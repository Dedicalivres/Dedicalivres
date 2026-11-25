import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("admin-context.js", "utf8");
const oldUser = { id: "11111111-1111-4111-8111-111111111111" };
const nextUser = { id: "22222222-2222-4222-8222-222222222222" };
const reader = { id: "reader" };
const session = user => ({ access_token: user.id, user, expires_at: Math.floor(Date.now() / 1000) + 3600 });
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
  const admins = new Set([oldUser.id, nextUser.id]);
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
  const response = (table, columns, options, cursor) => {
    if (options?.head) return { count: table === "site_visits" ? (currentSession?.user.id === nextUser.id ? 11 : 7) : 1, data: null, error: null };
    if (table === "events" && typeof columns === "string" && columns.includes("title")) {
      return { data: cursor ? [] : [{ id: currentSession?.user.id || oldUser.id, title: "private-event", created_at: "2026-01-01T00:00:00Z" }], count: 1, error: null };
    }
    if (table === "event_authors_presence") {
      return { data: [{ id: "private-presence" }], count: 1, error: null };
    }
    if (table === "authors") return { data: [{ id: "private-author" }], count: 1, error: null };
    if (table === "testimonials") return { data: [{ id: "private-testimonial" }], count: 1, error: null };
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
      let columns, options, cursor = false;
      const query = {
        select(value, opts) { columns = value; options = opts; return query; },
        range() { return query; },
        or() { cursor = true; return query; },
        is() { cursor = true; return query; },
        lt() { cursor = true; return query; },
        eq() { return query; },
        gte() { return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve, reject) {
          reads.push(table);
          if (table === "admin_users") {
            return Promise.resolve({
              data: admins.has(currentSession?.user.id) ? [{ user_id: currentSession.user.id }] : [],
              error: null
            }).then(resolve, reject);
          }
          const value = response(table, columns, options, cursor);
          if (holdOldReads) {
            return new Promise(done => {
              const release = override => done(override || value);
              release.table = table;
              pending.push(release);
            }).then(resolve, reject);
          }
          return Promise.resolve(value).then(resolve, reject);
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
  const holdReads = () => { holdOldReads = true; };
  const setAdmin = (user, allowed) => {
    if (allowed) admins.add(user.id);
    else admins.delete(user.id);
  };
  const changeUser = (user, event = user ? "SIGNED_IN" : "SIGNED_OUT") => {
    currentSession = user ? { access_token: `${user.id}-${event}`, user,
      expires_at: Math.floor(Date.now() / 1000) + 3600 } : null;
    listener(event, currentSession);
  };
  return { context, pending, reads, completeOldReads, releaseNewReads,
    holdReads, setAdmin, changeUser };
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
  assert.equal(state.communitySummary.metrics, null);
  assert.equal(state.metrics.visitsToday, null);
}

for (const scenario of ["signout", "expired", "nonadmin", "new-admin", "query-401"]) {
  const lab = fixture();
  const loading = lab.context.signIn("admin@example.test", "local");
  await tick();
  assert.equal(lab.pending.length, 5, `${scenario}: five initial event/catalog reads started (lazy secondary modules deferred)`);
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
    0, `${scenario}: no contact lookup before explicit event-page selection`);
  console.log(`PASS ${scenario}: stale initial event/catalog reads cannot restore private state`);
}

for (const event of ["TOKEN_REFRESHED", "SIGNED_IN", "USER_UPDATED"]) {
  const lab = fixture();
  lab.releaseNewReads();
  await lab.context.signIn("admin@example.test", "local");
  assert.equal(lab.context.getState().status, "ready");
  await waitFor(() => lab.context.getState().eventCatalog.status === "ready" &&
    lab.context.getState().communitySummary.status === "ready" && lab.context.getState().metrics.visitsTotal === 7);
  const adminReads = lab.reads.filter(table => table === "admin_users").length;
  lab.holdReads();
  const authorizedSession = lab.context.getState().session;
  lab.changeUser(oldUser, event);
  if (event === "TOKEN_REFRESHED") {
    assert.equal(lab.context.getState().status, "ready");
    assert.equal(lab.context.getState().session.access_token, authorizedSession.access_token,
      "preserve only the previously authorized session, not the pending token");
  } else assertPrivateEmpty(lab.context.getState());
  const expected = event === "TOKEN_REFRESHED" ? 8 : 5;
  await waitFor(() => lab.pending.length === expected);
  assert.deepEqual(lab.pending.map(item => item.table).sort(), event === "TOKEN_REFRESHED"
    ? ["authors", "event_authors_presence", "events", "site_visits", "site_visits", "site_visits", "site_visits", "testimonials"].sort()
    : Array(5).fill("events"), `${event}: only expected summary and event requests`);
  assert.equal(lab.reads.filter(table => table === "admin_users").length, adminReads + 1,
    `${event}: admin rights rechecked`);
  lab.completeOldReads();
  await waitFor(() => lab.context.getState().status === "ready" && !lab.context.getState().refreshing &&
    lab.context.getState().communitySummary.status === "ready" && lab.context.getState().metrics.visitsTotal === 7);
  assert.equal(lab.context.getState().session.user.id, oldUser.id);
  assert.equal(lab.context.getState().events[0].id, oldUser.id);
  console.log(`PASS ${event}: same admin revalidated with expiry and stale-request guards`);
}

{
  const lab = fixture();
  lab.releaseNewReads();
  await lab.context.signIn("admin@example.test", "local");
  lab.setAdmin(oldUser, false);
  lab.changeUser(oldUser, "TOKEN_REFRESHED");
  await waitFor(() => lab.context.getState().status === "forbidden");
  assertPrivateEmpty(lab.context.getState());
  console.log("PASS admin revocation: authorization denied and private state cleared");
}

{
  const lab = fixture();
  lab.releaseNewReads();
  await lab.context.signIn("admin@example.test", "local");
  lab.changeUser(nextUser);
  await waitFor(() => lab.context.getState().status === "ready");
  assert.equal(lab.context.getState().events[0].id, nextUser.id);
  lab.changeUser(null);
  assertPrivateEmpty(lab.context.getState());
  assert.equal(lab.context.getState().status, "unauthenticated");
  console.log("PASS user switch and SIGNED_OUT: old data removed immediately");
}

// Home summaries must not restore private counts after a session ends or changes.
for (const scenario of ["summary-signout", "summary-new-admin"]) {
  const lab = fixture();
  lab.releaseNewReads();
  await lab.context.signIn("admin@example.test", "local");
  await waitFor(() => lab.context.getState().eventCatalog.status === "ready" &&
    lab.context.getState().communitySummary.status === "ready" && lab.context.getState().metrics.visitsTotal === 7);
  lab.holdReads();
  const refreshing = lab.context.refresh();
  await waitFor(() => lab.pending.length === 8);
  assert.equal(lab.pending.filter(item => item.table === "site_visits").length, 4);
  assert.equal(lab.pending.filter(item => ["authors", "event_authors_presence", "testimonials"].includes(item.table)).length, 3);
  if (scenario === "summary-signout") {
    await lab.context.signOut();
    assertPrivateEmpty(lab.context.getState());
  } else {
    lab.releaseNewReads();
    lab.changeUser(nextUser);
    await waitFor(() => lab.context.getState().status === "ready" &&
      lab.context.getState().communitySummary.status === "ready" && lab.context.getState().metrics.visitsTotal === 11);
  }
  lab.completeOldReads();
  await refreshing;
  await tick();
  if (scenario === "summary-signout") assertPrivateEmpty(lab.context.getState());
  else {
    assert.equal(lab.context.getState().session.user.id, nextUser.id);
    assert.equal(lab.context.getState().metrics.visitsTotal, 11);
    assert.equal(lab.context.getState().communitySummary.status, "ready");
  }
  console.log(`PASS ${scenario}: stale home summaries cannot restore old private counts`);
}
