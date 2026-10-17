import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-context.js", "utf8");
const oldUser = { id: "old-admin" };
const nextUser = { id: "next-admin" };
const reader = { id: "reader" };
const session = user => ({ access_token: user.id, user });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail("auth transition did not settle");
}

function fixture() {
  let currentSession = null;
  let listener;
  let holdOldReads = true;
  const pending = [];
  const reads = [];
  const window = {
    DEDICALIVRES_CONFIG: {},
    dispatchEvent() {},
    setTimeout(callback, ms) {
      const timer = setTimeout(callback, ms);
      if (ms > 1000) timer.unref();
      return timer;
    },
    clearTimeout,
    getDedicalivresSupabaseClient: () => client
  };
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  const response = (table, columns) => {
    if (table === "events" && typeof columns === "string" && columns.includes("title")) {
      return { data: [{ id: currentSession?.user.id || "old-admin", title: "private-event" }], error: null };
    }
    if (table === "event_authors_presence") {
      return { data: [{ id: "private-presence" }], error: null };
    }
    if (table === "authors") return { data: [{ id: "private-author" }], error: null };
    if (table === "testimonials") return { data: [{ id: "private-testimonial" }], error: null };
    if (table === "site_visits" && typeof columns === "string" && columns.includes("page")) {
      return { data: [{ path: "/private-page", referrer: "https://private.test" }], error: null };
    }
    return { count: 7, data: [], error: null };
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: currentSession } }),
      getUser: async () => ({ data: { user: currentSession?.user || null }, error: null }),
      signInWithPassword: async () => {
        currentSession = session(oldUser);
        return { data: { session: currentSession }, error: null };
      },
      signOut: async () => {
        currentSession = null;
        listener("SIGNED_OUT", null);
        return { error: null };
      },
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    from(table) {
      let columns;
      const query = {
        select(value) { columns = value; return query; },
        eq() { return query; },
        gte() { return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve, reject) {
          reads.push(table);
          if (table === "admin_users") {
            return Promise.resolve({
              data: currentSession?.user.id === reader.id ? [] : [{ user_id: currentSession?.user.id }],
              error: null
            }).then(resolve, reject);
          }
          if (holdOldReads) {
            return new Promise(done => pending.push(override => done(override || response(table, columns))))
              .then(resolve, reject);
          }
          return Promise.resolve(response(table, columns)).then(resolve, reject);
        }
      };
      return query;
    }
  };
  vm.runInNewContext(source, { window, CustomEvent, console, setTimeout, clearTimeout });
  const context = window.DEDICALIVRES_ADMIN_CONTEXT;
  const completeOldReads = (failureStatus = null) => {
    holdOldReads = false;
    pending.splice(0).forEach((resolve, index) => resolve(
      index === 0 && failureStatus
        ? { data: null, error: Object.assign(new Error("auth denied"), { status: failureStatus }) }
        : null
    ));
  };
  const releaseNewReads = () => { holdOldReads = false; };
  const changeUser = user => {
    currentSession = user ? session(user) : null;
    listener(user ? "SIGNED_IN" : "SIGNED_OUT", currentSession);
  };
  return { context, pending, reads, completeOldReads, releaseNewReads, changeUser };
}

function assertPrivateEmpty(state) {
  assert.equal(state.authenticated, false);
  assert.equal(state.events.length, 0);
  assert.equal(state.community.presences.length, 0);
  assert.equal(state.community.authors.length, 0);
  assert.equal(state.community.testimonials.length, 0);
  assert.equal(state.metrics.eventsTotal, null);
  assert.equal(state.metrics.visitsTotal, null);
  assert.equal(state.trafficDetails.topPages.length, 0);
  assert.equal(state.communityMetrics.presenceTotal, null);
}

for (const scenario of ["signout", "expired", "nonadmin", "new-admin", "query-401"]) {
  const lab = fixture();
  const loading = lab.context.signIn("admin@example.test", "local");
  await tick();
  assert.equal(lab.pending.length, 13, `${scenario}: five loaders started`);
  if (scenario === "signout") await lab.context.signOut();
  if (scenario === "expired") lab.changeUser(null);
  if (scenario === "nonadmin") lab.changeUser(reader);
  if (scenario === "new-admin") {
    lab.releaseNewReads();
    lab.changeUser(nextUser);
  }
  if (scenario === "nonadmin") {
    await waitFor(() => lab.context.getState().status === "forbidden");
  }
  if (scenario === "new-admin") {
    await waitFor(() => lab.context.getState().status === "ready");
  }
  if (scenario === "new-admin") {
    assert.equal(lab.context.getState().status, "ready");
    assert.equal(lab.context.getState().events[0].id, nextUser.id);
  } else if (scenario !== "query-401") {
    assertPrivateEmpty(lab.context.getState());
  }
  lab.completeOldReads(scenario === "query-401" ? 401 : null);
  await loading;
  await tick();
  const state = lab.context.getState();
  if (scenario === "new-admin") {
    assert.equal(state.status, "ready");
    assert.equal(state.events[0].id, nextUser.id);
  } else {
    assertPrivateEmpty(state);
    assert.equal(state.status, scenario === "nonadmin" ? "forbidden" : "unauthenticated");
  }
  assert.equal(lab.reads.filter(table => table === "event_submission_contacts").length,
    scenario === "new-admin" ? 1 : 0, `${scenario}: stale events do not start contact lookup`);
  console.log(`PASS ${scenario}: five late loaders cannot restore private state`);
}
