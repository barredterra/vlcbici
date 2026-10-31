// App state that more than one module reads and changes.
// One plain object, because a module cannot assign to a variable that it imports.
export const state = {
  // Points picked on the map, by geolocation or already geocoded. A typed address clears them.
  startPoint: null,
  destPoint: null,

  // The last successful plan: { legs, start, destination, pickup, dropoff, pickupMarker,
  // dropoffMarker }. Walk-only trips have no stations and no station markers (null).
  currentTrip: null,

  // The stations on the map, for the buttons in their popups.
  shownStations: [],

  // While riding: the map follows the live location until the user drags it.
  followingLocation: false,
};
