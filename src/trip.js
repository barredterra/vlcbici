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
  nearbyParkingLayer,
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
  nearbyParkingLayer.clearLayers(); // the plan shows the parking near the destination
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
    state.followingLocation = false; // "Show my location" would pan away from the route
    map.fitBounds(routeLayer.getBounds(), paddingOutsidePanel());
    // The body can still be scrolled down from the form: bring the plan into view.
    tripCard.scrollIntoView({ block: "start" });
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
// A destination picked with "Park here" is that parking spot: no walk after the ride.
async function planOwnBikeTrip(start, destination) {
  const spots = await fetchParkingNear(destination);
  const pickedSpot = spots.find(function (spot) {
    return spot.id === destination.parkingId;
  });
  const parking = pickedSpot || nearestPoint(spots, destination);
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

// Before a plan, "Park here" in a parking popup plans the ride from the live location to
// this spot. Without a live location, the start stays as it is.
export function onParkingPlanClick(event) {
  const button = event.target.closest("[data-park-spot]");
  if (!button || document.body.dataset.mode !== "planning") return;
  if (planButton.disabled) return; // a plan is running
  map.closePopup();
  const here = livePosition();
  if (here) {
    state.startPoint = here;
    startInput.value = here.label;
  }
  state.destPoint = {
    lat: Number(button.dataset.lat),
    lon: Number(button.dataset.lon),
    label: "Public bike parking",
    parkingId: Number(button.dataset.parkSpot),
  };
  destInput.value = state.destPoint.label;
  drawPoints();
  routeForm.requestSubmit(); // planRoute()
}

// Own bike, before a plan: the public bike parking around the live location, with the
// same rules as near the destination. style.css shows the button only when the location is known.
export async function showNearbyParking() {
  const here = livePosition();
  nearbyParkingLayer.clearLayers();
  showMessage("Looking for bike parking near you...", "info");
  let spots;
  try {
    spots = await fetchParkingNear(here);
  } catch (err) {
    showMessage(err.message, "error");
    return;
  }
  // A plan can start while the request runs. It shows its own parking.
  if (document.body.dataset.mode !== "planning") return;
  if (!spots.length) {
    showMessage(
      "No public bike parking with " +
        MIN_PARKING_SPACES +
        "+ spaces within " +
        MAX_PARKING_WALK_M +
        " m of your location.",
      "info",
    );
    return;
  }
  clearMessage();
  spots.forEach(function (spot) {
    parkingSpotMarker(spot).addTo(nearbyParkingLayer);
  });
  const spotsAndHere = L.latLngBounds(
    spots.map(function (spot) {
      return [spot.lat, spot.lon];
    }),
  ).extend([here.lat, here.lon]);
  state.followingLocation = false; // "Show my location" would pan away from the spots
  map.fitBounds(spotsAndHere, paddingOutsidePanel());
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
// A destination that is the parking spot itself needs no walk.
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
  const rideLeg = {
    mode: "bike",
    title: "Ride to bike parking",
    router: BIKE_ROUTER_URL,
    from: start,
    to: parking,
    name: "the bike ride",
  };
  if (destination.parkingId === parking.id) return [rideLeg];
  return [
    rideLeg,
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
