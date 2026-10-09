import assert from "node:assert/strict";
import fs from "node:fs";


const admin =
  fs.readFileSync(
    "admin-shell.js",
    "utf8"
  );


const workflow =
  fs.readFileSync(
    ".github/workflows/publish-events.yml",
    "utf8"
  );


const edgeDispatch =
  fs.readFileSync(
    "supabase/functions/event-publication-dispatch/index.ts",
    "utf8"
  );


const supabaseConfig =
  fs.readFileSync(
    "supabase/config.toml",
    "utf8"
  );


const worker =
  fs.readFileSync(
    "scripts/publication-jobs.mjs",
    "utf8"
  );


const publisher =
  fs.readFileSync(
    "scripts/publish-events-local.sh",
    "utf8"
  );


const diffGuard =
  fs.readFileSync(
    "scripts/check-publication-diff.mjs",
    "utf8"
  );


const wrapper =
  fs.readFileSync(
    "scripts/event-publisher/generate-events-cloud.py",
    "utf8"
  );


const core =
  fs.readFileSync(
    "scripts/event-publisher/generate-events.py",
    "utf8"
  );


const migrations =
  fs.readdirSync(
    "supabase/migrations"
  );


const lifecycleName =
  migrations.find(
    (name) =>
      name.endsWith(
        "_event_publication_lifecycle.sql"
      )
  );


assert.ok(
  lifecycleName,
  "Migration lifecycle publication introuvable"
);


const lifecycle =
  fs.readFileSync(
    "supabase/migrations/"
    + lifecycleName,
    "utf8"
  );


const legacy =
  JSON.parse(
    fs.readFileSync(
      "scripts/event-publisher/legacy-enriched-events.json",
      "utf8"
    )
  );


assert.equal(
  Object.keys(
    legacy.events
    || {}
  ).length,
  282
);


// Validation humaine conservée.
assert.match(
  admin,
  /\.update\(\{\s*validated:\s*true,\s*rejected:\s*false/s
);


// Rejet humain conservé.
assert.match(
  admin,
  /\.update\(\{\s*rejected:\s*true,\s*validated:\s*false/s
);


// Plus aucun dispatch GitHub/Edge depuis le navigateur admin.
assert.doesNotMatch(
  admin,
  /functions\/v1\/event-publication-dispatch/
);

assert.doesNotMatch(
  admin,
  /requestV11EventPublication/
);


// Messages cohérents avec le serveur.
assert.match(
  admin,
  /publication automatique planifiée/
);

assert.match(
  admin,
  /dépublication automatique planifiée/
);

assert.match(
  admin,
  /retrait statique automatique planifié/
);


// La migration ne décide jamais de la validation.
assert.doesNotMatch(
  lifecycle,
  /update\s+public\.events\s+set\s+validated/i
);


// Identité durable après DELETE.
assert.match(
  lifecycle,
  /target_event_id/
);


// Transition public -> non public.
assert.match(
  lifecycle,
  /old_is_public\s+and\s+not new_is_public/
);


// DELETE événement.
assert.match(
  lifecycle,
  /tg_op = 'DELETE'/
);

assert.match(
  lifecycle,
  /'unpublish'/
);

assert.match(
  lifecycle,
  /'delete'/
);


// Dispatch serveur accepte les deux nouvelles raisons.
assert.match(
  lifecycle,
  /'validation',\s*'edit',\s*'unpublish',\s*'delete'/s
);

assert.match(
  lifecycle,
  /coalesce\(\s*job\.event_id,\s*job\.target_event_id\s*\)/s
);


// Compatibilité transitoire :
// l'ancien RPC serveur reste présent.
assert.match(
  lifecycle,
  /claim_event_publication_dispatch\(\s*p_job_id uuid\s*\)/s
);


// Nouveau canal authentifié par jeton aléatoire par job.
assert.match(
  lifecycle,
  /dispatch_token/
);

assert.match(
  lifecycle,
  /gen_random_uuid\(\)/
);

assert.match(
  lifecycle,
  /p_dispatch_token/
);

assert.match(
  lifecycle,
  /job\.dispatch_token\s*=\s*p_dispatch_token/s
);

assert.match(
  lifecycle,
  /claim_event_publication_dispatch\(uuid, uuid\)/
);

assert.match(
  edgeDispatch,
  /dispatch_token/
);

assert.match(
  edgeDispatch,
  /p_dispatch_token/
);

assert.match(
  edgeDispatch,
  /invalid_dispatch_token/
);


// L'appel pg_net n'utilise pas le contrôle JWT de plateforme.
// L'authentification est réalisée par le jeton serveur du job.
assert.match(
  supabaseConfig,
  /verify_jwt\s*=\s*false/
);


// Worker transmet uniquement les suppressions autorisées.
assert.match(
  worker,
  /target_event_id/
);

assert.match(
  worker,
  /depublish_event_ids/
);

assert.match(
  worker,
  /depublish_paths/
);

assert.match(
  worker,
  /event-canonical-map\.json/
);

assert.match(
  worker,
  /isDepublicationReason/
);

assert.match(
  worker,
  /row\.reason === "edit"[\s\S]*canonicalDepublicationPath\(row\) !== null/
);


// Un canonical absent ou invalide bloque le job avant RUNNING.
assert.match(
  worker,
  /\^evenement\\\/\[\^\/\]\+\\\.html\$/
);

assert.match(
  worker,
  /value === "evenement\/index\.html"/
);

assert.match(
  worker,
  /BLOCKED canonical/
);

assert.match(
  worker,
  /chemin canonical absent ou invalide pour target_event_id=/
);

assert.match(
  worker,
  /depublishEventIds\.length\s*!==\s*depublishPaths\.length/s
);


// Les legacy restent bloquées pour republication,
// mais une dépublication explicite peut les retirer.
assert.match(
  worker,
  /BLOCKED legacy/
);

assert.match(
  worker,
  /isDepublicationReason/
);


// Garde-fou génération : retrait exact uniquement.
assert.match(
  publisher,
  /PUBLICATION_DEPUBLISH_PATHS/
);

assert.match(
  publisher,
  /suppression historique non autorisée/i
);

assert.match(
  publisher,
  /authorized_removed/
);

assert.match(
  publisher,
  /target\.unlink\(\)/
);

assert.match(
  publisher,
  /PUBLICATION_DEPUBLISH_EVENT_IDS/
);

assert.match(
  publisher,
  /event-pages-manifest\.json/
);

assert.match(
  publisher,
  /ancienne fiche retirée sans remplacement canonique valide/
);


// Garde-fou Git : toute autre suppression reste bloquée.
assert.match(
  diffGuard,
  /PUBLICATION_DEPUBLISH_PATHS/
);

assert.match(
  diffGuard,
  /unauthorizedDeleted/
);

assert.match(
  diffGuard,
  /suppression automatique non autorisée/
);


// Workflow transmet l'autorisation du batch.
assert.match(
  workflow,
  /PUBLICATION_DEPUBLISH_PATHS/
);

assert.match(
  workflow,
  /steps\.claim\.outputs\.depublish_paths/
);

assert.match(
  workflow,
  /steps\.claim\.outputs\.depublish_event_ids/
);


// Le job manual isolé suit le canal serveur sécurisé complet.
assert.match(
  lifecycle,
  /job\.reason = 'manual'[\s\S]*job\.event_id\s+is null[\s\S]*job\.target_event_id\s+is null/
);

assert.match(
  lifecycle,
  /new\.reason = 'manual'[\s\S]*new\.event_id\s+is null[\s\S]*new\.target_event_id\s+is null/
);

assert.doesNotMatch(
  lifecycle.match(
    /claim_event_publication_dispatch\(\s*p_job_id uuid\s*\)[\s\S]*?\$function\$;/
  )?.[0] || "",
  /'manual'/
);

assert.match(
  edgeDispatch,
  /job\.reason === "manual"/
);

assert.match(
  edgeDispatch,
  /preactivation_test:\s*"true"/
);

assert.match(
  workflow,
  /PUBLICATION_PREACTIVATION_TEST/
);

assert.match(
  workflow,
  /PASS préactivation : zéro diff généré\./
);


// Filet de secours et concurrence conservés.
assert.match(
  workflow,
  /schedule:/
);

assert.match(
  workflow,
  /cron: "\*\/5 \* \* \* \*"/
);

assert.match(
  workflow,
  /cancel-in-progress: false/
);


// Protections historiques toujours présentes.
assert.match(
  wrapper,
  /LEGACY_PRESERVED/
);

assert.match(
  wrapper,
  /ARCHIVE_PRESERVED/
);

assert.match(
  wrapper,
  /SITEMAP_URLS_PRESERVED/
);

assert.match(
  wrapper,
  /SITEMAP_LASTMOD_PRESERVED/
);


assert.doesNotMatch(
  core,
  /from veille/
);

assert.doesNotMatch(
  core,
  /import veille/
);


console.log(
  "PASS cycle événement : "
  + "validation humaine → publication serveur ; "
  + "rejet/suppression humaine → dépublication serveur autorisée ; "
  + "suppression statique non autorisée toujours bloquée."
);
