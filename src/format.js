// Text for the panel and popups. Pure logic: no DOM, no Leaflet.

export function formatDistance(meters) {
  if (Math.round(meters) < 1000) return Math.round(meters) + " m";
  return (meters / 1000).toFixed(1) + " km";
}

export function formatMinutes(seconds) {
  return Math.max(1, Math.round(seconds / 60)) + " min";
}

export function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours + " h ago";
  return Math.round(hours / 24) + " days ago";
}

// Turn one OSRM step into a short English instruction.
export function formatStep(step) {
  const type = step.maneuver.type;
  const modifier = step.maneuver.modifier;
  const road = step.name || "the path";
  const direction = modifier ? " " + modifier : "";
  let text;

  if (type === "depart") {
    text = "Start on " + road;
  } else if (type === "arrive") {
    text = "Arrive";
  } else if (type === "roundabout" || type === "rotary") {
    const exit = step.maneuver.exit ? "exit " + step.maneuver.exit : "the exit";
    text = "At the roundabout take " + exit + " onto " + road;
  } else if (modifier === "uturn") {
    text = "Make a U-turn onto " + road;
  } else if (type === "new name" || type === "continue") {
    const keepSide = modifier && modifier !== "straight";
    text = keepSide
      ? "Keep" + direction + " onto " + road
      : "Continue onto " + road;
  } else if (modifier === "straight") {
    text = "Go straight onto " + road;
  } else if (type === "end of road") {
    text = "At the end of the road turn" + direction + " onto " + road;
  } else {
    // turn, fork, merge, on ramp, off ramp, notification, ...
    const verb = type.charAt(0).toUpperCase() + type.slice(1);
    text = verb + direction + " onto " + road;
  }

  if (type !== "arrive" && step.distance > 0) {
    text += " (" + formatDistance(step.distance) + ")";
  }
  return text;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function pointText(point) {
  return point.lat.toFixed(5) + ", " + point.lon.toFixed(5);
}

// "Plaça de l'Ajuntament, Ciutat Vella, Valencia, …" -> "Plaça de l'Ajuntament, Ciutat Vella"
export function shortPlaceName(label) {
  return label.split(", ").slice(0, 2).join(", ");
}
