import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const shell = fs.readFileSync("admin-shell.js", "utf8");
const start = shell.indexOf("  let hadAuthorizedView = false;");
const end = shell.indexOf("    if (authTitle && authCopy && loginForm) {", start);
assert.ok(start >= 0 && end > start, "Admin V11 auth rendering found");
const authRender = shell.slice(start, end) + "  }\nthis.renderState = renderState;";
const session = id => ({ user: { id } });
const state = (status, authenticated, id = null) => ({
  status, authenticated, session: id ? session(id) : null
});

function fixture() {
  let attached = true;
  let reloads = 0;
  const classes = new Set();
  const app = { remove() { attached = false; } };
  const document = {
    body: {
      classList: { toggle(name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      } },
      prepend(element) {
        assert.equal(element, app);
        attached = true;
      }
    },
    querySelector(selector) {
      return selector === ".v11-app" && attached ? app : null;
    }
  };
  const window = { location: { reload() { reloads++; } } };
  const context = { document, window };
  vm.runInNewContext(authRender, context);
  return {
    render: context.renderState,
    get attached() { return attached; },
    get reloads() { return reloads; },
    get authorized() { return classes.has("v11-is-authorized"); }
  };
}

for (const event of ["TOKEN_REFRESHED", "SIGNED_IN", "USER_UPDATED"]) {
  const lab = fixture();
  lab.render(state("ready", true, "admin"));
  assert.equal(lab.authorized, true);
  lab.render(state("loading", false));
  assert.equal(lab.attached, false, `${event}: private DOM detached`);
  assert.equal(lab.authorized, false);
  assert.equal(lab.reloads, 0, `${event}: no premature reload`);
  lab.render(state("loading", true, "admin"));
  assert.equal(lab.attached, false, `${event}: admin lookup alone cannot expose DOM`);
  lab.render(state("ready", true, "admin"));
  assert.equal(lab.attached, true, `${event}: same user's UI restored`);
  assert.equal(lab.authorized, true);
  assert.equal(lab.reloads, 0);
  console.log(`PASS ${event}: private DOM parked and same-admin UI restored`);
}

for (const scenario of ["SIGNED_OUT", "new-user", "admin-revoked"]) {
  const lab = fixture();
  lab.render(state("ready", true, "admin"));
  lab.render(state("loading", false, scenario === "SIGNED_OUT" ? "admin" : null));
  assert.equal(lab.attached, false);
  if (scenario === "SIGNED_OUT") lab.render(state("unauthenticated", false));
  if (scenario === "admin-revoked") lab.render(state("forbidden", false, "admin"));
  if (scenario === "new-user") {
    lab.render(state("loading", true, "other-admin"));
    assert.equal(lab.attached, false);
    lab.render(state("ready", true, "other-admin"));
  }
  assert.equal(lab.attached, false, `${scenario}: old private DOM never restored`);
  assert.equal(lab.reloads, 1, `${scenario}: reload after confirmed transition`);
  console.log(`PASS ${scenario}: old private DOM removed`);
}

{
  const lab = fixture();
  lab.render(state("ready", true, "admin"));
  lab.render(state("expired", false));
  assert.equal(lab.attached, false, "expired: private DOM detached");
  assert.equal(lab.authorized, false);
  assert.equal(lab.reloads, 0, "expired: login gate can be shown without reload");
  lab.render(state("ready", true, "admin"));
  assert.equal(lab.reloads, 1, "new login reloads clean private DOM");
  console.log("PASS expiry: private DOM removed, login remains available, fresh login reloads");
}
