import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script = fs.readFileSync(new URL('../admin-event-image.js',import.meta.url),'utf8');
const FILE = new File([Uint8Array.from([1,2,3])],'affiche.jpg',{type:'image/jpeg'});
function boot(state){
 const window={DEDICALIVRES_CONFIG:{},DEDICALIVRES_ADMIN_CONTEXT:{getState:()=>state}};
 vm.runInNewContext(script,{window,File,FormData,URL,Error,Set}, {filename:'admin-event-image.js'});
 return window.DEDICALIVRES_ADMIN_EVENT_IMAGE;
}
let n=0;
const test=async(name,fn)=>{await fn();n++;console.log('PASS '+name)};
await test('legacy R2 multipart unchanged when flag absent',async()=>{
 const api=boot(null);let sent;
 const url=await api.upload(FILE,{config:{imageUploadProvider:'r2',imageUploadEndpoint:'https://legacy.example/upload'},fetcher:async(e,r)=>{sent={e,r};return Response.json({url:'https://r2.example/old.jpg'});}});
 assert.equal(url,'https://r2.example/old.jpg');assert.equal(sent.r.method,'POST');assert.ok(sent.r.body instanceof FormData);assert.equal(sent.r.headers,undefined);
});
await test('secure flag refuses missing admin session without network call',async()=>{
 let called=false;const api=boot({authenticated:false,status:'unauthenticated'});
 await assert.rejects(api.upload(FILE,{config:{imageUploadProvider:'r2',imageUploadAuthEnabled:true,imageUploadSecureEndpoint:'https://secure.example/upload'},fetcher:async()=>{called=true;}}),/administrateur requise/);
 assert.equal(called,false);
});
await test('secure flag forwards bearer only with ready admin',async()=>{
 const api=boot({authenticated:true,status:'ready',session:{access_token:'actual-supabase-user-jwt'}});let sent;
 await api.upload(FILE,{config:{imageUploadProvider:'r2',imageUploadAuthEnabled:true,imageUploadSecureEndpoint:'https://secure.example/upload'},fetcher:async(e,r)=>{sent={e,r};return Response.json({url:'https://r2.example/new.jpg'});}});
 assert.equal(sent.e,'https://secure.example/upload');assert.equal(sent.r.headers.Authorization,'Bearer actual-supabase-user-jwt');assert.equal(sent.r.headers['Content-Type'],'image/jpeg');assert.equal(sent.r.body,FILE);
});
console.log(`PASS TESTS ${n}/${n}`);
