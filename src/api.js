// Network calls: station data, geocoding and routing.

import {
  GEOCODER_INTERVAL_MS,
  GEOCODER_URL,
  MAX_SNAP_DISTANCE_M,
  STATIONS_URL,
} from "./config.js";
import { parseStations } from "./stations.js";

export async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(networkReason(err));
  }
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " from " + new URL(url).host);
  }
  return response.json();
}

export async function fetchStations() {
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

export async function geocode(text, label) {
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
export async function fetchRoute(routerUrl, from, to, legName) {
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
      "Routing request failed for " +
        legName +
        " (" +
        networkReason(err) +
        ").",
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

// Each browser has its own text for a failed fetch ("Failed to fetch", "Load failed").
// Without a connection, say so plainly.
function networkReason(err) {
  return navigator.onLine ? err.message : "no internet connection";
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
