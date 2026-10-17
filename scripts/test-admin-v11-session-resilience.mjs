import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-context.js", "utf8");
const user = { id: "11111111-1111-4111-8111-111111111111" };
const session = { access_token: "local-test-token", user,
  expires_at: Math.floor(Date.now() / 1000) + 3600 };
let currentSession = null;
let admin = false;
let networkError = null;
let listener = null;
let reads = 0;
let signedOut = 0;

const client = {
  auth: {
    getSession: async () => ({ data: { session: currentSession } }),
    getUser: async () => networkError
      ? { data: { user: null }, error: networkError }
      : { data: { user: currentSession?.user || null }, error: null },
    signInWithPassword: async () => {
      currentSession = session;
      return { data: { session }, error: null };
    },
    signOut: async () => {
      signedOut++;
      currentSession = null;
      listener?.("SIGNED_OUT", null);
      return { error: null };
    },
    onAuthStateChange(callback) {
      listener = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    }
  },
  from(table) {
    if (table !== "admin_users") {
      const query = new Proxy({}, {
        get(_, key) {
          if (key === "then") return (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
          return () => query;
        }
      });
      return query;
    }
    reads++;
    const query = {
      select() { return query; },
      eq() { return query; },
      limit: async () => ({ data: admin ? [{ user_id: user.id }] : [], error: null })
    };
    return query;
  },
  rpc: async () => ({ data: [], error: null })
};

class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}
const window = {
  CustomEvent, dispatchEvent() {},
  getDedicalivresSupabaseClient: () => client,
  setTimeout, clearTimeout
};
vm.runInNewContext(source, { window, CustomEvent, console, setTimeout, clearTimeout });
const context = window.DEDICALIVRES_ADMIN_CONTEXT;

await context.restoreSession();
assert.equal(context.getState().status, "unauthenticated");
assert.equal(reads, 0);

await context.signIn("reader@example.test", "test");
assert.equal(context.getState().status, "forbidden");
assert.equal(context.getState().authenticated, false);
assert.equal(reads, 1);

await context.signOut();
assert.equal(signedOut, 1);
admin = true;
await context.signIn("admin@example.test", "test");
assert.equal(context.getState().authenticated, true);
assert.equal(reads, 2);

networkError = Object.assign(new Error("network"), { status: 503 });
listener("TOKEN_REFRESHED", session);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(context.getState().status, "error");
assert.equal(context.getState().authenticated, false);
assert.equal(context.getState().events.length, 0);

networkError = null;
listener("SIGNED_OUT", null);
assert.equal(context.getState().status, "unauthenticated");
assert.equal(context.getState().session, null);

currentSession = session;
networkError = Object.assign(new Error("expired"), { status: 401 });
await context.restoreSession();
assert.equal(context.getState().status, "unauthenticated");
assert.equal(context.getState().authenticated, false);

console.log("PASS admin-v11-session-resilience: anon, denied, admin lookup, refresh error, sign-out (mocks)");
