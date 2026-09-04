import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("admin-v11.css", "utf8");
const shell = fs.readFileSync("admin-shell.js", "utf8");
const config = fs.readFileSync("config.js", "utf8");
const htmlV10 = fs.readFileSync("admin.html", "utf8");

assert.match(config, /adminV11WatchSubmissionEnabled:\s*true/);
assert.ok(htmlV10.length > 0, "La V10 doit rester présente");

for (const fragment of [
  ".v11-icon-button,",
  "min-width: 44px;",
  "min-height: 44px;",
  ".v11-text-button {",
  ".v11-mobile-nav button {"
]) {
  assert.ok(css.includes(fragment), `Protection tactile absente : ${fragment}`);
}

for (const fragment of [
  "function isV11BrowserOffline()",
  "navigator.onLine === false",
  "function isV11NetworkError(error)",
  "function v11ErrorMessage(error, fallback)",
  'window.addEventListener("offline"',
  'window.addEventListener("online"',
  "Connexion réseau indisponible",
  "Vérifiez vos identifiants",
  "Les actions réseau sont indisponibles",
  "Actualisez les données"
]) {
  assert.ok(shell.includes(fragment), `Résilience réseau absente : ${fragment}`);
}

assert.match(shell, /submit\.disabled = true[\s\S]*finally[\s\S]*submit\.disabled = false/);
assert.match(shell, /refreshButton\.disabled = true[\s\S]*finally[\s\S]*refreshButton\.disabled = false/);

console.log("PASS admin-v11-device-network-readiness");
