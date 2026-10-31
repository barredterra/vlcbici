// Trip planning: from the start and destination to legs on the map and a summary.

import {
  BIKE_ROUTER_URL,
  FOOT_ROUTER_URL,
  MIN_BIKES,
  MIN_DOCKS,
} from "./config.js";
import {
  chooseDropoffStation,
  choosePickupStation,
  findStation,
  isNearNetwork,
  shouldWalkOnly,
} from "./stations.js";
import { fetchRoute, fetchStations, geocode } from "./api.js";
import {
  drawLegs,
  drawStations,
  map,
  paddingOutsidePanel,
  routeLayer,
  stationMarker,
} from "./map.js";
import { drawPoints } from "./points.js";
import { livePosition } from "./location.js";
import { BIKE_ICON, PARKING_ICON, renderSummary } from "./render.js";
import {
  clearMessage,
  destInput,
  messageBox,
  planButton,
  routeForm,
  setFormDisabled,
  setMode,
  showMessage,
  startInput,
  summaryBox,
  tripCard,
} from "./panel.js";
import { state } from "./state.js";

export async function planRoute(event) {
  event.preventDefault();
  clearMessage();
  summaryBox.innerHTML = "";
  state.currentTrip = null;
  routeLayer.clearLayers();
  setFormDisabled(true); // no edits, clicks or Clear while a plan is running
  planButton.textContent = "Planning...";

  try {
    // Store each point as soon as it resolves, so a retry does not geocode it again.
    state.startPoint = await resolvePoint(
      state.startPoint,
      startInput.value,
      "start",
    );
    state.destPoint = await resolvePoint(
      state.destPoint,
      destInput.value,
      "destination",
    );
    const start = state.startPoint;
    const destination = state.destPoint;
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
      state.currentTrip = {
        legs: legs,
        origin: start,
        start: start,
        destination: destination,
        pickup: null,
        dropoff: null,
        pickupMarker: null,
        dropoffMarker: null,
      };
    } else {
      legs = await fetchLegs(bikeLegs(origin, pickup, dropoff, destination));
      state.currentTrip = bikeTrip(
        legs,
        origin,
        start,
        destination,
        pickup,
        dropoff,
      );
    }
    renderSummary(state.currentTrip);
    if (warnings.length) showMessage(warnings.join(" "), "info");

    drawLegs(legs);
    // Before fitBounds: the form closes, so the phone sheet gets shorter.
    setMode("planned");
    map.fitBounds(routeLayer.getBounds(), paddingOutsidePanel());
    // In a short panel (phones, landscape) the plan can be below the fold: bring it into view.
    const firstResult = messageBox.textContent ? messageBox : tripCard;
    firstResult.scrollIntoView({ block: "start" });
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    setFormDisabled(false);
    planButton.textContent = "Plan route";
  }
}

export function editTrip() {
  setMode("planning");
  // On phones the sheet is still scrolled down to the trip, below the form.
  routeForm.scrollIntoView({ block: "start" });
}

// Walk to the pickup station (only with an origin), ride, then walk to the destination.
// A destination station is where the bike goes back: no walk after it.
export function bikeLegs(origin, pickup, dropoff, destination) {
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
  if (destination.stationId !== dropoff.id) {
    plannedLegs.push({
      mode: "walk",
      title: "Walk to destination",
      router: FOOT_ROUTER_URL,
      from: dropoff,
      to: destination,
      name: "the walk to the destination",
    });
  }
  return plannedLegs;
}

export async function fetchLegs(plannedLegs) {
  const routes = await Promise.all(
    plannedLegs.map(function (leg) {
      return fetchRoute(leg.router, leg.from, leg.to, leg.name);
    }),
  );
  return plannedLegs.map(function (leg, i) {
    return { mode: leg.mode, title: leg.title, route: routes[i] };
  });
}

// Adds the pickup and return pins to the route layer and returns the trip.
// The journey refreshes the counts in their popups.
export function bikeTrip(legs, origin, start, destination, pickup, dropoff) {
  const pickupMarker = stationMarker(pickup, BIKE_ICON, "Pickup station");
  const dropoffMarker = stationMarker(dropoff, PARKING_ICON, "Return station");
  pickupMarker.addTo(routeLayer);
  dropoffMarker.addTo(routeLayer);
  return {
    legs: legs,
    origin: origin,
    start: origin || start,
    destination: destination,
    pickup: pickup,
    dropoff: dropoff,
    pickupMarker: pickupMarker,
    dropoffMarker: dropoffMarker,
  };
}

// Use the picked point, or geocode the typed text.
async function resolvePoint(point, text, label) {
  if (point) return point;
  if (!text.trim())
    throw new Error("Please enter a " + label + " or click the map.");
  return geocode(text.trim(), label);
}
