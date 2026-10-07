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
