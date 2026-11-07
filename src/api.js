// Network calls: station data, geocoding and routing.

import {
  GEOCODER_INTERVAL_MS,
  GEOCODER_URL,
  MAX_PARKING_WALK_M,
  MAX_SNAP_DISTANCE_M,
  MIN_PARKING_SPACES,
  PARKING_URL,
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
  const geojson = await fetchGeoportal(STATIONS_URL, "Valenbisi station data");
  return parseStations(geojson);
}

// Public bike parking with enough spaces near a point: [{ id, spaces, lat, lon }, ...].
export async function fetchParkingNear(point) {
  const query = new URLSearchParams({
    where: "numplazas >= " + MIN_PARKING_SPACES,
    geometry: point.lon + "," + point.lat,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    distance: MAX_PARKING_WALK_M,
    units: "esriSRUnit_Meter",
    outFields: "objectid,numplazas",
    outSR: "4326",
    f: "geojson",
  });
  const geojson = await fetchGeoportal(
    PARKING_URL + "?" + query,
    "bike parking data",
  );
  return geojson.features.map(function (feature) {
    return {
      id: feature.properties.objectid,
      spaces: feature.properties.numplazas,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
    };
  });
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

// The city geoportal (ArcGIS) reports query errors as HTTP 200 with an "error" body.
async function fetchGeoportal(url, dataName) {
  let geojson;
  try {
    geojson = await fetchJson(url);
  } catch (err) {
    throw new Error("Could not load " + dataName + " (" + err.message + ").");
  }
  if (!geojson.features) {
    const reason = geojson.error
      ? geojson.error.message
      : "unexpected response";
    throw new Error("Could not load " + dataName + " (" + reason + ").");
  }
  return geojson;
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
