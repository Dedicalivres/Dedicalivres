import assert from "node:assert/strict";
import fs from "node:fs";


const admin =
  fs.readFileSync(
    "admin.js",
    "utf8"
  );

const migration =
  fs.readFileSync(
    "supabase/migrations/20261006203000_event_publication_jobs.sql",
    "utf8"
  );

const workflow =
  fs.readFileSync(
    ".github/workflows/publish-events.yml",
    "utf8"
  );

const worker =
  fs.readFileSync(
    "scripts/publication-jobs.mjs",
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


assert.match(
  admin,
  /DEDICALIVRES_DUPLICATES\.findMatches/
);

assert.match(
  admin,
  /\.update\(\{\s*validated:\s*true,\s*rejected:\s*false/s
);

assert.match(
  admin,
  /requestEventPublication\(\s*id,\s*"validation"/s
);


assert.doesNotMatch(
  migration,
  /update\s+public\.events\s+set\s+validated/i
);

assert.match(
  migration,
  /if not new_is_public then/
);

assert.match(
  migration,
  /'BLOCKED'/
);


assert.match(
  worker,
  /BLOCKED/
);

assert.match(
  worker,
  /legacy-enriched-events\.json/
);


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
  /no-auto-matte\.sqlite3/
);


assert.doesNotMatch(
  core,
  /from veille/
);

assert.doesNotMatch(
  core,
  /import veille/
);

assert.doesNotMatch(
  core,
  /veille_litteraire/
);


assert.match(
  workflow,
  /PUBLICATION_AUTOMATION_ENABLED/
);

assert.match(
  workflow,
  /vars\.PUBLICATION_AUTOMATION_ENABLED == 'true'/
);

assert.match(
  workflow,
  /preactivation_test/
);

assert.match(
  workflow,
  /github\.event_name == 'workflow_dispatch'/
);

assert.match(
  workflow,
  /inputs\.preactivation_test == true/
);

assert.match(
  workflow,
  /PUBLICATION_PREACTIVATION_TEST/
);

assert.match(
  worker,
  /PUBLICATION_PREACTIVATION_TEST/
);

assert.match(
  worker,
  /reason=eq\.manual/
);

assert.match(
  worker,
  /event_id=is\.null/
);

assert.match(
  worker,
  /only manual jobs with event_id=null are allowed/
);

assert.match(
  workflow,
  /Enforce isolated preactivation no-op/
);

assert.match(
  workflow,
  /zéro diff généré/
);

assert.match(
  workflow,
  /env\.PUBLICATION_PREACTIVATION_TEST == 'true'/
);

assert.match(
  worker,
  /PREACTIVATION_TEST\s*\? false\s*:\s*attempts < 3/s
);

assert.match(
  workflow,
  /cancel-in-progress: false/
);

assert.match(
  workflow,
  /DEDICALIVRES_SUPABASE_SECRET_KEY/
);


console.log(
  "PASS architecture post-validation : "
  + "validation humaine, legacy BLOCKED, "
  + "aucune suppression, activation fermée."
);
