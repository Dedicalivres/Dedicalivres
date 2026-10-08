import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("tracking-v4.js", "utf8");
const eventId = "01e6fa91-6956-4775-bf49-4ad2f0e88761";

async function run(userAgent, withEvent = false, repeats = 1, failCrawler = false) {
  const writes = [];
  const attempts = [];
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
          attempts.push(table);
          if (failCrawler && table === "crawler_visits") {
            return { error: new Error("crawler insert refused") };
          }
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
  for (let index = 0; index < repeats; index += 1) {
    vm.runInContext(source, context);
  }
  await new Promise((resolve) => setImmediate(resolve));
  return { writes, attempts, api: window.DEDICALIVRES_TRACKING };
}

const bots = [
  ["meta-webindexer/1.1", "social", "Meta", "meta-webindexer"],
  ["meta-externalagent/1.1", "social", "Meta", "meta-externalagent"],
  ["facebookexternalhit/1.1", "social", "Meta", "facebookexternalhit"],
  ["Mozilla/5.0 (compatible; Googlebot/2.1)", "search", "Google", "googlebot"],
  ["AdsBot-Google-Mobile", "search", "Google", "adsbot-google"],
  ["bingbot/2.0", "search", "Bing", "bingbot"],
  ["BingPreview/1.0", "search", "Bing", "bingpreview"],
  ["DuckDuckBot/1.1", "search", "DuckDuckGo", "duckduckbot"],
  ["YandexBot/3.0", "search", "Yandex", "yandexbot"],
  ["Baiduspider/2.0", "search", "Baidu", "baiduspider"],
  ["AhrefsBot/7.0", "seo", "Ahrefs", "ahrefsbot"],
  ["SemrushBot/7~bl", "seo", "Semrush", "semrushbot"],
  ["MJ12bot/v1.4.8", "seo", "Majestic", "mj12bot"],
  ["DotBot/1.2", "seo", "DotBot", "dotbot"],
  ["PetalBot", "search", "Petal", "petalbot"],
  ["Applebot/0.1", "search", "Apple", "applebot"],
  ["GPTBot/1.2", "ai", "OpenAI", "gptbot"],
  ["OAI-SearchBot/1.0", "ai", "OpenAI", "oai-searchbot"],
  ["ChatGPT-User/1.0", "ai", "OpenAI", "chatgpt-user"],
  ["ClaudeBot/1.0", "ai", "Anthropic", "claudebot"],
  ["Claude-SearchBot/1.0", "ai", "Anthropic", "claude-searchbot"],
  ["Claude-User/1.0", "ai", "Anthropic", "claude-user"],
  ["Bytespider", "ai", "ByteDance", "bytespider"],
  ["PerplexityBot/1.0", "ai", "Perplexity", "perplexitybot"],
  ["Amazonbot/0.1", "ai", "Amazon", "amazonbot"],
  ["Qwantbot/1.0", "search", "Qwant", "qwantbot"],
  ["CertSignalBot/1.0", "seo", "CertSignal", "certsignalbot"],
  ["LinkedInBot/1.0", "social", "LinkedIn", "linkedinbot"],
  ["Twitterbot/1.0", "social", "Twitter", "twitterbot"],
  ["HubSpot Crawler/1.0", "seo", "HubSpot", "hubspot crawler"],
  ["Example CRAWLER/1.0", "other", "Other", "crawler"],
  ["Example SPIDER/1.0", "other", "Other", "spider"]
];

for (const [userAgent, category, family, agent] of bots) {
  const site = await run(userAgent);
  const event = await run(userAgent, true);
  assert.deepEqual(site.writes.map((entry) => entry.table), ["crawler_visits"], userAgent);
  assert.deepEqual(event.writes.map((entry) => entry.table), ["crawler_visits"], userAgent);
  assert.deepEqual(
    {
      category: site.writes[0].payload[0].crawler_category,
      family: site.writes[0].payload[0].crawler_family,
      agent: site.writes[0].payload[0].crawler_agent,
      kind: site.writes[0].payload[0].visit_kind
    },
    { category, family, agent, kind: "site" },
    userAgent
  );
  assert.equal(event.writes[0].payload[0].visit_kind, "event", userAgent);
  assert.equal(event.writes[0].payload[0].event_id, eventId, userAgent);
  assert.equal("origin_table" in site.writes[0].payload[0], false, userAgent);
  assert.equal("origin_id" in site.writes[0].payload[0], false, userAgent);
  assert.equal(site.api.isAutomatedAgent(userAgent), true, userAgent);
  const classification = site.api.classifyAutomatedAgent(userAgent);
  assert.equal(classification.category, category, userAgent);
  assert.equal(classification.family, family, userAgent);
  assert.equal(classification.agent, agent, userAgent);
}

const deduplicated = await run("meta-webindexer/1.1", false, 2);
assert.equal(deduplicated.writes.length, 1);

const failedCrawler = await run("GPTBot/1.2", false, 1, true);
assert.deepEqual(failedCrawler.attempts, ["crawler_visits"]);
assert.equal(failedCrawler.writes.length, 0);

const chrome = await run("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36");
assert.deepEqual(chrome.writes.map((entry) => entry.table), ["site_visits"]);

const safari = await run("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1", true);
assert.deepEqual(safari.writes.map((entry) => entry.table), ["event_visits"]);
assert.equal(safari.writes[0].payload[0].event_id, eventId);

const migrationName = fs.readdirSync("supabase/migrations")
  .find((name) => name.endsWith("_crawler_visits.sql"));
assert.ok(migrationName);
const migration = fs.readFileSync(`supabase/migrations/${migrationName}`, "utf8");
assert.match(migration, /create table public\.crawler_visits/);
assert.match(migration, /enable row level security/);
assert.match(migration, /grant insert on public\.crawler_visits to anon, authenticated/);
assert.match(migration, /grant select on public\.crawler_visits to authenticated/);
assert.match(migration, /for insert\s+to anon, authenticated\s+with check/s);
assert.match(migration, /origin_table is null\s+and origin_id is null/s);
assert.match(migration, /origin_table is not null\s+and origin_id is not null/s);
assert.match(migration, /create unique index crawler_visits_origin_unique_idx/);
assert.match(migration, /using \(\(select private\.is_admin\(\)\)\)/);
assert.doesNotMatch(migration, /grant (?:update|delete|truncate)/i);
assert.doesNotMatch(migration, /security definer/i);

const validOriginPair = (originTable, originId) => (
  (originTable === null && originId === null)
  || (
    originTable !== null
    && originId !== null
    && ["site_visits", "event_visits", "visits"].includes(originTable)
    && originId.trim().length > 0
  )
);
assert.equal(validOriginPair(null, null), true);
assert.equal(validOriginPair("site_visits", "visit-1"), true);
assert.equal(validOriginPair("site_visits", null), false);
assert.equal(validOriginPair(null, "visit-1"), false);

console.log("PASS tracking crawlers : compteur séparé, humains et NFC préservés");
