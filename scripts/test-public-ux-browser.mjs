import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const root = path.resolve(new URL('..', import.meta.url).pathname);
const output = process.env.TEST_OUTPUT || '/tmp/dedicalivres-public-ux';
await fs.mkdir(output, { recursive: true });
const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris'}).format(new Date());
const previous = new Date(Date.parse(today) - 86400000).toISOString().slice(0,10);
const next = new Date(Date.parse(today) + 86400000).toISOString().slice(0,10);
const base = { title:'Rencontre littéraire',type:'Salon',country_code:'FR',region:'Bretagne',city:'Rennes',start_date:today,end_date:today,validated:true,rejected:false,description:'Des livres et des rencontres.',lat:48.11,lng:-1.68 };
let catalog = Array.from({length:6},(_, i)=>({...base,id:String(i+1),title:`Rencontre ${i+1}`}));
catalog.push({...base,id:'7',start_date:previous,end_date:next},{...base,id:'8',start_date:next,end_date:next});
const pages = ['index.html','salons-du-livre.html','dedicaces.html','temoignages.html','widget-partenaires.html','soumettre.html','author-contribute.html','agenda.html'];
const viewports = [{width:360,height:800},{width:390,height:844},{width:768,height:1024},{width:1440,height:900}];
const errors = [];
let blockedWrites = 0;
let widgetFailure = false;
let layouts = 0;
async function fixtureContext(options = {}) {
  const context = await browser.newContext({ reducedMotion:'reduce', ...options });
  await context.addInitScript(() => {
    window.__geoCalls = 0; window.__geoOutcome = 'success';
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success, failure) {
      window.__geoCalls++;
      if (window.__geoOutcome === 'success') success({coords:{latitude:0,longitude:0}});
      else failure({code:window.__geoOutcome === 'refused' ? 1 : 2});
    }}});
    window.supabase = {createClient() { return {from(table) {
      const filters = {}; let single = false;
      const q = { select(){return q},eq(k,v){filters[k]=v;return q},order(){return q},or(){return q},in(){return q},limit(){return q},range(){return q},lte(){return q},gte(){return q},not(){return q},gt(k,v){filters.after=v;return q},maybeSingle(){single=true;return q},
        then(resolve,reject){return fetch('/__fixture?'+new URLSearchParams({table,id:filters.id||'',after:filters.after||'',single})).then(r=>r.json()).then(resolve,reject)} };
      return q;
    },rpc(){return Promise.resolve({data:null,error:null})}}}};
  });
  await context.route('**/*',async route => {
    const request = route.request();
    if (!['GET','HEAD'].includes(request.method())) {blockedWrites++; return route.abort();}
    const url = new URL(request.url());
    if (/leaflet@.*\/leaflet\.js$/.test(url.pathname)) return process.env.LEAFLET_TEST_JS ? route.fulfill({contentType:'application/javascript',body:await fs.readFile(process.env.LEAFLET_TEST_JS)}) : route.abort();
    if (/leaflet@.*\/leaflet\.css$/.test(url.pathname)) return process.env.LEAFLET_TEST_CSS ? route.fulfill({contentType:'text/css',body:await fs.readFile(process.env.LEAFLET_TEST_CSS)}) : route.abort();
    if (url.pathname === '/rest/v1/events') return widgetFailure ? route.fulfill({status:503,json:{error:'fixture unavailable'}}) : route.fulfill({json:catalog});
    if (url.origin !== 'http://local.test') return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:''});
    if (url.pathname === '/__fixture') {
      const rows = url.searchParams.get('table')==='events' ? catalog.filter(e=>(!url.searchParams.get('id')||e.id===url.searchParams.get('id'))&&(!url.searchParams.get('after')||Number(e.id)>Number(url.searchParams.get('after')))) : [];
      return route.fulfill({json:{data:url.searchParams.get('single')==='true'?rows[0]:rows,error:null}});
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if (!file.startsWith(root+path.sep)) return route.abort();
    try {return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});} catch {return route.fulfill({status:404,body:'not found'});}
  });
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  return context;
}
async function layout(page, viewport, file) {
  assert.equal(await page.locator('.public-header nav > *').count(),8,file);
  const geometry=await page.evaluate(()=>{
    const nav=document.querySelector('.public-header nav');
    const buttons=[...nav.children].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
    const img=document.querySelector('.public-header .logo'),box=img.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(nav).gridTemplateColumns.split(' ').length,buttons,logo:{width:box.width,height:box.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}};
  });
  assert.equal(geometry.overflow,false,`${file} overflow at ${viewport.width}`);
  assert.equal(geometry.columns,viewport.width<=680?2:4,`${file} columns`);
  assert(geometry.buttons.every(b=>b.height>=43.9&&b.width>=44),`${file}: touch targets`);
  if(geometry.logo.naturalWidth) assert(Math.abs(geometry.logo.width/geometry.logo.height-geometry.logo.naturalWidth/geometry.logo.naturalHeight)<.05,`${file}: logo ratio`);
  assert.equal(await page.locator('.a11y-showcase,#lud-back-top').count(),0);
  layouts++;
}
try {
  const context=await fixtureContext();const page=await context.newPage();
  for(const viewport of viewports) {
    await page.setViewportSize(viewport);
    for(const file of pages) {
      await page.goto('http://local.test/'+file);
      await page.locator('.a11y-nav-btn:not([disabled])').waitFor();
      await layout(page,viewport,file);
      if(file==='index.html') {
        await page.locator('#current-events-grid .event-card').first().waitFor();
        assert.equal(await page.locator('#current-events-grid .event-card').count(),4);
        assert.equal(await page.locator('#upcoming-preview').getAttribute('open'),null);
        assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-static-event-preview]').length),0); // hydrated without removing the static HTML contract
      }
    }
  }
  for(const viewport of viewports) {
    await page.setViewportSize(viewport);
    for(const file of pages) {
      await page.goto('http://local.test/'+file);
      await page.locator('.a11y-nav-btn:not([disabled])').waitFor();
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.locator('.a11y-nav-btn').click();
      const box=await page.locator('#a11y-menu').boundingBox();
      const header=await page.locator('.public-header').boundingBox();
      assert(box.x>=0&&box.x+box.width<=viewport.width&&box.y>=header.y+header.height-1&&box.y+box.height<=viewport.height,`${file}: comfort placement`);
      for(const mode of ['soir','dyslexie','daltonien']) {
        const control=page.locator(`[data-mode="${mode}"]`);
        if(await control.getAttribute('aria-pressed')==='true') await control.click();
      }
      for(const mode of ['soir','dyslexie','daltonien']) {
        const control=page.locator(`[data-mode="${mode}"]`);
        await control.click();
        await layout(page,viewport,file);
        await control.click();
      }
      for(const mode of ['soir','dyslexie']) await page.locator(`[data-mode="${mode}"]`).click();
      await page.locator('button[data-ambiance="papier"]').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.a11y-nav-btn').getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('.a11y-nav-btn').evaluate(el=>el===document.activeElement),true);
      await layout(page,viewport,file);
      if(file==='author-contribute.html') {
        const contrasts = await page.evaluate(() => {
          function luminance(color) {
            const channels=color.match(/[\d.]+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
            return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
          }
          return ['.author-contribution-progress li','.author-request-options label','input[name="pseudo"]','textarea','.author-submit-button'].map(selector=>{
            const el=document.querySelector(selector);if(!el) throw Error('Missing contrast target '+selector);
            const css=getComputedStyle(el);const a=luminance(css.color);const backgrounds=css.backgroundImage.match(/rgba?\([^)]+\)/g)||[css.backgroundColor];
            return {selector,ratio:Math.min(...backgrounds.map(color=>{const b=luminance(color);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}))};
          });
        });
        assert(contrasts.every(c=>c.ratio>=4.5),JSON.stringify(contrasts));
      }
      if(file==='index.html'||file==='author-contribute.html') await page.screenshot({path:path.join(output,`${file}-${viewport.width}-comfort.png`),fullPage:false});
      if(file==='author-contribute.html'&&(viewport.width===360||viewport.width===1440)) await page.locator('.author-contribution-step').first().screenshot({path:path.join(output,`author-fields-${viewport.width}-comfort.png`)});
      await page.locator('.a11y-nav-btn').click();
      await page.mouse.click(2, 2);
      assert.equal(await page.locator('.a11y-nav-btn').getAttribute('aria-expanded'),'false');
    }
  }
  await page.goto('http://local.test/index.html');
  await page.locator('#current-events-grid .event-card').first().waitFor();
  await page.locator('#current-events-grid [data-favorite-id="1"]').click();
  await page.waitForFunction(()=>document.querySelector('#saved-summary-count').textContent.startsWith('1 favori'));
  await page.locator('#current-events-grid [data-favorite-id="1"]').click();
  await page.waitForFunction(()=>document.querySelector('#saved-summary-count').textContent.startsWith('0 favoris'));
  await page.locator('#discovery-country').selectOption('BE');
  assert((await page.locator('#discovery-region option').count())>1);
  assert.equal(await page.evaluate(()=>window.__geoCalls),0);
  await page.selectOption('.discovery-nearby select','50');
  await page.locator('.discovery-nearby button').click();
  await page.waitForURL('**/agenda.html?autour=1&rayon=50');
  await page.locator('#agenda-widget .w-geo').waitFor();
  assert.equal(await page.evaluate(()=>window.__geoCalls),0);
  await page.locator('#agenda-widget .w-geo').click();
  await page.waitForFunction(()=>document.querySelector('#agenda-widget').shadowRoot.querySelector('.w-geo').textContent.includes('50 km'));
  assert.equal(await page.locator('#agenda-widget .w-item').count(),0,'no out-of-radius fallback');
  catalog.push({...base,id:'9',title:'Near fixture',lat:.05,lng:.05});
  await page.locator('#agenda-widget .w-geo').click();
  await page.waitForFunction(()=>document.querySelector('#agenda-widget').shadowRoot.querySelectorAll('.w-item').length===1);
  assert.match(await page.locator('#agenda-widget .w-item').textContent(),/Near fixture/);
  catalog.pop();
  widgetFailure=true;
  await page.locator('#agenda-widget .w-geo').click();
  await page.waitForFunction(()=>document.querySelector('#agenda-widget').shadowRoot.querySelector('.w-geo').textContent.includes('indisponible'));
  assert.equal(await page.locator('#agenda-widget .w-geo').isEnabled(),true);
  widgetFailure=false;
  for(const outcome of ['refused','unavailable']) {
    await page.evaluate(value=>window.__geoOutcome=value,outcome);
    await page.locator('#agenda-widget .w-geo').click();
    assert.match(await page.locator('#agenda-widget .w-geo').textContent(),outcome==='refused'?/refusée/:/indisponible/);
  }
  assert(await page.locator('#agenda-widget .w').evaluate(el=>el.classList.contains('soir')&&el.classList.contains('dyslexie')));
  await page.goto('http://local.test/widget-partenaires.html');
  await page.locator('#wg-preview .w').waitFor();
  assert(await page.locator('#wg-preview .w').evaluate(el=>el.classList.contains('clair')&&!el.classList.contains('dyslexie')),'partner widget keeps its own configuration');
  await page.goto('http://local.test/index.html#saved-events');
  assert(await page.locator('#saved-events').evaluate(el=>el.open));
  await page.locator('#upcoming-preview > summary').click();
  await page.locator('#events-grid [data-favorite-id="1"]').click();
  await page.locator('#local-save-search').click();
  await page.waitForFunction(()=>document.querySelector('#saved-summary-count').textContent==='1 favori · 1 critère suivi');
  await page.goto('http://local.test/index.html');
  assert(await page.locator('#saved-events').evaluate(el=>el.open));
  await page.locator('#saved-events > summary').click();
  await page.reload();
  assert.equal(await page.locator('#saved-events').evaluate(el=>el.open),false);
  await page.evaluate(()=>location.hash='#local-discoveries');
  await page.waitForFunction(()=>document.querySelector('#saved-events').open);
  await page.goto('http://local.test/salons-du-livre.html');
  await page.locator('#regional-map-app [data-country-code="BE"]').waitFor();
  await page.locator('#regional-map-app').scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>scrollY);
  await page.locator('#regional-map-app [data-country-code="BE"]').click();
  assert(Math.abs(await page.evaluate(()=>scrollY)-before)<2,'country selection keeps reading position');
  assert.equal(new URL(page.url()).hash,'');
  await page.locator('#regional-map-app select').selectOption({index:1});
  assert(Math.abs(await page.evaluate(()=>scrollY)-before)<2,'region selection keeps reading position');
  assert.match(await page.locator('.regional-map-panel-actions .btn-primary').textContent(),/événements trouvés — Voir les résultats/);
  // Exercise the real existing Leaflet dependency when supplied by the local recipe.
  if(process.env.LEAFLET_TEST_JS) {
    await page.goto('http://local.test/index.html');
    await page.locator('#map').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('#map').classList.contains('leaflet-container'));
    assert(await page.locator('.leaflet-marker-icon').count()>0);
    for(const viewport of [viewports[3],viewports[0]]) {
      await page.setViewportSize(viewport);
      await page.locator('#map').scrollIntoViewIfNeeded();
      for(let i=0;i<8;i++) {
        await page.locator('.leaflet-control-zoom-out').evaluate(el=>el.click());
        await page.waitForTimeout(300); // Leaflet finishes its existing zoom animation before the next click.
        if(await page.locator('.leaflet-control-zoom-out').getAttribute('aria-disabled')==='true') break;
      }
      await page.waitForFunction(()=>document.querySelector('.leaflet-control-zoom-out').getAttribute('aria-disabled')==='true');
      assert.equal(await page.locator('.leaflet-control-zoom-in').getAttribute('aria-disabled'),'false');
      await page.locator('.leaflet-control-zoom-in').click();
      await page.waitForFunction(()=>document.querySelector('.leaflet-control-zoom-out').getAttribute('aria-disabled')==='false');
    }
    await page.screenshot({path:path.join(output,'map-desktop.png'),fullPage:false});
  }
  catalog=[];
  await page.goto('http://local.test/index.html');
  await page.waitForFunction(()=>document.querySelector('#current-events-grid').textContent.includes('Aucun événement annoncé'));
  assert.equal(await page.locator('#saved-summary-count').textContent(),'1 favori · 1 critère suivi');
  const nojs=await fixtureContext({javaScriptEnabled:false,viewport:viewports[0]});
  const staticPage=await nojs.newPage();await staticPage.goto('http://local.test/index.html');
  const links=staticPage.locator('#events-grid [data-static-event-preview] a[href]');
  assert((await links.count())>=1,'static canonical links remain without JavaScript');
  assert((await staticPage.locator('[data-static-event-preview]').count())<=12);
  await nojs.close();
  assert.equal(blockedWrites,0,'no production write attempted');
  assert.deepEqual(errors,[]);
  console.log(`PASS public UX browser: ${layouts} layouts, 4 viewports, comfort/keyboard/persistence, saved panels, daily events, strict radius, geography without scrolling, static SEO, no writes. Screenshots: ${output}`);
  await context.close();
} finally {await browser.close();}
