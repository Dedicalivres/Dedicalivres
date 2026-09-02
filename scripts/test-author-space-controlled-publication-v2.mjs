import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "author-publication.js"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260902161258_author_editorial_status_publication_v2.sql"),
  "utf8"
);
const adminSource = fs.readFileSync(path.join(root, "admin-shell.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "admin-v11.html"), "utf8");
const authorHtml = fs.readFileSync(path.join(root, "author.html"), "utf8");
const configSource = fs.readFileSync(path.join(root, "config.js"), "utf8");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: "author-publication.js" });
const publication = context.window.DEDICALIVRES_AUTHOR_PUBLICATION;
assert.ok(publication, "Le moteur de publication V2 doit être exposé.");

const ready = {
  id: "author-ready",
  validated: true,
  publication_ready: true,
  editorial_status: "READY",
  published: false,
  merged_into: null
};

assert.deepEqual(
  Array.from(publication.publicationBlockers(ready, "READY", true)),
  [],
  "READY + non publiée doit être publiable."
);

for (const status of ["INCOMPLETE", "NEEDS_REVIEW", "AMBIGUOUS"]) {
  const candidate = { ...ready, editorial_status: status };
  assert.ok(
    publication.publicationBlockers(candidate, status, true).length > 0,
    `${status} doit bloquer la publication.`
  );
}

assert.equal(
  publication.isPubliclyAvailable({ ...ready, published: false }),
  false,
  "Une fiche non publiée doit rester inaccessible."
);
assert.equal(
  publication.isPubliclyAvailable({ ...ready, published: true }),
  true,
  "Une fiche publiée et validée doit être accessible après filtrage RLS."
);

for (const internal of [
  "publication_ready_by",
  "published_by",
  "editorial_status",
  "editorial_review",
  "editorial_status_by"
]) {
  assert.ok(
    !publication.PUBLIC_FIELDS.split(/,\s*/).includes(internal),
    `${internal} ne doit pas être demandé par la page publique.`
  );
}

function createClient({ error = null, delay = null } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, payload: null, filters: [] };
      calls.push(call);
      const chain = {
        update(payload) { call.payload = payload; return chain; },
        eq(field, value) { call.filters.push(["eq", field, value]); return chain; },
        is(field, value) { call.filters.push(["is", field, value]); return chain; },
        select() { return chain; },
        async maybeSingle() {
          if (delay) await delay;
          return {
            error,
            data: error
              ? null
              : {
                  id: ready.id,
                  published: call.payload.published,
                  published_at: call.payload.published_at,
                  publication_ready: true,
                  editorial_status: "READY"
                }
          };
        }
      };
      return chain;
    }
  };
  return client;
}

const fixedNow = new Date("2026-09-02T12:00:00.000Z");
const publishClient = createClient();
const publishController = publication.createController();
const published = await publishController.setPublished({
  client: publishClient,
  author: ready,
  publish: true,
  adminId: "admin-1",
  readinessStatus: "READY",
  globalEnabled: true,
  now: fixedNow
});
assert.equal(published.data.published, true, "Publication réussie.");
assert.ok(
  publishClient.calls[0].filters.some((filter) => filter.join(":") === "eq:editorial_status:READY"),
  "La mise à jour doit filtrer sur READY côté serveur."
);

const unpublishClient = createClient();
const unpublished = await publication.createController().setPublished({
  client: unpublishClient,
  author: { ...ready, published: true },
  publish: false,
  adminId: "admin-1",
  readinessStatus: "READY",
  globalEnabled: true,
  now: fixedNow
});
assert.equal(unpublished.data.published, false, "Dépublication réussie.");

let release;
const pending = new Promise((resolve) => { release = resolve; });
const slowClient = createClient({ delay: pending });
const doubleClickController = publication.createController();
const firstClick = doubleClickController.setPublished({
  client: slowClient,
  author: ready,
  publish: true,
  adminId: "admin-1",
  readinessStatus: "READY",
  globalEnabled: true,
  now: fixedNow
});
const secondClick = await doubleClickController.setPublished({
  client: slowClient,
  author: ready,
  publish: true,
  adminId: "admin-1",
  readinessStatus: "READY",
  globalEnabled: true,
  now: fixedNow
});
assert.equal(secondClick.skipped, true, "Double clic protégé.");
assert.equal(secondClick.reason, "running", "Le second clic doit être identifié comme déjà en cours.");
release();
await firstClick;
assert.equal(slowClient.calls.length, 1, "Un seul UPDATE doit être envoyé.");

await assert.rejects(
  publication.createController().setPublished({
    client: createClient({ error: new Error("RLS denied") }),
    author: ready,
    publish: true,
    adminId: "admin-1",
    readinessStatus: "READY",
    globalEnabled: true,
    now: fixedNow
  }),
  /RLS denied/,
  "Une erreur Supabase doit remonter à l’interface."
);

assert.match(migration, /editorial_status in \('READY', 'NEEDS_REVIEW', 'INCOMPLETE', 'AMBIGUOUS'\)/);
assert.match(migration, /and editorial_status = 'READY'/);
assert.match(migration, /private\.invalidate_author_editorial_readiness/);
assert.match(migration, /revoke select on public\.authors from anon/);
assert.match(migration, /to anon[\s\S]*validated = true[\s\S]*published = true/);
assert.match(adminSource, /authorPublicationController\.setPublished/);
assert.match(adminSource, /persistV11AuthorReviewDecision/);
assert.match(adminHtml, /author-publication\.js\?v=author-publication-v2/);
assert.match(authorHtml, /author-publication\.js\?v=author-publication-v2/);
assert.match(configSource, /authorPublicPublishingEnabled:\s*true/);

console.log("PASS author-space-controlled-publication-v2");
