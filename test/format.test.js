import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  formatAge,
  formatDistance,
  formatMinutes,
  formatStep,
  shortPlaceName,
} from "../src/format.js";

test("formatDistance uses metres below 1 km", function () {
  assert.equal(formatDistance(42.4), "42 m");
  assert.equal(formatDistance(999.4), "999 m");
  assert.equal(formatDistance(999.6), "1.0 km");
  assert.equal(formatDistance(2345), "2.3 km");
});

test("formatMinutes shows at least 1 min", function () {
  assert.equal(formatMinutes(10), "1 min");
  assert.equal(formatMinutes(150), "3 min");
});

test("formatAge", function () {
  const minute = 60 * 1000;
  assert.equal(formatAge(10 * 1000), "just now");
  assert.equal(formatAge(5 * minute), "5 min ago");
  assert.equal(formatAge(3 * 60 * minute), "3 h ago");
  assert.equal(formatAge(72 * 60 * minute), "3 days ago");
});

function step(type, modifier, name, distance, exit) {
  return { maneuver: { type, modifier, exit }, name, distance };
}

test("formatStep writes short instructions", function () {
  assert.equal(
    formatStep(step("depart", undefined, "Calle Colón", 120)),
    "Start on Calle Colón (120 m)",
  );
  assert.equal(formatStep(step("arrive", undefined, "", 0)), "Arrive");
  assert.equal(
    formatStep(step("turn", "left", "", 1500)),
    "Turn left onto the path (1.5 km)",
  );
  assert.equal(
    formatStep(step("roundabout", "right", "Avenida del Puerto", 300, 2)),
    "At the roundabout take exit 2 onto Avenida del Puerto (300 m)",
  );
  assert.equal(
    formatStep(step("continue", "straight", "Gran Vía", 0)),
    "Continue onto Gran Vía",
  );
  assert.equal(
    formatStep(step("new name", "slight left", "Gran Vía", 0)),
    "Keep slight left onto Gran Vía",
  );
  assert.equal(
    formatStep(step("turn", "uturn", "Gran Vía", 0)),
    "Make a U-turn onto Gran Vía",
  );
  assert.equal(
    formatStep(step("end of road", "right", "Gran Vía", 0)),
    "At the end of the road turn right onto Gran Vía",
  );
});

test("escapeHtml escapes markup and quotes", function () {
  assert.equal(
    escapeHtml('<a href="x">&</a>'),
    "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
  );
  assert.equal(escapeHtml(12), "12");
});

test("shortPlaceName keeps the first two parts", function () {
  assert.equal(
    shortPlaceName(
      "23, Carrer de l'Escultor Josep Capuz, Montolivet, Valencia, 46005, Spain",
    ),
    "23, Carrer de l'Escultor Josep Capuz",
  );
  assert.equal(shortPlaceName("Your location"), "Your location");
});
