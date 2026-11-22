// Lecture seule de l'API publique Supabase. Aucun jeton privilégié, aucune mutation.
import fs from 'node:fs';
import { auditEventImages } from './event-image-provenance-core.mjs';
const match = (fs.readFileSync('config.js','utf8'));
const url = match.match(/supabaseUrl:\s*["']([^"']+)/)?.[1];
const key = match.match(/supabaseAnonKey:\s*["']([^"']+)/)?.[1];
if (!url || !key) throw new Error('Configuration publique Supabase introuvable.');
const fromArg = process.argv.find(arg => arg.startsWith('--from='));
const fromDate = fromArg ? fromArg.slice(7) : '';
if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) throw new Error('Date --from invalide.');
const json = process.argv.includes('--json');
const events = [];
let cursor = '';
for (;;) {
  const query = new URLSearchParams({
    select:'id,title,city,start_date,image_url,website,source_label,validated,rejected',
    validated:'eq.true', rejected:'eq.false', order:'id.asc', limit:'250'
  });
  if (cursor) query.set('id',`gt.${cursor}`);
  const response = await fetch(`${url}/rest/v1/events?${query}`,{
    headers:{apikey:key, Authorization:`Bearer ${key}`}, signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Lecture API publique refusée: HTTP ${response.status}.`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Réponse API inattendue.');
  events.push(...data);
  if (data.length < 250) break;
  if (events.length > 10000) throw new Error('Pagination excessive : audit interrompu.');
  cursor = String(data.at(-1).id);
}
const report = auditEventImages(events,{fromDate});
if (json) console.log(JSON.stringify(report,null,2));
else {
  console.log(`EXAMINES=${report.examined} FICHES_SIGNALEES=${report.flagged_events}`);
  for (const [issue,n] of Object.entries(report.counts)) console.log(`${issue}=${n}`);
  for (const row of report.findings.slice(0,80)) console.log(`${row.id}\t${row.date}\t${row.issues.join(',')}\t${row.title}`);
  if (report.findings.length>80) console.log(`... et ${report.findings.length-80} autres signalements`);
}
