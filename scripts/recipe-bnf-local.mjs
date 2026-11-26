// Local/CI fixture recipe; never connects to BnF or Supabase itself.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "dedicalivres-bnf-recette-"));
const previewDir = path.join(root,"bnf-preview-artifact");
const env = {};
for (const k of ["PATH","LANG","LC_ALL","LC_CTYPE","TZ","SYSTEMROOT","TMPDIR","TEMP","TMP"]) {
  if (process.env[k]) env[k]=process.env[k];
}
// No inherited app credentials, NODE_OPTIONS, PYTHONPATH or database URLs.
env.HOME=reportDir;
env.PYTHONDONTWRITEBYTECODE="1";
const run = (cmd,args,timeout=120000) => spawnSync(cmd,args,{
  cwd:root,env,encoding:"utf8",timeout,maxBuffer:8*1024*1024
});
const git = run("git",["rev-parse","HEAD"],10000);
if(git.status!==0) throw new Error("Use a local Git checkout or isolated worktree.");
const head = git.stdout.trim();
const tracked = run("git",["status","--porcelain","--untracked-files=no"],10000);
if(tracked.status!==0||tracked.stdout.trim()) throw new Error("Use a clean committed checkout; no tracked changes may be overwritten.");
const protectedOutput = run("git",["ls-files","--","bnf-preview-artifact"],10000);
if(protectedOutput.status!==0||protectedOutput.stdout.trim()||fs.existsSync(previewDir)||fs.readdirSync(root).includes("bnf-preview-artifact")) {
  throw new Error("Preview output already exists or is tracked; use a fresh isolated checkout.");
}
const cases=[
 ["public-features",process.execPath,["scripts/test-author-public-features.mjs"]],
 ["cache-policy",process.execPath,["scripts/test-author-bnf-cache-policy.mjs"]],
 ["gallery",process.execPath,["--test","scripts/test-author-bnf-reviewed-gallery.mjs"]],
 ["admin-draft",process.execPath,["--test","scripts/test-author-bnf-admin-review-draft.mjs"]],
 ["sru-fixtures","python3",["scripts/test_preview_bnf_author.py"]],
 ["presences-maps",process.execPath,["--test","scripts/test-author-presences-live.mjs"]],
 ["seo",process.execPath,["scripts/test-author-seo-pages.mjs"]],
 ["gallery-preview",process.execPath,["scripts/preview-author-bnf-gallery.mjs"]],
 ["admin-preview",process.execPath,["scripts/preview-author-bnf-admin.mjs"]]
];
const results=[];
for(const [name,cmd,args] of cases){
  const generation=name.endsWith("-preview");
  if(generation&&results.some(r=>r.status==="FAIL")){
    results.push({name,status:"SKIP",reason:"Earlier fixture failure"});
    console.log("SKIP "+name);continue;
  }
  const start=Date.now();
  const r=run(cmd,args);
  const status=r.status===0&&!r.error?"PASS":"FAIL";
  const log=[r.stdout||"",r.stderr||"",r.error?String(r.error):""].join("\n");
  fs.writeFileSync(path.join(reportDir,name+".log"),log,{mode:0o600});
  results.push({name,status,exitCode:r.status,durationMs:Date.now()-start});
  console.log(status+" "+name);
  if(status==="FAIL") console.error(log);
}
const after=run("git",["status","--porcelain","--untracked-files=no"],10000);
const clean=after.status===0&&!after.stdout.trim();
const allPassed=clean&&results.length===cases.length&&results.every(r=>r.status==="PASS");
const report={head,generatedAt:new Date().toISOString(),fixtureVerdict:allPassed?"PASS":"FAIL",trackedFilesUnchanged:clean,
  manualChecksPending:["real SRU","Safari","SQL disposable database","authenticated Admin integration","cover rights"],publicationAllowed:false,results};
fs.writeFileSync(path.join(reportDir,"rapport.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log("Report: "+path.join(reportDir,"rapport.json"));
console.log("Fixture verdict: "+report.fixtureVerdict+"; NOT a production approval");
process.exitCode=allPassed?0:1;
