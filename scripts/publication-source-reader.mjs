import {PUBLIC_EVENT_FIELDS} from './territorial-catalog.mjs';
export const FIELDS = [...new Set([
  ...PUBLIC_EVENT_FIELDS.split(','),
  'description', 'image_url',
])].join(',');
const stop = message => { throw new Error(`STOP source publique : ${message}`); };
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
