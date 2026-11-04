// vlcbici: route planner for Valencia (walk -> Valenbisi bike -> walk), in plain JavaScript.
// This file connects the page events to the modules and starts the app.

import { fetchStations } from "./api.js";
import { STATION_REFRESH_MS } from "./config.js";
import { drawStations, map } from "./map.js";
import { onMapClick, onStationButtonClick } from "./points.js";
import { useMyLocation, watchLiveLocationIfAllowed } from "./location.js";
import { editTrip, planRoute } from "./trip.js";
import {
  clearAll,
  followLocation,
  onRideStationClick,
  startJourney,
} from "./journey.js";
import {
  clearMessage,
  destInput,
  messageBox,
  showMessage,
  startInput,
  toggleButton,
  togglePanel,
} from "./panel.js";
import { state } from "./state.js";

map.on("click", onMapClick);
document.addEventListener("click", onStationButtonClick);
document.addEventListener("click", onRideStationClick);
document.getElementById("route-form").addEventListener("submit", planRoute);
document
  .getElementById("locate-button")
  .addEventListener("click", useMyLocation);
document.getElementById("clear-button").addEventListener("click", clearAll);
document
  .getElementById("start-journey-button")
  .addEventListener("click", startJourney);
document.getElementById("edit-trip-button").addEventListener("click", editTrip);
document
  .getElementById("follow-button")
  .addEventListener("click", followLocation);
document
  .getElementById("end-journey-button")
  .addEventListener("click", clearAll);
// Dragging the map means "let me look around": stop following for this journey.
map.on("dragstart", function () {
  state.followingLocation = false;
});
toggleButton.addEventListener("click", togglePanel);
startInput.addEventListener("input", function () {
  state.startPoint = null;
});
destInput.addEventListener("input", function () {
  state.destPoint = null;
});

// Show the station map right away; planning fetches fresh data again.
// When a later load works, remove the old load error, but keep other messages.
let stationLoadError = "";
function loadStations() {
  fetchStations()
    .then(function (stations) {
      drawStations(stations);
      if (stationLoadError && messageBox.textContent === stationLoadError) {
        clearMessage();
      }
      stationLoadError = "";
    })
    .catch(function (err) {
      stationLoadError = err.message;
      showMessage(err.message, "error");
    });
}
loadStations();

// An installed app has no reload button and can stay in the background for hours.
// Load the station counts again when it comes back. While riding, journey.js does this.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible") return;
  if (document.body.dataset.mode === "riding") return;
  if (Date.now() - state.stationsDrawnAt < STATION_REFRESH_MS) return;
  loadStations();
});

watchLiveLocationIfAllowed();

// Installable app; without a connection it only opens (see sw.js).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
