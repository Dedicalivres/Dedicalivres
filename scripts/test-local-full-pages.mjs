import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const browser = await playwright[engine].launch({ headless: true });
const root = path.resolve(new URL('..', import.meta.url).pathname);
const output = path.resolve(process.env.TEST_OUTPUT || '/tmp/dedicalivres-local-recipe');
await fs.mkdir(output, { recursive: true });
const base = { id: '1', title: 'Salon des livres de Bretagne', type: 'Salon', country_code: 'FR', region: 'Bretagne', city: 'Rennes', start_date: '2030-10-10', end_date: '2030-10-11', validated: true, rejected: false, description: 'Une rencontre littéraire de démonstration.', lat: null, lng: null };
let catalog = [base];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  await context.addInitScript(() => {
    window.__writes = [];
    window.supabase = { createClient() { return {
      from(table) {
        const filters = {}; let single = false; let write = false;
        const query = {
          select() { return query; }, eq(k,v) { filters[k] = v; return query; },
          order() { return query; }, or() { return query; }, in() { return query; }, limit() { return query; }, range() { return query; },
          lte() { return query; }, gte() { return query; }, not() { return query; },
          gt(k,v) { filters.after = v; return query; },
          maybeSingle() { single = true; return query; },
          insert(payload) { window.__writes.push({ table, payload }); write = true; return query; },
          then(resolve, reject) { return fetch('/__fixture?' + new URLSearchParams({ table, id: filters.id || '', after: filters.after || '', single, write })).then(r => r.json()).then(resolve,reject); }
        }; return query;
      }, rpc() { return Promise.resolve({ data: true, error: null }); }
    }; } };
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    // No production request is allowed out, including tracking or uploads.
    if (url.pathname.endsWith('/leaflet.js')) return route.abort();
    if (url.origin !== 'http://local.test') return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' });
    if (url.pathname === '/__fixture') {
      const rows = url.searchParams.get('table') === 'events' ? catalog.filter(e => (!url.searchParams.get('id') || e.id === url.searchParams.get('id')) && (!url.searchParams.get('after') || Number(e.id) > Number(url.searchParams.get('after')))) : [];
      return route.fulfill({ json: { data: url.searchParams.get('write') === 'true' ? null : url.searchParams.get('single') === 'true' ? rows[0] : rows, error: null } });
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) return route.abort();
    try {
      const body = await fs.readFile(file);
      const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType: type, body });
    } catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  const home = await context.newPage();
  await home.goto('http://local.test/index.html');
  await home.locator('#events-grid [data-favorite-id="1"]').waitFor();
  await home.selectOption('#country-filter', 'FR');
  await home.selectOption('#region-filter', 'Bretagne');
  await home.selectOption('#type-filter', 'Salon');
  await home.click('#local-save-search');
  assert.equal(await home.locator('#local-rules li').count(), 1);
  const before = await home.evaluate(() => window.__writes.length);
  await home.locator('#events-grid [data-favorite-id="1"]').click();
  assert.equal(await home.evaluate(() => window.__writes.length), before);
  const detail = await context.newPage();
  await detail.goto('http://local.test/event.html?id=1');
  await detail.locator('.local-author-draft').waitFor();
  assert.equal(await detail.locator('#detail-favorite-btn').getAttribute('aria-pressed'), 'true');
  await home.click('#clear-favorites');
  await detail.waitForFunction(() => document.querySelector('#detail-favorite-btn')?.getAttribute('aria-pressed') === 'false');
  await detail.selectOption('[name=participant_type]', 'publisher');
  await detail.locator('.local-author-draft input').check();
  await detail.fill('[name=organization_name]', 'Éditions Démonstration');
  await detail.fill('[name=contact_email]', 'test@example.test');
  await detail.reload();
  await detail.locator('.local-author-draft').waitFor();
  assert.equal(await detail.locator('[name=participant_type]').inputValue(), 'publisher');
  assert.equal(await detail.locator('[name=organization_name]').inputValue(), 'Éditions Démonstration');
  assert.equal(await detail.locator('[name=contact_email]').inputValue(), 'test@example.test');
  assert.equal(await detail.locator('#publisher-presence-fields').isVisible(), true);
  assert.equal(await detail.locator('[name=legal_accept]').isChecked(), false);
  catalog = [base, { ...base, id: '2', title: 'Nouvelle rencontre littéraire à Rennes' }, { ...base, id: '3', country_code: 'BE' }];
  await home.reload();
  await home.locator('#local-results a').waitFor();
  assert.equal(await home.locator('#local-results a').count(), 1);
  await home.locator('#saved-events').scrollIntoViewIfNeeded();
  await home.locator('#saved-events').screenshot({ path: path.join(output, engine + '-favoris-mobile.png') });
  await home.setViewportSize({ width: 1365, height: 1000 });
  await home.locator('#saved-events').screenshot({ path: path.join(output, engine + '-favoris-desktop.png') });
  await home.click('#local-seen');
  await home.reload();
  await home.waitForFunction(() => document.querySelector('#local-count')?.textContent === 'Vous êtes à jour');
  await home.locator('#local-discoveries summary').click();
  home.on('dialog', d => d.accept());
  await home.click('#local-clear');
  await detail.waitForFunction(() => document.querySelector('.local-author-draft input')?.checked === false);
  await detail.fill('[name=organization_name]', 'Saisie après effacement');
  assert.equal(await detail.evaluate(() => localStorage.getItem('dedicalivres_author_draft_v1_author-presence-form')), null);
  const submit = await context.newPage();
  await submit.goto('http://local.test/soumettre.html');
  await submit.locator('.local-author-draft').waitFor();
  await submit.selectOption('#event-type-submit', 'Dédicace');
  await submit.locator('.local-author-draft input').check();
  await submit.fill('[name=author_pseudo]', 'Auteur de démonstration');
  await submit.reload();
  await submit.locator('.local-author-draft').waitFor();
  assert.equal(await submit.locator('[name=author_pseudo]').inputValue(), 'Auteur de démonstration');
  assert.equal(await submit.locator('[name=legal_accept]').isChecked(), false);
  await submit.locator('.local-author-draft').screenshot({ path: path.join(output, engine + '-auteur.png') });
  assert.deepEqual(errors, []);
  console.log('PASS ' + engine + ': full pages/CSS, legacy favorites, multi-tab delete, new visit, acknowledgement, real publisher/author restoration, consent excluded. Screenshots: ' + output);
} finally { await browser.close(); }
