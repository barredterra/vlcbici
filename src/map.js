// The Leaflet map: map styles, the city bike network, and the layers for stations,
// points and routes. Leaflet comes from a classic script as the global L.

import {
  BIKE_NETWORK_GROUPS,
  BIKE_NETWORK_URL,
  BIKE_STYLE,
  MIN_BIKES,
  MIN_DOCKS,
  VALENCIA_CENTER,
  WALK_STYLE,
} from "./config.js";
import { isStationLive } from "./stations.js";
import { fetchJson } from "./api.js";
import { PARKING_ICON, parkingPopup, stationPopup } from "./render.js";
import { panel, showMessage } from "./panel.js";
import { state } from "./state.js";

export const map = L.map("map").setView(VALENCIA_CENTER, 14);
// Top right, so the bottom sheet never covers the OSM credit.
// Set it before adding layers: setPosition re-adds the control, which counts their credits twice.
map.attributionControl.setPosition("topright");
// Zoom buttons below the attribution, above the layer switcher.
// Phones hide them (style.css) and use pinch zoom.
map.zoomControl.setPosition("topright");
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
    const sample = `${group.style.weight}px ${lineStyle} ${group.style.color}`;
    return `<div><span style="border-top:${sample}"></span>${group.label}</div>`;
  });
  box.innerHTML = `<strong>Bike network (City of Valencia)</strong>${rows.join("")}`;
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
const layersControl = L.control
  .layers({
    "Street map": standardLayer,
    "Cycling map (OpenStreetMap)": cyclingLayer,
    "Bike network (City of Valencia)": cityLayer,
  })
  .addTo(map);

// "Show my location", below the layer switcher, in every trip mode.
// main.js connects it to showMyLocation() in src/location.js.
// Icon from Lucide (ISC licence): "locate-fixed".
const locateControl = L.control({ position: "topright" });
locateControl.onAdd = function () {
  const button = L.DomUtil.create("button", "leaflet-control locate-control");
  button.id = "show-location-button";
  button.type = "button";
  button.title = "Show my location";
  button.setAttribute("aria-label", "Show my location");
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12h3M19 12h3M12 2v3M12 19v3" />
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="3" />
  </svg>`;
  L.DomEvent.disableClickPropagation(button); // a click must not pick a map point
  return button;
};
locateControl.addTo(map);
// These credits apply to all map styles.
map.attributionControl.addAttribution(
  'Stations, bike network and bike parking: <a href="https://opendata.vlci.valencia.es/">Valencia Open Data</a>' +
    ' | Routing: <a href="https://routing.openstreetmap.de/">FOSSGIS OSRM</a>',
);

// Stations sit below the route lines (overlayPane is 400). The canvas tolerance
// makes each circle easier to hit with a finger than it looks.
map.createPane("stations").style.zIndex = 390;
const stationRenderer = L.canvas({ pane: "stations", tolerance: 8 });
export const stationLayer = L.layerGroup().addTo(map);
export const pointLayer = L.layerGroup().addTo(map);
export const routeLayer = L.featureGroup().addTo(map);
// "Show nearby parking": the spots around the live location, before a plan.
export const nearbyParkingLayer = L.layerGroup().addTo(map);

// Popup options shared by all station markers; the class hooks the popup styles.
const STATION_POPUP_OPTIONS = { className: "station-popup", minWidth: 220 };
// Interactive: a tap on the label opens the station popup, like a tap on the pin.
const STATION_COUNT_TOOLTIP_OPTIONS = {
  className: "station-count-tooltip",
  permanent: true,
  interactive: true,
  direction: "right",
  offset: [15, 0],
};

export function drawStations(stations) {
  const now = Date.now();
  state.stationsDrawnAt = now;
  state.shownStations = stations;
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

// The same icons as the station cards in the trip summary.
// countLabel stays open next to the pin, so the count is visible without a tap.
export function stationMarker(station, icon, role, countLabel) {
  // Draw above the A/B pins: the pickup is often right next to the start.
  const options = {
    icon: pinIcon(`<span class="pin-icon">${icon}</span>`, "#c026d3"),
    zIndexOffset: 1000,
  };
  return L.marker([station.lat, station.lon], options)
    .bindPopup(stationPopup(station, role), STATION_POPUP_OPTIONS)
    .bindTooltip(countLabel, STATION_COUNT_TOOLTIP_OPTIONS);
}

// The chosen bike parking: a pin like the return station, with its spaces next to it.
export function parkingMarker(spot) {
  const options = {
    icon: pinIcon(`<span class="pin-icon">${PARKING_ICON}</span>`, "#c026d3"),
    zIndexOffset: 1000,
  };
  return L.marker([spot.lat, spot.lon], options)
    .bindPopup(parkingPopup(spot, "Bike parking"), STATION_POPUP_OPTIONS)
    .bindTooltip(
      `<span class="count-label">${spot.spaces} spaces</span>`,
      STATION_COUNT_TOOLTIP_OPTIONS,
    );
}

// Other parking near the destination: a small "P", below the route lines like the stations.
export function parkingSpotMarker(spot) {
  const icon = L.divIcon({
    className: "parking-spot",
    html: "P",
    iconSize: [16, 16],
  });
  return L.marker([spot.lat, spot.lon], {
    icon: icon,
    pane: "stations",
  }).bindPopup(parkingPopup(spot), STATION_POPUP_OPTIONS);
}

// A white outline under each line keeps it readable on busy map styles (CyclOSM).
// All outlines go first, so no outline covers the end of another leg.
export function drawLegs(legs) {
  legs.forEach(function (leg) {
    const style = leg.mode === "bike" ? BIKE_STYLE : WALK_STYLE;
    const outline = Object.assign({}, style, {
      color: "#fff",
      weight: style.weight + 4,
      opacity: 1,
    });
    L.polyline(leg.route.coordinates, outline).addTo(routeLayer);
  });
  legs.forEach(function (leg) {
    const style = leg.mode === "bike" ? BIKE_STYLE : WALK_STYLE;
    L.polyline(leg.route.coordinates, style).addTo(routeLayer);
  });
}

// Keep the route clear of the panel (above the bottom sheet on phones, right of the
// sidebar on wider screens) and of the buttons on the right. The layer button is the
// wider one, and phones hide zoom.
export function paddingOutsidePanel() {
  const margin = 30;
  const buttonsLeft = layersControl.getContainer().getBoundingClientRect().left;
  const rightPadding = map.getSize().x - buttonsLeft + margin;
  const isSidebar = window.matchMedia("(min-width: 601px)").matches; // as in style.css
  if (isSidebar) {
    return {
      paddingTopLeft: [panel.offsetWidth + margin, margin],
      paddingBottomRight: [rightPadding, margin],
    };
  }
  // On phones the attribution wraps to several lines across the top.
  const attributionBottom = map.attributionControl
    .getContainer()
    .getBoundingClientRect().bottom;
  return {
    paddingTopLeft: [margin, attributionBottom + margin],
    paddingBottomRight: [rightPadding, panel.offsetHeight + margin],
  };
}

export function pinIcon(content, colour) {
  const style =
    `width:30px;height:30px;border-radius:50%;background:${colour};` +
    "color:#fff;font:bold 14px system-ui,sans-serif;" +
    // Flex centres both letters and icons inside the border (the page uses border-box).
    "display:flex;align-items:center;justify-content:center;" +
    "border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)";
  return L.divIcon({
    className: "",
    html: `<div style="${style}">${content}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

// Keep in sync with the station legend in index.html.
function stationColour(station, now) {
  if (!isStationLive(station, now)) return "#9ca3af";
  if (station.bikes >= MIN_BIKES && station.docks >= MIN_DOCKS)
    return "#16a34a";
  if (station.bikes >= MIN_BIKES) return "#ea580c"; // bikes but nearly full
  if (station.docks >= MIN_DOCKS) return "#eab308"; // docks but few bikes
  return "#dc2626";
}

// The city may add new codes; draw unknown ones like a normal bike lane.
function bikeNetworkGroup(code) {
  const group = BIKE_NETWORK_GROUPS.find(function (g) {
    return g.codes.indexOf(code) !== -1;
  });
  return group || BIKE_NETWORK_GROUPS[0];
}
