---
name: vlcbici
description: Door-to-door walk and Valenbisi bike plans for visitors to Valencia.
colors:
  route-magenta: "#c026d3"
  route-magenta-tint: "#fae8ff"
  slate-ink: "#0f172a"
  slate-text-secondary: "#334155"
  slate-muted: "#64748b"
  slate-border: "#cbd5e1"
  slate-soft: "#f1f5f9"
  panel-white: "#ffffff"
  error-ink: "#9b1c1c"
  error-tint: "#fde8e8"
  info-ink: "#1e3a8a"
  info-tint: "#eef4ff"
  station-ready: "#16a34a"
  station-few-docks: "#ea580c"
  station-few-bikes: "#eab308"
  station-few-both: "#dc2626"
  station-stale: "#9ca3af"
  live-location: "#1a73e8"
  network-lane: "#1d4ed8"
  network-shared: "#0891b2"
  network-pedestrian: "#6b7280"
  network-works: "#f59e0b"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 700
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  eyebrow:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.04em"
  stat:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.1
rounded:
  sm: "5px"
  md: "8px"
  sheet: "10px"
  full: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
components:
  button-primary:
    backgroundColor: "{colors.slate-ink}"
    textColor: "{colors.panel-white}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  button-secondary:
    backgroundColor: "{colors.slate-soft}"
    textColor: "{colors.slate-text-secondary}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  input-text:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "7px 8px"
  badge-start:
    backgroundColor: "{colors.slate-ink}"
    textColor: "{colors.panel-white}"
    rounded: "{rounded.full}"
    size: "18px"
  badge-dest:
    backgroundColor: "{colors.route-magenta}"
    textColor: "{colors.panel-white}"
    rounded: "{rounded.full}"
    size: "18px"
  panel:
    backgroundColor: "{colors.panel-white}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    width: "360px"
  station-card:
    backgroundColor: "{colors.panel-white}"
    rounded: "{rounded.sm}"
    padding: "8px"
  message-error:
    backgroundColor: "{colors.error-tint}"
    textColor: "{colors.error-ink}"
    rounded: "{rounded.sm}"
    padding: "8px"
  message-info:
    backgroundColor: "{colors.info-tint}"
    textColor: "{colors.info-ink}"
    rounded: "{rounded.sm}"
    padding: "8px"
---

# Design System: vlcbici

## Overview

**Creative North Star: "The Pocket Wayfinder"**

vlcbici is a calm guide in a stranger's pocket. The map leads; the panel quietly says what to do next. A visitor who does not know Valencia stands on a street with a phone in one hand and needs three answers fast: where to get a bike, where to ride, where to give it back. Every visual decision serves that glance.

The system is native map-app plain. It uses the platform's own font, flat white panels and controls that look like the ones people already know from map apps. The brand does not decorate; it lives in one place: the magenta course of the bike ride and the stations that start and end it. Slate carries the text and the main action. Status colours appear only where they report real station data.

Density is moderate and compact: a 360px floating panel on desktop, a bottom sheet on phones, small type steps, short gaps. Nothing in the panel competes with the map for attention.

**Key Characteristics:**

- Map first; the panel is a quiet tool on top of it.
- One brand colour, Route Magenta, reserved for the planned bike course and its stations.
- Slate ink for text and the primary action, never the brand colour.
- Colour always has a job: wayfinding (A/B), course, or station status.
- System font, flat surfaces, one soft shadow for the floating panel.

## Colors

A neutral slate instrument panel with a single magenta course line, and a fixed set of status colours that belong to the station data.

### Primary

- **Route Magenta** (#c026d3): the brand. The solid bike line on the map, the pickup and return station pins, the station icons in the trip summary, the "B" pin and badge, the "bici" in the logo, focus rings and the text caret. Chosen because no map layer uses it: the street map is orange, yellow and green, CyclOSM and the city network draw bike lanes in blue and cyan.
- **Route Magenta Tint** (#fae8ff): the soft circle behind station icons in the trip summary, and text selection.

### Neutral

- **Slate Ink** (#0f172a): body text, labels, the primary button, the "A" pin and badge, and the dotted walking line on the map.
- **Slate Secondary Text** (#334155): text on secondary buttons.
- **Slate Muted** (#64748b): helper text, the station legend and the disclaimer.
- **Slate Border** (#cbd5e1): input borders.
- **Slate Soft** (#f1f5f9): secondary button fill ("My location", "Clear", "Hide").
- **Panel White** (#ffffff): the panel, inputs, cards and map legends.

### Status (map data, fixed)

- **Station Ready** (#16a34a), **Few Docks** (#ea580c), **Few Bikes** (#eab308), **Few of Both** (#dc2626), **Closed or Stale** (#9ca3af): the station dots. Their meaning is documented in the README and in the in-panel legend; they never change for aesthetic reasons.
- **Error Ink / Error Tint** (#9b1c1c on #fde8e8): error messages and low-count warnings in station popups.
- **Info Ink / Info Tint** (#1e3a8a on #eef4ff): info and warning messages about the plan.
- **Live Location** (#1a73e8, halo #8ab4f8): the user's position dot, following the platform convention.
- **City network lines** (#1d4ed8 lane, #0891b2 shared, #6b7280 pedestrian, #f59e0b works): only on the "Bike network (City of Valencia)" layer, with their own legend.

### Named Rules

**The One Course Rule.** Route Magenta marks the planned bike course and the stations that bound it. It is not a button colour, a heading colour or a decoration. If something magenta is not part of the trip or a focus/selection state, it is wrong.

**The Data Owns Its Colours Rule.** Green, orange, yellow, red and grey belong to station status, blue and cyan to bike lanes. New UI never reuses them for anything else.

**The Pin Equals Badge Rule.** The A/B badges in the panel and popups always use the same colours as the A/B pins on the map. Change one, change both (`style.css` tokens and `app.js` pin colours).

## Typography

**Body Font:** system-ui (with -apple-system, Segoe UI, Roboto, sans-serif)

**Character:** The platform's own sans. It reads like the phone's own map app and costs no download, which matters on a mobile connection in the street.

### Hierarchy

- **Headline** (700, 17px): the "vlcbici" wordmark in the panel header.
- **Title** (600, 15px): "Your trip" and leg titles; 14px for station names in popups.
- **Body** (400, 15px): input text and general copy. Buttons use 14px.
- **Label** (600, 13px): field labels; 13px regular for leg meta and directions.
- **Caption** (400, 12px): helper text, station legend, disclaimer, secondary popup text.
- **Stat** (700, 18px, line-height 1.1): bike and dock counts in station popups.
- **Eyebrow** (600, 11px, 0.04em, uppercase): the role line in pickup/return popups, in Route Magenta.

### Named Rules

**The Small Steps Rule.** Sizes stay within 11–18px. Hierarchy comes from weight (400/600/700) and colour (ink vs. muted), not from big size jumps; the map is the only large element.

## Layout

The map fills the viewport. The panel floats above it.

- **Desktop:** a 360px panel, 10px from the top and 54px from the left (clear of the zoom buttons), with a scrolling body and a max height of the viewport minus 20px.
- **Phone (≤600px):** the panel becomes a full-width bottom sheet, at most 55% of the height, with 10px top corners. The map attribution moves to the top right so the sheet never covers it. The sheet's white continues under the home indicator (`safe-area-inset-bottom`); the map controls and the desktop panel keep clear of the notch. After a plan, the panel scrolls to the result, because the form fills most of a short panel.
- When a route is drawn, the map fits the route into the space the panel leaves free (to the right on desktop, above the sheet on phones).
- **Spacing rhythm:** 6px inside rows and between a label and its field, 8px between cards and list items, 10–12px for panel padding and section gaps.

## Elevation & Depth

Flat by default. Only things that float above the map get a shadow; everything inside the panel is flat and separated by tint, border or space.

### Shadow Vocabulary

- **Floating panel** (`box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25)`): the panel / bottom sheet.
- **Map legend** (`box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3)`): the bike network legend on the map.
- **Map pin** (`box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4)` with a 2px white border): A/B pins, station pins and the live-location dot.

### Named Rules

**The Float Only Rule.** A shadow means "this sits on the map". Nothing inside the panel gets one.

## Shapes

Gently rounded and plain. Controls, inputs, cards and messages use a 5px radius; the panel uses 8px; the phone sheet uses 10px top corners. Everything that marks a point (pins, badges, station dots, station icons) is a full circle. Borders are 1px and quiet.

## Components

### Buttons

- **Shape:** gently rounded (5px), no border.
- **Primary:** Slate Ink fill, white text, 14px, 7px × 10px padding. "Plan route" stretches to fill its row. The popup "Start" / "Destination" buttons use the same style with an A/B badge inside (white ring to separate it from the dark fill) and a 36px minimum height for touch.
- **Secondary:** Slate Soft fill with Slate Secondary Text ("My location", "Clear", "Hide").
- **Focus:** 2px Route Magenta outline, 2px offset.
- **Disabled:** 60% opacity and a wait cursor while a plan runs.
- **Touch:** on touch screens (`pointer: coarse`) every button and text input is at least 44px tall.

### Inputs / Fields

- **Style:** white, 1px Slate Border, 5px radius, 15px Slate Ink text, Slate Muted placeholder, Route Magenta caret.
- **Focus:** border and 1px outline in Route Magenta.
- **Touch:** 16px text on touch screens, so iOS Safari does not zoom in on focus.

### A/B Badges (signature)

18px circles with a white bold 11px letter: "A" in Slate Ink, "B" in Route Magenta. They sit before the Start and Destination labels and inside the popup buttons, and they mirror the 30px A/B pins on the map. They tie the panel to the map.

### Trip Summary

- **Legs:** flat cards on a very light grey with a line swatch that copies the map line: a dotted Slate Ink line for walks, a solid Route Magenta line for the ride. Distance and time in 13px muted text; directions in a native `<details>`.
- **Station cards:** white with a 1px light border; a 36px Route Magenta Tint circle with a magenta Lucide icon (bike or square-parking); the address in 600 weight and the count on the right.
- **Total:** one bold line at the end.

### Station Popups

Leaflet popups with the role eyebrow (pickup/return only), the address as title, two stat tiles (bikes, free docks) with Lucide icons, an update line and the A/B buttons. A stat below 3 turns Error Ink on Error Tint; a closed or stale station greys out its tiles.

### Map Marks

- **Route:** bike leg solid Route Magenta, 8px, 0.9 opacity; walk legs Slate Ink, 7px, round dots (`1 12` dash). Each line sits on a white outline 4px wider (same dash pattern), so it stays readable on CyclOSM and the city network layer.
- **Pins:** 30px circles with a 2px white border; A/B letters or station icons in white.
- **Station dots:** 7px radius circles with a 2px white border in the status colours, drawn below the route.

### Station Legend

A wrapping inline list of 10px status dots with 12px muted labels, at the bottom of the panel, above the disclaimer.

## Do's and Don'ts

### Do:

- **Do** keep Route Magenta (#c026d3) for the bike course, its stations, the "B" mark, the logo accent and focus.
- **Do** use Slate Ink (#0f172a) for the primary action and body text.
- **Do** keep A/B badges and A/B map pins in the same colours.
- **Do** keep every status colour paired with text: the legend, popup labels or a message.
- **Do** use the 5px radius for controls and cards, full circles for anything that marks a point.
- **Do** use the existing neutral tokens (`--ink`, `--muted`) for new text. Some older rules still use plain greys (#555, #fafafa, #e5e5e5, #f3f4f6); move them to slate tokens when you touch them.

### Don't:

- **Don't** use blue or cyan for the route or the brand; the CyclOSM and city network layers already draw bike lanes in those colours.
- **Don't** use green, orange, yellow, red or grey for anything except station status and errors.
- **Don't** put shadows on elements inside the panel.
- **Don't** use web fonts or large display type; the map is the hero.
- **Don't** use Valenbisi, JCDecaux or City of Valencia logos or brand styling; the app is unofficial.
