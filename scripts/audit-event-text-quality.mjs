import fs from "node:fs";
import path from "node:path";
import "../event-text-quality.js";

const detector = globalThis.DEDICALIVRES_EVENT_TEXT_QUALITY;
const configSource = fs.readFileSync("config.js", "utf8");
const supabaseUrl = configSource.match(/supabaseUrl:\s*["']([^"']+)/)?.[1];
const supabaseAnonKey = configSource.match(/supabaseAnonKey:\s*["']([^"']+)/)?.[1];
if (!supabaseUrl || !supabaseAnonKey) throw new Error("Configuration Supabase publique introuvable.");

const canonicalMap = JSON.parse(fs.readFileSync("docs/territoires/event-canonical-map.json", "utf8"));
const headers = { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` };
const events = [];
let cursor = "";

for (;;) {
  const query = new URLSearchParams({
    select: "id,title,description,city,region,website,start_date,validated,rejected,verified",
    validated: "eq.true",
    rejected: "eq.false",
    order: "id.asc",
    limit: "250"
  });
  if (cursor) query.set("id", `gt.${cursor}`);
  const response = await fetch(`${supabaseUrl}/rest/v1/events?${query}`, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Lecture Supabase refusée (${response.status}).`);
  const page = await response.json();
  if (!Array.isArray(page)) throw new Error("Réponse Supabase invalide.");
  events.push(...page);
  if (page.length < 250) break;
  cursor = page.at(-1).id;
}

const findings = [];
for (const event of events) {
  const relativePath = canonicalMap[event.id] || null;
  const canonicalUrl = relativePath ? `https://dedicalivres.fr/${relativePath}` : null;
  const staticHtml = relativePath && fs.existsSync(relativePath) ? fs.readFileSync(relativePath, "utf8") : null;
  for (const issue of detector.analyzeEvent(event)) {
    const encodedNeedle = String(event[issue.field] || "").slice(0, 40);
    findings.push({
      eventId: event.id,
      title: event.title,
      field: issue.field,
      classification: issue.classification,
      code: issue.code,
      excerpt: issue.excerpt,
      canonicalUrl,
      sourceUrl: event.website || null,
      origin: staticHtml && (staticHtml.includes(encodedNeedle) || staticHtml.includes(issue.excerpt))
        ? "supabase-et-html-statique"
        : "supabase",
      suggestion: issue.suggestion
    });
  }
}

const suspiciousUrls = [...new Set(findings.map((item) => item.canonicalUrl).filter(Boolean))];
const servedPages = new Map();
for (let index = 0; index < suspiciousUrls.length; index += 6) {
  const batch = suspiciousUrls.slice(index, index + 6);
  await Promise.all(batch.map(async (url) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      servedPages.set(url, response.ok ? await response.text() : null);
    } catch {
      servedPages.set(url, null);
    }
  }));
}

for (const finding of findings) {
  const html = finding.canonicalUrl ? servedPages.get(finding.canonicalUrl) : null;
  const comparable = String(html || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  finding.served = html === null || html === undefined
    ? "unavailable"
    : comparable.includes(finding.excerpt)
      ? "issue-visible"
      : "page-reached";
  if (finding.served === "issue-visible") finding.origin = `${finding.origin}-et-site-servi`;
}

const counts = findings.reduce((result, item) => {
  result[item.classification] = (result[item.classification] || 0) + 1;
  return result;
}, { certain: 0, probable: 0, review: 0 });
const eventCounts = Object.fromEntries(["certain", "probable", "review"].map((classification) => [
  classification,
  new Set(findings.filter((item) => item.classification === classification).map((item) => item.eventId)).size
]));
const report = {
  generatedAt: new Date().toISOString(),
  source: "Supabase public read-only API; validated=true; rejected=false",
  examined: events.length,
  suspiciousEvents: new Set(findings.map((item) => item.eventId)).size,
  counts,
  eventCounts,
  servedPagesChecked: servedPages.size,
  servedIssuesVisible: findings.filter((item) => item.served === "issue-visible").length,
  findings
};

const output = process.argv[2];
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const markdown = [
    "# Audit qualité textuelle des événements",
    "",
    `- Généré le : ${report.generatedAt}`,
    `- Fiches publiées examinées : ${report.examined}`,
    `- Fiches suspectes : ${report.suspiciousEvents}`,
    `- Anomalies certaines : ${report.eventCounts.certain} fiche(s), ${report.counts.certain} signalement(s)`,
    `- Anomalies probables : ${report.eventCounts.probable} fiche(s), ${report.counts.probable} signalement(s)`,
    `- Contrôle humain : ${report.eventCounts.review} fiche(s), ${report.counts.review} signalement(s)`,
    `- Pages servies contrôlées : ${report.servedPagesChecked}`,
    "",
    "Le scan est strictement en lecture seule. Aucun texte ni statut n'a été modifié.",
    "",
    "| Gravité | ID | Titre | Champ | Défaut | Extrait | Origine | Vérification |",
    "|---|---|---|---|---|---|---|---|",
    ...findings.map((item) => `| ${item.classification} | ${item.eventId} | ${String(item.title).replaceAll("|", "\\|")} | ${item.field} | ${item.code} | ${String(item.excerpt).replaceAll("|", "\\|")} | ${item.origin} | ${item.sourceUrl ? `[source](${item.sourceUrl})` : "contrôle humain"} · ${item.canonicalUrl ? `[fiche](${item.canonicalUrl})` : "canonical absente"} |`)
  ].join("\n");
  fs.writeFileSync(output.replace(/\.json$/i, ".md"), `${markdown}\n`);
}
console.log(JSON.stringify(report, null, 2));
