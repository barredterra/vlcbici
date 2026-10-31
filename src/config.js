// Settings: data URLs, limits and line styles. Pure data.

export const STATIONS_URL =
  "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/228/query?where=1=1&outFields=*&f=geojson";
// The city's official cycling network ("Itinerarios Ciclistas"). Simplified to about 1 m,
// which cuts the download from 2.2 MB to 350 kB.
export const BIKE_NETWORK_URL =
  "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/189/query" +
  "?where=1=1&outFields=estado&outSR=4326&maxAllowableOffset=0.00001&f=geojson";
export const FOOT_ROUTER_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving/";
export const BIKE_ROUTER_URL =
  "https://routing.openstreetmap.de/routed-bike/route/v1/driving/";
export const GEOCODER_URL =
  "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&viewbox=-0.45,39.53,-0.28,39.40&bounded=1&q=";

export const MIN_BIKES = 3;
export const MIN_DOCKS = 3;
export const MAX_STATION_AGE_MS = 2 * 60 * 60 * 1000;
export const MAX_DISTANCE_TO_NETWORK_M = 2000; // farther from every station = outside the Valenbisi area
export const MAX_SNAP_DISTANCE_M = 300; // farther from a road or path = point is not routable
export const GEOCODER_INTERVAL_MS = 1000; // Nominatim policy: max 1 request per second
export const VALENCIA_CENTER = [39.4699, -0.3763];

// While riding, the station counts refresh every minute, and the map follows at street level.
export const STATION_REFRESH_MS = 60 * 1000;
export const STREET_ZOOM = 16;

// Same colours as --ink and --brand in style.css.
export const WALK_STYLE = {
  color: "#0f172a",
  weight: 7,
  opacity: 0.9,
  dashArray: "1 12",
  lineCap: "round",
};
export const BIKE_STYLE = { color: "#c026d3", weight: 8, opacity: 0.9 };

// Line styles for the "estado" codes of the city bike network, grouped for the legend.
export const BIKE_NETWORK_GROUPS = [
  // Bike lane, Turia park bike lane, bike path, network outside the city limits
  {
    label: "Bike lane or path",
    codes: ["1", "4", "6", "8"],
    style: { color: "#1d4ed8", weight: 4 },
  },
  // Cycle street (30 km/h), bus-bike lane, low-traffic "ciclobarrio"
  {
    label: "Shared with traffic",
    codes: ["2", "7", "9"],
    style: { color: "#0891b2", weight: 3 },
  },
  {
    label: "Pedestrian street",
    codes: ["3"],
    style: { color: "#6b7280", weight: 3, dashArray: "4 6" },
  },
  {
    label: "Closed for works",
    codes: ["5"],
    style: { color: "#f59e0b", weight: 4, dashArray: "6 6" },
  },
];
