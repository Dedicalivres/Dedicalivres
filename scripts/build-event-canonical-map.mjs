import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EVENT_DIR = path.join(ROOT, "evenement");
const MAP_FILE = path.join(
  ROOT,
  "docs",
  "territoires",
  "event-canonical-map.json"
);
const MISSING_FILE = path.join(
  ROOT,
  "docs",
  "territoires",
  "event-canonical-missing.json"
);
const SNAPSHOT_FILE = path.join(
  ROOT,
  "docs",
  "territoires",
  "catalogue-public.json"
);

if (!fs.existsSync(EVENT_DIR)) {
  throw new Error("Dossier evenement/ introuvable.");
}

const files = fs
  .readdirSync(EVENT_DIR)
  .filter((name) => name.endsWith(".html") && name !== "index.html")
  .sort();

const discovered = new Map();
const paths = new Map();

for (const file of files) {
  const fullPath = path.join(EVENT_DIR, file);
  const html = fs.readFileSync(fullPath, "utf8");

  const id = html.match(
    /\bdata-event-id="([^"]+)"/
  )?.[1];

  const canonical = html.match(
    /<link\s+rel="canonical"\s+href="([^"]+)"/i
  )?.[1];

  if (!id) {
    throw new Error(`data-event-id absent : evenement/${file}`);
  }

  if (!canonical) {
    throw new Error(`canonical absent : evenement/${file}`);
  }

  const url = new URL(canonical);

  if (
    url.hostname !== "dedicalivres.fr" ||
    !url.pathname.startsWith("/evenement/")
  ) {
    throw new Error(
      `canonical inattendue pour ${id} : ${canonical}`
    );
  }

  const relativePath = url.pathname.replace(/^\/+/, "");

  if (relativePath !== `evenement/${file}`) {
    throw new Error(
      `canonical/fichier incohérents : ${id} -> ${relativePath}`
    );
  }

  if (discovered.has(id)) {
    throw new Error(`UUID dupliqué : ${id}`);
  }

  if (paths.has(relativePath)) {
    throw new Error(
      `URL canonique dupliquée : ${relativePath}`
    );
  }

  discovered.set(id, relativePath);
  paths.set(relativePath, id);
}

/*
 * Préserver l'ordre existant pour éviter un diff artificiel
 * de plusieurs centaines de lignes.
 */
let previous = {};

if (fs.existsSync(MAP_FILE)) {
  previous = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
}

const orderedIds = [
  ...Object.keys(previous).filter((id) => discovered.has(id)),
  ...[...discovered.keys()]
    .filter((id) => !(id in previous))
    .sort()
];

const output = {};

for (const id of orderedIds) {
  output[id] = discovered.get(id);
}

/*
 * Si le snapshot public territorial existe, il devient un
 * contrôle supplémentaire : 1 événement public = 1 canonical.
 */
let missing = [];
let extra = [];

if (fs.existsSync(SNAPSHOT_FILE)) {
  const snapshot = JSON.parse(
    fs.readFileSync(SNAPSHOT_FILE, "utf8")
  );

  const publicIds = new Set(
    (snapshot.events || []).map((event) => String(event.id))
  );

  missing = [...publicIds]
    .filter((id) => !discovered.has(id))
    .sort();

  extra = [...discovered.keys()]
    .filter((id) => !publicIds.has(id))
    .sort();

  if (missing.length || extra.length) {
    console.error(
      JSON.stringify(
        {
          publicEvents: publicIds.size,
          staticPages: discovered.size,
          missing,
          extra
        },
        null,
        2
      )
    );

    throw new Error(
      "Corpus public et pages canoniques non alignés."
    );
  }
}

fs.writeFileSync(
  MAP_FILE,
  JSON.stringify(output, null, 2) + "\n"
);

fs.writeFileSync(
  MISSING_FILE,
  JSON.stringify(missing, null, 2) + "\n"
);

console.log(
  `PASS canonical map : ${discovered.size} événements, missing=${missing.length}, extra=${extra.length}`
);
