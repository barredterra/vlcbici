// HTML for the station and parking popups and the trip summary.

import {
  MIN_BIKES,
  MIN_DOCKS,
  MIN_PARKING_SPACES,
  VALENBISI_APP_URL,
} from "./config.js";
import { isStationLive } from "./stations.js";
import {
  escapeHtml,
  formatAge,
  formatDistance,
  formatMinutes,
  formatStep,
  pointText,
  shortPlaceName,
} from "./format.js";
import { summaryBox } from "./panel.js";

// Icons from Lucide (ISC licence): "bike" and "square-parking".
export const BIKE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="18.5" cy="17.5" r="3.5"/>
  <circle cx="5.5" cy="17.5" r="3.5"/>
  <circle cx="15" cy="5" r="1"/>
  <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
</svg>`;
export const PARKING_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <rect width="18" height="18" x="3" y="3" rx="2"/>
  <path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>
</svg>`;

// role: "Pickup station" or "Return station" on the route markers, empty otherwise.
// The "plan" buttons are handled in onStationButtonClick. They help when a
// station hides the spot to click. The "ride" buttons are handled in
// onRideStationClick. style.css shows one row of buttons per trip mode.
export function stationPopup(station, role) {
  const now = Date.now();
  const age = formatAge(now - station.updatedAt);
  const live = isStationLive(station, now);
  let status = "Updated " + age;
  if (!station.open) status = "Closed";
  else if (!live) status = "No recent data (last update " + age + ")";
  // Counts of a closed or silent station are not reliable: grey them out.
  const statsClass = live ? "popup-stats" : "popup-stats stale";
  const roleHtml = role ? `<div class="popup-role">${role}</div>` : "";

  return `
    ${roleHtml}
    <div class="popup-title">${escapeHtml(station.address)}</div>
    <div class="popup-sub">Station ${station.id}</div>
    <div class="${statsClass}">
      ${popupStatHtml(BIKE_ICON, station.bikes, "bikes", MIN_BIKES)}
      ${popupStatHtml(PARKING_ICON, station.docks, "free docks", MIN_DOCKS)}
    </div>
    <div class="popup-status">${status}</div>
    <div class="popup-actions plan-actions">
      <button type="button" data-use-station="start" data-station-id="${station.id}"><span class="ab-badge" aria-hidden="true">A</span>Start</button>
      <button type="button" data-use-station="destination" data-station-id="${station.id}"><span class="ab-badge dest" aria-hidden="true">B</span>Destination</button>
    </div>
    <div class="popup-actions ride-actions">
      <button type="button" data-ride-station="pickup" data-station-id="${station.id}">Pick up here</button>
      <button type="button" data-ride-station="return" data-station-id="${station.id}">Return here</button>
    </div>`;
}

export function renderSummary(trip) {
  const legs = trip.legs;
  const pickup = trip.pickup;
  const dropoff = trip.dropoff;
  let totalDistance = 0;
  let totalDuration = 0;
  legs.forEach(function (leg) {
    totalDistance += leg.route.distance;
    totalDuration += leg.route.duration;
  });

  // The station cards frame the bike leg. A trip can lack the first or last walk.
  // An own-bike trip has no stations, only a parking card after the ride, if a spot was found.
  const legsHtml = legs.map(function (leg) {
    if (leg.mode !== "bike") return legHtml(leg);
    if (!pickup) {
      const parkingHtml = trip.parking ? parkingCardHtml(trip.parking) : "";
      return legHtml(leg) + parkingHtml;
    }
    return (
      stationCardHtml(
        BIKE_ICON,
        "Pick up a bike",
        pickup,
        `${pickup.bikes} bikes`,
        { href: VALENBISI_APP_URL, label: "Open Valenbisi app" },
      ) +
      legHtml(leg) +
      stationCardHtml(
        PARKING_ICON,
        "Return the bike",
        dropoff,
        `${dropoff.docks} free docks`,
      )
    );
  });

  // A trip that ends at a picked return station or parking spot ends with its card:
  // no B line after it.
  const destination = trip.destination;
  const endsAtStation = dropoff && destination.stationId === dropoff.id;
  const endsAtParking =
    trip.parking && destination.parkingId === trip.parking.id;
  const destinationHtml =
    endsAtStation || endsAtParking
      ? ""
      : endpointHtml("B", "dest", destination);

  summaryBox.innerHTML = `
    <div class="trip-header">
      <h2>Your trip</h2>
      <span class="trip-total">${formatDistance(totalDistance)} &middot; ${formatMinutes(totalDuration)}</span>
    </div>
    ${endpointHtml("A", "start", trip.start)}
    ${legsHtml.join("")}
    ${destinationHtml}`;
}

// The A or B end of the timeline. It shows what the geocoder found, so a
// wrong match is visible. A clicked point has no name: show its coordinates.
// The full name is in the tooltip and in the popup of the pin on the map.
function endpointHtml(letter, kind, point) {
  const name = point.label || pointText(point);
  return `
    <div class="endpoint ${kind}" title="${escapeHtml(name)}">
      <span class="ab-badge ${kind}" aria-hidden="true">${letter}</span>${escapeHtml(shortPlaceName(name))}
    </div>`;
}

// role: "Bike parking" on the chosen spot, empty on the other spots. Only the other
// spots get "Park here": before a plan onParkingPlanClick (trip.js), with a plan
// onParkHereClick (journey.js).
export function parkingPopup(spot, role) {
  const roleHtml = role ? `<div class="popup-role">${role}</div>` : "";
  const actionsHtml = role
    ? ""
    : `<div class="popup-actions park-actions">
        <button type="button" data-park-spot="${spot.id}" data-lat="${spot.lat}" data-lon="${spot.lon}">
          Park here
        </button>
      </div>`;
  return `
    ${roleHtml}
    <div class="popup-title">Public bike parking</div>
    <div class="popup-sub">City of Valencia</div>
    <div class="popup-stats">
      ${popupStatHtml(PARKING_ICON, spot.spaces, "spaces", MIN_PARKING_SPACES)}
    </div>
    <div class="popup-status">No live data: the spaces can be full.</div>
    ${actionsHtml}`;
}

// The open labels next to the pickup and return pins on the map.
export function pickupCountLabel(station) {
  return countLabelHtml(station.bikes, "free bikes", MIN_BIKES);
}

export function returnCountLabel(station) {
  return countLabelHtml(station.docks, "free docks", MIN_DOCKS);
}

function countLabelHtml(count, label, minimum) {
  const low = count < minimum ? " low" : "";
  return `<span class="count-label${low}">${count} ${label}</span>`;
}

function popupStatHtml(icon, count, label, minimum) {
  const low = count < minimum ? " low" : "";
  return `
    <div class="popup-stat${low}">
      ${icon}
      <div><strong>${count}</strong><span>${label}</span></div>
    </div>`;
}

function legHtml(leg) {
  // The roundabout step already names the exit road.
  const shownSteps = leg.route.steps.filter(function (step) {
    const type = step.maneuver.type;
    return type !== "exit roundabout" && type !== "exit rotary";
  });
  const steps = shownSteps.map(function (step) {
    return `<li>${escapeHtml(formatStep(step))}</li>`;
  });
  return `
    <div class="leg ${leg.mode}">
      <div class="leg-title">${escapeHtml(leg.title)}</div>
      <div class="leg-meta">${formatDistance(leg.route.distance)} &middot; ${formatMinutes(leg.route.duration)}</div>
      <details>
        <summary>Directions</summary>
        <ol>${steps.join("")}</ol>
      </details>
    </div>`;
}

function parkingCardHtml(spot) {
  return `
    <div class="station-card">
      <div class="station-icon">${PARKING_ICON}</div>
      <div class="station-text">
        <div class="station-action">Park the bike</div>
        <div class="station-address">Public bike parking</div>
      </div>
      <div class="station-count">${spot.spaces} spaces</div>
    </div>`;
}

// link: optional { href, label }. Then the whole card is a link. It opens in a
// new tab, so the trip stays open when the website loads instead of the app.
function stationCardHtml(icon, action, station, count, link) {
  const content = `
      <div class="station-icon">${icon}</div>
      <div class="station-text">
        <div class="station-action">${action}</div>
        <div class="station-address">${escapeHtml(station.address)}</div>
        <div class="station-name">Station ${station.id}</div>
        ${link ? `<div class="station-link">${link.label} &nearr;</div>` : ""}
      </div>
      <div class="station-count">${count}</div>`;
  if (!link) return `<div class="station-card">${content}</div>`;
  return `<a class="station-card" href="${link.href}" target="_blank" rel="noopener">${content}</a>`;
}

// The Valenbisi app can take some seconds to open. Show at once that the tap worked,
// until the user comes back to this page (or after 10 s, if no app or tab opens).
export function onAppLinkClick(event) {
  const card = event.target.closest("a.station-card");
  if (!card || card.classList.contains("opening")) return;
  const link = card.querySelector(".station-link");
  const label = link.textContent;
  card.classList.add("opening");
  link.textContent = "Opening Valenbisi app…";

  function reset() {
    card.classList.remove("opening");
    link.textContent = label;
    document.removeEventListener("visibilitychange", onVisible);
  }
  function onVisible() {
    if (document.visibilityState === "visible") reset();
  }
  document.addEventListener("visibilitychange", onVisible);
  setTimeout(reset, 10000);
}
