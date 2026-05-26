import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.wrangler'].includes(entry.name)) return [];
      return walk(full);
    }
    return [full];
  });
}

function rel(file) {
  return path.relative(root, file);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function checkFileExists(file) {
  if (!fs.existsSync(path.join(root, file))) fail(`Fichier manquant: ${file}`);
}

checkFileExists('style.css');
checkFileExists('_headers');
checkFileExists('SUPABASE_SECURITY_HARDENING.sql');
checkFileExists('SECURITY.md');

const jsFiles = walk(root).filter((file) => file.endsWith('.js'));
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`Syntaxe JS invalide: ${rel(file)}\n${String(error.stderr || error.message)}`);
  }
}

const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
const publicHtml = htmlFiles.filter((file) => !['admin.html', 'google65fc95f0d9b60381.html', 'snippet.html', 'event.html', 'author.html'].includes(file));
const sitemapPath = path.join(root, 'sitemap.xml');

if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const listed = new Set(urls.map((url) => {
    const pathname = new URL(url).pathname.replace(/^\/+/, '');
    return pathname || 'index.html';
  }));

  const missing = publicHtml.filter((file) => {
    if (file === 'index.html') return !listed.has('index.html') && !urls.includes('https://dedicalivres.fr/');
    const slug = file.replace(/\.html$/, '');
    return !listed.has(file) && !listed.has(slug);
  });

  if (missing.length) warn(`Pages absentes du sitemap: ${missing.join(', ')}`);
} else {
  fail('sitemap.xml manquant');
}

for (const file of publicHtml) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  if (!/<title>[\s\S]*?<\/title>/i.test(html)) warn(`Titre HTML manquant: ${file}`);
  if (!/<meta\s+name=["']description["']/i.test(html)) warn(`Meta description manquante: ${file}`);
}

warnings.forEach((message) => console.warn(`WARN ${message}`));
failures.forEach((message) => console.error(`FAIL ${message}`));

if (failures.length) {
  process.exit(1);
}

console.log(`OK ${jsFiles.length} scripts verifies, ${publicHtml.length} pages publiques inspectees.`);
