import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// sw.js keeps these files for an offline start. A missing file works online
// but leaves the app blank offline.
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const leafletBase = sw.match(/const LEAFLET = "([^"]+)"/)[1];

test("sw.js keeps every module in src/", function () {
  readdirSync(new URL("../src/", import.meta.url)).forEach(function (name) {
    assert.ok(
      sw.includes(`"src/${name}"`),
      `add "src/${name}" to APP_FILES in sw.js`,
    );
  });
});

test("sw.js keeps the Leaflet files that index.html loads", function () {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  html.match(/https:\/\/unpkg\.com\/[^"]+/g).forEach(function (url) {
    assert.ok(
      url.startsWith(leafletBase),
      `${url} is not under LEAFLET in sw.js`,
    );
    const file = url.slice(leafletBase.length);
    assert.ok(
      sw.includes(`LEAFLET + "${file}"`),
      `add LEAFLET + "${file}" to APP_FILES in sw.js`,
    );
  });
});
