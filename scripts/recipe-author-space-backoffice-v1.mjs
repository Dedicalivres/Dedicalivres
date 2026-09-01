import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "author-backoffice.js"), "utf8");
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, "scripts/fixtures/author-space-backoffice-v1.json"),
    "utf8"
  )
);
const context = { URL };

vm.createContext(context);
vm.runInContext(source, context, { filename: "author-backoffice.js" });

const engine = context.DEDICALIVRES_AUTHOR_BACKOFFICE;
const result = engine.buildAuthorBackoffice({
  ...fixture,
  now: new Date(fixture.today)
});

console.log("ESPACE AUTEUR BACK-OFFICE V1 — RECETTE LOCALE");
console.log(JSON.stringify(result.counters, null, 2));

for (const record of result.records) {
  console.log(
    [
      record.identity.name,
      record.readiness.status,
      `${record.quality.confidence}%`,
      `${record.history.future.length} futur`,
      `${record.history.past.length} passé`,
      `${record.quality.ambiguities.length} ambiguïté`
    ].join(" · ")
  );
}

console.log("Publication : false · route publique : false · fusion automatique : false");
