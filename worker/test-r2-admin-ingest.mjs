import assert from 'node:assert/strict';
import {handleRequest, inspectImage, sanitizeImage,MAX_UPLOAD_BYTES} from './r2-admin-ingest.mjs';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOKEN = 'f'.repeat(36);
const URL = 'https://ingest.example.invalid/upload';
const ORIGIN = 'https://dedicalivres.fr';
const image = Uint8Array.from([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xda,0,2,0,0,0xff,0xd9]);
function envWith(overrides={}) {
  const saved = [];
  return {saved,env:{
    SUPABASE_URL:'https://test-project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_public',
    R2_PUBLIC_BASE_URL:'https://r2.example.invalid',
    ALLOWED_ORIGINS:ORIGIN,
    UPLOAD_RATE_LIMIT:{async limit({key}){assert.equal(key,USER);return {success:true};}},
    UPLOAD_BUCKET:{async put(key,bytes,config){saved.push({key,bytes,config});return {etag:'mock'};}},
    ...overrides,
  }};
}
function opts({admin=true,authenticated=true,failUpstream=false}={}) {
  return {fetchImpl:async(url,{headers,method})=>{
    assert.equal(headers.Authorization,`Bearer ${TOKEN}`);
    assert.equal(headers.apikey,'sb_publishable_test_public');
    assert.equal(method,'GET');
    if(failUpstream)throw Error('network issue');
    if(url.includes('/auth/v1/user'))return new Response(authenticated?JSON.stringify({id:USER}):'{}',{status:authenticated?200:401});
    if(url.includes('/rest/v1/admin_users'))return Response.json(admin?[{user_id:USER}]:[]);
    throw Error(`unexpected upstream ${url}`);
  }, now:new Date('2026-11-07T15:00:00Z'),uuid:()=>USER};
}
function request({body=image,type='image/jpeg',origin=ORIGIN,token=TOKEN,method='POST',url=URL,contentLength}={}){
 const headers={'Content-Type':type};if(origin!==null)headers.Origin=origin;if(token!==null)headers.Authorization=`Bearer ${token}`;
 if(contentLength!==undefined)headers['Content-Length']=String(contentLength);
 return new Request(url,{method,headers,body:method==='POST'?body:undefined});
}
async function run(name, expected, req, env, config) {
 const result=await handleRequest(req,env,config);
 assert.equal(result.status,expected,`${name} -> ${await result.clone().text()}`);
 return result;
}
let tests=0;
const test=async(name,fn)=>{await fn();tests++;console.log('PASS '+name)};
await test('admin validé → image R2 event-images uniquement, sans accès service_role',async()=>{
 const {env,saved}=envWith(); const result=await run('admin',201,request(),env,opts());
 const payload=await result.json();
 assert.equal(saved.length,1);assert.equal(payload.key,`event-images/2026/11/${USER}.jpg`);
 assert.equal(payload.url,`https://r2.example.invalid/${payload.key}`);
 assert.equal(saved[0].config.httpMetadata.contentType,'image/jpeg');
 assert.equal(result.headers.get('Access-Control-Allow-Origin'),ORIGIN);
 assert.deepEqual([...saved[0].bytes],[...image]);
});
await test('missing bearer → 401, aucun upload',async()=>{
 const {env,saved}=envWith();await run('missing',401,request({token:null}),env,opts());assert.equal(saved.length,0);
});
await test('invalid Supabase JWT → 401',async()=>{
 const {env,saved}=envWith();await run('invalid',401,request(),env,opts({authenticated:false}));assert.equal(saved.length,0);
});
await test('non-admin → 403',async()=>{
 const {env,saved}=envWith();await run('non admin',403,request(),env,opts({admin:false}));assert.equal(saved.length,0);
});
await test('Supabase down → 503 fail closed',async()=>{
 const {env,saved}=envWith();await run('down',503,request(),env,opts({failUpstream:true}));assert.equal(saved.length,0);
});
await test('origin externe refusé même avec token',async()=>{
 const {env,saved}=envWith();await run('cross site',403,request({origin:'https://other.example'}),env,opts());assert.equal(saved.length,0);
});
await test('CORS preflight limité aux origines approuvées',async()=>{
 const {env}=envWith();const result=await run('preflight',204,request({method:'OPTIONS'}),env,opts());
 assert.equal(result.headers.get('Access-Control-Allow-Methods'),'POST, OPTIONS');
});
await test('application cliente sans Origin reste protégée par JWT',async()=>{
 const {env,saved}=envWith();await run('CLI',201,request({origin:null}),env,opts());assert.equal(saved.length,1);
});
await test('image type faux → 415, aucun upload',async()=>{
 const {env,saved}=envWith();await run('MIME',415,request({type:'image/png'}),env,opts());assert.equal(saved.length,0);
});
await test('métadonnées EXIF supprimées avant stockage',async()=>{
 const exif=Uint8Array.from([0xff,0xd8,0xff,0xe1,0,4,0,0,0xff,0xe0,0,4,0,0,0xff,0xda,0,2,0,0,0xff,0xd9]);
 assert.throws(()=>inspectImage(exif,'image/jpeg'),/remove_image_metadata/);
 const cleaned = sanitizeImage(exif,'image/jpeg');
 assert.equal(cleaned.length,exif.length-6);
 assert.equal(inspectImage(cleaned,'image/jpeg'),'jpg');
 const {env,saved}=envWith();await run('strip EXIF',201,request({body:exif}),env,opts());
 assert.equal(saved.length,1);assert.equal(saved[0].bytes.length,cleaned.length);
});
await test('upload trop volumineux interrompu',async()=>{
 const {env,saved}=envWith();await run('oversized',413,request({contentLength:MAX_UPLOAD_BYTES+1}),env,opts());assert.equal(saved.length,0);
});
await test('streaming sans Content-Length plafonné',async()=>{
 const {env,saved}=envWith();await run('stream oversized',413,request({body:new Uint8Array(MAX_UPLOAD_BYTES+1)}),env,opts());assert.equal(saved.length,0);
});
await test('rate limit refuse au-delà du quota',async()=>{
 const {env,saved}=envWith({UPLOAD_RATE_LIMIT:{async limit(){return {success:false}}}});
 await run('rate',429,request(),env,opts());assert.equal(saved.length,0);
});
await test('R2 binding absent → 503',async()=>{
 const {env}=envWith({UPLOAD_BUCKET:null});await run('binding',503,request(),env,opts());
});
await test('route inconnue non accessible',async()=>{
 const {env}=envWith();await run('other route',404,request({url:'https://ingest.example.invalid/'}),env,opts());
});
console.log(`PASS TESTS ${tests}/${tests}`);
