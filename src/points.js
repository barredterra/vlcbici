// The start and destination points: their map pins and form fields,
// set by map clicks and by the buttons in station popups.

import { map, pinIcon, pointLayer } from "./map.js";
import { destInput, planButton, startInput } from "./panel.js";
import { findStation } from "./stations.js";
import { escapeHtml, pointText } from "./format.js";
import { state } from "./state.js";

// A tap on the map while a popup is open only closes the popup: it must not also set a point.
// Leaflet closes the popup on "preclick". main.js adds this listener first, so it runs before.
let popupWasOpen = false;
export function onMapPreclick() {
  popupWasOpen = document.querySelector(".leaflet-popup") !== null;
}

export function onMapClick(event) {
  if (document.body.dataset.mode !== "planning") return; // the form is hidden
  if (planButton.disabled) return; // a plan is running
  if (popupWasOpen) return;
  const point = { lat: event.latlng.lat, lon: event.latlng.lng };
  // Fill the empty field; when both are filled, start again.
  const startEmpty = !startInput.value.trim();
  const destFilled = destInput.value.trim() !== "";
  const pickStart = startEmpty || destFilled;
  if (pickStart) {
    state.destPoint = null;
    destInput.value = "";
    setStart(point);
  } else {
    setDestination(point);
  }
}

// A station as start means "pick up the bike here", as destination "return it here".
export function onStationButtonClick(event) {
  const button = event.target.closest("[data-use-station]");
  if (!button || document.body.dataset.mode !== "planning") return;
  if (planButton.disabled) return;
  const station = findStation(
    state.shownStations,
    Number(button.dataset.stationId),
  );
  const point = {
    lat: station.lat,
    lon: station.lon,
    label: station.address,
    stationId: station.id,
  };
  const text = "Station " + station.id + ": " + station.address;
  if (button.dataset.useStation === "start") {
    state.startPoint = point;
    startInput.value = text;
  } else {
    state.destPoint = point;
    destInput.value = text;
  }
  drawPoints();
  map.closePopup();
}

export function setStart(point) {
  state.startPoint = point;
  startInput.value = pointText(point);
  drawPoints();
}

function setDestination(point) {
  state.destPoint = point;
  destInput.value = pointText(point);
  drawPoints();
}

// Same colours as --start and --dest in style.css.
export function drawPoints() {
  pointLayer.clearLayers();
  if (state.startPoint) {
    L.marker([state.startPoint.lat, state.startPoint.lon], {
      icon: pinIcon("A", "#0f172a"),
    })
      .bindPopup(escapeHtml(state.startPoint.label || "Start"))
      .addTo(pointLayer);
  }
  if (state.destPoint) {
    L.marker([state.destPoint.lat, state.destPoint.lon], {
      icon: pinIcon("B", "#c026d3"),
    })
      .bindPopup(escapeHtml(state.destPoint.label || "Destination"))
      .addTo(pointLayer);
  }
}
