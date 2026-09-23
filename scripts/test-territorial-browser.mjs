import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const audit=JSON.parse(await fs.readFile('docs/territoires/audit.json','utf8'));
const out=process.env.TEST_OUTPUT||'../../outputs';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const javaScriptEnabled of [false,true])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({javaScriptEnabled,viewport});
  // Prevent analytics/third-party requests during local verification.
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await context.newPage();
  for(const p of audit.pilots){
   await page.goto('http://127.0.0.1:8765/'+p.file);
   assert.equal(await page.locator('[data-event-id]').count(),p.total);
   assert.equal(Number(await page.locator('[data-count="total"]').textContent()),p.total);
   assert.equal(await page.locator('#a-venir [data-event-id]').count(),p.upcoming);
   assert.equal(await page.locator('#archives [data-event-id]').count(),p.past);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(overflow,false,`${p.label} horizontal overflow ${viewport.width}`);
   assert(await page.locator('h1').isVisible());
   if(!javaScriptEnabled)await page.screenshot({path:`${out}/${p.id}-${viewport.width}.png`,fullPage:false});
   await page.locator('a[href="#archives"]').click();
   await page.locator('#archive-title').evaluate(el=>el.scrollIntoView({behavior:'instant'}));
   await page.waitForFunction(()=>{const y=document.getElementById('archive-title').getBoundingClientRect().top;return y>=-1&&y<innerHeight});
   const archiveBox=await page.locator('#archive-title').boundingBox();
   assert(archiveBox.y>=-1 && archiveBox.y<viewport.height);
   if(!javaScriptEnabled)await page.screenshot({path:`${out}/${p.id}-${viewport.width}-archives.png`});
   const href=await page.locator('[data-event-id] a').first().getAttribute('href');
   const id=new URL(href,'http://local/').searchParams.get('id');
   assert(p.ids.includes(id));
   results.push({territory:p.id,width:viewport.width,javaScriptEnabled,events:p.total,overflow});
  }
  await context.close();
 }
 // Exercise the existing detail page with the captured public record, offline.
 const catalog=JSON.parse(await fs.readFile('docs/territoires/catalogue-public.json','utf8')).events;
 const event=catalog.find(e=>e.id==='5f2f72d0-7f33-4f9f-b0f2-2e222dc919d0');
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(event=>{
  window.supabase={createClient(){return {from(table){
   let single=false;
   const q={select(){return q},eq(){return q},order(){return q},or(){return q},in(){return q},limit(){return q},maybeSingle(){single=true;return q},
    then(resolve){return Promise.resolve({data:table==='events'?(single?event:[event]):[],error:null}).then(resolve)}};
   return q;
  },rpc(){return Promise.resolve({data:null,error:null})}}}};
 },event);
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const detail=await context.newPage();
 await detail.goto('http://127.0.0.1:8765/evenements-litteraires-wallonie.html');
 await detail.locator(`[data-event-id="${event.id}"] h3 a`).click();
 await detail.locator('#detail-favorite-btn').waitFor();
 assert((await detail.locator('#event-detail').textContent()).includes(event.title));
 await detail.locator('#detail-favorite-btn').click();
 assert.equal(await detail.locator('#detail-favorite-btn').getAttribute('aria-pressed'),'true');
 await detail.reload();
 assert.equal(await detail.locator('#detail-favorite-btn').getAttribute('aria-pressed'),'true');
 const download=detail.waitForEvent('download');
 await detail.locator('#detail-calendar-btn').click();
 const file=await download;
 const ics=await fs.readFile(await file.path(),'utf8');
 assert(ics.includes(`UID:${event.id}@dedicalivres.fr`));
 assert(ics.includes('DTSTART;VALUE=DATE:20261010'));
 assert(ics.includes('DTEND;VALUE=DATE:20261012'));
 results.push({detail:'existing event.html',fixture:event.id,favoritesReload:true,icsStart:'20261010',icsExclusiveEnd:'20261012',remoteWrites:0});
 await context.close();
 await fs.writeFile(`${out}/recette-navigateur.json`,JSON.stringify(results,null,2));
 console.log('PASS navigateur : 2 pilotes × desktop/mobile × JavaScript activé/désactivé; compteurs, ancres, liens, aucun débordement');
}finally{await browser.close();}
