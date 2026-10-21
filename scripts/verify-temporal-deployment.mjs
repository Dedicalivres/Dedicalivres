// Reuse the publication verifier: exact Pages SHA and bytes for every changed asset.
import fs from 'node:fs';
import {verifyPagesFiles} from './verify-publication-deployment.mjs';
const report=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if(!report.files?.length)throw Error('STOP : aucun changement temporel à déployer');
let proof;
for(let attempt=1;attempt<=60;attempt++){
 try{
  proof=await verifyPagesFiles({sha:process.env.PUBLICATION_SHA,paths:report.files,
   repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN});
  break;
 }catch(error){
  if(attempt===60)throw error;
  console.log(`${error.message} ; attente ${attempt}/60`);
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
}
console.log(JSON.stringify(proof));
fs.appendFileSync(process.env.GITHUB_OUTPUT,`proof=${JSON.stringify(proof)}\n`);
