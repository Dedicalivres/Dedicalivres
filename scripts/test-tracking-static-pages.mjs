import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

const source = fs.readFileSync("tracking-v4.js", "utf8");
const validEventId = "01e6fa91-6956-4775-bf49-4ad2f0e88761";

async function runPage({ pathname, search = "", title, canonical, territorial = false, eventId = null, repeats = 1 }) {
  const writes = [];
  const storage = new Map();
  const location = { pathname, search, origin: "https://dedicalivres.fr" };
  const client = {
    from(table) {
      return {
        async insert(payload) {
          writes.push({ table, payload });
          return { error: null };
        }
      };
    },
    async rpc() { return { data: true, error: null }; }
  };
  const body = {
    dataset: eventId ? { eventId } : {},
    matches(selector) { return territorial && selector === ".territorial-page[data-country-code]"; }
  };
  const document = {
    title,
    referrer: "https://search.example/",
    body,
    querySelector(selector) { return selector === 'link[rel="canonical"]' ? { href: canonical } : null; },
    addEventListener() {}
  };
  const sessionStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); }
  };
  const window = {
    location,
    document,
    sessionStorage,
    navigator: { userAgent: "Test Browser" },
    DEDICALIVRES_CONFIG: { supabaseUrl: "https://public.example", supabaseAnonKey: "public-test" },
    supabase: { createClient() { return client; } },
    innerWidth: 1200
  };
  const context = { window, location, document, sessionStorage, navigator: window.navigator, URL, URLSearchParams, console };
  vm.createContext(context);
  for (let index = 0; index < repeats; index += 1) vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { writes, api: window.DEDICALIVRES_TRACKING };
}

const country = await runPage({
  pathname: "/evenements-litteraires-france.html",
  search: "?utm_source=test",
  canonical: "https://dedicalivres.fr/evenements-litteraires-france",
  title: "Événements littéraires en France — Dédicalivres",
  territorial: true,
  repeats: 2
});
assert.equal(country.writes.length, 1, "La déduplication de session doit rester active.");
assert.equal(country.writes[0].table, "site_visits");
assert.equal(country.writes[0].payload[0].path, "/evenements-litteraires-france");
assert.equal(country.writes[0].payload[0].page, "Événements littéraires en France — Dédicalivres");

const region = await runPage({
  pathname: "/evenements-litteraires-bretagne.html",
  canonical: "https://dedicalivres.fr/evenements-litteraires-bretagne",
  title: "Événements littéraires en Bretagne, France — Dédicalivres",
  territorial: true
});
assert.equal(region.writes.length, 1);
assert.equal(region.writes[0].payload[0].path, "/evenements-litteraires-bretagne");

const staticEvent = await runPage({
  pathname: "/evenement/fete-du-livre-4700.html",
  search: "?utm_campaign=test",
  canonical: "https://dedicalivres.fr/evenement/fete-du-livre-4700.html",
  title: "Fête du Livre | Dédicalivres"
});
assert.deepEqual(staticEvent.writes.map((entry) => entry.table), ["site_visits"]);
assert.equal(staticEvent.writes[0].payload[0].path, "/evenement/fete-du-livre-4700.html");

const dynamicEvent = await runPage({
  pathname: "/event.html",
  search: `?id=${validEventId}&utm_source=test`,
  canonical: "https://dedicalivres.fr/event.html",
  title: "Événement | Dédicalivres"
});
assert.deepEqual(dynamicEvent.writes.map((entry) => entry.table), ["event_visits"]);
assert.equal(dynamicEvent.writes[0].payload[0].event_id, validEventId);
assert.equal(dynamicEvent.writes[0].payload[0].path, `/event.html?id=${validEventId}`);

const existing = await runPage({
  pathname: "/index.html",
  search: "?country=FR",
  canonical: "https://dedicalivres.fr/",
  title: "Dédicalivres"
});
assert.deepEqual(existing.writes.map((entry) => entry.table), ["site_visits"]);
assert.equal(existing.writes[0].payload[0].path, "/index.html?country=FR");

const audit = JSON.parse(fs.readFileSync("docs/territoires/audit.json", "utf8"));
assert.equal(audit.territorialPages.length, 21);
for (const territory of audit.territorialPages) {
  const html = fs.readFileSync(territory.file, "utf8");
  assert.equal((html.match(/src="tracking-v4\.js/g) || []).length, 1, territory.file);
  assert.equal((html.match(/@supabase\/supabase-js/g) || []).length, 1, territory.file);
}

const staticFiles = fs.readdirSync("evenement").filter((file) => file.endsWith(".html") && file !== "index.html");
let eventPages = 0;
for (const file of staticFiles) {
  const html = fs.readFileSync(`evenement/${file}`, "utf8");
  eventPages += 1;
  assert.equal((html.match(/src="\/tracking-v4\.js/g) || []).length, 1, file);
  assert.equal((html.match(/@supabase\/supabase-js/g) || []).length, 1, file);
}
assert.ok(eventPages > 0);

const changed = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" });
assert.doesNotMatch(changed, /^supabase\//m);
console.log(`PASS tracking P1 : 21 territoires, ${eventPages} fiches statiques, normalisation, tables et déduplication`);
