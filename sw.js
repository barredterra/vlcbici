// Service worker: lets the installed app open without a connection.
// It keeps only the app files (this site and the pinned Leaflet). Station data, routes,
// geocoding, the city bike network and map tiles never pass through here: the app never
// shows old live data as current, and the OpenStreetMap tile policy stays respected.
// Network first: online, every load gets the deployed files. No version number to bump.

const CACHE = "vlcbici";
// Keep crossorigin="" on the Leaflet tags in index.html. Without it the responses are
// opaque, the service worker cannot keep them, and the app does not start offline.
const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/";
// Add each new file in src/ here too. test/sw.test.js checks this.
const APP_FILES = [
  "./",
  "about.html",
  "style.css",
  "src/api.js",
  "src/config.js",
  "src/format.js",
  "src/journey.js",
  "src/location.js",
  "src/main.js",
  "src/map.js",
  "src/panel.js",
  "src/points.js",
  "src/render.js",
  "src/state.js",
  "src/stations.js",
  "src/trip.js",
  LEAFLET + "leaflet.css",
  LEAFLET + "leaflet.js",
  // The layer button icon that leaflet.css loads.
  LEAFLET + "images/layers.png",
  LEAFLET + "images/layers-2x.png",
];

self.addEventListener("install", function (event) {
  self.skipWaiting(); // safe: the fetch handler keeps no state
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(APP_FILES);
    }),
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const isAppFile =
    new URL(request.url).origin === self.location.origin ||
    request.url.startsWith(LEAFLET);
  // Live data and tiles: no respondWith, so the browser handles them as without a service worker.
  if (request.method !== "GET" || !isAppFile) return;
  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const request = event.request;
  try {
    const response = await fetch(request);
    // Keep only full answers: cache.put rejects 206, and a CSS image from unpkg is opaque (status 0).
    if (response.status === 200) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(CACHE).then(function (cache) {
          return cache.put(request, copy);
        }),
      );
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // "/index.html" or "/?anything" without a connection: open the app.
    if (request.mode === "navigate") {
      const app = await caches.match("./");
      if (app) return app;
    }
    throw err;
  }
}
