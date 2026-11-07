// Geolocation: "Use my location" (the start), "Show my location" (follow), and the live location dot.

import { STREET_ZOOM } from "./config.js";
import { map, paddingOutsidePanel } from "./map.js";
import { setStart } from "./points.js";
import { clearMessage, showMessage } from "./panel.js";
import { state } from "./state.js";

// Live location: a pulsing blue dot that follows the user.
let liveLocationMarker = null;
let liveLocationWatchId = null;

// "Show my location" on the map, in every trip mode: the map follows the location
// until the user drags it.
export function showMyLocation() {
  if (!navigator.geolocation) {
    showMessage("Your browser does not support geolocation.", "error");
    return;
  }
  watchLiveLocation(); // the user pressed a button, so a permission prompt is fine here
  followLocation();
}

// Follow the live location at street level: the route overview is too far out to ride by.
// A drag on the map stops it (main.js).
export function followLocation() {
  state.followingLocation = true;
  const zoom = Math.max(map.getZoom(), STREET_ZOOM);
  const here = livePosition();
  if (here) panToLiveLocation([here.lat, here.lon], zoom);
  else map.setZoom(zoom); // the first position update pans to the dot
}

// "Use my location" next to the start field: the location becomes the start.
export function useMyLocation() {
  if (!navigator.geolocation) {
    showMessage("Your browser does not support geolocation.", "error");
    return;
  }
  // The live dot already knows where the user is. No need to wait for a new fix.
  const here = livePosition();
  if (here) {
    setStart({ lat: here.lat, lon: here.lon });
    map.setView([here.lat, here.lon], 15);
    return;
  }
  showMessage("Looking up your location...", "info");
  requestLocation(true);
}

// A precise GPS fix can take long indoors or on laptops.
// When it times out, try once more with the faster network-based location.
function requestLocation(highAccuracy) {
  navigator.geolocation.getCurrentPosition(
    function (position) {
      clearMessage();
      const point = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
      setStart(point);
      map.setView([point.lat, point.lon], 15);
      showLiveLocation(position);
      watchLiveLocation();
    },
    function (err) {
      if (err.code === err.TIMEOUT && highAccuracy) {
        requestLocation(false);
        return;
      }
      showMessage("Could not get your location: " + err.message, "error");
    },
    { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 60000 },
  );
}

export function livePosition() {
  if (!liveLocationMarker) return null;
  const latLng = liveLocationMarker.getLatLng();
  return { lat: latLng.lat, lon: latLng.lng, label: "Your location" };
}

export function watchLiveLocation() {
  if (liveLocationWatchId !== null) return;
  liveLocationWatchId = navigator.geolocation.watchPosition(
    showLiveLocation,
    function (err) {
      // Keep the last dot on short GPS gaps; remove it when the user revokes access.
      if (err.code !== err.PERMISSION_DENIED) return;
      if (state.followingLocation)
        showMessage(
          "Location access is off. The map cannot follow you.",
          "info",
        );
      navigator.geolocation.clearWatch(liveLocationWatchId);
      liveLocationWatchId = null;
      if (liveLocationMarker) liveLocationMarker.remove();
      liveLocationMarker = null;
      delete document.body.dataset.located;
    },
    { enableHighAccuracy: true, maximumAge: 10000 },
  );
}

// Show the dot at once when the user allowed location on an earlier visit. Never prompt on load.
export function watchLiveLocationIfAllowed() {
  if (!navigator.geolocation || !navigator.permissions) return;
  navigator.permissions.query({ name: "geolocation" }).then(function (status) {
    if (status.state === "granted") watchLiveLocation();
  });
}

// Centre the dot in the part of the map that the panel leaves free, at this zoom.
// A plain panTo would centre it on the whole map, which is behind the sheet on phones.
export function panToLiveLocation(latLng, zoom) {
  const dot = L.latLngBounds([latLng, latLng]);
  const options = Object.assign({ maxZoom: zoom }, paddingOutsidePanel());
  map.fitBounds(dot, options);
}

function showLiveLocation(position) {
  const latLng = [position.coords.latitude, position.coords.longitude];
  if (state.followingLocation) panToLiveLocation(latLng, map.getZoom());
  if (liveLocationMarker) {
    liveLocationMarker.setLatLng(latLng);
    return;
  }
  const icon = L.divIcon({
    className: "live-location",
    html: '<span class="pulse"></span><span class="dot"></span>',
    iconSize: [18, 18],
  });
  // Above the A/B pins, below the station pins.
  liveLocationMarker = L.marker(latLng, {
    icon: icon,
    interactive: false,
    zIndexOffset: 500,
  }).addTo(map);
  document.body.dataset.located = "true"; // style.css shows "Show nearby parking"
}
