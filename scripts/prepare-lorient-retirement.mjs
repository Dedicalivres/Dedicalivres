// Invoked only by a future explicitly authorized, already-claimed manual job.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {authorization,guardRetiredJobs,readWithdrawalEvidence,assertWithdrawalEvidence,ID,PAGE} from './retired-test-policy.mjs';
import {preview} from './preview-lorient-test-retirement.mjs';
export async function prepareLorientRetirement({root=process.cwd(),output,request=fetch}={}){
 const a=authorization(),selected=JSON.parse(process.env.PUBLICATION_JOBS||'[]');guardRetiredJobs(selected);
 if(process.env.PUBLICATION_MANUAL_MODE!=='execute'||process.env.PUBLICATION_AUTOMATION_ENABLED!=='false'
   ||process.env.PUBLICATION_MANUAL_CONFIRMATION!=='EXECUTE'||selected[0].attempt_count!==(a.retry?2:1)||!selected[0].batch_id)
  throw Error('STOP retrait : parcours manuel explicitement confirmé requis');
 if(JSON.stringify(JSON.parse(process.env.PUBLICATION_DEPUBLISH_EVENT_IDS||'[]'))!==JSON.stringify([ID])
   ||JSON.stringify(JSON.parse(process.env.PUBLICATION_DEPUBLISH_PATHS||'[]'))!==JSON.stringify([PAGE]))throw Error('STOP retrait : suppression non alignée');
 output=path.resolve(output||process.env.EVENT_PUBLISHER_EXPORT_DIR||'');
 if(output===root||output.startsWith(path.resolve(root)+path.sep)||fs.existsSync(output))throw Error('STOP retrait : export neuf isolé requis');
 const evidence=await readWithdrawalEvidence(a,request);
 if(evidence.jobs[0]?.batch_id!==selected[0].batch_id)throw Error('STOP retrait : batch différent');
 assertWithdrawalEvidence(a,evidence,root,'claimed');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 const result=await preview({root,output,withdrawal:a,evidence,phase:'claimed',day:a.reference_date});
 const fresh=await readWithdrawalEvidence(a,request);assertWithdrawalEvidence(a,fresh,root,'claimed');
 if(fresh.jobs[0]?.batch_id!==selected[0].batch_id)throw Error('STOP retrait : réservation modifiée');
 const patch=path.join(output,'projection.patch');
 execFileSync('git',['apply','--check',patch],{cwd:root});
 execFileSync('git',['apply',patch],{cwd:root});
 fs.writeFileSync(path.join(output,'public-events-source.json'),JSON.stringify(evidence.source,null,2)+'\n');
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await prepareLorientRetirement();console.log('PASS préparation figée Lorient ; aucune publication effectuée par ce script');
}
