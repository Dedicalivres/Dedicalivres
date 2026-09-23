import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {territories,renderTerritory} from './territorial-render.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const registry=JSON.parse(await fs.readFile('docs/territoires/referentiel.json'));
const snapshot=JSON.parse(await fs.readFile('docs/territoires/catalogue-public.json'));
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8766';
const browser=await chromium.launch();const proof=[];
try{for(const width of [1440,390])for(const javaScriptEnabled of [false,true]){
 const context=await browser.newContext({viewport:{width,height:1000},javaScriptEnabled});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/rest/v1/events'){const cursor=u.searchParams.get('id')?.slice(3);return route.fulfill({json:snapshot.events.filter(e=>!cursor||e.id>cursor).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,500)});}return ['127.0.0.1','pub-45a59368068e48578d3b1a1bb519c543.r2.dev'].includes(u.hostname)?route.continue():route.abort();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const id of ['FR-BRE','BE-WAL','CH-local-24']){
 const p=territories.find(p=>p.id===id);
 await page.goto(base+'/index.html');await page.locator(`#territoires-pilotes a[href="${p.countryUrl}"]`).click();
 await page.locator(`.territory-navigation a[href="${p.file}"]`).click();
 if(javaScriptEnabled)await page.waitForFunction(()=>document.querySelector('#territory-refresh-status')?.textContent==='Catalogue public actualisé.');
 await page.locator('.territory-banner').evaluate(img=>img.decode());
 assert.equal(await page.locator('[data-event-id]').count(),snapshot.events.filter(e=>e.country_code===p.code&&e.region===p.label).length);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.locator('.territory-navigation a[href="index.html#agenda"]').count(),1);
 assert.equal(await page.locator('.territory-navigation a[href="'+p.countryUrl+'"]').count(),1);
 assert.match(await page.locator('[data-event-id] h3 a').first().getAttribute('href'),/^event.html\?id=/);
 if(javaScriptEnabled)await page.screenshot({path:`../../outputs/generalisation-${p.id}-${width}.png`});
 await page.locator('.territory-navigation a[href="'+p.countryUrl+'"]').click();assert(page.url().endsWith(p.countryUrl));
 proof.push({id,width,javaScriptEnabled,passed:true});
 }assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();}
// Unknown geography must remain visible on country pages, and image fallback must never emit a broken image.
const france=territories.find(p=>p.id==='FR');const rendered=renderTerritory({p:france,events:snapshot.events,registry,capturedAt:snapshot.capturedAt});assert.equal(rendered.stats.total,snapshot.events.filter(e=>e.country_code==='FR').length);assert(!rendered.main.includes('src="undefined"'));
await fs.writeFile('../../outputs/generalisation-recette.json',JSON.stringify(proof,null,2));console.log('PASS 3 territoires × mobile/desktop × JS/sans JS : R2, navigation, annonces, aucun débordement ni erreur JS');
