import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { authorIndexUrl, fetchPublicAuthorCatalog, renderAuthorIndexPage, renderAuthorStaticPage } from "./author-static-page.mjs";

// Ignore only line-ending/trailing-space churn, never visible text or card order.
const significant = html => html.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();

export function buildAuthorPages({ root = process.cwd(), catalog, now = new Date(),
  targeted = process.env.PUBLICATION_TARGETED === "true", referenceDate = process.env.PUBLICATION_REFERENCE_DATE }) {
  const generatedAt = now.toISOString();
  const day = referenceDate || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))
      || new Date(day).toISOString().slice(0, 10) !== day) throw new Error("Date de publication Europe/Paris invalide.");
  const baseHtml = fs.readFileSync(path.join(root, "author.html"), "utf8");
  const files = new Map(), urls = [], changed = [];
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
  return { authors: urls.length, changed, day };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = fs.readFileSync("config.js", "utf8");
  const supabaseUrl = config.match(/supabaseUrl:\s*["']([^"']+)/)?.[1];
  const supabaseAnonKey = config.match(/supabaseAnonKey:\s*["']([^"']+)/)?.[1];
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Configuration Supabase publique introuvable.");
  const catalog = await fetchPublicAuthorCatalog({ supabaseUrl, supabaseAnonKey });
  const result = buildAuthorPages({ catalog });
  console.log(`PASS auteurs statiques : ${result.authors} fiche(s) publiée(s), ${result.changed.length} lastmod actualisé(s)`);
}
