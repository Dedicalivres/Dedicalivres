import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-context.js", "utf8");
const shell = fs.readFileSync("admin-shell.js", "utf8");
let authListener = null;

const client = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange(listener) {
      authListener = listener;
      return { data: { subscription: { unsubscribe() {} } } };
    }
  }
};

class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const window = {
  CustomEvent,
  dispatchEvent() {},
  getDedicalivresSupabaseClient: () => client,
  setTimeout,
  clearTimeout
};

vm.runInNewContext(source, { window, CustomEvent, console, setTimeout, clearTimeout });

const context = window.DEDICALIVRES_ADMIN_CONTEXT;
await context.restoreSession();
assert.equal(typeof authListener, "function");
assert.equal(context.getState().authenticated, false);

const refreshedSession = { access_token: "test-token", user: { id: "test-user" } };
authListener("TOKEN_REFRESHED", refreshedSession);
assert.equal(context.getState().authenticated, true);
assert.deepEqual(context.getState().session, refreshedSession);

authListener("SIGNED_OUT", null);
assert.equal(context.getState().authenticated, false);
assert.equal(context.getState().session, null);
assert.equal(context.getState().status, "unauthenticated");

assert.match(shell, /submit\.disabled = true/);
assert.match(shell, /await context\.signIn/);
console.log("PASS admin-v11-session-resilience");
