import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleSource = fs.readFileSync(path.join(root, "author-backoffice.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "admin-v11.html"), "utf8");
const adminSource = fs.readFileSync(path.join(root, "admin-shell.js"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const authorSitemap = fs.readFileSync(path.join(root, "sitemap-seo-auteurs.xml"), "utf8");
const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");
const configSource = fs.readFileSync(path.join(root, "config.js"), "utf8");
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, "scripts/fixtures/author-space-backoffice-v1.json"),
    "utf8"
  )
);
const context = { URL };

vm.createContext(context);
vm.runInContext(moduleSource, context, { filename: "author-backoffice.js" });

const engine = context.DEDICALIVRES_AUTHOR_BACKOFFICE;
assert.ok(engine, "Le moteur auteur doit être exposé.");
assert.equal(typeof engine.author_publication_readiness, "function");
assert.equal(typeof engine.renderAuthorPublicTemplate, "function");

const result = engine.buildAuthorBackoffice({
  ...fixture,
  now: new Date(fixture.today)
});
const byId = new Map(result.records.map((record) => [record.id, record]));

assert.deepEqual(
  JSON.parse(JSON.stringify(result.counters)),
  {
    total: 4,
    READY: 1,
    NEEDS_REVIEW: 1,
    INCOMPLETE: 1,
    AMBIGUOUS: 1
  },
  "La recette doit couvrir les quatre états de préparation."
);

const ready = byId.get("author-ready");
assert.equal(ready.readiness.status, "READY");
assert.equal(ready.readiness.ready, true);
assert.equal(ready.history.future.length, 1, "La présence future doit être classée.");
assert.equal(ready.history.past.length, 1, "La présence passée doit être classée.");
assert.equal(ready.quality.confirmedPresenceCount, 2);
assert.ok(ready.quality.independentSourceCount >= 2);
assert.ok(ready.provenance.some((row) => row.origin === "admin"));
assert.ok(ready.provenance.some((row) => row.field === "presence"));

const incomplete = byId.get("author-incomplete");
assert.equal(incomplete.readiness.status, "INCOMPLETE");
assert.ok(incomplete.readiness.missing.includes("photo"));

const ambiguous = byId.get("author-ambiguous");
assert.equal(ambiguous.readiness.status, "AMBIGUOUS");
assert.equal(ambiguous.quality.ambiguities[0].type, "manual");
assert.equal(ambiguous.source.automaticMerge, false);

const needsReview = byId.get("author-review");
assert.equal(needsReview.readiness.status, "NEEDS_REVIEW");
assert.ok(needsReview.readiness.reviewReasons.some((reason) => reason.includes("Identité")));
assert.ok(needsReview.readiness.reviewReasons.some((reason) => reason.includes("70")));

const kgView = engine.normalizeKnowledgeGraphAuthorView({
  publication: false,
  public_route: false,
  automatic_merge: false,
  identity: {
    entity_key: "author:kg-test",
    entity_type: "author",
    display_name: "Élise KG",
    confidence_score: 84,
    confidence_level: "high",
    confidence_reasons: ["deux sources"],
    provenance: [{ event_id: 9, source_url: "https://source.example/auteur" }],
    attributes: { event_count: 2, photo: "", bio: "", public_links: [] }
  },
  past_events: [],
  future_events: [{
    event_id: 9,
    title: "Salon KG",
    date: "2026-10-01",
    city: "Paris",
    presence_status: "confirmed",
    provenance: [{ event_id: 9 }],
    evidence: [{ proof: "programme" }]
  }],
  possible_identity_matches: [{
    relation_key: "match:1",
    confidence_score: 76,
    evidence: [{ classification: "ambiguous" }]
  }]
});
assert.equal(kgView.entityKey, "author:kg-test");
assert.equal(kgView.confidence, 84);
assert.equal(kgView.futureEvents.length, 1);
assert.equal(kgView.possibleSameAs.length, 1);
assert.equal(kgView.publicRoute, false);

const privateInputRecord = engine.buildAuthorRecord({
  author: fixture.authors[0],
  authors: fixture.authors,
  events: fixture.events,
  presences: [{
    ...fixture.presences[0],
    contact_email: "private@example.test",
    contact_name: "Contact privé"
  }],
  now: new Date(fixture.today)
});
assert.doesNotMatch(JSON.stringify(privateInputRecord), /private@example\.test|Contact privé/);

assert.equal(
  engine.filterAuthorRecords(result.records, { status: "READY" }).length,
  1
);
assert.equal(
  engine.filterAuthorRecords(result.records, { photo: "no" }).length,
  1
);
assert.equal(
  engine.filterAuthorRecords(result.records, { future: "yes" }).length,
  4
);
assert.equal(
  engine.filterAuthorRecords(result.records, { ambiguity: "yes" }).length,
  1
);
assert.equal(
  engine.filterAuthorRecords(result.records, { search: "aurore" })[0].id,
  "author-ready"
);

const template = engine.renderAuthorPublicTemplate(ready);
assert.match(template, /data-author-preview-template="v1"/);
assert.match(template, /Événements à venir/);
assert.match(template, /Historique/);
assert.match(template, /Liens utiles/);
assert.doesNotMatch(template, /<script|application\/ld\+json|rel="canonical"|<meta/i);
assert.doesNotMatch(moduleSource, /\bfetch\s*\(/, "Le modèle ne doit déclencher aucun appel réseau.");

for (const status of ["READY", "NEEDS_REVIEW", "INCOMPLETE", "AMBIGUOUS"]) {
  assert.match(adminHtml, new RegExp(`data-author-readiness-count="${status}"`));
}
for (const id of [
  "v11-author-confidence-filter",
  "v11-author-photo-filter",
  "v11-author-future-filter",
  "v11-author-ambiguity-filter",
  "v11-author-search"
]) {
  assert.match(adminHtml, new RegExp(`id="${id}"`));
}
for (const action of [
  "Valider l’identité",
  "Marquer ambigu",
  "Confirmer une présence",
  "Ignorer le faux rapprochement"
]) {
  assert.match(adminHtml, new RegExp(action));
}
assert.match(adminSource, /renderV11AuthorTemplatePreview/);
assert.match(adminSource, /toggleV11AuthorIdentityValidated/);
assert.match(adminSource, /toggleV11AuthorAmbiguity/);
assert.match(adminSource, /ignoreV11AuthorPossibleMatches/);
assert.match(adminSource, /focusV11AuthorPresences/);

assert.match(configSource, /authorPublicPublishingEnabled:\s*false/);
assert.doesNotMatch(sitemap, /\/author\.html/);
assert.doesNotMatch(authorSitemap, /\/author\.html/);
assert.doesNotMatch(redirects, /^\/author(?:\s|\/)/m);
assert.doesNotMatch(homeHtml, /href=["'][^"']*author\.html/i);
assert.doesNotMatch(adminHtml, /href=["'][^"']*author\.html/i);

console.log("PASS author-space-backoffice-v1");
