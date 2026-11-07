import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseDropoffStation,
  choosePickupStation,
  haversineMeters,
  isNearNetwork,
  isStationLive,
  nearestPoint,
  parseStations,
  shouldWalkOnly,
} from "../src/stations.js";

const NOW = Date.parse("2026-05-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function station(id, lat, lon, bikes, docks, extra) {
  const base = { id, address: "Station " + id, open: true, bikes, docks };
  return Object.assign(base, { lat, lon, updatedAt: NOW }, extra);
}

test("parseStations reads the city GeoJSON", function () {
  const geojson = {
    features: [
      {
        properties: {
          number: 7,
          name: "007_PLAZA",
          address: "Plaza Mayor",
          open: "T",
          available: 5,
          free: 10,
          update_jcd: NOW,
        },
        geometry: { coordinates: [-0.37, 39.47] },
      },
    ],
  };
  assert.deepEqual(parseStations(geojson), [
    {
      id: 7,
      name: "007_PLAZA",
      address: "Plaza Mayor",
      open: true,
      bikes: 5,
      docks: 10,
      updatedAt: NOW,
      lat: 39.47,
      lon: -0.37,
    },
  ]);
});

test("haversineMeters measures about 111 km per degree of latitude", function () {
  const distance = haversineMeters({ lat: 39, lon: 0 }, { lat: 40, lon: 0 });
  assert.ok(Math.abs(distance - 111195) < 10);
});

test("isStationLive needs an open station with a recent report", function () {
  assert.equal(isStationLive(station(1, 0, 0, 5, 5), NOW), true);
  const closed = station(1, 0, 0, 5, 5, { open: false });
  assert.equal(isStationLive(closed, NOW), false);
  const old = station(1, 0, 0, 5, 5, { updatedAt: NOW - 3 * HOUR });
  assert.equal(isStationLive(old, NOW), false);
});

test("choosePickupStation skips stations with too few bikes", function () {
  const start = { lat: 39.47, lon: -0.376 };
  const stations = [
    station(1, 39.47, -0.376, 2, 20), // nearest, but only 2 bikes
    station(2, 39.471, -0.376, 3, 0),
    station(3, 39.48, -0.376, 10, 10),
  ];
  assert.equal(choosePickupStation(stations, start, NOW).id, 2);
});

test("chooseDropoffStation skips stations with too few docks or old data", function () {
  const destination = { lat: 39.47, lon: -0.376 };
  const old = { updatedAt: NOW - 3 * HOUR };
  const stations = [
    station(1, 39.47, -0.376, 20, 2), // nearest, but only 2 docks
    station(2, 39.471, -0.376, 0, 10, old),
    station(3, 39.48, -0.376, 0, 3),
  ];
  assert.equal(chooseDropoffStation(stations, destination, NOW).id, 3);
});

test("choosePickupStation returns null when no station qualifies", function () {
  const stations = [station(1, 39.47, -0.376, 0, 20)];
  assert.equal(
    choosePickupStation(stations, { lat: 39.47, lon: -0.376 }, NOW),
    null,
  );
});

test("shouldWalkOnly when pickup and return are the same station", function () {
  const s = station(1, 39.47, -0.376, 5, 5);
  const start = { lat: 39.4, lon: -0.376 };
  const destination = { lat: 39.5, lon: -0.376 };
  assert.equal(shouldWalkOnly(start, destination, s, s), true);
});

test("shouldWalkOnly compares station walks with the direct walk", function () {
  const start = { lat: 39.46, lon: -0.376 };
  const destination = { lat: 39.48, lon: -0.376 };
  const nearStart = station(1, 39.461, -0.376, 5, 5);
  const nearDestination = station(2, 39.479, -0.376, 5, 5);
  assert.equal(
    shouldWalkOnly(start, destination, nearStart, nearDestination),
    false,
  );
  // Stations behind the start and the destination: walking there is longer.
  const behindStart = station(3, 39.45, -0.376, 5, 5);
  const behindDestination = station(4, 39.49, -0.376, 5, 5);
  assert.equal(
    shouldWalkOnly(start, destination, behindStart, behindDestination),
    true,
  );
});

test("isNearNetwork accepts points within 2 km of a station", function () {
  const stations = [station(1, 39.47, -0.376, 5, 5)];
  assert.equal(isNearNetwork(stations, { lat: 39.48, lon: -0.376 }), true);
  assert.equal(isNearNetwork(stations, { lat: 39.5, lon: -0.376 }), false);
});

test("nearestPoint returns the closest item, or null for none", function () {
  const near = { spaces: 4, lat: 39.47, lon: -0.376 };
  const far = { spaces: 10, lat: 39.48, lon: -0.376 };
  const destination = { lat: 39.4701, lon: -0.376 };
  assert.equal(nearestPoint([far, near], destination), near);
  // No parking near the destination: the own-bike plan rides to the destination.
  assert.equal(nearestPoint([], destination), null);
});
