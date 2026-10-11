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


let authorizedDeletedPaths;


try {

  const parsed =
    JSON.parse(
      process.env.PUBLICATION_DEPUBLISH_PATHS
      || "[]"
    );


  if (!Array.isArray(parsed)) {
    throw new Error(
      "tableau JSON attendu"
    );
  }


  authorizedDeletedPaths =
    new Set(
      parsed.map(
        (value) =>
          String(value)
      )
    );


  for (
    const path
    of authorizedDeletedPaths
  ) {
    if (
      !/^evenement\/[^/]+\.html$/.test(
        path
      )
      || path === "evenement/index.html"
    ) {
      throw new Error(
        "chemin non autorisé : "
        + path
      );
    }
  }

} catch (
  error
) {

  console.error(
    "STOP : PUBLICATION_DEPUBLISH_PATHS invalide",
    error
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

if (process.env.PUBLICATION_P0_RECOVERY === "true") {
  const allowedIds = new Set([
    "c69b157c-bf2f-4ddf-affa-a57497d261c2",
    "14b81335-1dab-4f6d-9667-5e88675c6f98",
  ]);
  const mapPath = "docs/territoires/event-canonical-map.json";
  const before = JSON.parse(execFileSync("git", ["show", `HEAD:${mapPath}`], { encoding: "utf8" }));
  const after = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const allowedPages = new Set([...allowedIds].flatMap((id) =>
    [before[id], after[id]].filter(Boolean)));
  const otherPages = [...changed].filter((path) =>
    path.startsWith("evenement/")
    && path !== "evenement/index.html"
    && !allowedPages.has(path));
  if (otherPages.length) {
    console.error("STOP : fiche hors des deux événements P0 modifiée", otherPages);
    process.exit(1);
  }

  const indexPath = "evenement/index.html";
  const pascal = before["c69b157c-bf2f-4ddf-affa-a57497d261c2"]?.replace("evenement/", "");
  const seclin = after["14b81335-1dab-4f6d-9667-5e88675c6f98"]?.replace("evenement/", "");
  const cardLinks = (html) => [...html.matchAll(/<a\s+class="card"\s+href="([^"]+\.html)"/g)]
    .map((match) => match[1]);
  const previousLinks = cardLinks(execFileSync("git", ["show", `HEAD:${indexPath}`], { encoding: "utf8" }));
  const currentLinks = cardLinks(fs.readFileSync(indexPath, "utf8"));
  const previous = new Set(previousLinks);
  const current = new Set(currentLinks);
  const otherPrevious = [...previous].filter((link) => link !== pascal && link !== seclin);
  const otherCurrent = [...current].filter((link) => link !== pascal && link !== seclin);
  if (!changed.has(indexPath) || !pascal || !seclin
      || !previous.has(pascal) || previous.has(seclin)
      || current.has(pascal) || !current.has(seclin)
      || previous.size !== previousLinks.length || current.size !== currentLinks.length
      || otherPrevious.length !== otherCurrent.length
      || otherPrevious.some((link) => !otherCurrent.includes(link))) {
    console.error("STOP : index P0 incohérent ou autre référence modifiée");
    process.exit(1);
  }

  if (changed.has(mapPath)) {
    const otherIds = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const id of allowedIds) otherIds.delete(id);
    if ([...otherIds].some((id) => before[id] !== after[id])) {
      console.error("STOP : autre canonical modifié pendant la reprise P0");
      process.exit(1);
    }
  }
}


const progressiveManifestPath =
  "scripts/event-publisher/progressive-events.json";

if (changed.has(progressiveManifestPath)) {
  try {
    const before = JSON.parse(execFileSync(
      "git", ["show", `HEAD:${progressiveManifestPath}`], { encoding: "utf8" }
    ));
    const after = JSON.parse(fs.readFileSync(progressiveManifestPath, "utf8"));
    const canonicalBefore = JSON.parse(execFileSync(
      "git", ["show", "HEAD:docs/territoires/event-canonical-map.json"], { encoding: "utf8" }
    ));
    if (!Array.isArray(before.event_ids) || !Array.isArray(after.event_ids)
        || Object.keys(before).join() !== "event_ids"
        || Object.keys(after).join() !== "event_ids"
        || after.event_ids.length > 2 || new Set(after.event_ids).size !== after.event_ids.length
        || after.event_ids.some((id) => !before.event_ids.includes(id))
        || before.event_ids.filter((id) => !after.event_ids.includes(id))
          .some((id) => !authorizedDeletedPaths.has(canonicalBefore[id]))) {
      throw new Error("retrait progressif non autorisé");
    }
  } catch (error) {
    console.error("STOP : manifeste progressif modifié hors dépublication autorisée", error);
    process.exit(1);
  }
}


const deleted =
  command([
    "diff",
    "--diff-filter=D",
    "--name-only",
  ]);


const deletedSet =
  new Set(
    deleted
  );


const unauthorizedDeleted =
  deleted.filter(
    (path) =>
      !authorizedDeletedPaths.has(
        path
      )
  );


if (
  unauthorizedDeleted.length
) {
  console.error(
    "STOP : suppression automatique non autorisée"
  );

  for (
    const path
    of unauthorizedDeleted
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
      && !(
        deletedSet.has(
          path
        )
        && authorizedDeletedPaths.has(
          path
        )
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
    progressiveManifestPath,
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
  `PASS suppressions autorisées : ${deleted.length}`
);
