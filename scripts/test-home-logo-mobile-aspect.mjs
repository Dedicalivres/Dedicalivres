import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("ludique.css", "utf8");

assert.match(
  html,
  /rel="preload" as="image" href="assets\/brand\/logo-3d-clair\.webp\?v=logo3d-1"/
);
assert.match(
  html,
  /brand-logo brand-logo--clair[\s\S]*?width="820"[\s\S]*?height="687"/
);
assert.match(
  html,
  /brand-logo brand-logo--sombre[\s\S]*?width="1536"[\s\S]*?height="1024"/
);
assert.match(html, /ludique\.css\?v=ludique-22-logo-aspect/);

const mobileRule = css.match(
  /@media \(max-width:680px\)\{[\s\S]*?\.association-hero-brand img\{([\s\S]*?)\n\s*\}/
);

assert.ok(mobileRule, "La règle mobile du logo doit être présente");
assert.match(mobileRule[1], /width:100%/);
assert.match(mobileRule[1], /height:auto/);
assert.match(mobileRule[1], /max-height:none/);
assert.match(mobileRule[1], /object-fit:contain/);
assert.doesNotMatch(mobileRule[1], /max-height:\s*140px/);

console.log("PASS — proportions du logo d’accueil mobile protégées");
