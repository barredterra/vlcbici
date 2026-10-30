# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Visitors and tourists in Valencia who use Valenbisi, the city's bike sharing service, usually with a short-term pass. They do not know the city or the station network. They use the app on a phone, outdoors, often one-handed, just before a trip or between two rides. Their job: get from where they are to where they want to go, with a bike for the middle part, without having to find out which stations have bikes or free docks.

## Product Purpose

vlcbici plans one trip from door to door: walk to a pickup station, ride, return the bike, walk to the destination. Success means the visitor reaches a station that really has a bike, rides, and finds a free dock at the end, with no guessing on the street.

## Positioning

The full door-to-door plan in one step. The app picks the pickup and return stations from live bike and dock counts (3 or more), routes all three legs, and shows them together. A general map app does not know Valenbisi availability, and a station map does not plan the walk and ride around it.

## Operating Context

- Used on the street, on a phone, often in sunlight and in motion. The map and the bottom sheet must work with one thumb.
- A trip starts from the current location, a typed address, a map tap, or a station popup ("Start" / "Destination").
- The visitor checks the plan again during the trip: which station, how many bikes or docks, which way to walk or ride.

## Capabilities and Constraints

- Static site with no build step and no backend: `index.html`, `style.css`, `app.js`, Leaflet 1.9.4 from a CDN.
- Only public services: Valencia Open Data (station availability, city bike network), OpenStreetMap tiles, CyclOSM, FOSSGIS OSRM routing (foot and bike), Nominatim geocoding. Their usage policies apply (for example, at most one Nominatim request per second, no search while typing, `Referer` needed for OSM tiles).
- Station rules: a station counts only when it is open and reported in the last 2 hours. Pickup needs 3+ bikes, return needs 3+ free docks. A station that the visitor picks is kept even below these counts, with a warning.
- Walk-only result when the bike does not help. Points more than 2 km from every station are outside the service area.
- UI language is English. No accounts, no stored personal data. Live location only after the visitor allows it.

## Brand Commitments

- Name: "vlcbici".
- The app is unofficial. It must never look or read as if it is affiliated with Valenbisi, JCDecaux or the City of Valencia. The disclaimer stays visible in the app and the README. "Valenbisi" is used only to name the service.
- Code under the MIT License; data credits (OpenStreetMap, Valencia Open Data, CyclOSM, FOSSGIS) stay visible on the map.

## Evidence on Hand

- `README.md`: behaviour, data sources, station colour meanings.
- `screenshot.png`: a screenshot of the app.
- No users, testimonials, usage numbers or press exist. Do not invent them.

## Product Principles

1. One plan, start to end. The visitor should never have to combine station data and routes by hand.
2. Trust comes from honest data. Show how fresh station data is, warn about low counts, and say plainly when the bike does not help.
3. Built for the street. Phone first, one hand, quick to read at a glance.
4. Explain for newcomers. Assume the visitor does not know Valencia or how Valenbisi works.
5. Small and free to run. Static files and public services only; respect their usage policies.
