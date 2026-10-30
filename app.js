// Valenbisi route planner: walk -> bike -> walk, in plain JavaScript.

var STATIONS_URL =
  "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?where=1=1&outFields=*&f=geojson";
// The city's official cycling network ("Itinerarios Ciclistas"). Simplified to about 1 m,
// which cuts the download from 2.2 MB to 350 kB.
var BIKE_NETWORK_URL =
  "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/189/query" +
  "?where=1=1&outFields=estado&outSR=4326&maxAllowableOffset=0.00001&f=geojson";
var FOOT_ROUTER_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/driving/";
var BIKE_ROUTER_URL = "https://routing.openstreetmap.de/routed-bike/route/v1/driving/";
var GEOCODER_URL =
  "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&viewbox=-0.45,39.53,-0.28,39.40&bounded=1&q=";

var MIN_BIKES = 3;
var MIN_DOCKS = 3;
var MAX_STATION_AGE_MS = 2 * 60 * 60 * 1000;
var MAX_DISTANCE_TO_NETWORK_M = 2000; // farther from every station = outside the Valenbisi area
var MAX_SNAP_DISTANCE_M = 300; // farther from a road or path = point is not routable
var GEOCODER_INTERVAL_MS = 1000; // Nominatim policy: max 1 request per second
var VALENCIA_CENTER = [39.4699, -0.3763];

var WALK_STYLE = { color: "#d62828", weight: 7, opacity: 0.9, dashArray: "1 12", lineCap: "round" };
var BIKE_STYLE = { color: "#d62828", weight: 8, opacity: 0.9 };

// Line styles for the "estado" codes of the city bike network, grouped for the legend.
var BIKE_NETWORK_GROUPS = [
  // Bike lane, Turia park bike lane, bike path, network outside the city limits
  { label: "Bike lane or path", codes: ["1", "4", "6", "8"], style: { color: "#1d4ed8", weight: 4 } },
  // Cycle street (30 km/h), bus-bike lane, low-traffic "ciclobarrio"
  { label: "Shared with traffic", codes: ["2", "7", "9"], style: { color: "#0891b2", weight: 3 } },
  { label: "Pedestrian street", codes: ["3"], style: { color: "#6b7280", weight: 3, dashArray: "4 6" } },
  { label: "Closed for works", codes: ["5"], style: { color: "#f59e0b", weight: 4, dashArray: "6 6" } },
];

// ---------------------------------------------------------------------------
// Pure logic: no DOM, no network.
// ---------------------------------------------------------------------------

// The city may add new codes; draw unknown ones like a normal bike lane.
function bikeNetworkGroup(code) {
  var group = BIKE_NETWORK_GROUPS.find(function (g) {
    return g.codes.indexOf(code) !== -1;
  });
  return group || BIKE_NETWORK_GROUPS[0];
}

function haversineMeters(a, b) {
  var earthRadius = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * toRad;
  var dLon = (b.lon - a.lon) * toRad;
  var sinLat = Math.sin(dLat / 2);
  var sinLon = Math.sin(dLon / 2);
  var h = sinLat * sinLat + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLon * sinLon;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function parseStations(geojson) {
  return geojson.features.map(function (feature) {
    var p = feature.properties;
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
  var age = now - station.updatedAt;
  return station.open && age <= MAX_STATION_AGE_MS;
}

function nearestStation(stations, point) {
  var best = null;
  var bestDistance = Infinity;
  stations.forEach(function (station) {
    var distance = haversineMeters(point, station);
    if (distance < bestDistance) {
      best = station;
      bestDistance = distance;
    }
  });
  return best;
}

function choosePickupStation(stations, start, now) {
  var candidates = stations.filter(function (s) {
    return isStationLive(s, now) && s.bikes >= MIN_BIKES;
  });
  return nearestStation(candidates, start);
}

function chooseDropoffStation(stations, destination, now) {
  var candidates = stations.filter(function (s) {
    return isStationLive(s, now) && s.docks >= MIN_DOCKS;
  });
  return nearestStation(candidates, destination);
}

// A bike only helps when walking to and from the stations is shorter than walking directly.
function shouldWalkOnly(start, destination, pickup, dropoff) {
  if (pickup.id === dropoff.id) return true;
  var stationWalks = haversineMeters(start, pickup) + haversineMeters(dropoff, destination);
  var directWalk = haversineMeters(start, destination);
  return stationWalks >= directWalk;
}

function isNearNetwork(stations, point) {
  var closest = nearestStation(stations, point);
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

// Turn one OSRM step into a short English instruction.
function formatStep(step) {
  var type = step.maneuver.type;
  var modifier = step.maneuver.modifier;
  var road = step.name ? step.name : "the path";
  var direction = modifier ? " " + modifier : "";
  var text;

  if (type === "depart") {
    text = "Start on " + road;
  } else if (type === "arrive") {
    text = "Arrive";
  } else if (type === "roundabout" || type === "rotary") {
    var exit = step.maneuver.exit ? "exit " + step.maneuver.exit : "the exit";
    text = "At the roundabout take " + exit + " onto " + road;
  } else if (modifier === "uturn") {
    text = "Make a U-turn onto " + road;
  } else if (type === "new name" || type === "continue") {
    var keepSide = modifier && modifier !== "straight";
    text = keepSide ? "Keep" + direction + " onto " + road : "Continue onto " + road;
  } else if (modifier === "straight") {
    text = "Go straight onto " + road;
  } else if (type === "end of road") {
    text = "At the end of the road turn" + direction + " onto " + road;
  } else {
    // turn, fork, merge, on ramp, off ramp, notification, ...
    var verb = type.charAt(0).toUpperCase() + type.slice(1);
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
  var response = await fetch(url);
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " from " + new URL(url).host);
  }
  return response.json();
}

async function fetchStations() {
  var geojson;
  try {
    geojson = await fetchJson(STATIONS_URL);
  } catch (err) {
    throw new Error("Could not load Valenbisi station data (" + err.message + ").");
  }
  // The ArcGIS server reports query errors as HTTP 200 with an "error" body.
  if (!geojson.features) {
    var reason = geojson.error ? geojson.error.message : "unexpected response";
    throw new Error("Could not load Valenbisi station data (" + reason + ").");
  }
  return parseStations(geojson);
}

var lastGeocodeAt = 0;

async function geocode(text, label) {
  var waitMs = lastGeocodeAt + GEOCODER_INTERVAL_MS - Date.now();
  if (waitMs > 0) await wait(waitMs);
  lastGeocodeAt = Date.now();

  var results;
  try {
    results = await fetchJson(GEOCODER_URL + encodeURIComponent(text));
  } catch (err) {
    throw new Error("Geocoding of the " + label + " failed (" + err.message + ").");
  }
  if (results.length === 0) {
    throw new Error('No place found in Valencia for ' + label + ' "' + text + '".');
  }
  var place = results[0];
  return { lat: Number(place.lat), lon: Number(place.lon), label: place.display_name };
}

// Returns { distance, duration, coordinates: [[lat, lon], ...], steps }.
async function fetchRoute(routerUrl, from, to, legName) {
  var coords = from.lon + "," + from.lat + ";" + to.lon + "," + to.lat;
  var url = routerUrl + coords + "?overview=full&geometries=geojson&steps=true";
  var data;
  try {
    // No fetchJson here: OSRM sends its error codes with HTTP 400 and a JSON body.
    var response = await fetch(url);
    data = await response.json();
  } catch (err) {
    throw new Error("Routing request failed for " + legName + " (" + err.message + ").");
  }
  if (data.code !== "Ok" || data.routes.length === 0) {
    throw new Error("No route found for " + legName + " (" + (data.message || data.code) + ").");
  }
  // OSRM snaps each point to the nearest road, even when that road is kilometres away.
  var snapDistance = Math.max(data.waypoints[0].distance, data.waypoints[1].distance);
  if (snapDistance > MAX_SNAP_DISTANCE_M) {
    throw new Error("No road or path found near the ends of " + legName + ".");
  }
  var route = data.routes[0];
  var latLngs = route.geometry.coordinates.map(function (c) {
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

var map = L.map("map").setView(VALENCIA_CENTER, 14);
// Top right, so the panel (bottom sheet on phones) never covers the OSM credit.
// Set it before adding layers: setPosition re-adds the control, which counts their credits twice.
map.attributionControl.setPosition("topright");
var OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function osmStandardTiles() {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    // OSM blocks tile requests without a Referer: https://wiki.openstreetmap.org/wiki/Blocked_tiles
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution: OSM_CREDIT,
  });
}
var standardLayer = osmStandardTiles();
// CyclOSM shows bike lanes, cycle tracks and bike parking.
var cyclingLayer = L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", {
  maxZoom: 19,
  referrerPolicy: "strict-origin-when-cross-origin",
  attribution:
    OSM_CREDIT +
    ' | Map style: <a href="https://www.cyclosm.org/">CyclOSM</a>' +
    ' hosted by <a href="https://openstreetmap.fr/">OpenStreetMap France</a>',
});

// City bike network: standard tiles plus the city's lines, loaded on first use.
// Its own pane keeps the lines below the route and station markers (overlayPane is 400).
map.createPane("bikeNetwork").style.zIndex = 350;
var bikeNetworkLines = L.geoJSON(null, {
  pane: "bikeNetwork",
  interactive: false, // map clicks must still set start and destination
  style: function (feature) {
    return bikeNetworkGroup(feature.properties.estado).style;
  },
});
var cityLayer = L.layerGroup([osmStandardTiles(), bikeNetworkLines]);
var bikeNetworkLegend = L.control({ position: "topright" });
bikeNetworkLegend.onAdd = function () {
  var box = L.DomUtil.create("div", "network-legend");
  var rows = BIKE_NETWORK_GROUPS.map(function (group) {
    var lineStyle = group.style.dashArray ? "dashed" : "solid";
    var sample = group.style.weight + "px " + lineStyle + " " + group.style.color;
    return '<div><span style="border-top:' + sample + '"></span>' + group.label + "</div>";
  });
  box.innerHTML = "<strong>City bike network</strong>" + rows.join("");
  return box;
};
var bikeNetworkLoaded = false;
cityLayer.on("add", async function () {
  bikeNetworkLegend.addTo(map);
  if (bikeNetworkLoaded) return;
  bikeNetworkLoaded = true;
  try {
    bikeNetworkLines.addData(await fetchJson(BIKE_NETWORK_URL));
  } catch (err) {
    bikeNetworkLoaded = false; // try again the next time the layer is chosen
    showMessage("Could not load the city bike network (" + err.message + ").", "error");
  }
});
cityLayer.on("remove", function () {
  bikeNetworkLegend.remove();
});

standardLayer.addTo(map);
L.control
  .layers({ Standard: standardLayer, Cycling: cyclingLayer, "City bike network": cityLayer })
  .addTo(map);
// These credits apply to all map styles.
map.attributionControl.addAttribution(
  'Stations and bike network: <a href="https://opendata.vlci.valencia.es/">Valencia Open Data</a>' +
  ' | Routing: <a href="https://routing.openstreetmap.de/">FOSSGIS OSRM</a>'
);

var stationLayer = L.layerGroup().addTo(map);
var pointLayer = L.layerGroup().addTo(map);
var routeLayer = L.featureGroup().addTo(map);

var startInput = document.getElementById("start-input");
var destInput = document.getElementById("dest-input");
var routeForm = document.getElementById("route-form");
var planButton = document.getElementById("plan-button");
var messageBox = document.getElementById("message");
var summaryBox = document.getElementById("summary");
var panel = document.getElementById("panel");
var toggleButton = document.getElementById("toggle-panel");

// Points picked on the map, by geolocation or already geocoded. A typed address clears them.
var startPoint = null;
var destPoint = null;

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
      '<div style="width:26px;height:26px;border-radius:50%;background:' + colour +
      ';color:#fff;font:bold 13px system-ui,sans-serif;' +
      // Flex centres both letters and icons inside the border (the page uses border-box).
      'display:flex;align-items:center;justify-content:center;' +
      'border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">' + content + "</div>",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

function stationColour(station, now) {
  if (!isStationLive(station, now)) return "#9ca3af";
  if (station.bikes >= MIN_BIKES && station.docks >= MIN_DOCKS) return "#16a34a";
  if (station.bikes >= MIN_BIKES) return "#ea580c"; // bikes but nearly full
  if (station.docks >= MIN_DOCKS) return "#eab308"; // docks but few bikes
  return "#dc2626";
}

function stationPopup(station) {
  return (
    "<strong>" + escapeHtml(station.name) + "</strong><br>" +
    escapeHtml(station.address) + "<br>" +
    "Bikes: " + station.bikes + " &middot; Free docks: " + station.docks
  );
}

function drawStations(stations) {
  var now = Date.now();
  stationLayer.clearLayers();
  stations.forEach(function (station) {
    var colour = stationColour(station, now);
    var marker = L.circleMarker([station.lat, station.lon], {
      radius: 5,
      color: "#fff",
      weight: 1,
      fillColor: colour,
      fillOpacity: 0.9,
      bubblingMouseEvents: false, // clicking a station must not set start/destination
    });
    marker.bindPopup(stationPopup(station));
    stationLayer.addLayer(marker);
  });
}

function drawPoints() {
  pointLayer.clearLayers();
  if (startPoint) {
    L.marker([startPoint.lat, startPoint.lon], { icon: pinIcon("A", "#111827") })
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

function onMapClick(event) {
  if (planButton.disabled) return; // a plan is running
  var point = { lat: event.latlng.lat, lon: event.latlng.lng };
  // Fill the empty field; when both are filled, start again.
  var startEmpty = !startInput.value.trim();
  var destFilled = destInput.value.trim() !== "";
  var pickStart = startEmpty || destFilled;
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
      var point = { lat: position.coords.latitude, lon: position.coords.longitude };
      setStart(point);
      map.setView([point.lat, point.lon], 15);
    },
    function (err) {
      showMessage("Could not get your location: " + err.message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Use the picked point, or geocode the typed text.
async function resolvePoint(point, text, label) {
  if (point) return point;
  if (!text.trim()) throw new Error("Please enter a " + label + " or click the map.");
  return geocode(text.trim(), label);
}

// The same icons as the station cards in the trip summary.
function stationMarker(station, icon, title, detail) {
  var popup = "<em>" + title + "</em><br>" + stationPopup(station) + "<br>" + detail;
  // Draw above the A/B pins: the pickup is often right next to the start.
  var options = { icon: pinIcon('<span class="pin-icon">' + icon + "</span>", "#d62828"), zIndexOffset: 1000 };
  return L.marker([station.lat, station.lon], options).bindPopup(popup);
}

function legHtml(leg) {
  // The roundabout step already names the exit road.
  var shownSteps = leg.route.steps.filter(function (step) {
    var type = step.maneuver.type;
    return type !== "exit roundabout" && type !== "exit rotary";
  });
  var steps = shownSteps.map(function (step) {
    return "<li>" + escapeHtml(formatStep(step)) + "</li>";
  });
  return (
    '<div class="leg ' + leg.mode + '">' +
    '<div class="leg-title">' + escapeHtml(leg.title) + "</div>" +
    '<div class="leg-meta">' + formatKm(leg.route.distance) + " &middot; " +
    formatMinutes(leg.route.duration) + "</div>" +
    "<details><summary>Directions</summary><ol>" + steps.join("") + "</ol></details>" +
    "</div>"
  );
}

// Icons from Lucide (ISC licence): "bike" and "square-parking".
var BIKE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18.5" cy="17.5" r="3.5"/>' +
  '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';
var PARKING_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/>' +
  '<path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>';

function stationCardHtml(icon, action, station, count) {
  return (
    '<div class="station-card">' +
    '<div class="station-icon">' + icon + "</div>" +
    '<div class="station-text">' +
    '<div class="station-action">' + action + "</div>" +
    '<div class="station-address">' + escapeHtml(station.address) + "</div>" +
    '<div class="station-name">Station ' + station.id + "</div>" +
    "</div>" +
    '<div class="station-count">' + count + "</div>" +
    "</div>"
  );
}

function renderSummary(legs, start, destination, pickup, dropoff) {
  var totalDistance = 0;
  var totalDuration = 0;
  legs.forEach(function (leg) {
    totalDistance += leg.route.distance;
    totalDuration += leg.route.duration;
  });

  var html = "<h2>Your trip</h2>";
  // Show what the geocoder found, so a wrong match is visible.
  if (start.label) html += '<div class="place">From: ' + escapeHtml(start.label) + "</div>";
  if (destination.label) html += '<div class="place">To: ' + escapeHtml(destination.label) + "</div>";
  if (pickup) {
    // Legs are walk, bike, walk: the station cards go between them.
    html +=
      legHtml(legs[0]) +
      stationCardHtml(BIKE_ICON, "Pick up a bike", pickup, pickup.bikes + " bikes") +
      legHtml(legs[1]) +
      stationCardHtml(PARKING_ICON, "Return the bike", dropoff, dropoff.docks + " free docks") +
      legHtml(legs[2]);
  } else {
    html += legs.map(legHtml).join("");
  }
  html +=
    '<div class="total">Total: ' + formatKm(totalDistance) + " &middot; " +
    formatMinutes(totalDuration) + "</div>";
  summaryBox.innerHTML = html;
}

function drawLegs(legs) {
  legs.forEach(function (leg) {
    var style = leg.mode === "bike" ? BIKE_STYLE : WALK_STYLE;
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
    var start = startPoint;
    var destination = destPoint;
    drawPoints();

    var stations = await fetchStations();
    drawStations(stations);
    if (!isNearNetwork(stations, start)) throw new Error("The start is outside the Valenbisi area.");
    if (!isNearNetwork(stations, destination)) throw new Error("The destination is outside the Valenbisi area.");

    var now = Date.now();
    var pickup = choosePickupStation(stations, start, now);
    var dropoff = chooseDropoffStation(stations, destination, now);
    if (!pickup) throw new Error("No open station with " + MIN_BIKES + "+ bikes available right now.");
    if (!dropoff) throw new Error("No open station with " + MIN_DOCKS + "+ free docks right now.");

    var legs;
    if (shouldWalkOnly(start, destination, pickup, dropoff)) {
      var walkRoute = await fetchRoute(FOOT_ROUTER_URL, start, destination, "the walk");
      legs = [{ mode: "walk", title: "Walk to destination", route: walkRoute }];
      showMessage("Walking directly is shorter than walking to and from the Valenbisi stations.", "info");
      renderSummary(legs, start, destination, null, null);
    } else {
      var routes = await Promise.all([
        fetchRoute(FOOT_ROUTER_URL, start, pickup, "the walk to the pickup station"),
        fetchRoute(BIKE_ROUTER_URL, pickup, dropoff, "the bike ride"),
        fetchRoute(FOOT_ROUTER_URL, dropoff, destination, "the walk to the destination"),
      ]);
      legs = [
        { mode: "walk", title: "Walk to the pickup station", route: routes[0] },
        { mode: "bike", title: "Ride to the return station", route: routes[1] },
        { mode: "walk", title: "Walk to destination", route: routes[2] },
      ];
      stationMarker(pickup, BIKE_ICON, "Pickup station", pickup.bikes + " bikes available").addTo(routeLayer);
      stationMarker(dropoff, PARKING_ICON, "Return station", dropoff.docks + " free docks").addTo(routeLayer);
      renderSummary(legs, start, destination, pickup, dropoff);
    }

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
  var margin = 30;
  var isPhone = window.matchMedia("(max-width: 600px)").matches;
  if (isPhone) {
    var attributionHeight = map.attributionControl.getContainer().offsetHeight;
    return {
      paddingTopLeft: [margin, attributionHeight + margin],
      paddingBottomRight: [margin, panel.offsetHeight + margin],
    };
  }
  var panelRight = panel.offsetLeft + panel.offsetWidth;
  return { paddingTopLeft: [panelRight + margin, margin], paddingBottomRight: [margin, margin] };
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
  var collapsed = panel.classList.toggle("collapsed");
  toggleButton.textContent = collapsed ? "Show" : "Hide";
  toggleButton.setAttribute("aria-expanded", String(!collapsed));
}

map.on("click", onMapClick);
document.getElementById("route-form").addEventListener("submit", planRoute);
document.getElementById("locate-button").addEventListener("click", useMyLocation);
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
