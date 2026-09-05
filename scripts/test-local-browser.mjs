import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  await page.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await page.goto('http://local.test/');
  await page.addScriptTag({ path: new URL('../local-preferences.js', import.meta.url).pathname });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dedicalivres:catalog-loaded', { detail: [{ id: 1, title: 'Déjà connu' }] })));
  await page.click('#local-save-search');
  assert.equal(await page.locator('#local-rules li').count(), 1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dedicalivres:catalog-loaded', { detail: [{ id: 1 }, { id: 2, title: '<img src=x onerror=alert(1)>' }] })));
  assert.equal(await page.locator('#local-results a').count(), 1);
  assert.equal(await page.locator('#local-results img').count(), 0);
  await page.click('#local-seen');
  assert.equal(await page.locator('#local-results a').count(), 0);
  await page.evaluate(() => {
    const form = document.createElement('form'); form.id = 'author-presence-form';
    form.innerHTML = '<input name="pseudo"><input name="legal_accept" type="checkbox"><input name="author_portrait" type="file">'; document.body.append(form);
  });
  await page.addScriptTag({ path: new URL('../author-local-draft.js', import.meta.url).pathname });
  await page.locator('#author-presence-form fieldset input').check();
  await page.locator('[name=pseudo]').fill('Auteur test');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('dedicalivres_author_draft_v1_author-presence-form')));
  assert.equal(draft.fields.pseudo, 'Auteur test');
  assert.equal(draft.fields.legal_accept, undefined);
  assert.equal(draft.fields.author_portrait, undefined);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#local-discoveries summary').click();
  await page.click('#local-clear');
  assert.equal(await page.evaluate(() => localStorage.getItem('dedicalivres_author_draft_v1_author-presence-form')), null);
  assert.deepEqual(errors, []);
  console.log('PASS Chromium mobile: criteria, escaped content, acknowledgement, author opt-in, exclusions, deletion, no JS errors');
} finally { await browser.close(); }
