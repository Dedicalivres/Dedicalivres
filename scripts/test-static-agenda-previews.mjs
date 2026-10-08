import assert from "node:assert/strict";
import fs from "node:fs";

const builder =
  fs.readFileSync(
    "scripts/build-static-agenda-previews.mjs",
    "utf8"
  );

assert.match(
  builder,
  /new Date\(\s*snapshot\.capturedAt\s*\)/
);

assert.doesNotMatch(
  builder,
  /\.format\(new Date\(\)\)/
);


const targets = [
  ["home", "index.html", "results-count", "app.js"],
  ["salons", "salons-du-livre.html", "seo-count", "seo-pages.js"],
  ["dedicaces", "dedicaces.html", "seo-count", "seo-pages.js"]
];

for (
  const [key, file, countId, runtime]
  of targets
) {
  const html =
    fs.readFileSync(file, "utf8");

  const start =
    `<!-- STATIC-EVENT-PREVIEW:${key}:START -->`;

  const end =
    `<!-- STATIC-EVENT-PREVIEW:${key}:END -->`;

  const a = html.indexOf(start);
  const b = html.indexOf(end);

  assert(a >= 0);
  assert(b > a);

  const block = html.slice(a, b);

  const links = [
    ...block.matchAll(
      /href="(\/evenement\/[^"]+\.html)"/g
    )
  ].map(match => match[1]);

  assert(
    links.length > 0 &&
    links.length <= 12
  );

  assert.doesNotMatch(
    block,
    /event\.html\?id=/
  );

  for (const href of links) {
    assert(
      fs.existsSync(
        href.replace(/^\//, "")
      )
    );
  }

  const count = html.match(
    new RegExp(
      `<p\\s+id="${countId}"[^>]*>([\\s\\S]*?)<\\/p>`
    )
  );

  assert(count);
  assert.doesNotMatch(
    count[1],
    /Chargement/i
  );

  const canonicalScript =
    html.indexOf(
      "event-canonical.js?v=1"
    );

  const runtimeScript =
    html.indexOf(runtime);

  assert(
    canonicalScript >= 0 &&
    runtimeScript > canonicalScript
  );
}

console.log(
  "PASS HTML initial crawlable : accueil + catégories"
);

const snapshot = JSON.parse(
  fs.readFileSync(
    "docs/territoires/catalogue-public.json",
    "utf8"
  )
);
const canonicalMap = JSON.parse(
  fs.readFileSync(
    "docs/territoires/event-canonical-map.json",
    "utf8"
  )
);
const clean = value => String(value || "").trim();
const normalizeCity = value =>
  clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
const today = snapshot.capturedAt.slice(0, 10);
const publicEvents = snapshot.events.filter(
  event =>
    event.validated === true &&
    event.rejected === false
);
const cityPages = fs.readdirSync(".")
  .filter(file => /^evenements-litteraires-.*\.html$/.test(file))
  .map(file => ({ file, html: fs.readFileSync(file, "utf8") }))
  .filter(page => /data-city="[^"]+"/.test(page.html));

assert.equal(cityPages.length, 20);

for (const page of cityPages) {
  const city = page.html.match(/data-city="([^"]+)"/)[1];
  const key = page.file
    .replace(/^evenements-litteraires-/, "")
    .replace(/\.html$/, "");
  const start = `<!-- STATIC-EVENT-PREVIEW:city-${key}:START -->`;
  const end = `<!-- STATIC-EVENT-PREVIEW:city-${key}:END -->`;

  assert.equal(page.html.split(start).length - 1, 1);
  assert.equal(page.html.split(end).length - 1, 1);

  const block = page.html.slice(
    page.html.indexOf(start),
    page.html.indexOf(end)
  );
  const ids = [
    ...block.matchAll(/data-event-id="([^"]+)"/g)
  ].map(match => match[1]);
  const rows = publicEvents.filter(
    event =>
      normalizeCity(event.city) ===
        normalizeCity(city)
  );
  const upcomingRows = rows.filter(event => {
    const endDate = clean(
      event.end_date || event.start_date
    );
    return /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
      endDate >= today;
  });

  if (!rows.length) {
    assert.equal(ids.length, 0);
    assert.match(
      block,
      new RegExp(`Aucun événement actuellement référencé à ${city}`)
    );
    assert.match(block, /href="soumettre\.html"/);
  } else {
    assert(ids.length > 0);
    assert(ids.length <= (upcomingRows.length ? 12 : 6));
    if (!upcomingRows.length) {
      assert.match(block, /Événements récemment référencés/);
    }
  }

  assert.doesNotMatch(block, /event\.html\?id=/);

  for (const id of ids) {
    const event = snapshot.events.find(row => String(row.id) === id);
    assert(event);
    assert.equal(event.validated, true);
    assert.equal(event.rejected, false);
    assert.equal(normalizeCity(event.city), normalizeCity(city));
    assert(canonicalMap[id]);
    assert.match(
      block,
      new RegExp(`href="/${canonicalMap[id].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
    );
  }
}

for (const city of ["Avignon", "Dijon", "Nice"]) {
  const page = cityPages.find(
    candidate =>
      candidate.html.includes(`data-city="${city}"`)
  );
  assert(page);
  assert.match(
    page.html,
    new RegExp(`Aucun événement actuellement référencé à ${city}`)
  );
}

const nonCityTerritories = fs.readdirSync(".")
  .filter(file => /^evenements-litteraires-.*\.html$/.test(file))
  .map(file => fs.readFileSync(file, "utf8"))
  .filter(html => /data-region="[^"]+"/.test(html));

for (const html of nonCityTerritories) {
  assert.doesNotMatch(
    html,
    /STATIC-EVENT-PREVIEW:city-/
  );
}

console.log(
  "PASS HTML initial crawlable : 20 pages ville, canonicals, modes et états vides"
);
