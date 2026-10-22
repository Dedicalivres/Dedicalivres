import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { authorIndexUrl, fetchPublicAuthorCatalog, renderAuthorIndexPage, renderAuthorStaticPage } from "./author-static-page.mjs";
import {readIsolation, hash} from "./targeted-source-isolation.mjs";

// Ignore only line-ending/trailing-space churn, never visible text or card order.
const significant = html => html.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();

// Event jobs never authorize creating an author profile. Slugs must already
// exist in the static corpus; a new source author is reported, never published.
export function selectTargetedAuthors(root, catalog, jobs) {
  const stop = message => { throw new Error("STOP auteurs ciblés : " + message); };
  const validId = id => typeof id === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
  if (!Array.isArray(catalog) || !Array.isArray(jobs) || !jobs.length
      || jobs.some(j => !validId(j.id) || !validId(j.event_id))
      || catalog.some(row => !row?.author || !validId(row.author.id)
        || !/^[a-z0-9][a-z0-9-]*$/.test(row.author.slug || "")
        || row.author.validated !== true || row.author.published !== true || row.author.merged_into
        || !Array.isArray(row.events) || row.events.some(e => !validId(e?.id)
          || hash(e) !== hash(row.events.find(first => first.id === e.id))))
      || new Set(catalog.map(row => row.author.id)).size !== catalog.length
      || new Set(catalog.map(row => row.author.slug)).size !== catalog.length) stop("identités, états ou présences invalides");
  const selected = new Set(jobs.map(j => j.event_id)), published = new Set();
  for (const entry of fs.readdirSync(path.join(root, "auteurs"), {withFileTypes:true})) {
    if (entry.name === "index.html" && entry.isFile()) continue;
    const file = path.join(root, "auteurs", entry.name, "index.html");
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)
        || !fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) stop("corpus statique ambigu");
    const html = fs.readFileSync(file, "utf8"), url = "https://dedicalivres.fr/auteurs/" + entry.name + "/";
    const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m => m[1]);
    const persons = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(m => JSON.parse(m[1])).filter(o => o["@type"] === "Person");
    if (canonicals.length !== 1 || canonicals[0] !== url || persons.length !== 1
        || persons[0].url !== url || persons[0]["@id"] !== url + "#person"
        || !html.includes('data-author-slug="' + entry.name + '"')) stop("canonical ou identité statique incohérent");
    published.add(entry.name);
  }
  if ([...published].some(slug => !catalog.some(row => row.author.slug === slug))) stop("auteur publié absent de la source");
  const deferred = catalog.filter(row => !published.has(row.author.slug));
  if (deferred.some(row => row.events.some(e => selected.has(e.id)))) stop("nouvel auteur lié au lot : autorisation auteur distincte requise");
  return {catalog:catalog.filter(row => published.has(row.author.slug)),
    deferred:deferred.map(({author}) => ({id:author.id, slug:author.slug})), selected};
}

function assertAuthorEventScope(previous, fresh, selected) {
  const stop = message => { throw new Error("STOP auteurs ciblés : " + message); };
  const cards = html => new Map([...html.matchAll(/<article class="event-card" data-event-id="([^"]+)">[\s\S]*?<\/article>/g)]
    .map(m => [m[1], m[0]]));
  const before = cards(previous), after = cards(fresh);
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (!selected.has(id) && before.get(id) !== after.get(id)) stop("présence tierce modifiée : " + id);
  }
  const relevant = [...before.keys(), ...after.keys()].some(id => selected.has(id));
  if (!relevant && significant(previous) !== significant(fresh)) stop("fiche auteur non concernée modifiée");
  if (relevant) {
    const profile = html => html.match(/<article class="author-profile">[\s\S]*?<\/article>/)?.[0];
    if (!profile(previous) || profile(previous) !== profile(fresh)) stop("profil auteur modifié par un job événement");
  }
}

export function buildAuthorPages({ root = process.cwd(), catalog, now = new Date(),
  targeted = process.env.PUBLICATION_TARGETED === "true", referenceDate = process.env.PUBLICATION_REFERENCE_DATE,
  selectedJobs = targeted ? readIsolation(root)?.selected : undefined }) {
  const generatedAt = now.toISOString();
  const day = referenceDate || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))
      || new Date(day).toISOString().slice(0, 10) !== day) throw new Error("Date de publication Europe/Paris invalide.");
  const baseHtml = fs.readFileSync(path.join(root, "author.html"), "utf8");
  const files = new Map(), urls = [], changed = [];
  let scope;
  if (targeted && selectedJobs) {
    const sealed = readIsolation(root)?.author_source;
    if (sealed && hash(catalog) !== hash(sealed)) throw new Error("STOP auteurs ciblés : source auteur modifiée depuis capture");
    scope = selectTargetedAuthors(root, catalog, selectedJobs);
    catalog = scope.catalog;
  }
  if (targeted && (!Array.isArray(catalog) || catalog.some(({ author }) => !author
      || author.validated !== true || author.published !== true || author.merged_into
      || !/^[a-z0-9][a-z0-9-]*$/.test(author.slug || ""))
      || new Set(catalog.map(({ author }) => author.slug)).size !== catalog.length)) {
    throw new Error("STOP auteurs ciblés : catalogue publié invalide ou dupliqué.");
  }
  const index = renderAuthorIndexPage({ baseHtml, authors: catalog.map(({ author }) => author) });
  const indexFile = "auteurs/index.html";
  if (targeted) {
    const previous = fs.readFileSync(path.join(root, indexFile), "utf8");
    if (significant(previous) !== significant(index.html)) throw new Error("STOP auteurs ciblés : index des auteurs modifié.");
    files.set(indexFile, previous);
  } else files.set(indexFile, index.html);
  for (const { author, events } of catalog) {
    const rendered = renderAuthorStaticPage({ baseHtml, author, events, generatedAt: targeted ? day : generatedAt });
    const file = path.join("auteurs", author.slug, "index.html");
    let html = rendered.html;
    if (targeted) {
      const previous = fs.readFileSync(path.join(root, file), "utf8");
      const canonicals = [...previous.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(match => match[1]);
      if (canonicals.length !== 1 || canonicals[0] !== rendered.canonical) throw new Error("STOP auteurs ciblés : canonical existant incohérent.");
      if (scope) assertAuthorEventScope(previous, html, scope.selected);
      if (significant(previous) !== significant(html)) changed.push(rendered.canonical);
      else html = previous;
    }
    files.set(file, html);
    urls.push({ loc: rendered.canonical, lastmod: String(author.published_at || generatedAt).slice(0, 10) });
  }
  let sitemap;
  if (targeted) {
    // Reuse the strict XML/lastmod updater used by the index refresh. Validate
    // the entire plan before writing any page, keeping the existing XML bytes.
    sitemap = execFileSync("python3", [path.join(path.dirname(fileURLToPath(import.meta.url)), "event-publisher", "author-sitemap-lastmod.py")], {
      encoding: "utf8", input: JSON.stringify({ source: fs.readFileSync(path.join(root, "sitemap-seo-auteurs.xml"), "utf8"),
        urls: [authorIndexUrl(), ...urls.map(row => row.loc)], changed, day }),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
  } else sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${authorIndexUrl()}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
${urls.map(({ loc, lastmod }) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join("\n")}
</urlset>
`;
  files.set("sitemap-seo-auteurs.xml", sitemap);
  for (const [file, content] of files) {
    const destination = path.join(root, file);
    if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== content) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
    }
  }
  return { authors: urls.length, changed, day, deferred:scope?.deferred || [] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = fs.readFileSync("config.js", "utf8");
  const supabaseUrl = config.match(/supabaseUrl:\s*["']([^"']+)/)?.[1];
  const supabaseAnonKey = config.match(/supabaseAnonKey:\s*["']([^"']+)/)?.[1];
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Configuration Supabase publique introuvable.");
  const catalog = await fetchPublicAuthorCatalog({ supabaseUrl, supabaseAnonKey });
  const result = buildAuthorPages({ catalog });
  console.log(`PASS auteurs statiques : ${result.authors} fiche(s) publiée(s), ${result.changed.length} lastmod actualisé(s)`);
  for (const author of result.deferred) console.log("AUTEUR DIFFÉRÉ : " + author.slug + " (" + author.id + ")");
}
