import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "nfc/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "nfc/nfc.css"), "utf8");
const js = fs.readFileSync(path.join(root, "nfc/nfc.js"), "utf8");

assert.match(html, /viewport-fit=cover/);
assert.match(html, /noindex,nofollow,noarchive/);
assert.match(html, /<noscript>[\s\S]*Accéder directement à l’agenda/);
assert.equal((html.match(/data-scene=/g) || []).length, 5);
assert.equal((html.match(/data-intent=/g) || []).length, 4);
assert.match(css, /env\(safe-area-inset-top\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(html, /data:image\//);
assert.doesNotMatch(css, /filter:\s*blur/);
assert.doesNotMatch(js, /navigator\.geolocation/);
assert.doesNotMatch(js, /fetch\s*\(/);

const context = { window: {}, URLSearchParams };
vm.createContext(context);
vm.runInContext(js, context, { filename: "nfc.js" });
const nfc = context.window.DEDICALIVRES_NFC;

assert.ok(nfc);
assert.equal(nfc.normalizeToken("example01"), "EXAMPLE01");
assert.equal(nfc.normalizeToken("court"), null);
assert.equal(nfc.normalizeToken("TOKEN<script>"), null);
assert.equal(nfc.resolveIntentTarget("nearby", false), "/index.html#agenda");
assert.equal(nfc.resolveIntentTarget("favorites", false), "/index.html#agenda");
assert.equal(nfc.resolveIntentTarget("favorites", true), "/index.html#saved-events");
assert.equal(nfc.resolveIntentTarget("organizer", false), "/soumettre.html");
assert.equal(nfc.resolveIntentTarget("unknown", false), "/index.html");

console.log("PASS nfc-immersive-passage-v1");
