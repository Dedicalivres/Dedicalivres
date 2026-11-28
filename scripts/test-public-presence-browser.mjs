import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = name => fs.readFile(new URL('../'+name, import.meta.url), 'utf8');
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'fr-FR'});
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<style>[hidden]{display:none!important}</style><article id="event-detail" data-event-id="fixture"></article>');
  await page.evaluate(() => {
    window.__writes = [];
    window.__options = null;
    window.DEDICALIVRES_CONFIG = {supabaseUrl:'https://example.test',supabaseAnonKey:'public-key'};
    window.DEDICALIVRES_SUPABASE_CLIENT = {from(){throw new Error('Shared ADMIN client used');}};
    window.getDedicalivresSupabaseClient = () => window.DEDICALIVRES_SUPABASE_CLIENT;
    window.supabase = {createClient(url,key,options){
      window.__options=options;
      return {from(table){
        const q={
          select(){return q},eq(){return q},order(){return q},or(){return q},in(){return q},
          maybeSingle(){return Promise.resolve({data:{id:'fixture',title:'Salon test',validated:true,rejected:false},error:null})},
          then(resolve){resolve({data:[],error:null})},
          insert(rows){window.__writes.push(rows[0]);return Promise.resolve({error:null})}
        };return q;
      }};
    }};
  });
  await page.addScriptTag({content:await source('url-normalizer.js')});
  await page.addScriptTag({content:await source('authors-presence.js')});
  const form=page.locator('#author-presence-form');
  const feedback=page.locator('#author-presence-feedback');
  const send=()=>form.locator('button[type=submit]').click();
  const fillAuthor=async (name,link)=>{
    await form.locator('[name=pseudo]').fill(name);
    await form.locator('[name=author_profile_url]').fill(link);
    await form.locator('[name=legal_accept]').check();
  };
  await form.waitFor();
  assert.equal(await page.evaluate(()=>window.__options.auth.persistSession),false);
  await fillAuthor('Auteur test','www.example.org');
  await send();
  await feedback.waitFor({state:'visible'});
  assert.match(await feedback.textContent(),/bien été envoyée/);
  let rows=await page.evaluate(()=>window.__writes);
  assert.equal(rows.length,1);
  assert.equal(rows[0].author_profile_url,'https://www.example.org');
  assert.equal(rows[0].validated,false);
  await fillAuthor('Auteur test','javascript:alert(1)');
  await send();
  assert.match(await feedback.textContent(),/vérifier le lien auteur/);
  assert.equal(await page.evaluate(()=>window.__writes.length),1);
  await fillAuthor('Auteur test','example.org');
  await form.locator('[name=author_portrait]').setInputFiles({name:'portrait.jpg',mimeType:'image/jpeg',buffer:Buffer.from('test')});
  await send();
  assert.match(await feedback.textContent(),/sans le portrait/);
  rows=await page.evaluate(()=>window.__writes);
  assert.equal(rows.length,2);
  assert.equal(rows[1].author_portrait_url,null);
  await form.locator('[name=participant_type]').selectOption('publisher');
  await form.locator('[name=organization_name]').fill('Éditions test');
  await form.locator('[name=organization_website]').fill('example.org');
  await form.locator('[name=contact_name]').fill('Contact test');
  await form.locator('[name=contact_email]').fill('contact@example.org');
  await form.locator('[name=legal_accept]').check();
  await send();
  rows=await page.evaluate(()=>window.__writes);
  assert.equal(rows.length,3);
  assert.equal(rows[2].participant_type,'publisher');
  assert.equal(rows[2].author_slug,null);
  assert.equal(rows[2].validated,false);
  assert.deepEqual(errors,[]);
  console.log('PASS mobile Chromium: real form submission, URL, optional portrait, publisher; no production traffic.');
} finally { await browser.close(); }
