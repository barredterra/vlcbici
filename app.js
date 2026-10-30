// vlcbici: route planner for Valencia (walk -> Valenbisi bike -> walk), in plain JavaScript.

const STATIONS_URL =
  "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?where=1=1&outFields=*&f=geojson";
// The city's official cycling network ("Itinerarios Ciclistas"). Simplified to about 1 m,
// which cuts the download from 2.2 MB to 350 kB.
const BIKE_NETWORK_URL =
  "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/189/query" +
  "?where=1=1&outFields=estado&outSR=4326&maxAllowableOffset=0.00001&f=geojson";
const FOOT_ROUTER_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving/";
const BIKE_ROUTER_URL =
  "https://routing.openstreetmap.de/routed-bike/route/v1/driving/";
const GEOCODER_URL =
  "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&viewbox=-0.45,39.53,-0.28,39.40&bounded=1&q=";

const MIN_BIKES = 3;
const MIN_DOCKS = 3;
const MAX_STATION_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_DISTANCE_TO_NETWORK_M = 2000; // farther from every station = outside the Valenbisi area
const MAX_SNAP_DISTANCE_M = 300; // farther from a road or path = point is not routable
const GEOCODER_INTERVAL_MS = 1000; // Nominatim policy: max 1 request per second
const VALENCIA_CENTER = [39.4699, -0.3763];

const WALK_STYLE = {
  color: "#d62828",
  weight: 7,
  opacity: 0.9,
  dashArray: "1 12",
  lineCap: "round",
};
const BIKE_STYLE = { color: "#d62828", weight: 8, opacity: 0.9 };

// Line styles for the "estado" codes of the city bike network, grouped for the legend.
const BIKE_NETWORK_GROUPS = [
  // Bike lane, Turia park bike lane, bike path, network outside the city limits
  {
    label: "Bike lane or path",
    codes: ["1", "4", "6", "8"],
    style: { color: "#1d4ed8", weight: 4 },
  },
  // Cycle street (30 km/h), bus-bike lane, low-traffic "ciclobarrio"
  {
    label: "Shared with traffic",
    codes: ["2", "7", "9"],
    style: { color: "#0891b2", weight: 3 },
  },
  {
    label: "Pedestrian street",
    codes: ["3"],
    style: { color: "#6b7280", weight: 3, dashArray: "4 6" },
  },
  {
    label: "Closed for works",
    codes: ["5"],
    style: { color: "#f59e0b", weight: 4, dashArray: "6 6" },
  },
];

// ---------------------------------------------------------------------------
// Pure logic: no DOM, no network.
// ---------------------------------------------------------------------------

// The city may add new codes; draw unknown ones like a normal bike lane.
function bikeNetworkGroup(code) {
  const group = BIKE_NETWORK_GROUPS.find(function (g) {
    return g.codes.indexOf(code) !== -1;
  });
  return group || BIKE_NETWORK_GROUPS[0];
}

function haversineMeters(a, b) {
  const earthRadius = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLon * sinLon;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function parseStations(geojson) {
  return geojson.features.map(function (feature) {
    const p = feature.properties;
    return {
      id: p.number,
      name: p.name,
      address: p.address,
      open: p.open === "T",
      bikes: p.available,
      docks: p.free,
      updatedAt: p.update_jcd,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
    };
  });
}

// A station counts only when it is open and reported recently.
function isStationLive(station, now) {
  const age = now - station.updatedAt;
  return station.open && age <= MAX_STATION_AGE_MS;
}

function nearestStation(stations, point) {
  let best = null;
  let bestDistance = Infinity;
  stations.forEach(function (station) {
    const distance = haversineMeters(point, station);
    if (distance < bestDistance) {
      best = station;
      bestDistance = distance;
    }
  });
  return best;
}

function choosePickupStation(stations, start, now) {
  const candidates = stations.filter(function (s) {
    return isStationLive(s, now) && s.bikes >= MIN_BIKES;
  });
  return nearestStation(candidates, start);
}

function chooseDropoffStation(stations, destination, now) {
  const candidates = stations.filter(function (s) {
    return isStationLive(s, now) && s.docks >= MIN_DOCKS;
  });
  return nearestStation(candidates, destination);
}

function findStation(stations, id) {
  return stations.find(function (s) {
    return s.id === id;
  });
}

// A bike only helps when walking to and from the stations is shorter than walking directly.
function shouldWalkOnly(start, destination, pickup, dropoff) {
  if (pickup.id === dropoff.id) return true;
  const stationWalks =
    haversineMeters(start, pickup) + haversineMeters(dropoff, destination);
  const directWalk = haversineMeters(start, destination);
  return stationWalks >= directWalk;
}

function isNearNetwork(stations, point) {
  const closest = nearestStation(stations, point);
  return haversineMeters(point, closest) <= MAX_DISTANCE_TO_NETWORK_M;
}

function formatDistance(meters) {
  if (meters < 1000) return Math.round(meters) + " m";
  return (meters / 1000).toFixed(1) + " km";
}

function formatKm(meters) {
  return (meters / 1000).toFixed(2) + " km";
}

function formatMinutes(seconds) {
  return Math.max(1, Math.round(seconds / 60)) + " min";
}

function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours + " h ago";
  return Math.round(hours / 24) + " days ago";
}

// Turn one OSRM step into a short English instruction.
function formatStep(step) {
  const type = step.maneuver.type;
  const modifier = step.maneuver.modifier;
  const road = step.name || "the path";
  const direction = modifier ? " " + modifier : "";
  let text;

  if (type === "depart") {
    text = "Start on " + road;
  } else if (type === "arrive") {
    text = "Arrive";
  } else if (type === "roundabout" || type === "rotary") {
    const exit = step.maneuver.exit ? "exit " + step.maneuver.exit : "the exit";
    text = "At the roundabout take " + exit + " onto " + road;
  } else if (modifier === "uturn") {
    text = "Make a U-turn onto " + road;
  } else if (type === "new name" || type === "continue") {
    const keepSide = modifier && modifier !== "straight";
    text = keepSide
      ? "Keep" + direction + " onto " + road
      : "Continue onto " + road;
  } else if (modifier === "straight") {
    text = "Go straight onto " + road;
  } else if (type === "end of road") {
    text = "At the end of the road turn" + direction + " onto " + road;
  } else {
    // turn, fork, merge, on ramp, off ramp, notification, ...
    const verb = type.charAt(0).toUpperCase() + type.slice(1);
    text = verb + direction + " onto " + road;
  }

  if (type !== "arrive" && step.distance > 0) {
    text += " (" + formatDistance(step.distance) + ")";
  }
  return text;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " from " + new URL(url).host);
  }
  return response.json();
}

async function fetchStations() {
  let geojson;
  try {
    geojson = await fetchJson(STATIONS_URL);
  } catch (err) {
    throw new Error(
      "Could not load Valenbisi station data (" + err.message + ").",
    );
  }
  // The ArcGIS server reports query errors as HTTP 200 with an "error" body.
  if (!geojson.features) {
    const reason = geojson.error
      ? geojson.error.message
      : "unexpected response";
    throw new Error("Could not load Valenbisi station data (" + reason + ").");
  }
  return parseStations(geojson);
}

let lastGeocodeAt = 0;

async function geocode(text, label) {
  const waitMs = lastGeocodeAt + GEOCODER_INTERVAL_MS - Date.now();
  if (waitMs > 0) await wait(waitMs);
  lastGeocodeAt = Date.now();

  let results;
  try {
    results = await fetchJson(GEOCODER_URL + encodeURIComponent(text));
  } catch (err) {
    throw new Error(
      "Geocoding of the " + label + " failed (" + err.message + ").",
    );
  }
  if (results.length === 0) {
    throw new Error(
      "No place found in Valencia for " + label + ' "' + text + '".',
    );
  }
  const place = results[0];
  return {
    lat: Number(place.lat),
    lon: Number(place.lon),
    label: place.display_name,
  };
}

// Returns { distance, duration, coordinates: [[lat, lon], ...], steps }.
async function fetchRoute(routerUrl, from, to, legName) {
  const coords = from.lon + "," + from.lat + ";" + to.lon + "," + to.lat;
  const url =
    routerUrl + coords + "?overview=full&geometries=geojson&steps=true";
  let data;
  try {
    // No fetchJson here: OSRM sends its error codes with HTTP 400 and a JSON body.
    const response = await fetch(url);
    data = await response.json();
  } catch (err) {
    throw new Error(
      "Routing request failed for " + legName + " (" + err.message + ").",
    );
  }
  if (data.code !== "Ok" || data.routes.length === 0) {
    throw new Error(
      "No route found for " +
        legName +
        " (" +
        (data.message || data.code) +
        ").",
    );
  }
  // OSRM snaps each point to the nearest road, even when that road is kilometres away.
  const snapDistance = Math.max(
    data.waypoints[0].distance,
    data.waypoints[1].distance,
  );
  if (snapDistance > MAX_SNAP_DISTANCE_M) {
    throw new Error("No road or path found near the ends of " + legName + ".");
  }
  const route = data.routes[0];
  const latLngs = route.geometry.coordinates.map(function (c) {
    return [c[1], c[0]];
  });
  return {
    distance: route.distance,
    duration: route.duration,
    coordinates: latLngs,
    steps: route.legs[0].steps,
  };
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// Map and UI
// ---------------------------------------------------------------------------

const map = L.map("map").setView(VALENCIA_CENTER, 14);
// Top right, so the panel (bottom sheet on phones) never covers the OSM credit.
// Set it before adding layers: setPosition re-adds the control, which counts their credits twice.
map.attributionControl.setPosition("topright");
const OSM_CREDIT =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function osmStandardTiles() {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    // OSM blocks tile requests without a Referer: https://wiki.openstreetmap.org/wiki/Blocked_tiles
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution: OSM_CREDIT,
  });
}
const standardLayer = osmStandardTiles();
// CyclOSM shows bike lanes, cycle tracks and bike parking.
const cyclingLayer = L.tileLayer(
  "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution:
      OSM_CREDIT +
      ' | Map style: <a href="https://www.cyclosm.org/">CyclOSM</a>' +
      ' hosted by <a href="https://openstreetmap.fr/">OpenStreetMap France</a>',
  },
);

// City bike network: standard tiles plus the city's lines, loaded on first use.
// Its own pane keeps the lines below the route and station markers (overlayPane is 400).
map.createPane("bikeNetwork").style.zIndex = 350;
const bikeNetworkLines = L.geoJSON(null, {
  pane: "bikeNetwork",
  interactive: false, // map clicks must still set start and destination
  style: function (feature) {
    return bikeNetworkGroup(feature.properties.estado).style;
  },
});
const cityLayer = L.layerGroup([osmStandardTiles(), bikeNetworkLines]);
const bikeNetworkLegend = L.control({ position: "topright" });
bikeNetworkLegend.onAdd = function () {
  const box = L.DomUtil.create("div", "network-legend");
  const rows = BIKE_NETWORK_GROUPS.map(function (group) {
    const lineStyle = group.style.dashArray ? "dashed" : "solid";
    const sample =
      group.style.weight + "px " + lineStyle + " " + group.style.color;
    return (
      '<div><span style="border-top:' +
      sample +
      '"></span>' +
      group.label +
      "</div>"
    );
  });
  box.innerHTML =
    "<strong>Bike network (City of Valencia)</strong>" + rows.join("");
  return box;
};
let bikeNetworkLoaded = false;
cityLayer.on("add", async function () {
  bikeNetworkLegend.addTo(map);
  if (bikeNetworkLoaded) return;
  bikeNetworkLoaded = true;
  try {
    bikeNetworkLines.addData(await fetchJson(BIKE_NETWORK_URL));
  } catch (err) {
    bikeNetworkLoaded = false; // try again the next time the layer is chosen
    showMessage(
      "Could not load the city bike network (" + err.message + ").",
      "error",
    );
  }
});
cityLayer.on("remove", function () {
  bikeNetworkLegend.remove();
});

standardLayer.addTo(map);
L.control
  .layers({
    "Street map": standardLayer,
    "Cycling map (OpenStreetMap)": cyclingLayer,
    "Bike network (City of Valencia)": cityLayer,
  })
  .addTo(map);
// These credits apply to all map styles.
map.attributionControl.addAttribution(
  'Stations and bike network: <a href="https://opendata.vlci.valencia.es/">Valencia Open Data</a>' +
    ' | Routing: <a href="https://routing.openstreetmap.de/">FOSSGIS OSRM</a>',
);

// Stations sit below the route lines (overlayPane is 400). The canvas tolerance
// makes each circle easier to hit with a finger than it looks.
map.createPane("stations").style.zIndex = 390;
const stationRenderer = L.canvas({ pane: "stations", tolerance: 8 });
const stationLayer = L.layerGroup().addTo(map);
const pointLayer = L.layerGroup().addTo(map);
const routeLayer = L.featureGroup().addTo(map);

const startInput = document.getElementById("start-input");
const destInput = document.getElementById("dest-input");
const routeForm = document.getElementById("route-form");
const planButton = document.getElementById("plan-button");
const messageBox = document.getElementById("message");
const summaryBox = document.getElementById("summary");
const panel = document.getElementById("panel");
const toggleButton = document.getElementById("toggle-panel");

// Points picked on the map, by geolocation or already geocoded. A typed address clears them.
let startPoint = null;
let destPoint = null;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showMessage(text, kind) {
  messageBox.textContent = text;
  messageBox.className = kind;
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "";
}

function pinIcon(content, colour) {
  return L.divIcon({
    className: "",
    html:
      '<div style="width:30px;height:30px;border-radius:50%;background:' +
      colour +
      ";color:#fff;font:bold 14px system-ui,sans-serif;" +
      // Flex centres both letters and icons inside the border (the page uses border-box).
      "display:flex;align-items:center;justify-content:center;" +
      'border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">' +
      content +
      "</div>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

function stationColour(station, now) {
  if (!isStationLive(station, now)) return "#9ca3af";
  if (station.bikes >= MIN_BIKES && station.docks >= MIN_DOCKS)
    return "#16a34a";
  if (station.bikes >= MIN_BIKES) return "#ea580c"; // bikes but nearly full
  if (station.docks >= MIN_DOCKS) return "#eab308"; // docks but few bikes
  return "#dc2626";
}

// Popup options shared by all station markers; the class hooks the popup styles.
const STATION_POPUP_OPTIONS = { className: "station-popup", minWidth: 220 };

function popupStatHtml(icon, count, label, minimum) {
  const low = count < minimum ? " low" : "";
  return (
    '<div class="popup-stat' +
    low +
    '">' +
    icon +
    "<div><strong>" +
    count +
    "</strong><span>" +
    label +
    "</span></div>" +
    "</div>"
  );
}

// role: "Pickup station" or "Return station" on the route markers, empty otherwise.
function stationPopup(station, role) {
  const now = Date.now();
  const age = formatAge(now - station.updatedAt);
  const live = isStationLive(station, now);
  let status = "Updated " + age;
  if (!station.open) status = "Closed";
  else if (!live) status = "No recent data (last update " + age + ")";
  // Counts of a closed or silent station are not reliable: grey them out.
  const statsClass = live ? "popup-stats" : "popup-stats stale";

  return (
    (role ? '<div class="popup-role">' + role + "</div>" : "") +
    '<div class="popup-title">' +
    escapeHtml(station.address) +
    "</div>" +
    '<div class="popup-sub">Station ' +
    station.id +
    "</div>" +
    '<div class="' +
    statsClass +
    '">' +
    popupStatHtml(BIKE_ICON, station.bikes, "bikes", MIN_BIKES) +
    popupStatHtml(PARKING_ICON, station.docks, "free docks", MIN_DOCKS) +
    "</div>" +
    '<div class="popup-status">' +
    status +
    "</div>" +
    // Handled in onStationButtonClick. They help when a station hides the spot to click.
    '<div class="popup-actions">' +
    '<button type="button" data-use-station="start" data-station-id="' +
    station.id +
    '">Start</button>' +
    '<button type="button" data-use-station="destination" data-station-id="' +
    station.id +
    '">Destination</button>' +
    "</div>"
  );
}

// The stations on the map, for the Start/Destination buttons in their popups.
let shownStations = [];

function drawStations(stations) {
  const now = Date.now();
  shownStations = stations;
  stationLayer.clearLayers();
  stations.forEach(function (station) {
    const colour = stationColour(station, now);
    const marker = L.circleMarker([station.lat, station.lon], {
      pane: "stations",
      renderer: stationRenderer,
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: colour,
      fillOpacity: 0.9,
      bubblingMouseEvents: false, // clicking a station must not set start/destination
    });
    marker.bindPopup(stationPopup(station), STATION_POPUP_OPTIONS);
    stationLayer.addLayer(marker);
  });
}

function drawPoints() {
  pointLayer.clearLayers();
  if (startPoint) {
    L.marker([startPoint.lat, startPoint.lon], {
      icon: pinIcon("A", "#111827"),
    })
      .bindPopup(escapeHtml(startPoint.label || "Start"))
      .addTo(pointLayer);
  }
  if (destPoint) {
    L.marker([destPoint.lat, destPoint.lon], { icon: pinIcon("B", "#7c3aed") })
      .bindPopup(escapeHtml(destPoint.label || "Destination"))
      .addTo(pointLayer);
  }
}

function pointText(point) {
  return point.lat.toFixed(5) + ", " + point.lon.toFixed(5);
}

function setStart(point) {
  startPoint = point;
  startInput.value = pointText(point);
  drawPoints();
}

function setDestination(point) {
  destPoint = point;
  destInput.value = pointText(point);
  drawPoints();
}

// A station as start means "pick up the bike here", as destination "return it here".
function onStationButtonClick(event) {
  const button = event.target.closest("[data-use-station]");
  if (!button || planButton.disabled) return;
  const station = findStation(shownStations, Number(button.dataset.stationId));
  const point = {
    lat: station.lat,
    lon: station.lon,
    label: station.address,
    stationId: station.id,
  };
  const text = "Station " + station.id + ": " + station.address;
  if (button.dataset.useStation === "start") {
    startPoint = point;
    startInput.value = text;
  } else {
    destPoint = point;
    destInput.value = text;
  }
  drawPoints();
  map.closePopup();
}

function onMapClick(event) {
  if (planButton.disabled) return; // a plan is running
  const point = { lat: event.latlng.lat, lon: event.latlng.lng };
  // Fill the empty field; when both are filled, start again.
  const startEmpty = !startInput.value.trim();
  const destFilled = destInput.value.trim() !== "";
  const pickStart = startEmpty || destFilled;
  if (pickStart) {
    destPoint = null;
    destInput.value = "";
    setStart(point);
  } else {
    setDestination(point);
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    showMessage("Your browser does not support geolocation.", "error");
    return;
  }
  showMessage("Looking up your location...", "info");
  navigator.geolocation.getCurrentPosition(
    function (position) {
      clearMessage();
      const point = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
      setStart(point);
      map.setView([point.lat, point.lon], 15);
      showLiveLocation(position);
      watchLiveLocation();
    },
    function (err) {
      showMessage("Could not get your location: " + err.message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

// Live location: a pulsing blue dot that follows the user.
let liveLocationMarker = null;
let liveLocationWatchId = null;

function showLiveLocation(position) {
  const latLng = [position.coords.latitude, position.coords.longitude];
  if (liveLocationMarker) {
    liveLocationMarker.setLatLng(latLng);
    return;
  }
  const icon = L.divIcon({
    className: "live-location",
    html: '<span class="pulse"></span><span class="dot"></span>',
    iconSize: [18, 18],
  });
  // Above the A/B pins, below the station pins.
  liveLocationMarker = L.marker(latLng, {
    icon: icon,
    interactive: false,
    zIndexOffset: 500,
  }).addTo(map);
}

function livePosition() {
  if (!liveLocationMarker) return null;
  const latLng = liveLocationMarker.getLatLng();
  return { lat: latLng.lat, lon: latLng.lng, label: "Your location" };
}

function watchLiveLocation() {
  if (liveLocationWatchId !== null) return;
  liveLocationWatchId = navigator.geolocation.watchPosition(
    showLiveLocation,
    function (err) {
      // Keep the last dot on short GPS gaps; remove it when the user revokes access.
      if (err.code !== err.PERMISSION_DENIED) return;
      navigator.geolocation.clearWatch(liveLocationWatchId);
      liveLocationWatchId = null;
      if (liveLocationMarker) liveLocationMarker.remove();
      liveLocationMarker = null;
    },
    { enableHighAccuracy: true, maximumAge: 10000 },
  );
}

// Show the dot at once when the user allowed location on an earlier visit. Never prompt on load.
function watchLiveLocationIfAllowed() {
  if (!navigator.geolocation || !navigator.permissions) return;
  navigator.permissions.query({ name: "geolocation" }).then(function (status) {
    if (status.state === "granted") watchLiveLocation();
  });
}

// Use the picked point, or geocode the typed text.
async function resolvePoint(point, text, label) {
  if (point) return point;
  if (!text.trim())
    throw new Error("Please enter a " + label + " or click the map.");
  return geocode(text.trim(), label);
}

// The same icons as the station cards in the trip summary.
function stationMarker(station, icon, role) {
  // Draw above the A/B pins: the pickup is often right next to the start.
  const options = {
    icon: pinIcon('<span class="pin-icon">' + icon + "</span>", "#d62828"),
    zIndexOffset: 1000,
  };
  return L.marker([station.lat, station.lon], options).bindPopup(
    stationPopup(station, role),
    STATION_POPUP_OPTIONS,
  );
}

function legHtml(leg) {
  // The roundabout step already names the exit road.
  const shownSteps = leg.route.steps.filter(function (step) {
    const type = step.maneuver.type;
    return type !== "exit roundabout" && type !== "exit rotary";
  });
  const steps = shownSteps.map(function (step) {
    return "<li>" + escapeHtml(formatStep(step)) + "</li>";
  });
  return (
    '<div class="leg ' +
    leg.mode +
    '">' +
    '<div class="leg-title">' +
    escapeHtml(leg.title) +
    "</div>" +
    '<div class="leg-meta">' +
    formatKm(leg.route.distance) +
    " &middot; " +
    formatMinutes(leg.route.duration) +
    "</div>" +
    "<details><summary>Directions</summary><ol>" +
    steps.join("") +
    "</ol></details>" +
    "</div>"
  );
}

// Icons from Lucide (ISC licence): "bike" and "square-parking".
const BIKE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18.5" cy="17.5" r="3.5"/>' +
  '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';
const PARKING_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/>' +
  '<path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>';

function stationCardHtml(icon, action, station, count) {
  return (
    '<div class="station-card">' +
    '<div class="station-icon">' +
    icon +
    "</div>" +
    '<div class="station-text">' +
    '<div class="station-action">' +
    action +
    "</div>" +
    '<div class="station-address">' +
    escapeHtml(station.address) +
    "</div>" +
    '<div class="station-name">Station ' +
    station.id +
    "</div>" +
    "</div>" +
    '<div class="station-count">' +
    count +
    "</div>" +
    "</div>"
  );
}

function renderSummary(legs, start, destination, pickup, dropoff) {
  let totalDistance = 0;
  let totalDuration = 0;
  legs.forEach(function (leg) {
    totalDistance += leg.route.distance;
    totalDuration += leg.route.duration;
  });

  let html = "<h2>Your trip</h2>";
  // Show what the geocoder found, so a wrong match is visible.
  if (start.label)
    html += '<div class="place">From: ' + escapeHtml(start.label) + "</div>";
  if (destination.label)
    html +=
      '<div class="place">To: ' + escapeHtml(destination.label) + "</div>";
  // The station cards frame the bike leg. A trip can lack the first or last walk.
  legs.forEach(function (leg) {
    if (leg.mode !== "bike") {
      html += legHtml(leg);
      return;
    }
    html +=
      stationCardHtml(
        BIKE_ICON,
        "Pick up a bike",
        pickup,
        pickup.bikes + " bikes",
      ) +
      legHtml(leg) +
      stationCardHtml(
        PARKING_ICON,
        "Return the bike",
        dropoff,
        dropoff.docks + " free docks",
      );
  });
  html +=
    '<div class="total">Total: ' +
    formatKm(totalDistance) +
    " &middot; " +
    formatMinutes(totalDuration) +
    "</div>";
  summaryBox.innerHTML = html;
}

function drawLegs(legs) {
  legs.forEach(function (leg) {
    const style = leg.mode === "bike" ? BIKE_STYLE : WALK_STYLE;
    L.polyline(leg.route.coordinates, style).addTo(routeLayer);
  });
}

async function planRoute(event) {
  event.preventDefault();
  clearMessage();
  summaryBox.innerHTML = "";
  routeLayer.clearLayers();
  setFormDisabled(true); // no edits, clicks or Clear while a plan is running
  planButton.textContent = "Planning...";

  try {
    // Store each point as soon as it resolves, so a retry does not geocode it again.
    startPoint = await resolvePoint(startPoint, startInput.value, "start");
    destPoint = await resolvePoint(destPoint, destInput.value, "destination");
    const start = startPoint;
    const destination = destPoint;
    drawPoints();

    const stations = await fetchStations();
    drawStations(stations);
    if (!isNearNetwork(stations, start))
      throw new Error("The start is outside the Valenbisi area.");
    if (!isNearNetwork(stations, destination))
      throw new Error("The destination is outside the Valenbisi area.");

    // A station picked with its popup button wins over the nearest one.
    const now = Date.now();
    const pickup = start.stationId
      ? findStation(stations, start.stationId)
      : choosePickupStation(stations, start, now);
    const dropoff = destination.stationId
      ? findStation(stations, destination.stationId)
      : chooseDropoffStation(stations, destination, now);
    if (!pickup)
      throw new Error(
        "No open station with " + MIN_BIKES + "+ bikes available right now.",
      );
    if (!dropoff)
      throw new Error(
        "No open station with " + MIN_DOCKS + "+ free docks right now.",
      );
    if (start.stationId && destination.stationId && pickup.id === dropoff.id)
      throw new Error("Start and destination are the same station.");

    // Picked stations are the user's choice: warn about low counts, do not replace them.
    const warnings = [];
    if (start.stationId && pickup.bikes < MIN_BIKES)
      warnings.push("The start station has only " + pickup.bikes + " bikes.");
    if (destination.stationId && dropoff.docks < MIN_DOCKS)
      warnings.push(
        "The destination station has only " + dropoff.docks + " free docks.",
      );

    // From a start station, walk there from the live location, when it is known and nearby.
    let origin = start;
    if (start.stationId) {
      const here = livePosition();
      origin = here && isNearNetwork(stations, here) ? here : null;
    }
    const pickedStation = start.stationId || destination.stationId;
    const walkOnly =
      pickup.id === dropoff.id ||
      (!pickedStation && shouldWalkOnly(start, destination, pickup, dropoff));

    let legs;
    if (walkOnly) {
      const walkRoute = await fetchRoute(
        FOOT_ROUTER_URL,
        start,
        destination,
        "the walk",
      );
      legs = [{ mode: "walk", title: "Walk to destination", route: walkRoute }];
      warnings.push(
        "Walking directly is shorter than walking to and from the Valenbisi stations.",
      );
      renderSummary(legs, start, destination, null, null);
    } else {
      const plannedLegs = [];
      if (origin) {
        plannedLegs.push({
          mode: "walk",
          title: "Walk to the pickup station",
          router: FOOT_ROUTER_URL,
          from: origin,
          to: pickup,
          name: "the walk to the pickup station",
        });
      }
      plannedLegs.push({
        mode: "bike",
        title: "Ride to the return station",
        router: BIKE_ROUTER_URL,
        from: pickup,
        to: dropoff,
        name: "the bike ride",
      });
      // A destination station is where the bike goes back: no walk after it.
      if (!destination.stationId) {
        plannedLegs.push({
          mode: "walk",
          title: "Walk to destination",
          router: FOOT_ROUTER_URL,
          from: dropoff,
          to: destination,
          name: "the walk to the destination",
        });
      }
      const routes = await Promise.all(
        plannedLegs.map(function (leg) {
          return fetchRoute(leg.router, leg.from, leg.to, leg.name);
        }),
      );
      legs = plannedLegs.map(function (leg, i) {
        return { mode: leg.mode, title: leg.title, route: routes[i] };
      });
      stationMarker(pickup, BIKE_ICON, "Pickup station").addTo(routeLayer);
      stationMarker(dropoff, PARKING_ICON, "Return station").addTo(routeLayer);
      renderSummary(legs, origin || start, destination, pickup, dropoff);
    }
    if (warnings.length) showMessage(warnings.join(" "), "info");

    drawLegs(legs);
    map.fitBounds(routeLayer.getBounds(), paddingOutsidePanel());
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    setFormDisabled(false);
    planButton.textContent = "Plan route";
  }
}

function setFormDisabled(disabled) {
  Array.from(routeForm.elements).forEach(function (element) {
    element.disabled = disabled;
  });
}

// Keep the route clear of the panel: left of it on desktop, above it on phones.
function paddingOutsidePanel() {
  const margin = 30;
  const isPhone = window.matchMedia("(max-width: 600px)").matches;
  if (isPhone) {
    const attributionHeight =
      map.attributionControl.getContainer().offsetHeight;
    return {
      paddingTopLeft: [margin, attributionHeight + margin],
      paddingBottomRight: [margin, panel.offsetHeight + margin],
    };
  }
  const panelRight = panel.offsetLeft + panel.offsetWidth;
  return {
    paddingTopLeft: [panelRight + margin, margin],
    paddingBottomRight: [margin, margin],
  };
}

function clearAll() {
  startPoint = null;
  destPoint = null;
  startInput.value = "";
  destInput.value = "";
  pointLayer.clearLayers();
  routeLayer.clearLayers();
  summaryBox.innerHTML = "";
  clearMessage();
}

function togglePanel() {
  const collapsed = panel.classList.toggle("collapsed");
  toggleButton.textContent = collapsed ? "Show" : "Hide";
  toggleButton.setAttribute("aria-expanded", String(!collapsed));
}

map.on("click", onMapClick);
document.addEventListener("click", onStationButtonClick);
document.getElementById("route-form").addEventListener("submit", planRoute);
document
  .getElementById("locate-button")
  .addEventListener("click", useMyLocation);
document.getElementById("clear-button").addEventListener("click", clearAll);
toggleButton.addEventListener("click", togglePanel);
startInput.addEventListener("input", function () {
  startPoint = null;
});
destInput.addEventListener("input", function () {
  destPoint = null;
});

// Show the station map right away; planning fetches fresh data again.
fetchStations()
  .then(drawStations)
  .catch(function (err) {
    showMessage(err.message, "error");
  });

watchLiveLocationIfAllowed();
