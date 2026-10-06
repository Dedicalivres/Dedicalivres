import {
  execFileSync,
} from "node:child_process";

import fs from "node:fs";


function command(
  args
) {
  return execFileSync(
    "git",
    args,
    {
      encoding:
        "utf8",
    },
  )
    .split("\n")
    .map(
      (value) =>
        value.trim()
    )
    .filter(Boolean);
}


const legacy =
  JSON.parse(
    fs.readFileSync(
      "scripts/event-publisher/legacy-enriched-events.json",
      "utf8"
    )
  );


const protectedPages =
  new Set(
    Object.values(
      legacy.events
      || {}
    ).map(
      (filename) =>
        `evenement/${filename}`
    )
  );


if (
  protectedPages.size !== 282
) {
  console.error(
    "STOP : manifeste legacy != 282"
  );

  process.exit(1);
}


const changed =
  new Set([
    ...command([
      "diff",
      "--name-only",
    ]),

    ...command([
      "ls-files",
      "--others",
      "--exclude-standard",
    ]),
  ]);


const deleted =
  command([
    "diff",
    "--diff-filter=D",
    "--name-only",
  ]);


if (
  deleted.length
) {
  console.error(
    "STOP : suppression automatique détectée"
  );

  for (
    const path
    of deleted
  ) {
    console.error(
      ` - ${path}`
    );
  }

  process.exit(1);
}


const legacyChanged =
  [
    ...changed,
  ].filter(
    (path) =>
      protectedPages.has(
        path
      )
  );


if (
  legacyChanged.length
) {
  console.error(
    "STOP : modification fiche legacy protégée"
  );

  for (
    const path
    of legacyChanged
  ) {
    console.error(
      ` - ${path}`
    );
  }

  process.exit(1);
}


function allowed(
  path
) {
  if (
    path.startsWith(
      "evenement/"
    )
  ) {
    return true;
  }

  if (
    path.startsWith(
      "auteurs/"
    )
  ) {
    return true;
  }

  if (
    path.startsWith(
      "docs/territoires/"
    )
  ) {
    return true;
  }

  if (
    /^evenements-litteraires-.*\.html$/.test(
      path
    )
  ) {
    return true;
  }

  if (
    /^sitemap(?:-[a-z0-9-]+)?\.xml$/i.test(
      path
    )
  ) {
    return true;
  }

  return new Set([
    "index.html",
    "salons-du-livre.html",
    "dedicaces.html",
    "event-canonical.js",
  ]).has(path);
}


const unexpected =
  [
    ...changed,
  ].filter(
    (path) =>
      !allowed(path)
  );


if (
  unexpected.length
) {
  console.error(
    "STOP : fichier généré inattendu"
  );

  for (
    const path
    of unexpected
  ) {
    console.error(
      ` - ${path}`
    );
  }

  process.exit(1);
}


if (
  changed.size > 250
) {
  console.error(
    `STOP : ${changed.size} fichiers modifiés ; seuil = 250`
  );

  process.exit(1);
}


console.log(
  `PASS périmètre publication : ${changed.size} fichier(s)`
);

console.log(
  "PASS fiches legacy modifiées : 0/282"
);

console.log(
  "PASS suppressions : 0"
);
