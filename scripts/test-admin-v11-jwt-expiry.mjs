import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-context.js", "utf8");
const BASE = 1_700_000_000_000;
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  let now = BASE;
  let nextTimer = 0;
  let current = null;
  let listener;
  let admin = true;
  let networkError = null;
  let heldUser = null;
  let holdReads = false;
  const pendingReads = [];
  const timers = new Map();
  const documentListeners = new Map();
  const DateClock = class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  const window = {
    dispatchEvent() {},
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    getDedicalivresSupabaseClient: () => client
  };
  const document = {
    visibilityState: "visible",
    addEventListener(name, callback) { documentListeners.set(name, callback); }
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: current } }),
      getUser: async () => {
        if (heldUser) await new Promise(resolve => { heldUser.resolve = resolve; });
        return networkError
          ? { data: { user: null }, error: networkError }
          : { data: { user: current?.user || null }, error: null };
      },
      signInWithPassword: async () => ({ data: { session: current }, error: null }),
      signOut: async () => { current = null; listener("SIGNED_OUT", null); return { error: null }; },
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: {} } }; }
    },
    from(table) {
      let columns;
      const query = {
        select(value) { columns = value; return query; },
        eq() { return query; }, gte() { return query; },
        order() { return query; }, limit() { return query; },
        then(resolve, reject) {
          const result = table === "admin_users"
            ? { data: admin ? [{ user_id: current?.user.id }] : [], error: null }
            : { data: columns?.includes("title") ? [{ id: "private-event" }] : [], count: 1, error: null };
          if (holdReads && table !== "admin_users") {
            return new Promise(done => pendingReads.push(() => done(result))).then(resolve, reject);
          }
          return Promise.resolve(result).then(resolve, reject);
        }
      };
      return query;
    }
  };
  vm.runInNewContext(source, { window, document, Date: DateClock, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  const context = window.DEDICALIVRES_ADMIN_CONTEXT;
  const session = (user, seconds, suffix = "one") => ({
    user: { id: user }, access_token: `${user}-${suffix}`, expires_at: Math.floor(now / 1000) + seconds
  });
  const due = async (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now && timers.has(id)) {
        timers.delete(id);
        timer.callback();
      }
    }
    await flush();
  };
  return { context, session, due, documentListeners,
    setSession(value) { current = value; },
    emit(event, value) { current = value; listener(event, value); },
    setAdmin(value) { admin = value; },
    setNetworkError(value) { networkError = value; },
    holdUser() { heldUser = {}; },
    releaseUser() { heldUser.resolve(); heldUser = null; },
    holdPrivateReads() { holdReads = true; },
    releasePrivateReads() { holdReads = false; pendingReads.splice(0).forEach(done => done()); },
    pendingReads,
    jump(ms) { now += ms; },
    timers, get now() { return now; } };
}

async function ready(lab, session) {
  lab.setSession(session);
  await lab.context.restoreSession();
  assert.equal(lab.context.getState().status, "ready");
  assert.equal(lab.context.getState().events.length, 1);
}

function locked(lab, status = "expired") {
  const state = lab.context.getState();
  assert.equal(state.status, status);
  assert.equal(state.authenticated, false);
  assert.equal(state.session, null);
  assert.equal(state.events.length, 0);
  assert.equal(state.community.presences.length, 0);
  assert.equal(state.metrics.eventsTotal, null);
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  const oldTimer = [...lab.timers.values()].find(timer => timer.at === BASE + 10_000).callback;
  const renewed = lab.session("admin", 30, "renewed");
  lab.emit("TOKEN_REFRESHED", renewed);
  await lab.due(0);
  await flush();
  assert.equal(lab.context.getState().status, "ready");
  oldTimer();
  await lab.due(11_000);
  assert.equal(lab.context.getState().status, "ready");
  await lab.due(19_000);
  locked(lab);
  console.log("PASS renewed JWT replaces timer; old timer cannot lock; expiry locks without SIGNED_OUT");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.setSession(null); // SDK may later return null without SIGNED_OUT.
  await lab.due(10_000);
  locked(lab);
  console.log("PASS revoked refresh with valid JWT stays READY until local expiry, then clears private state");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.setSession(null);
  await lab.context.restoreSession();
  locked(lab, "unauthenticated");
  console.log("PASS getSession returning null clears private state immediately");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  await lab.due(11_000);
  locked(lab);
  lab.setSession(lab.session("admin", -1));
  await lab.context.restoreSession();
  locked(lab);
  console.log("PASS getSession returning an expired JWT cannot restore READY");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  const oldTimer = [...lab.timers.values()].find(timer => timer.at === BASE + 10_000).callback;
  lab.emit("SIGNED_IN", lab.session("other", 30));
  await lab.due(0); await flush();
  oldTimer();
  assert.equal(lab.context.getState().status, "ready");
  assert.equal(lab.context.getState().session.user.id, "other");
  console.log("PASS old user timer cannot lock a new user");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.jump(11_000); // Simulate a suspended tab: no timers are delivered.
  lab.documentListeners.get("visibilitychange")();
  locked(lab);
  console.log("PASS wake after expired deadline locks immediately");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.jump(11_000);
  let prevented = false;
  lab.documentListeners.get("submit")({
    preventDefault() { prevented = true; }, stopImmediatePropagation() {}
  });
  assert.equal(prevented, true);
  locked(lab);
  console.log("PASS protected submit is stopped before a suspended timer runs");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.holdUser();
  lab.emit("TOKEN_REFRESHED", lab.session("admin", 5, "late-refresh"));
  await lab.due(0);
  lab.jump(6_000);
  lab.releaseUser();
  await flush();
  locked(lab);
  console.log("PASS delayed authorization cannot restore READY after JWT expiry");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.holdPrivateReads();
  const loading = lab.context.refresh();
  await flush();
  assert.equal(lab.pendingReads.length, 13);
  await lab.due(10_000);
  locked(lab);
  lab.releasePrivateReads();
  await loading;
  locked(lab);
  console.log("PASS five late loaders cannot restore data after local expiry");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.setNetworkError(Object.assign(new Error("temporary network failure"), { status: 503 }));
  lab.emit("TOKEN_REFRESHED", lab.session("admin", 30, "network-retry"));
  await lab.due(0); await flush();
  assert.equal(lab.context.getState().status, "error");
  assert.equal(lab.context.getState().events.length, 0);
  lab.setNetworkError(null);
  lab.emit("TOKEN_REFRESHED", lab.session("admin", 30, "recovered"));
  await lab.due(0); await flush();
  assert.equal(lab.context.getState().status, "ready");
  lab.setAdmin(false);
  lab.emit("TOKEN_REFRESHED", lab.session("admin", 30, "admin-revoked"));
  await lab.due(0); await flush();
  assert.equal(lab.context.getState().status, "forbidden");
  assert.equal(lab.context.getState().events.length, 0);
  console.log("PASS temporary network error recovers; confirmed admin loss is denied");
}

{
  const lab = fixture();
  await ready(lab, lab.session("admin", 10));
  lab.emit("SIGNED_OUT", null);
  locked(lab, "unauthenticated");
  console.log("PASS explicit sign-out clears private state immediately");
}

{
  const lab = fixture();
  lab.setSession({ access_token: "no-expiry", user: { id: "admin" } });
  await lab.context.restoreSession();
  locked(lab);
  console.log("PASS missing expires_at fails closed without inventing a deadline");
}
