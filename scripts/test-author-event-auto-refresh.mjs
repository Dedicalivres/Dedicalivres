import assert from "node:assert/strict";
import fs from "node:fs";
import { renderAuthorStaticPage } from "./author-static-page.mjs";

const migration = fs.readFileSync(
  "supabase/migrations/20261009143000_author_presence_static_refresh.sql",
  "utf8"
);

assert.match(migration, /after insert or update or delete[\s\S]*on public\.event_authors_presence/i);
assert.match(migration, /old\.validated = true[\s\S]*new\.validated = true/i);
assert.match(migration, /old\.rejected[\s\S]*new\.rejected/i);
assert.match(migration, /old\.archived_at is null[\s\S]*new\.archived_at is null/i);
assert.match(migration, /old\.author_id[\s\S]*new\.author_id/i);
assert.match(migration, /private\.queue_author_presence_publication\(old\.event_id\)/i);
assert.match(migration, /private\.queue_author_presence_publication\(new\.event_id\)/i);
assert.match(migration, /not exists \([\s\S]*public\.event_authors_presence presence/i);

const author = {
  id: "ababf0dc-b962-43ff-a324-dbc54dcc4505",
  pseudo: "Dylan Heskin",
  slug: "dylan-heskin",
  validated: true,
  published: true
};
const event = (id, title, start_date, validated = true, rejected = false) => ({
  id,
  title,
  start_date,
  end_date: start_date,
  city: "Brest",
  region: "Bretagne",
  country_code: "FR",
  type: "Dédicace",
  validated,
  rejected
});
const past = event("past", "Événement passé", "2026-07-21");
const queven = event(
  "f2df9ae0-6164-440e-8b67-1adafff70182",
  "Dédicace Dylan Heskin - Espace Culturel E. Leclerc Quéven",
  "2026-10-17"
);
const brest = event(
  "3d509e99-5e2d-478d-9300-f86ba6c478f6",
  "Dédicace Dylan Heskin - Cultura Brest",
  "2026-10-24"
);
const hidden = event("hidden", "Présence non validée", "2026-10-20", false, false);
const rejected = event("rejected", "Événement rejeté", "2026-10-21", true, true);

const rendered = renderAuthorStaticPage({
  baseHtml: fs.readFileSync("author.html", "utf8"),
  author,
  events: [brest, past, hidden, rejected, queven, queven],
  generatedAt: "2026-10-09T12:00:00Z"
});

assert.equal(rendered.groups.ongoing.length, 0);
assert.deepEqual(rendered.groups.upcoming.map(({ id }) => id), [queven.id, brest.id]);
assert.deepEqual(rendered.groups.past.map(({ id }) => id), [past.id]);
assert.equal((rendered.html.match(new RegExp(`data-event-id="${queven.id}"`, "g")) || []).length, 1);
assert.match(rendered.html, /evenement\/dedicace-dylan-heskin-espace-culturel-e-leclerc-queven-queven-/);
assert.match(rendered.html, /evenement\/dedicace-dylan-heskin-cultura-brest-brest-/);
assert.doesNotMatch(rendered.html, /Présence non validée|Événement rejeté/);

console.log("PASS auto-refresh auteurs : déclencheurs présence, Dylan futur, filtres, dédoublonnage, tri et URLs canoniques");
