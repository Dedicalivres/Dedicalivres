import assert from "node:assert/strict";
import fs from "node:fs";

const html =
  fs.readFileSync("event.html", "utf8");

assert.match(
  html,
  /name="robots"\s+content="noindex,follow"/
);

assert.match(
  html,
  /event-canonical\.js\?v=1/
);

assert.match(
  html,
  /data-event-canonical-legacy-redirect="true"/
);

assert.match(
  html,
  /resolver\.pathFor\(id\)/
);

assert.match(
  html,
  /window\.location\.replace\(target\)/
);

const canonical =
  html.indexOf("event-canonical.js?v=1");

const runtime =
  html.indexOf("event.js?");

assert(canonical >= 0);
assert(runtime > canonical);

console.log(
  "PASS legacy event.html : noindex + redirection canonical avant event.js"
);
