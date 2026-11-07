// Trip planning: from the start and destination to legs on the map and a summary.

import {
  BIKE_ROUTER_URL,
  FOOT_ROUTER_URL,
  MAX_PARKING_WALK_M,
  MIN_BIKES,
  MIN_DOCKS,
  MIN_PARKING_SPACES,
} from "./config.js";
import {
  chooseDropoffStation,
  choosePickupStation,
  findStation,
  isNearNetwork,
  nearestPoint,
  shouldWalkOnly,
} from "./stations.js";
import { fetchParkingNear, fetchRoute, fetchStations, geocode } from "./api.js";
import {
  drawLegs,
  drawStations,
  map,
  paddingOutsidePanel,
  parkingMarker,
  parkingSpotMarker,
  routeLayer,
  stationMarker,
} from "./map.js";
import { drawPoints } from "./points.js";
import { livePosition } from "./location.js";
import {
  BIKE_ICON,
  PARKING_ICON,
  pickupCountLabel,
  renderSummary,
  returnCountLabel,
} from "./render.js";
import {
  clearMessage,
  destInput,
  messageBox,
  ownBikeInput,
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
    drawPoints();

    const plan = ownBikeInput.checked
      ? await planOwnBikeTrip(state.startPoint, state.destPoint)
      : await planValenbisiTrip(state.startPoint, state.destPoint);
    state.currentTrip = plan.trip;
    renderSummary(plan.trip);
    if (plan.warnings.length) showMessage(plan.warnings.join(" "), "info");

    drawLegs(plan.trip.legs);
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

// Walk to a station with bikes, ride, return the bike at a station with docks, walk.
// Returns { trip, warnings }.
async function planValenbisiTrip(start, destination) {
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

  if (!walkOnly) {
    const legs = await fetchLegs(
      bikeLegs(origin, pickup, dropoff, destination),
    );
    const trip = bikeTrip(legs, origin, start, destination, pickup, dropoff);
    return { trip: trip, warnings: warnings };
  }

  const walkRoute = await fetchRoute(
    FOOT_ROUTER_URL,
    start,
    destination,
    "the walk",
  );
  const legs = [
    { mode: "walk", title: "Walk to destination", route: walkRoute },
  ];
  warnings.push(
    "Walking directly is shorter than walking to and from the Valenbisi stations.",
  );
  return {
    trip: tripWithoutStations(legs, start, destination),
    warnings,
  };
}

// Own bike: ride to public bike parking near the destination, then walk.
// Without parking nearby, ride to the destination. Station points count as plain points.
async function planOwnBikeTrip(start, destination) {
  const spots = await fetchParkingNear(destination);
  const parking = nearestPoint(spots, destination);
  const legs = await fetchLegs(ownBikeLegs(start, parking, destination));
  const warnings = [];
  if (!parking) {
    warnings.push(
      "No public bike parking with " +
        MIN_PARKING_SPACES +
        "+ spaces within " +
        MAX_PARKING_WALK_M +
        " m of the destination.",
    );
  }
  const trip = ownBikeTrip(legs, start, destination, parking, spots);
  return { trip: trip, warnings: warnings };
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
// The journey refreshes the counts in their popups and labels.
export function bikeTrip(legs, origin, start, destination, pickup, dropoff) {
  const pickupMarker = stationMarker(
    pickup,
    BIKE_ICON,
    "Pickup station",
    pickupCountLabel(pickup),
  );
  const dropoffMarker = stationMarker(
    dropoff,
    PARKING_ICON,
    "Return station",
    returnCountLabel(dropoff),
  );
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
    parking: null,
    parkingSpots: [],
  };
}

// Ride to the parking spot, then walk. Without a spot, ride to the destination.
export function ownBikeLegs(start, parking, destination) {
  if (!parking) {
    return [
      {
        mode: "bike",
        title: "Ride to destination",
        router: BIKE_ROUTER_URL,
        from: start,
        to: destination,
        name: "the bike ride",
      },
    ];
  }
  return [
    {
      mode: "bike",
      title: "Ride to bike parking",
      router: BIKE_ROUTER_URL,
      from: start,
      to: parking,
      name: "the bike ride",
    },
    {
      mode: "walk",
      title: "Walk to destination",
      router: FOOT_ROUTER_URL,
      from: parking,
      to: destination,
      name: "the walk to the destination",
    },
  ];
}

// Adds the parking pin and the other spots to the route layer and returns the trip.
// The data has no live counts: show the other spots too, in case the chosen one is full.
export function ownBikeTrip(legs, start, destination, parking, spots) {
  spots.forEach(function (spot) {
    if (spot !== parking) parkingSpotMarker(spot).addTo(routeLayer);
  });
  if (parking) parkingMarker(parking).addTo(routeLayer);
  const trip = tripWithoutStations(legs, start, destination);
  trip.parking = parking;
  trip.parkingSpots = spots;
  return trip;
}

// A walk-only or own-bike trip. The journey skips the station refresh for it.
function tripWithoutStations(legs, start, destination) {
  return {
    legs: legs,
    origin: start,
    start: start,
    destination: destination,
    pickup: null,
    dropoff: null,
    pickupMarker: null,
    dropoffMarker: null,
    parking: null,
    parkingSpots: [],
  };
}

// Use the picked point, or geocode the typed text.
async function resolvePoint(point, text, label) {
  if (point) return point;
  if (!text.trim())
    throw new Error("Please enter a " + label + " or click the map.");
  return geocode(text.trim(), label);
}
