import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { authorIndexUrl, classifyEvents, fetchPublicAuthorCatalog, renderAuthorIndexPage, renderAuthorStaticPage, seoDescription } from "./author-static-page.mjs";

const baseHtml = fs.readFileSync("author.html", "utf8");
const author = {
  id: "published-1",
  pseudo: "Aline Exemple",
  slug: "aline-exemple",
  bio: "Aline Exemple écrit des romans et participe à des rencontres littéraires.",
  avatar_url: "https://images.example/aline.jpg",
  location: "Bretagne, France",
  website: "https://aline.example",
  shop_url: "https://shop.example/aline",
  profile_type: "author",
  validated: true,
  published: true,
  merged_into: null
};
const event = (id, start_date, end_date = start_date) => ({
  id, title: `Événement ${id}`, city: "Rennes", region: "Bretagne", country_code: "FR",
  start_date, end_date, type: "Dédicace", image_url: "", validated: true, rejected: false
});
const events = [
  event("past", "2026-09-01"),
  event("ongoing", "2026-10-01", "2026-10-02"),
  event("future", "2026-10-10"),
  event("future", "2026-10-10"),
  { ...event("private", "2026-10-11"), validated: false },
  { ...event("rejected", "2026-10-12"), rejected: true }
];
const groups = classifyEvents(events, "2026-10-01T12:00:00Z");
assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.map((row) => row.id)])), {
  ongoing: ["ongoing"], upcoming: ["future"], past: ["past"]
});

const backofficeContext = {};
vm.createContext(backofficeContext);
vm.runInContext(fs.readFileSync("author-backoffice.js", "utf8"), backofficeContext);
const dynamicDraft = backofficeContext.DEDICALIVRES_AUTHOR_BACKOFFICE.buildAuthorDraft({
  author,
  presences: events.slice(0, 4).map((linkedEvent) => ({ validated: true, rejected: false, events: linkedEvent })),
  now: new Date("2026-10-01T12:00:00Z")
});
assert.deepEqual(Array.from(dynamicDraft.ongoingEvents, (row) => row.id), ["ongoing"]);
assert.deepEqual(Array.from(dynamicDraft.upcomingEvents, (row) => row.id), ["future"]);
assert.deepEqual(Array.from(dynamicDraft.pastEvents, (row) => row.id), ["past"]);

const rendered = renderAuthorStaticPage({ baseHtml, author, events, generatedAt: "2026-10-01T12:00:00Z" });
assert.equal((rendered.html.match(/<h1\b/g) || []).length, 1, "Une fiche publiée doit avoir un seul H1.");
assert.match(rendered.html, /<meta name="robots" content="index,follow"/);
assert.match(rendered.html, /<title>Aline Exemple — dédicaces, salons et rencontres \| Dédicalivres<\/title>/);
assert.match(rendered.html, /rel="canonical" href="https:\/\/dedicalivres\.fr\/auteurs\/aline-exemple\/"/);
assert.equal(rendered.person["@type"], "Person");
assert.equal(rendered.person.description, seoDescription(author, 3));
assert.deepEqual(rendered.person.sameAs, [author.website, author.shop_url]);
assert.equal(rendered.breadcrumb["@type"], "BreadcrumbList");
assert.match(rendered.html, /Événements en cours/);
assert.match(rendered.html, /Événements à venir/);
assert.match(rendered.html, /Événements passés/);
assert.match(rendered.html, /event\.html\?id=ongoing/);
assert.doesNotMatch(rendered.html, /supabase-js|config\.js|author\.js/, "Le HTML initial doit être autonome et indexable.");
assert.match(rendered.html, /href="\/auteurs\/">Auteurs<\/a>/);
assert.equal(rendered.breadcrumb.itemListElement[1].item, authorIndexUrl());

const indexPage = renderAuthorIndexPage({
  baseHtml,
  authors: [
    { ...author, id: "unpublished", pseudo: "Invisible", slug: "invisible", published: false },
    { ...author, id: "published-2", pseudo: "Zoé Exemple", slug: "zoe-exemple", avatar_url: "" },
    author
  ]
});
assert.equal(indexPage.canonical, "https://dedicalivres.fr/auteurs/");
assert.equal(indexPage.authors.length, 2);
assert.deepEqual(indexPage.authors.map((row) => row.slug), ["aline-exemple", "zoe-exemple"]);
assert.equal((indexPage.html.match(/<h1\b/g) || []).length, 1);
assert.match(indexPage.html, /<meta name="robots" content="index,follow"/);
assert.match(indexPage.html, /rel="canonical" href="https:\/\/dedicalivres\.fr\/auteurs\/"/);
assert.match(indexPage.html, /name="twitter:title" content="Auteurs publiés — Dédicalivres"/);
assert.match(indexPage.html, /href="https:\/\/dedicalivres\.fr\/auteurs\/aline-exemple\/"/);
assert.doesNotMatch(indexPage.html, /Invisible/);
assert.doesNotMatch(indexPage.html, /supabase-js|config\.js|author\.js/);

const sparse = renderAuthorStaticPage({
  baseHtml,
  author: { ...author, pseudo: "Nom Minimal", slug: "nom-minimal", bio: "", avatar_url: "", location: "", website: "", shop_url: "" },
  events: [],
  generatedAt: "2026-10-01T12:00:00Z"
});
assert.equal(sparse.description, "Fiche de Nom Minimal sur Dédicalivres.");
assert.doesNotMatch(JSON.stringify(sparse.person), /nationality|birthDate|award|publisher/);

let calls = 0;
const catalog = await fetchPublicAuthorCatalog({
  supabaseUrl: "https://public.example",
  supabaseAnonKey: "public-test",
  fetchImpl: async (url) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(new URL(url).searchParams.get("published"), "eq.true");
      assert.equal(new URL(url).searchParams.get("validated"), "eq.true");
      return { ok: true, json: async () => [author] };
    }
    assert.equal(new URL(url).searchParams.get("author_id"), `eq.${author.id}`);
    return { ok: true, json: async () => [{ events: event("linked", "2026-10-10") }] };
  }
});
assert.equal(catalog.length, 1);
assert.equal(catalog[0].events[0].id, "linked");
assert.equal(calls, 2);

const publicationContext = { window: {} };
vm.createContext(publicationContext);
vm.runInContext(fs.readFileSync("author-publication.js", "utf8"), publicationContext);
const availability = publicationContext.window.DEDICALIVRES_AUTHOR_PUBLICATION.isPubliclyAvailable;
assert.equal(availability({ validated: true, published: true, merged_into: null }), true, "La ligne publique filtrée par RLS doit être lisible sans champs admin.");
assert.equal(availability({ validated: true, published: true, publication_ready: false, editorial_status: "READY", merged_into: null }), false);

const dynamicHtml = fs.readFileSync("author.html", "utf8");
const headers = fs.readFileSync("_headers", "utf8");
assert.match(dynamicHtml, /noindex,nofollow,noarchive,nosnippet/);
assert.match(headers, /\/author\.html[\s\S]*X-Robots-Tag: noindex/);
assert.match(dynamicHtml, /author-ongoing-section/);
assert.equal((dynamicHtml.match(/<h1\b/g) || []).length, 0, "Le H1 dynamique ne doit pas être dupliqué dans le squelette.");

const sitemap = fs.readFileSync("sitemap-seo-auteurs.xml", "utf8");
assert.match(sitemap, /https:\/\/dedicalivres\.fr\/auteurs\//);
assert.doesNotMatch(sitemap, /https:\/\/dedicalivres\.fr\/auteurs-independants/);
assert.match(sitemap, /https:\/\/dedicalivres\.fr\/auteurs\/katell-poquet\//);
assert.doesNotMatch(sitemap, /TEST CODEX|bda8dae7-a1bd-49b2-9e1d-4717f4bd9624/);
const generated = fs.readFileSync("auteurs/katell-poquet/index.html", "utf8");
assert.equal((generated.match(/<h1\b/g) || []).length, 1);
assert.match(generated, /application\/ld\+json/);
assert.match(generated, /"@type":"Person"/);
assert.match(generated, /"@type":"BreadcrumbList"/);
assert.doesNotMatch(generated, /noindex/);
const generatedIndex = fs.readFileSync("auteurs/index.html", "utf8");
assert.match(generatedIndex, /rel="canonical" href="https:\/\/dedicalivres\.fr\/auteurs\/"/);
assert.match(generatedIndex, /href="https:\/\/dedicalivres\.fr\/auteurs\/katell-poquet\/"/);
assert.equal((generatedIndex.match(/data-generated-author-index=/g) || []).length, 2);
assert.doesNotMatch(generatedIndex, /supabase-js|config\.js|author\.js/);
const presenceSource = fs.readFileSync("authors-presence.js", "utf8");
assert.match(presenceSource, /`\/auteurs\/\$\{encodeURIComponent\(participant\.public_author_slug\)\}\/`/);
assert.doesNotMatch(presenceSource, /`author\.html\?slug=\$\{encodeURIComponent\(participant\.public_author_slug\)\}`/);
const home = fs.readFileSync("index.html", "utf8");
assert.match(home, /href="\/auteurs\/"[\s\S]*?<span>Auteurs<\/span>/);
const legacyIndex = fs.readFileSync("auteurs-independants.html", "utf8");
assert.match(legacyIndex, /http-equiv="refresh" content="0; url=\/auteurs\/"/);
assert.match(legacyIndex, /rel="canonical" href="https:\/\/dedicalivres\.fr\/auteurs\/"/);
console.log("PASS SEO auteur : publication seule, HTML initial, H1, métadonnées, Person, breadcrumb, dates, liens et sitemap");
