// ADMIN-OUTILS-HOTTE-01: offline, read-only structural verification.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (path) => fs.readFileSync(path, "utf8");
const index = read("admin.html");
const mirror = read("admin-v11.html");
const shell = read("admin-shell.js");
const hotte = read("admin-v11-hotte-tools.js");
const css = read("admin-v11-hotte-tools.css");
const partner = read("admin-v11-partner-widget.js");
const auth = read("admin-context.js");
const checks = [];
function check(condition, message) {
  assert.ok(condition, message);
  checks.push(message);
}
function occurrences(text, value) {
  return text.split(value).length - 1;
}

check(index === mirror, "Admin V11 entrypoints remain byte-identical");
for (const [label, html] of [["admin.html", index], ["admin-v11.html", mirror]]) {
  check(occurrences(html, 'data-tool-open="partners"') === 1, label + ": existing partner card preserved");
  check(occurrences(html, 'data-tool-open="hotte"') === 1, label + ": exactly one new Hotte card");
  check(occurrences(html, 'id="v11-hotte-panel"') === 1, label + ": exactly one Hotte workspace slot");
  check(occurrences(html, 'id="v11-partner-widget-panel"') === 1, label + ": partner slot untouched");
  check(occurrences(html, 'admin-v11-hotte-tools.js?v=he08-lab-01') === 1, label + ": lab script loaded once");
  check(occurrences(html, 'admin-v11-hotte-tools.css?v=he08-lab-01') === 1, label + ": scoped CSS loaded once");
  check(html.includes('id="v11-session-pending"') && html.includes('id="v11-auth-gate"'),
    label + ": existing authentication markup retained");
  check(html.includes('data-tool-open="nfc"') &&
    html.includes('id="v11-nfc-panel"') && html.includes('data-tool-open="partners"'),
    label + ": NFC and partner tools retained");
}

check(shell.includes('hotte: "v11-hotte-panel"'), "Hotte slot mapped to existing V11 workspace");
check(shell.includes('window.DEDICALIVRES_V11_PARTNER_WIDGET.open()'),
  "Existing public partner engine is still opened");
check(shell.includes('window.DEDICALIVRES_V11_HOTTE_TOOLS?.openWidgets?.()'),
  "Existing partner card adds widget hub tabs");
check(shell.includes('window.DEDICALIVRES_V11_HOTTE_TOOLS?.openHotte?.()'),
  "Hotte card opens first-party dashboard");
check(shell.includes('window.location.reload()') && shell.includes('context.subscribe(renderState)'),
  "Authentication and state handling remain present");

new vm.Script(hotte, { filename: "admin-v11-hotte-tools.js" });
check(true, "Hotte JavaScript parses");
const sandbox = { window: {}, document: null };
vm.runInNewContext(hotte, sandbox, { filename: "admin-v11-hotte-tools.js" });
check(typeof sandbox.window.DEDICALIVRES_V11_HOTTE_TOOLS?.openWidgets === "function",
  "Widget hub API registers without DOM or network effects");
check(typeof sandbox.window.DEDICALIVRES_V11_HOTTE_TOOLS?.openHotte === "function",
  "Hotte admin API registers without DOM or network effects");

for (const label of ['data-v11-widget-tab="agenda"', 'data-v11-widget-tab="hotte"',
  'data-v11-widget-tab="helloasso"', 'data-v11-hotte-tab="gestion"',
  'data-v11-hotte-tab="visiteur"']) {
  check(hotte.includes(label), "Expected UI control present: " + label);
}
check(hotte.includes('sandbox="allow-scripts"') && !hotte.includes('allow-same-origin'),
  "Visitor iframe is sandboxed without same-origin privilege");
check(!/\bfetch\s*\(|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|signInWithPassword|localStorage|sessionStorage/i.test(hotte),
  "Lab module has no network, database, auth write, or persistent storage method");
check(hotte.includes('state?.authenticated === true && state?.status === "ready"'),
  "New module gates entry on existing authorized admin status");
check(!/v11-auth-gate|v11-session-pending|v11-login-form/.test(css),
  "Scoped CSS does not alter V11 auth gating styles");
check(partner.includes('const ENGINE_SRC = "widget.js?v=widget-4";'),
  "Existing widget.js integration remains present");
check(auth.includes('client.auth.getUser()') && auth.includes('.from("admin_users")'),
  "Existing administrator authorization checks remain present");

console.log("PASS: " + checks.length + " static isolation / consistency checks");
