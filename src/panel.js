// The side panel: form elements, status message, trip mode and the collapse button.

export const startInput = document.getElementById("start-input");
export const destInput = document.getElementById("dest-input");
export const ownBikeInput = document.getElementById("own-bike-input");
export const routeForm = document.getElementById("route-form");
export const planButton = document.getElementById("plan-button");
export const messageBox = document.getElementById("message");
export const summaryBox = document.getElementById("summary");
export const tripCard = document.getElementById("trip");
export const panel = document.getElementById("panel");
export const toggleButton = document.getElementById("toggle-panel");

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

export function togglePanel() {
  const collapsed = panel.classList.toggle("collapsed");
  const label = collapsed ? "Show panel" : "Hide panel";
  toggleButton.setAttribute("aria-label", label);
  toggleButton.title = label;
  toggleButton.setAttribute("aria-expanded", String(!collapsed));
}
