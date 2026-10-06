import assert from "node:assert/strict";
import fs from "node:fs";

const app =
  fs.readFileSync("app.js", "utf8");

const seo =
  fs.readFileSync("seo-pages.js", "utf8");

const local =
  fs.readFileSync("local-preferences.js", "utf8");

const ludique =
  fs.readFileSync("ludique.js", "utf8");

const guide =
  fs.readFileSync("mascot-guide.js", "utf8");

assert.doesNotMatch(
  app,
  /href="event\.html\?id=\$\{encodeURIComponent\(event\.id\)\}"/
);

assert.doesNotMatch(
  seo,
  /href="event\.html\?id=\$\{encodeURIComponent\(event\.id\)\}"/
);

assert.doesNotMatch(
  local,
  /link\.href = 'event\.html\?id='/
);

assert.doesNotMatch(
  ludique,
  /return '<a href="event\.html\?id='/
);

assert.doesNotMatch(
  guide,
  /window\.location\.href = `event\.html\?id=/
);

console.log(
  "PASS liens publics : résolveur canonique utilisé"
);
