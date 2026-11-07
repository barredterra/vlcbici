// The journey ("riding" mode): follow the live location, refresh the station counts,
// and plan again with a station or parking spot picked in a popup.

import { MIN_BIKES, MIN_DOCKS, STATION_REFRESH_MS } from "./config.js";
import {
  chooseDropoffStation,
  choosePickupStation,
  findStation,
  isStationLive,
} from "./stations.js";
import { fetchStations } from "./api.js";
import {
  drawLegs,
  drawStations,
  map,
  nearbyParkingLayer,
  pointLayer,
  routeLayer,
  stationLayer,
} from "./map.js";
import { followLocation, livePosition, watchLiveLocation } from "./location.js";
import {
  bikeLegs,
  bikeTrip,
  fetchLegs,
  ownBikeLegs,
  ownBikeTrip,
} from "./trip.js";
import {
  pickupCountLabel,
  renderSummary,
  returnCountLabel,
  stationPopup,
} from "./render.js";
import {
  clearMessage,
  destInput,
  routeForm,
  setMode,
  showPanelBody,
  showMessage,
  startInput,
  summaryBox,
} from "./panel.js";
import { drawPoints } from "./points.js";
import { state } from "./state.js";

let stationRefreshTimer = null;

export function startJourney() {
  setMode("riding");
  // The user pressed a button, so a permission prompt is fine here.
  if (navigator.geolocation) {
    watchLiveLocation();
    followLocation();
  } else {
    showMessage(
      "Your browser does not support geolocation. The map cannot follow you.",
      "info",
    );
  }
  // Also for walk-only trips: a station popup can add a bike while riding.
  stationRefreshTimer = setInterval(refreshTripStations, STATION_REFRESH_MS);
}

// "Edit", with a plan or while riding: back to the form, with the points kept.
export function editTrip() {
  stopJourney();
  setMode("planning");
  showPanelBody();
  // On phones the sheet is still scrolled down to the trip, below the form.
  routeForm.scrollIntoView({ block: "start" });
}

// "Clear" and "End journey".
export function clearAll() {
  stopJourney();
  state.startPoint = null;
  state.destPoint = null;
  startInput.value = "";
  destInput.value = "";
  pointLayer.clearLayers();
  routeLayer.clearLayers();
  nearbyParkingLayer.clearLayers();
  summaryBox.innerHTML = "";
  state.currentTrip = null;
  clearMessage();
  setMode("planning");
}

function stopJourney() {
  clearInterval(stationRefreshTimer);
  state.followingLocation = false;
}

// While riding, "Pick up here" and "Return here" in a station popup plan the trip again
// with that station. A new pickup station gets a walk from the live location.
export async function onRideStationClick(event) {
  const button = event.target.closest("[data-ride-station]");
  if (!button || document.body.dataset.mode !== "riding") return;
  map.closePopup();
  const trip = state.currentTrip;
  const stations = state.shownStations;
  const station = findStation(stations, Number(button.dataset.stationId));

  // A walk-only trip gets the stations that a normal plan would choose.
  const now = Date.now();
  let origin = trip.origin;
  let pickup = trip.pickup || choosePickupStation(stations, trip.start, now);
  let dropoff =
    trip.dropoff || chooseDropoffStation(stations, trip.destination, now);
  if (button.dataset.rideStation === "pickup") {
    pickup = station;
    origin = livePosition() || trip.start;
  } else {
    dropoff = station;
  }
  if (!pickup || !dropoff) {
    showMessage(
      "No open station with enough bikes or docks right now.",
      "error",
    );
    return;
  }
  if (pickup.id === dropoff.id) {
    showMessage("Pickup and return must be different stations.", "error");
    return;
  }

  showMessage("Planning the route with the new station...", "info");
  let legs;
  try {
    legs = await fetchLegs(bikeLegs(origin, pickup, dropoff, trip.destination));
  } catch (err) {
    if (state.currentTrip === trip) showMessage(err.message, "error"); // keep the old plan
    return;
  }
  // The journey can end, or another station pick replace the trip, while the routes load.
  if (state.currentTrip !== trip) return;

  routeLayer.clearLayers();
  state.currentTrip = bikeTrip(
    legs,
    origin,
    trip.start,
    trip.destination,
    pickup,
    dropoff,
  );
  drawLegs(legs);
  renderSummary(state.currentTrip);
  showTripWarnings(state.currentTrip);
}

// With a planned own-bike trip, "Park here" in a parking popup plans the trip again
// with that spot. Like "Return here", the ride still starts at the start.
// A destination that is a parking spot ("Park here" before the plan) moves to the new spot.
// Otherwise the walk to the destination starts at the new spot.
export async function onParkHereClick(event) {
  const button = event.target.closest("[data-park-spot]");
  if (!button || document.body.dataset.mode === "planning") return;
  map.closePopup();
  const trip = state.currentTrip;
  const spotId = Number(button.dataset.parkSpot);
  const parking = trip.parkingSpots.find(function (spot) {
    return spot.id === spotId;
  });

  let destination = trip.destination;
  if (destination.parkingId) {
    destination = {
      lat: parking.lat,
      lon: parking.lon,
      label: destination.label,
      parkingId: parking.id,
    };
  }

  showMessage("Planning the route with the new parking...", "info");
  let legs;
  try {
    legs = await fetchLegs(ownBikeLegs(trip.start, parking, destination));
  } catch (err) {
    if (state.currentTrip === trip) showMessage(err.message, "error"); // keep the old plan
    return;
  }
  // The journey can end, or another pick replace the trip, while the routes load.
  if (state.currentTrip !== trip) return;

  routeLayer.clearLayers();
  state.currentTrip = ownBikeTrip(
    legs,
    trip.start,
    destination,
    parking,
    trip.parkingSpots,
  );
  state.destPoint = destination; // for "Edit"
  drawPoints(); // the B pin
  drawLegs(legs);
  renderSummary(state.currentTrip);
  clearMessage();
}

// Load the station counts again and warn when the pickup or return station runs low.
async function refreshTripStations() {
  const trip = state.currentTrip;
  if (!trip.pickup) return; // walk only
  let stations;
  try {
    stations = await fetchStations();
  } catch (err) {
    if (state.currentTrip === trip) showMessage(err.message, "error"); // keep the old plan
    return;
  }
  // The journey can end, and a new one start, while the request runs.
  if (state.currentTrip !== trip) return;

  // A redraw closes an open station popup: keep the old dots until the next refresh.
  const popupOpen = stationLayer.getLayers().some(function (marker) {
    return marker.isPopupOpen();
  });
  if (!popupOpen) drawStations(stations);
  // A station that left the feed keeps its old counts, which turn grey once they are too old.
  trip.pickup = findStation(stations, trip.pickup.id) || trip.pickup;
  trip.dropoff = findStation(stations, trip.dropoff.id) || trip.dropoff;
  trip.pickupMarker.setPopupContent(
    stationPopup(trip.pickup, "Pickup station"),
  );
  trip.dropoffMarker.setPopupContent(
    stationPopup(trip.dropoff, "Return station"),
  );
  trip.pickupMarker.setTooltipContent(pickupCountLabel(trip.pickup));
  trip.dropoffMarker.setTooltipContent(returnCountLabel(trip.dropoff));

  // The new summary closes the open "Directions": open them again.
  const openDirections = Array.from(summaryBox.querySelectorAll("details")).map(
    function (details) {
      return details.open;
    },
  );
  renderSummary(trip);
  summaryBox.querySelectorAll("details").forEach(function (details, i) {
    details.open = openDirections[i];
  });
  showTripWarnings(trip);
}

function showTripWarnings(trip) {
  const now = Date.now();
  const pickup = trip.pickup;
  const dropoff = trip.dropoff;
  const warnings = [];
  if (!isStationLive(pickup, now))
    warnings.push(
      "The pickup station " + pickup.address + " is closed or not reporting.",
    );
  else if (pickup.bikes < MIN_BIKES)
    warnings.push(
      "The pickup station " +
        pickup.address +
        " now has only " +
        pickup.bikes +
        " bikes.",
    );
  if (!isStationLive(dropoff, now))
    warnings.push(
      "The return station " + dropoff.address + " is closed or not reporting.",
    );
  else if (dropoff.docks < MIN_DOCKS)
    warnings.push(
      "The return station " +
        dropoff.address +
        " now has only " +
        dropoff.docks +
        " free docks.",
    );
  if (warnings.length) showMessage(warnings.join(" "), "info");
  else clearMessage();
}
