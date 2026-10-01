import fs from "node:fs";
import path from "node:path";
import { fetchPublicAuthorCatalog, renderAuthorStaticPage } from "./author-static-page.mjs";

const config = fs.readFileSync("config.js", "utf8");
const supabaseUrl = config.match(/supabaseUrl:\s*["']([^"']+)/)?.[1];
const supabaseAnonKey = config.match(/supabaseAnonKey:\s*["']([^"']+)/)?.[1];
if (!supabaseUrl || !supabaseAnonKey) throw new Error("Configuration Supabase publique introuvable.");

const baseHtml = fs.readFileSync("author.html", "utf8");
const generatedAt = new Date().toISOString();
const catalog = await fetchPublicAuthorCatalog({ supabaseUrl, supabaseAnonKey });
const urls = [];
for (const { author, events } of catalog) {
  const rendered = renderAuthorStaticPage({ baseHtml, author, events, generatedAt });
  const directory = path.join("auteurs", author.slug);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), rendered.html);
  urls.push({ loc: rendered.canonical, lastmod: String(author.published_at || generatedAt).slice(0, 10) });
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://dedicalivres.fr/auteurs-independants</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
${urls.map(({ loc, lastmod }) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync("sitemap-seo-auteurs.xml", sitemap);
console.log(`PASS auteurs statiques : ${urls.length} fiche(s) publiée(s)`);
