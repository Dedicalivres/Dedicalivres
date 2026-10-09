import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("soumettre.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const adminContext = fs.readFileSync("admin-context.js", "utf8");
const adminShell = fs.readFileSync("admin-shell.js", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261002181029_event_submission_contacts.sql",
  "utf8"
);
const atomicMigration = fs.readFileSync(
  "supabase/migrations/20261009143100_atomic_event_author_submission.sql",
  "utf8"
);

const contactIndex = html.indexOf('class="submission-contact-panel"');
assert.ok(contactIndex > html.indexOf('id="image-preview"'));
assert.ok(contactIndex < html.indexOf('class="legal-consent"'));
assert.match(html, /name="submitter_name"[^>]*maxlength="160"/);
assert.match(html, /name="submitter_email"[^>]*type="email"[^>]*required/);
assert.match(html, /ne sont jamais affichées publiquement/);

assert.match(app, /isValidEmail\(submitterEmail\)/);
assert.match(app, /\.rpc\("submit_event_with_contact"/);
assert.doesNotMatch(app, /from\("event_submission_contacts"\)\s*\.insert/);
assert.doesNotMatch(app, /from\("event_authors_presence"\)\s*\.insert/);
assert.match(app, /\{ \.\.\.payload, author_presence: authorPresencePayload \}/);
assert.match(app, /Aucun événement ni contact n’a été conservé/);

assert.match(adminContext, /from\("event_submission_contacts"\)/);
assert.match(adminContext, /submitter_name, submitter_email/);
assert.match(adminShell, /Contact proposant — nom\/structure/);
assert.match(adminShell, /value\.href = "mailto:" \+ String/);

assert.match(migration, /create table public\.event_submission_contacts/);
assert.match(migration, /alter table public\.event_submission_contacts enable row level security/);
assert.match(migration, /revoke all on public\.event_submission_contacts from anon, authenticated/);
assert.match(migration, /Admins can read event submission contacts/);
assert.match(migration, /security definer/);
assert.match(migration, /revoke all on function public\.submit_event_with_contact[\s\S]*from public/);
assert.match(migration, /grant execute on function public\.submit_event_with_contact[\s\S]*to anon, authenticated/);
assert.match(migration, /insert into public\.events[\s\S]*insert into public\.event_submission_contacts/);
assert.match(atomicMigration, /'author_presence'/);
assert.match(atomicMigration, /insert into public\.events[\s\S]*insert into public\.event_submission_contacts[\s\S]*insert into public\.event_authors_presence/);
assert.match(atomicMigration, /'event_submission'[\s\S]*'author'[\s\S]*false,[\s\S]*false,[\s\S]*false/);
assert.doesNotMatch(atomicMigration, /update\s+public\.event_authors_presence/i);

for (const publicFile of [
  "event.js",
  "scripts/build-author-pages.mjs",
  "scripts/build-territorial-pages.mjs",
  "scripts/build-event-pages.mjs",
  "sitemap.xml"
]) {
  if (!fs.existsSync(publicFile)) continue;
  const source = fs.readFileSync(publicFile, "utf8");
  assert.doesNotMatch(source, /submitter_(?:name|email)/, `${publicFile} ne doit pas exposer le contact`);
}

console.log("EVENT_SUBMISSION_CONTACT_OK");
