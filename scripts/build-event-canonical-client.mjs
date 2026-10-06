import fs from "node:fs";

const MAP_FILE = "docs/territoires/event-canonical-map.json";
const OUTPUT = "event-canonical.js";

const map = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));

if (!map || typeof map !== "object" || Array.isArray(map)) {
  throw new Error("Canonical map invalide.");
}

const ids = Object.keys(map);

if (!ids.length) {
  throw new Error("Canonical map vide.");
}

for (const [id, value] of Object.entries(map)) {
  if (
    !id ||
    typeof value !== "string" ||
    !value.startsWith("evenement/") ||
    !value.endsWith(".html")
  ) {
    throw new Error(`Entrée canonical invalide : ${id} -> ${value}`);
  }

  if (!fs.existsSync(value)) {
    throw new Error(`Page canonique absente : ${value}`);
  }
}

const source = `/* Généré automatiquement — ne pas éditer manuellement. */
(function (root) {
  "use strict";

  const MAP = Object.freeze(${JSON.stringify(map, null, 2)});

  function eventId(value) {
    if (value && typeof value === "object") {
      return String(value.id || "");
    }
    return String(value || "");
  }

  function cleanPath(value) {
    let path = String(value || "");
    while (path.startsWith("/")) path = path.slice(1);
    return path;
  }

  function pathFor(value) {
    return MAP[eventId(value)] || "";
  }

  function href(value, anchor = "") {
    const id = eventId(value);
    const path = pathFor(id);

    const base = path
      ? "/" + cleanPath(path)
      : "/event.html?id=" + encodeURIComponent(id);

    if (!anchor) return base;

    const suffix = String(anchor);
    return base + (suffix.startsWith("#") ? suffix : "#" + suffix);
  }

  root.DEDICALIVRES_EVENT_CANONICAL = Object.freeze({
    href,
    pathFor,
    size: Object.keys(MAP).length
  });
})(typeof window !== "undefined" ? window : globalThis);
`;

fs.writeFileSync(OUTPUT, source);

console.log(
  `PASS canonical client : ${ids.length} événements`
);
