import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const html=fs.readFileSync(new URL("../docs/author-audio-local-preview.html",import.meta.url),"utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if(scripts.length!==1||!html.includes('default-src \'none\'')||!html.includes('media-src blob:')||/<audio[^>]*\bautoplay\b/i.test(html))throw Error("Unsafe preview structure");
const env={PATH:process.env.PATH||"",HOME:process.env.HOME||"",LANG:"C.UTF-8"};
for(const [name,args,input] of [["syntax",["--check","-"],scripts[0][1]],["policy",["--test","scripts/test-author-audio-policy.mjs"],undefined]]){
 const r=spawnSync(process.execPath,args,{cwd:root,env,input,encoding:"utf8",timeout:30000});
 console.log(r.stdout||"");console.error(r.stderr||"");
 if(r.status!==0||r.error)throw Error(name+" FAIL");
 console.log(name+" PASS");
}
console.log("Offline fixture checks only. Microphone, browsers, backend and storage require separate qualification. NO-GO production.");
