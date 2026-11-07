// Station data and station choice. Pure logic: no DOM, no Leaflet, no network.

import {
  MAX_DISTANCE_TO_NETWORK_M,
  MAX_STATION_AGE_MS,
  MIN_BIKES,
  MIN_DOCKS,
} from "./config.js";

export function parseStations(geojson) {
  return geojson.features.map(function (feature) {
    const p = feature.properties;
    return {
      id: p.number,
      name: p.name,
      address: p.address,
      open: p.open === "T",
      bikes: p.available,
      docks: p.free,
      updatedAt: p.update_jcd,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
    };
  });
}

// A station counts only when it is open and reported recently.
export function isStationLive(station, now) {
  const age = now - station.updatedAt;
  return station.open && age <= MAX_STATION_AGE_MS;
}

export function choosePickupStation(stations, start, now) {
  const candidates = stations.filter(function (s) {
    return isStationLive(s, now) && s.bikes >= MIN_BIKES;
  });
  return nearestPoint(candidates, start);
}

export function chooseDropoffStation(stations, destination, now) {
  const candidates = stations.filter(function (s) {
    return isStationLive(s, now) && s.docks >= MIN_DOCKS;
  });
  return nearestPoint(candidates, destination);
}

export function findStation(stations, id) {
  return stations.find(function (s) {
    return s.id === id;
  });
}

// A bike only helps when walking to and from the stations is shorter than walking directly.
export function shouldWalkOnly(start, destination, pickup, dropoff) {
  if (pickup.id === dropoff.id) return true;
  const stationWalks =
    haversineMeters(start, pickup) + haversineMeters(dropoff, destination);
  const directWalk = haversineMeters(start, destination);
  return stationWalks >= directWalk;
}

export function isNearNetwork(stations, point) {
  const closest = nearestPoint(stations, point);
  return haversineMeters(point, closest) <= MAX_DISTANCE_TO_NETWORK_M;
}

// The item closest to point, or null for an empty list. Items need lat and lon.
export function nearestPoint(items, point) {
  let best = null;
  let bestDistance = Infinity;
  items.forEach(function (item) {
    const distance = haversineMeters(point, item);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  });
  return best;
}

export function haversineMeters(a, b) {
  const earthRadius = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLon * sinLon;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}
