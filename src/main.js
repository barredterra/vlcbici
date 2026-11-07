// vlcbici: route planner for Valencia (walk -> Valenbisi bike -> walk, or own bike -> walk),
// in plain JavaScript.
// This file connects the page events to the modules and starts the app.

import { fetchStations } from "./api.js";
import { STATION_REFRESH_MS } from "./config.js";
import { drawStations, map, nearbyParkingLayer, stationLayer } from "./map.js";
import { onMapClick, onStationButtonClick } from "./points.js";
import {
  showMyLocation,
  useMyLocation,
  watchLiveLocationIfAllowed,
} from "./location.js";
import { onParkingPlanClick, planRoute, showNearbyParking } from "./trip.js";
import {
  clearAll,
  editTrip,
  onParkHereClick,
  onRideStationClick,
  startJourney,
} from "./journey.js";
import {
  clearMessage,
  destInput,
  messageBox,
  ownBikeInput,
  showMessage,
  startInput,
} from "./panel.js";
import { state } from "./state.js";

map.on("click", onMapClick);
document.addEventListener("click", onStationButtonClick);
document.addEventListener("click", onRideStationClick);
document.addEventListener("click", onParkHereClick);
document.addEventListener("click", onParkingPlanClick);
document.getElementById("route-form").addEventListener("submit", planRoute);
document
  .getElementById("locate-button")
  .addEventListener("click", useMyLocation);
document
  .getElementById("show-location-button")
  .addEventListener("click", showMyLocation);
document.getElementById("clear-button").addEventListener("click", clearAll);
document
  .getElementById("nearby-parking-button")
  .addEventListener("click", showNearbyParking);
document
  .getElementById("start-journey-button")
  .addEventListener("click", startJourney);
document.getElementById("edit-trip-button").addEventListener("click", editTrip);
document
  .getElementById("end-journey-button")
  .addEventListener("click", clearAll);
// Dragging the map means "let me look around": stop following for this journey.
map.on("dragstart", function () {
  state.followingLocation = false;
});
startInput.addEventListener("input", function () {
  state.startPoint = null;
});
destInput.addEventListener("input", function () {
  state.destPoint = null;
});

// Remember the bike choice for the next visit: people with their own bike use it every time.
// Storage can be blocked (private mode). Then the choice starts at Valenbisi.
const BIKE_CHOICE_KEY = "vlcbici-bike";
try {
  ownBikeInput.checked = localStorage.getItem(BIKE_CHOICE_KEY) === "own";
} catch (err) {}
showBikeChoice();
document
  .querySelector(".bike-choice")
  .addEventListener("change", function (event) {
    showBikeChoice();
    try {
      localStorage.setItem(BIKE_CHOICE_KEY, event.target.value);
    } catch (err) {}
  });

// With an own bike, the Valenbisi stations are noise: hide them and their legend.
// With Valenbisi, the nearby bike parking is noise.
function showBikeChoice() {
  const ownBike = ownBikeInput.checked;
  document.body.dataset.bike = ownBike ? "own" : "valenbisi";
  if (ownBike) {
    stationLayer.remove();
  } else {
    stationLayer.addTo(map);
    nearbyParkingLayer.clearLayers();
  }
}

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
