import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, 'auteurs');
const sitemapPath = path.join(root, 'sitemap-seo-auteurs.xml');
if (!fs.existsSync(directory) || !fs.existsSync(sitemapPath)) {
  throw new Error('Missing authors directory or author sitemap');
}
const pages = fs.readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, 'index.html')))
  .map(entry => entry.name).sort();
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const slugs = [...sitemap.matchAll(/<loc>https:\/\/dedicalivres\.fr\/auteurs\/([a-z0-9-]+)\/<\/loc>/g)].map(match => match[1]).sort();
const missingInSitemap = pages.filter(slug => !slugs.includes(slug));
const missingPages = slugs.filter(slug => !pages.includes(slug));
const allowLegacyLeplat = process.argv.includes('--allow-legacy-leplat');
const expectedLegacyOnly = missingInSitemap.length === 1 && missingInSitemap[0] === 'leplat-thierry' && missingPages.length === 0;
console.log(JSON.stringify({ pages: pages.length, sitemapEntries: slugs.length, missingInSitemap, missingPages, legacyExceptionAccepted: allowLegacyLeplat && expectedLegacyOnly }, null, 2));
if (missingInSitemap.length || missingPages.length) {
  if (!(allowLegacyLeplat && expectedLegacyOnly)) process.exitCode = 1;
}
