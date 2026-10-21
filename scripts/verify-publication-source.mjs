import {authorization,guardRetiredJobs,readWithdrawalEvidence,assertWithdrawalEvidence,assertFrozenSnapshot} from './retired-test-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PUBLIC_EVENT_FIELDS} from './territorial-catalog.mjs';
import {publishedEventRows} from './project-targeted-publication.mjs';

import {fetchSource} from './publication-source-reader.mjs';
export {FIELDS, fetchSource} from './publication-source-reader.mjs';
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

export function assertTerritorialSame(snapshot, current) {
  if (!snapshot || !Array.isArray(snapshot.events)) stop('capture territoriale absente');
  const fields = PUBLIC_EVENT_FIELDS.split(',');
  const projected = current.map(row => Object.fromEntries(fields.map(name => [name, row[name]])));
  assertSourceSame(snapshot.events, projected);
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const captured = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const current = await fetchSource(process.env.DEDICALIVRES_SUPABASE_URL, process.env.DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY);
  assertSourceSame(captured, current);
  const territorial = JSON.parse(fs.readFileSync('docs/territoires/catalogue-public.json', 'utf8'));
  if(process.env.PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION){
    const a=authorization();const jobs=JSON.parse(process.env.PUBLICATION_JOBS||'[]');guardRetiredJobs(jobs);
    const evidence=await readWithdrawalEvidence(a);
    if(evidence.jobs[0]?.batch_id!==jobs[0]?.batch_id)stop('batch de retrait changé');
    assertWithdrawalEvidence(a,evidence,process.cwd(),'claimed');assertFrozenSnapshot(a,territorial);
  } else assertTerritorialSame(territorial,
    process.env.PUBLICATION_TARGETED === 'true' ? publishedEventRows(current) : current);
  console.log(`PASS source publique inchangée : ${current.length} événements`);
}
