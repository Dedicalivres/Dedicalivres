import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const output = process.env.TEST_OUTPUT || '/tmp/dedicalivres-nfc-visual-recipe';
await fs.mkdir(output, {recursive:true});
const browser = await playwright[engine].launch({headless:true});
try {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const errors = [];
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'nfc.test') return route.fulfill({body:''});
    if (url.pathname === '/config.js') return route.fulfill({body:''});
    const file = path.resolve(root, '.' + (url.pathname === '/nfc/' ? '/nfc/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) return route.abort();
    try {
      await route.fulfill({body:await fs.readFile(file), contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(file)] || 'application/octet-stream'});
    } catch { await route.fulfill({status:404,body:'absent'}); }
  });
  const page = await context.newPage();
  await page.goto('http://nfc.test/nfc/?t=EXAMPLE01');
  await page.waitForSelector('.visual-scroll');
  await page.waitForFunction(() => [...document.querySelectorAll('.scene-art img')].every(i => i.complete && i.naturalWidth));
  assert.equal(await page.locator('.scene-art img').count(),5);
  assert.equal(await page.locator('[data-scene]').count(),5);
  assert.ok(await page.locator('[data-scene]').evaluateAll(scenes => scenes.every(s => getComputedStyle(s).backgroundImage === 'none' && getComputedStyle(s).backgroundColor === 'rgba(0, 0, 0, 0)')), 'scene backgrounds must not hide the crossfade');
  await page.screenshot({path:path.join(output,engine+'-contact.png')});
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const scenes = [...document.querySelectorAll('[data-scene]')];
    window.scrollTo(0,scenes[1].offsetTop * .775);
  });
  await page.waitForFunction(() => {
    const frames = [...document.querySelectorAll('.passage-visuals .scene-art')];
    return frames.slice(0,2).every(f => +f.style.opacity > .35 && +f.style.opacity < .65);
  });
  await page.screenshot({path:path.join(output,engine+'-fondu.png')});
  assert.ok(await page.locator('.scene-art img').evaluateAll(images => images.every(i => getComputedStyle(i).objectFit === 'contain')));
  for (const size of [{width:320,height:568},{width:844,height:390},{width:1440,height:900}]) {
    await page.setViewportSize(size);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-intent="organizer"]').click();
  assert.equal(await page.locator('[data-enter-site]').getAttribute('href'),'/soumettre.html');
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dedicalivres_nfc_context_v2')).intent),'organizer');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => +document.querySelector('.passage-visuals .scene-art:last-child').style.opacity === 1);
  assert.equal(await page.locator('.secondary-link').evaluate(link => getComputedStyle(link).color), 'rgb(224, 214, 229)', 'agenda link stays legible on dark background');
  await page.screenshot({path:path.join(output,engine+'-passage.png')});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => !document.documentElement.classList.contains('visual-scroll'));
  assert.equal(await page.locator('[data-scene] > .scene-art').count(),5);
  assert.ok(await page.locator('.scene-art').evaluateAll(frames => frames.every(f => getComputedStyle(f).transform === 'none')));
  await page.reload();
  assert.equal(await page.locator('.passage-visuals').count(),0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForSelector('.visual-scroll');
  assert.deepEqual(errors,[]);
  // Missing first image must keep the static, usable document.
  await page.route('**/contact.webp', route => route.abort());
  await page.reload();
  assert.equal(await page.locator('.passage-visuals').count(),0);
  assert.equal(await page.locator('[data-enter-site]').count(),1);
  await context.close();
  const staticPage = await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
  await staticPage.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'nfc.test') return route.abort();
    try {await route.fulfill({body:await fs.readFile(path.join(root,url.pathname === '/nfc/' ? 'nfc/index.html' : url.pathname.slice(1))),contentType:url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.webp')?'image/webp':'text/html'});} catch {await route.abort();}
  });
  await staticPage.goto('http://nfc.test/nfc/');
  assert.equal(await staticPage.locator('[data-scene] > .scene-art').count(),5);
  assert.ok(await staticPage.locator('.no-script').isVisible());
  console.log(`PASS ${engine}: 5 images, crossfade, contain, responsive, intent/storage, reduced motion, failed image, no JS`);
} finally {await browser.close();}
