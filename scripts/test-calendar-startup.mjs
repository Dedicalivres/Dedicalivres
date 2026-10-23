import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(process.env.TEST_ROOT || '.');
const output=path.resolve(process.env.TEST_OUTPUT || '/tmp/calendar-startup');
await fs.mkdir(output,{recursive:true});
const ref=process.env.TEST_REF;
const historical=process.env.HISTORICAL==='1';
const cache=new Map();
async function read(file){
  if(!cache.has(file))cache.set(file,ref?execFileSync('git',['show',`${ref}:${file}`],{cwd:root,stdio:['ignore','pipe','ignore']}):await fs.readFile(path.join(root,file)));
  return cache.get(file);
}
const leafletJS=await fs.readFile(process.env.LEAFLET_TEST_JS || require.resolve('leaflet/dist/leaflet.js'));
const leafletCSS=await fs.readFile(process.env.LEAFLET_TEST_CSS || require.resolve('leaflet/dist/leaflet.css'));
const retired='eb6672b2-900f-4c6a-9021-ea84c5036769';
const base={validated:true,rejected:false,country_code:'FR',region:'Bretagne',city:'Rennes',type:'Salon',lat:48.11,lng:-1.68,description:'Fixture littéraire'};
const dataset=[
 {...base,id:'00000000-0000-4000-8000-000000000001',title:'Salon aujourd hui fixture',start_date:'2026-10-23',end_date:'2026-10-23'},
 {...base,id:'00000000-0000-4000-8000-000000000002',title:'Dedicace demain fixture',type:'Dédicace',city:'Bordeaux',region:'Nouvelle-Aquitaine',lat:44.84,lng:-.58,start_date:'2026-10-24',end_date:'2026-10-24'},
 {...base,id:'00000000-0000-4000-8000-000000000003',title:'Archive fixture',start_date:'2026-10-20',end_date:'2026-10-21'},
 {...base,id:retired,title:'Test Lorient interdit',start_date:'2026-10-24',end_date:'2026-10-24'}];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || chromium.executablePath()});
let writes=0;
let staleScriptRequests=0;
async function fixture(mode='normal',seo=false){
 const context=await browser.newContext({timezoneId:'Europe/Paris',locale:'fr-FR',viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const errors=[],consoleErrors=[];let eventQueries=0;
 await context.addInitScript(()=>{
  window.__catalogLoaded=null;window.__catalogError=false;window.__rejections=[];
  addEventListener('unhandledrejection',e=>window.__rejections.push(String(e.reason)));
  addEventListener('dedicalivres:catalog-loaded',e=>window.__catalogLoaded=e.detail);
  addEventListener('dedicalivres:catalog-error',()=>window.__catalogError=true);
  window.supabase={createClient(){return {from(table){const f={};let after='',columns='';
   const q={select(value){columns=value;return q},eq(k,v){f[k]=v;return q},order(){return q},limit(){return q},gt(k,v){after=v;return q},in(){return q},or(){return q},lte(){return q},gte(){return q},not(){return q},range(){return q},maybeSingle(){return q},
    then(resolve,reject){return fetch('/__fixture?'+new URLSearchParams({table,after,filters:JSON.stringify(f),columns})).then(r=>r.json()).then(resolve,reject)}};return q;
  },rpc(){return Promise.resolve({data:[],error:null})}}}};
 });
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(!['GET','HEAD'].includes(req.method())){writes++;return route.abort();}
  if(/leaflet.*\.js$/.test(url.pathname))return route.fulfill({contentType:'application/javascript',body:leafletJS});
  if(/leaflet.*\.css$/.test(url.pathname))return route.fulfill({contentType:'text/css',body:leafletCSS});
  if(url.origin!=='http://catalog.test')return route.fulfill({contentType:req.resourceType()==='stylesheet'?'text/css':'application/javascript',body:''});
  if(url.pathname==='/__fixture'){
   const table=url.searchParams.get('table');if(table==='events'&&url.searchParams.get('columns')?.startsWith('id,title,validated,rejected,type'))eventQueries++;
   const filters=JSON.parse(url.searchParams.get('filters'));
   const data=table==='events'?dataset.filter(e=>(!seo||e.id!==retired)&&e.id>url.searchParams.get('after')&&Object.entries(filters).every(([k,v])=>e[k]===v)).slice(0,2):[];
   return route.fulfill({json:mode==='supabase-error'?{data:null,error:{message:'Fixture source unavailable'}}:{data,error:null}});
  }
  if(url.pathname==='/event-retirements.json'&&mode!=='normal'&&mode!=='supabase-error'){
   if(mode==='unavailable')return route.fulfill({status:503,body:'unavailable'});
   return route.fulfill({json:mode==='invalid'?{version:999,entries:[]}:JSON.parse(await read('event-retirements.json'))});
  }
  // Simulate a visitor retaining the formerly cached, broken script URL.
  if(!ref&&url.pathname==='/app.js'&&url.searchParams.get('v')==='site-ux-01'){
   staleScriptRequests++;
   return route.fulfill({contentType:'application/javascript',body:execFileSync('git',['show','origin/main:app.js'],{cwd:root})});
  }
  const file=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname).slice(1);
  if(path.resolve(root,file).startsWith(root+path.sep)){
   try{return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream',body:await read(file)});}catch{}
  }
  return route.fulfill({status:404,body:'not found'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))consoleErrors.push(m.text());});
 await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
 return {context,page,errors,consoleErrors,queries:()=>eventQueries};
}
const results=[];
try{
 const f=await fixture();const {page}=f;
 await page.goto('http://catalog.test/index.html');
 try{await page.waitForFunction(()=>Array.isArray(window.__catalogLoaded),{},{timeout:5000});}
 catch(error){
  const evidence={ref:ref||'working-tree',errors:f.errors,month:await page.locator('#calendar-current-month').textContent(),days:await page.locator('.calendar-day-number').count(),queries:f.queries(),rejections:await page.evaluate(()=>window.__rejections)};
  await fs.writeFile(path.join(output,'startup-failure.json'),JSON.stringify(evidence,null,2));
  await page.screenshot({path:path.join(output,'startup-red.png')});
  throw new Error('Calendar startup failed: '+JSON.stringify(evidence));
 }
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.consoleErrors,[]);assert.deepEqual(await page.evaluate(()=>window.__rejections),[]);
 assert.match(await page.locator('#calendar-current-month').textContent(),/octobre 2026/i);
 assert.deepEqual(await page.locator('.calendar-day-number').allTextContents(),Array.from({length:31},(_,i)=>String(i+1)));
 assert(f.queries()>=2,'real paginated initial load exercised');
 if(!historical)assert(!(await page.evaluate(()=>window.__catalogLoaded)).some(e=>e.id===retired));
 assert(await page.locator('#events-grid').textContent().then(t=>t.includes('demain fixture')));
 assert(await page.locator('#past-events-grid').textContent().then(t=>t.includes('Archive fixture')));
 await page.locator('#map').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelectorAll('#map .leaflet-marker-icon').length>=2);
 await page.locator('#search-input').fill('demain fixture');
 await page.waitForFunction(()=>document.querySelectorAll('#events-grid .event-card').length===1);
 await page.locator('#search-input').fill('');
 await page.locator('#calendar-next').click();assert.match(await page.locator('#calendar-current-month').textContent(),/novembre 2026/i);
 await page.locator('#calendar-prev').click();assert.match(await page.locator('#calendar-current-month').textContent(),/octobre 2026/i);
 for(const [shortcut,date] of [['today','2026-10-23'],['tomorrow','2026-10-24']]){
  await page.locator(`[data-calendar-shortcut="${shortcut}"]`).click();
  assert(await page.locator(`[data-calendar-date="${date}"]`).getAttribute('class').then(c=>c.includes('is-selected')));
 }
 await page.locator('[data-calendar-shortcut="month"]').click();
 assert.equal(await page.locator('.agenda-calendar-day.is-selected').count(),0);
 await page.screenshot({path:path.join(output,'calendar-green.png')});
 results.push({case:'startup-calendar-map-filters-navigation-archives',pass:true});
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.consoleErrors,[]);await f.context.close();
 if(!historical){
  for(const mode of ['unavailable','invalid','supabase-error']){
   const f=await fixture(mode);await f.page.goto('http://catalog.test/index.html');
   await f.page.waitForFunction(()=>window.__catalogError,{},{timeout:5000});
   assert.equal(await f.page.evaluate(()=>window.__catalogLoaded),null);
   assert.deepEqual(f.errors,[]);assert.deepEqual(await f.page.evaluate(()=>window.__rejections),[]);
   if(mode!=='supabase-error')assert.equal(f.queries(),0,'no source query when retirement policy fails');
   results.push({case:mode,pass:true});await f.context.close();
  }
  for(const file of ['salons-du-livre.html','dedicaces.html']){
   const f=await fixture('normal',true);await f.page.goto('http://catalog.test/'+file);
   await f.page.waitForFunction(()=>document.querySelector('#seo-events')?.textContent.includes('fixture'),{},{timeout:5000});
   assert.deepEqual(f.errors,[]);assert.deepEqual(f.consoleErrors,[]);assert.deepEqual(await f.page.evaluate(()=>window.__rejections),[]);
   results.push({case:file,pass:true});await f.context.close();
  }
 }
 if(!ref){
  assert.equal(staleScriptRequests,0,'updated HTML never requests the stale cached URL');
  for(const file of ['index.html','soumettre.html'])assert.match((await read(file)).toString(),/app\.js\?v=calendar-startup-1/);
 }
 assert.equal(writes,0);await fs.writeFile(path.join(output,'results.json'),JSON.stringify({ref:ref||'working-tree',results,writes},null,2));
 console.log('PASS real browser calendar startup:',JSON.stringify(results));
}finally{await browser.close();}
