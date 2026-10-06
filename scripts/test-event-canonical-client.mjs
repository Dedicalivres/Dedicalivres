import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const mapping = JSON.parse(
  fs.readFileSync(
    "docs/territoires/event-canonical-map.json",
    "utf8"
  )
);

const context = { window: {} };

vm.createContext(context);

vm.runInContext(
  fs.readFileSync(
    "event-canonical.js",
    "utf8"
  ),
  context
);

const resolver =
  context.window.DEDICALIVRES_EVENT_CANONICAL;

assert(resolver);

assert.equal(
  resolver.size,
  Object.keys(mapping).length
);

for (const [id, path] of Object.entries(mapping)) {
  assert.equal(
    resolver.href(id),
    "/" + path
  );
}

const known =
  "54f89147-8cd4-4abc-b883-cca26c5e31a2";

assert.equal(
  resolver.href(
    known,
    "#authors-presence-section"
  ),
  "/" +
    mapping[known] +
    "#authors-presence-section"
);

assert.equal(
  resolver.href("unknown/id"),
  "/event.html?id=unknown%2Fid"
);

console.log(
  `PASS canonical client : ${resolver.size} mappings`
);
