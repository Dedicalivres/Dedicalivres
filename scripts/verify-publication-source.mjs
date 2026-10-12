import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PUBLIC_EVENT_FIELDS} from './territorial-catalog.mjs';

export const FIELDS = [...new Set([
  ...PUBLIC_EVENT_FIELDS.split(','),
  'description', 'image_url',
])].join(',');
const stop = message => { throw new Error(`STOP source publique : ${message}`); };
const canonical = value => JSON.stringify(value, (_, entry) => entry && !Array.isArray(entry) && typeof entry === 'object'
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);

export function assertSourceSame(captured, current) {
  if (!Array.isArray(captured) || !Array.isArray(current)
      || new Set(captured.map(row => row.id)).size !== captured.length
      || new Set(current.map(row => row.id)).size !== current.length
      || canonical([...captured].sort((a, b) => a.id.localeCompare(b.id)))
        !== canonical([...current].sort((a, b) => a.id.localeCompare(b.id)))) {
    stop('événement public modifié pendant le traitement');
  }
}

export async function fetchSource(url, key, request = fetch) {
  if (!url || !key) stop('configuration publique absente');
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 200; page++) {
    const query = new URLSearchParams({select:FIELDS, validated:'eq.true', rejected:'eq.false', order:'id.asc', limit:'500'});
    if (cursor !== null) query.set('id', `gt.${cursor}`);
    const response = await request(`${url}/rest/v1/events?${query}`, {
      headers:{apikey:key}, signal:AbortSignal.timeout(20000),
    });
    if (!response.ok) stop(`lecture publique HTTP ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) stop('catalogue public invalide');
    if (!batch.length) return rows;
    rows.push(...batch);
    cursor = batch.at(-1).id;
    if (batch.length < 500) return rows;
  }
  stop('pagination publique incomplète');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const captured = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const current = await fetchSource(process.env.DEDICALIVRES_SUPABASE_URL, process.env.DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY);
  assertSourceSame(captured, current);
  console.log(`PASS source publique inchangée : ${current.length} événements`);
}
