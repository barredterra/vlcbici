# Valenbisi Route Planner

A small static web app that plans a trip in Valencia with walking and Valenbisi bike sharing.

## What it does

1. You enter a start and a destination. You can type an address, click the map, or use your current location for the start.
2. The app loads live Valenbisi station data.
3. It selects the pickup station: the nearest station to the start with 3 or more available bikes.
4. It selects the return station: the nearest station to the destination with 3 or more free docks.
5. It requests three routes at the same time:
   - walk from the start to the pickup station,
   - ride from the pickup station to the return station,
   - walk from the return station to the destination.
6. It shows the routes on the map (walking as red dots, bike as a solid red line), a summary with distance and time per leg, and turn-by-turn directions.

If the pickup and return stations are the same, or if walking to and from the stations is longer than walking directly, the app shows only a walking route.

The app rejects a start or destination that is more than 2 km from every Valenbisi station.

The app ignores stations that are closed or that did not report data in the last 2 hours.

The map shows all stations as small circles:

| Colour | Meaning                                        |
| ------ | ---------------------------------------------- |
| Green  | 3+ bikes and 3+ free docks                     |
| Orange | 3+ bikes, fewer than 3 free docks              |
| Yellow | 3+ free docks, fewer than 3 bikes              |
| Red    | fewer than 3 bikes and fewer than 3 free docks |
| Grey   | closed or no recent data                       |

Map clicks fill the empty field: first the start, then the destination. When both fields are filled, the next click starts again.

## Data sources

- Station availability: [Valenbisi disponibilidad, Valencia Open Data](https://opendata.vlci.valencia.es/en/dataset/valenbisi-disponibilitat-valenbisi-dsiponibilidad), loaded live from the city geoportal (GeoJSON).
- Map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors.
- "Cycling map (OpenStreetMap)" map style (switch with the layer button at the top right): [CyclOSM](https://www.cyclosm.org/), hosted by OpenStreetMap France. It shows bike lanes, cycle tracks and bike parking.
- "Bike network (City of Valencia)" map style: [Itinerarios Ciclistas, Valencia Open Data](https://opendata.vlci.valencia.es/dataset/itinerarios-ciclistas-itineraris-ciclistes), drawn over the street map with a legend. It also marks sections closed for works. The app loads it (about 350 kB) only when you choose this map style.
- Routing: [OSRM on OSM data by FOSSGIS](https://routing.openstreetmap.de/) (foot and bike profiles).
- Geocoding: [Nominatim](https://nominatim.openstreetmap.org/). The app sends at most one search per second, only when you click "Plan route", and keeps each result until you change the text. It sends no search while you type.
- Map library: [Leaflet 1.9.4](https://leafletjs.com/).

## How to run

The app has no build step and no backend. Serve the folder with any static web server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Do not open `index.html` directly from disk (`file://`). The browser then sends no `Referer` header, and the OpenStreetMap tile server blocks tile requests without it. Privacy extensions that strip the `Referer` cause the same problem. See <https://wiki.openstreetmap.org/wiki/Blocked_tiles>.

"Use my location" needs `localhost` or HTTPS, because browsers allow geolocation only in a secure context.

## Files

- `index.html`: page layout.
- `style.css`: styles, including the mobile layout.
- `app.js`: all logic. Pure functions (distance, station selection, step text) are at the top. Network calls and the map/UI code follow.

## License

The code is under the [MIT License](LICENSE). It does not cover the data that the app loads:

- Map data: © OpenStreetMap contributors, under the [ODbL](https://www.openstreetmap.org/copyright).
- Station availability and bike network: Valencia Open Data, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
