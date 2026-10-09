import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const urlSource = fs.readFileSync(path.join(root, "url-normalizer.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "author-contribution-core.js"), "utf8");
const context = vm.createContext({ URL });
vm.runInContext(urlSource, context);
vm.runInContext(coreSource, context);
const core = context.DEDICALIVRES_AUTHOR_CONTRIBUTION;
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261001153248_author_profile_submissions.sql"),
  "utf8"
);
const approvalMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261009052049_author_profile_submission_approval_publish.sql"),
  "utf8"
);
const publicPage = fs.readFileSync(path.join(root, "author-contribute.html"), "utf8");
const publicScript = fs.readFileSync(path.join(root, "author-contribute.js"), "utf8");
const adminScript = fs.readFileSync(path.join(root, "admin-author-profile-submissions.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const adminV11Html = fs.readFileSync(path.join(root, "admin-v11.html"), "utf8");
const localDraft = fs.readFileSync(path.join(root, "author-local-draft.js"), "utf8");
const hardening = fs.readFileSync(path.join(root, "SUPABASE_SECURITY_HARDENING.sql"), "utf8");

const current = {
  id: "11111111-1111-4111-8111-111111111111",
  pseudo: "Auteure Test",
  bio: "Bio actuelle",
  location: "Bretagne",
  website: "https://example.com/",
  shop_url: "",
  profile_type: "author",
  avatar_url: "https://images.example/old.jpg",
  updated_at: "2026-10-01T05:00:00.000Z"
};

const creation = core.buildSubmission({
  mode: "create",
  input: {
    pseudo: "Élise Test",
    bio: "Biographie",
    location: "Wallonie, Belgique",
    website: "https://example.org",
    shop_url: "",
    profile_type: "artist_author",
    validated: true,
    published: true
  },
  proposedAvatarUrl: "https://images.example/new.jpg"
});

assert.equal(creation.request_type, "create");
assert.equal(creation.target_author_id, null);
assert.equal(creation.payload.slug, "elise-test");
assert.equal(creation.payload.validated, undefined);
assert.equal(creation.payload.published, undefined);
assert.equal(creation.proposed_avatar_url, "https://images.example/new.jpg");

assert.equal(
  core.findStrongExistingAuthorMatch(creation, [{
    id: "existing",
    pseudo: "Élise Test",
    slug: "elise-test",
    website: "https://example.org/"
  }])?.id,
  "existing"
);
assert.equal(core.findStrongExistingAuthorMatch(creation, [{
  id: "different",
  pseudo: "Élise Test",
  slug: "elise-test",
  website: "https://different.example"
}]), null);

const modification = core.buildSubmission({
  mode: "modify",
  currentAuthor: current,
  input: {
    ...current,
    bio: "Bio proposée",
    website: "https://example.com"
  }
});

assert.equal(JSON.stringify(modification.payload), JSON.stringify({ bio: "Bio proposée" }));
assert.equal(current.bio, "Bio actuelle", "la fiche originale reste intacte avant validation");
assert.equal(modification.base_author_updated_at, current.updated_at);
assert.equal(modification.payload.editorial_status, undefined);

const photoOnly = core.buildSubmission({
  mode: "modify",
  currentAuthor: current,
  input: current,
  proposedAvatarUrl: "https://images.example/replacement.jpg"
});
assert.equal(JSON.stringify(photoOnly.payload), "{}");
assert.equal(photoOnly.proposed_avatar_url, "https://images.example/replacement.jpg");

assert.throws(
  () => core.buildSubmission({ mode: "modify", currentAuthor: current, input: current }),
  /Aucune modification/
);

const comparison = core.compareSubmission(modification, current);
assert.equal(
  JSON.stringify(comparison),
  JSON.stringify([{ field: "bio", current: "Bio actuelle", proposed: "Bio proposée" }])
);

assert.match(migration, /create table if not exists public\.author_profile_submissions/);
assert.match(migration, /alter table public\.author_profile_submissions enable row level security/);
assert.match(migration, /grant insert \([\s\S]*?\) on public\.author_profile_submissions to anon, authenticated/);
assert.doesNotMatch(migration, /grant\s+update[^;]+to anon/i);
assert.match(migration, /for insert\s+to anon, authenticated\s+with check/);
assert.match(migration, /security invoker/g);
assert.match(migration, /auth\.uid\(\) is null or not \(select private\.is_admin\(\)\)/);
assert.match(migration, /payload - array\[[\s\S]*?'profile_type'[\s\S]*?\] = '\{\}'::jsonb/);
assert.match(migration, /payload <> '\{\}'::jsonb or proposed_avatar_url is not null/);
assert.doesNotMatch(migration, /jsonb_object_length/);
assert.match(migration, /status in \('pending', 'rejected'\) and target_author_id is null/);
assert.match(migration, /status = 'approved' and target_author_id is not null/);
assert.match(migration, /current_author\.updated_at is distinct from submission\.base_author_updated_at/);
assert.match(migration, /validated,\s*updated_at[\s\S]*?false,\s*now\(\)/);
assert.match(migration, /revoke all on function public\.approve_author_profile_submission\(uuid\) from public, anon/);
assert.match(approvalMigration, /for update/);
assert.match(approvalMigration, /status <> 'pending'/);
assert.match(approvalMigration, /pg_advisory_xact_lock/);
assert.match(approvalMigration, /candidate_slug := left\(base_slug,[\s\S]*?suffix::text/);
assert.match(approvalMigration, /validated = true/);
assert.match(approvalMigration, /publication_ready = true/);
assert.match(approvalMigration, /editorial_status = 'READY'/);
assert.match(approvalMigration, /published = true/);
assert.match(approvalMigration, /current_author\.updated_at is distinct from submission\.base_author_updated_at/);
assert.match(approvalMigration, /proposed_avatar_url is not null then submission\.proposed_avatar_url else avatar_url/);
assert.match(approvalMigration, /status = 'approved'/);

const rejectFunction = migration.match(/create or replace function public\.reject_author_profile_submission[\s\S]*?\$\$;/)?.[0] || "";
assert.ok(rejectFunction);
assert.doesNotMatch(rejectFunction, /update public\.authors/);

assert.match(publicPage, /Créer ou mettre à jour ma fiche auteur/);
assert.match(publicPage, /1 · Ma fiche|<span>1<\/span> Ma fiche/);
assert.match(publicPage, /2 · Mon portrait|<span>2<\/span> Mon portrait/);
assert.match(publicPage, /3 · Vérification et envoi|<span>3<\/span> Vérification et envoi/);
assert.match(publicPage, /Une dernière étape humaine/);
assert.match(publicPage, /Cette démarche n’empêche pas l’envoi de votre proposition/);
assert.match(publicPage, /https:\/\/www\.instagram\.com\/dedicalivres\//);
assert.match(publicPage, /mailto:dedicalivres@gmail\.com/);
assert.doesNotMatch(publicPage, /facebook\.com/i);
assert.match(publicPage, /name="request_type" value="create" checked/);
assert.match(publicPage, /name="request_type" value="modify"/);
assert.match(publicPage, /name="legal_accept" type="checkbox" required/);
assert.match(publicPage, /author-local-draft\.js\?v=4/);
assert.match(publicPage, /id="author-load-selected"/);
assert.match(publicScript, /const authorsPromise = loadAuthors\(\)/);
assert.match(publicScript, /await authorsPromise/);
assert.match(publicScript, /Récupérez d’abord les données publiques/);
assert.match(publicScript, /body\.append\("folder", "author-portraits"\)/);
assert.match(publicScript, /4 \* 1024 \* 1024/);
assert.match(publicScript, /author_profile_submissions/);
assert.doesNotMatch(publicScript, /\.from\("authors"\)\.update/);

assert.match(adminScript, /Actuel/);
assert.match(adminScript, /Proposé/);
assert.match(adminScript, />APPROUVER</);
assert.match(adminScript, />REJETER</);
assert.match(adminScript, /approve_author_profile_submission/);
assert.match(adminScript, /reject_author_profile_submission/);
assert.match(adminScript, /decisionsInFlight\.has\(submissionId\)/);
assert.match(adminScript, /querySelectorAll\("\[data-profile-submission-action\]"\)/);
assert.match(adminScript, /prochaine génération auteurs/);
assert.match(adminScript, /Une fiche auteur existante semble correspondre à cette soumission/);
assert.match(adminScript, />RATTACHER À CETTE FICHE</);
assert.match(adminScript, /request_type: "modify"/);
assert.match(adminScript, /delete payload\.slug/);
for (const page of [adminHtml, adminV11Html]) {
  assert.match(page, /author-contribution-core\.js\?v=2/);
  assert.match(page, /admin-author-profile-submissions\.js\?v=3/);
  assert.ok(page.indexOf("author-contribution-core.js") < page.indexOf("admin-author-profile-submissions.js"));
}
assert.match(localDraft, /#author-profile-submission-form/);
assert.match(localDraft, /form\.id === "author-profile-submission-form"/);
assert.match(localDraft, /Mes informations auteur sur cet appareil/);
assert.match(localDraft, /Réutiliser mes informations/);
assert.match(localDraft, /Continuer sans récupération/);
assert.match(localDraft, /Effacer les informations sauvegardées/);
assert.match(hardening, /create policy "Admins can manage authors"[\s\S]*?for all\s+to authenticated/);
assert.doesNotMatch(hardening, /on public\.authors\s+for update\s+to anon/i);

console.log("PASS author profile contributions: création, modification, photo, comparaison et barrières admin");
