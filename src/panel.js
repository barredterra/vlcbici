// The panel: a bottom sheet with the action bar, the form, the status message and the trip.

export const startInput = document.getElementById("start-input");
export const destInput = document.getElementById("dest-input");
export const ownBikeInput = document.getElementById("own-bike-input");
export const routeForm = document.getElementById("route-form");
export const planButton = document.getElementById("plan-button");
export const messageBox = document.getElementById("message");
export const summaryBox = document.getElementById("summary");
export const tripCard = document.getElementById("trip");
export const panel = document.getElementById("panel");
const panelHeader = document.getElementById("panel-header");
const panelBody = document.getElementById("panel-body");
const sheetHandle = document.getElementById("sheet-handle");

// "planning" (the form), "planned" (a plan, not started) or "riding".
// style.css shows and hides the panel parts for each mode.
export function setMode(mode) {
  document.body.dataset.mode = mode;
}

export function showMessage(text, kind) {
  messageBox.textContent = text;
  messageBox.className = kind;
}

export function clearMessage() {
  messageBox.textContent = "";
  messageBox.className = "";
}

export function setFormDisabled(disabled) {
  Array.from(routeForm.elements).forEach(function (element) {
    element.disabled = disabled;
  });
}

// Drag the header up or down to resize the body. The action bar stays on top of it.
// A body shorter than this snaps shut.
const SNAP_SHUT_PX = 60;
let dragged = false;

panelHeader.addEventListener("pointerdown", function (event) {
  const isSidebar = sheetHandle.offsetParent === null; // wide screens hide the handle
  if (isSidebar) return;
  if (event.target.closest("label, button:not(#sheet-handle)")) return;
  const startY = event.clientY;
  const startHeight = panelBody.offsetHeight;
  dragged = false;

  function onMove(moveEvent) {
    const dy = startY - moveEvent.clientY;
    if (Math.abs(dy) > 5) dragged = true; // less is a tap
    if (dragged) setBodyHeight(startHeight + dy);
  }
  function onEnd() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
    if (dragged && panelBody.offsetHeight < SNAP_SHUT_PX) setBodyHeight(0);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onEnd);
  window.addEventListener("pointercancel", onEnd);
});

// A tap on the handle (or Enter on it) hides or shows the body.
sheetHandle.addEventListener("click", function () {
  if (dragged) return;
  if (panelBody.offsetHeight > 0) setBodyHeight(0);
  else showPanelBody();
});

// The body at its default height: as tall as its content, up to the limit in style.css.
export function showPanelBody() {
  panelBody.style.removeProperty("--dragged-height");
  sheetHandle.setAttribute("aria-expanded", "true");
}

// The sheet can grow up to 85% of the screen, header included.
// Only the bottom sheet uses this height (style.css); the sidebar ignores it.
function setBodyHeight(height) {
  const maxHeight = window.innerHeight * 0.85 - panelHeader.offsetHeight;
  const newHeight = Math.max(0, Math.min(height, maxHeight));
  panelBody.style.setProperty("--dragged-height", newHeight + "px");
  sheetHandle.setAttribute("aria-expanded", String(newHeight > 0));
}
