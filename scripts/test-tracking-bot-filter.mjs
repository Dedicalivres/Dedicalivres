import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("tracking-v4.js", "utf8");
const eventId = "01e6fa91-6956-4775-bf49-4ad2f0e88761";

async function run(userAgent, withEvent = false) {
  const writes = [];
  const location = {
    pathname: withEvent ? "/event.html" : "/index.html",
    search: withEvent ? `?id=${eventId}` : "",
    origin: "https://dedicalivres.fr"
  };
  const storage = new Map();
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
  const document = {
    title: "Dédicalivres",
    referrer: "",
    body: { dataset: {}, matches() { return false; } },
    querySelector() { return null; },
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
    navigator: { userAgent },
    DEDICALIVRES_CONFIG: { supabaseUrl: "https://public.example", supabaseAnonKey: "public-test" },
    supabase: { createClient() { return client; } },
    innerWidth: 1200
  };
  const context = {
    window,
    location,
    document,
    sessionStorage,
    navigator: window.navigator,
    URL,
    URLSearchParams,
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { writes, api: window.DEDICALIVRES_TRACKING };
}

const bots = [
  "meta-webindexer/1.1",
  "meta-externalagent/1.1",
  "facebookexternalhit/1.1",
  "Mozilla/5.0 (compatible; Googlebot/2.1)",
  "AdsBot-Google-Mobile",
  "bingbot/2.0",
  "BingPreview/1.0",
  "DuckDuckBot/1.1",
  "YandexBot/3.0",
  "Baiduspider/2.0",
  "AhrefsBot/7.0",
  "SemrushBot/7~bl",
  "MJ12bot/v1.4.8",
  "DotBot/1.2",
  "PetalBot",
  "Applebot/0.1",
  "GPTBot/1.2",
  "OAI-SearchBot/1.0",
  "ChatGPT-User/1.0",
  "ClaudeBot/1.0",
  "Claude-SearchBot/1.0",
  "Claude-User/1.0",
  "Bytespider",
  "PerplexityBot/1.0",
  "Amazonbot/0.1",
  "Qwantbot/1.0",
  "CertSignalBot/1.0",
  "LinkedInBot/1.0",
  "Twitterbot/1.0",
  "HubSpot Crawler/1.0",
  "Example CRAWLER/1.0"
];

for (const userAgent of bots) {
  const site = await run(userAgent);
  const event = await run(userAgent, true);
  assert.equal(site.writes.length, 0, userAgent);
  assert.equal(event.writes.length, 0, userAgent);
  assert.equal(site.api.isAutomatedAgent(userAgent), true, userAgent);
}

const chrome = await run("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36");
assert.deepEqual(chrome.writes.map((entry) => entry.table), ["site_visits"]);

const safari = await run("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1", true);
assert.deepEqual(safari.writes.map((entry) => entry.table), ["event_visits"]);
assert.equal(safari.writes[0].payload[0].event_id, eventId);

console.log("PASS tracking bots : crawlers exclus, navigateurs humains conservés");
