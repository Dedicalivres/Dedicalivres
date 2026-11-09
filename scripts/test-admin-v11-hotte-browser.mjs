(async function runHotteBrowserSmoke() {
  // Deterministic fixture: no real backend, emails, payment or site requests.
  const fs = await import("node:fs");
  const assert = (await import("node:assert/strict")).default;
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  const js = fs.readFileSync("admin-v11-hotte-tools.js", "utf8");
  const css = fs.readFileSync("admin-v11-hotte-tools.css", "utf8");
  const fixture = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/admin-v11-hotte-tools.css"></head><body>
<div id="v11-partner-widget-panel"><section class="v11-partner-widget-shell">PARTNER-ORIGINAL-INVARIANT</section></div>
<div id="v11-hotte-panel"></div>
<script>window.__adminState={authenticated:false,status:"loading"};window.DEDICALIVRES_ADMIN_CONTEXT={getState(){return window.__adminState;}};</script>
<script src="/admin-v11-hotte-tools.js"></script></body></html>`;

  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
  try {
    for (const width of [1280, 390]) {
      fs.mkdirSync("hotte-browser-evidence", { recursive: true });
    const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const external = [], errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET" || url.origin !== "http://hotte-fixture.test") {
          external.push(url.href);
          return route.abort();
        }
        if (url.pathname === "/admin.html") return route.fulfill({ contentType: "text/html", body: fixture });
        if (url.pathname === "/admin-v11-hotte-tools.js") return route.fulfill({ contentType: "text/javascript", body: js });
        if (url.pathname === "/admin-v11-hotte-tools.css") return route.fulfill({ contentType: "text/css", body: css });
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://hotte-fixture.test/admin.html");
      await page.evaluate(() => window.DEDICALIVRES_V11_HOTTE_TOOLS.openWidgets());
      assert.equal(await page.locator("[data-v11-widget-tab]").count(), 0, "Unauthorized user does not get widget hub");
      await page.evaluate(() => {
        window.__adminState = { authenticated: true, status: "ready" };
        window.DEDICALIVRES_V11_HOTTE_TOOLS.openWidgets();
      });
      assert.equal(await page.locator("[data-v11-widget-tab]").count(), 3);
      assert(await page.locator(".v11-partner-widget-shell").isVisible());
      assert.equal(await page.locator(".v11-partner-widget-shell").innerText(), "PARTNER-ORIGINAL-INVARIANT");
      await page.locator('[data-v11-widget-tab="hotte"]').click();
      assert.equal(await page.locator(".v11-partner-widget-shell").isVisible(), false);
      assert(await page.locator("#v11-hotte-float-expanded").isVisible());
      await page.screenshot({ path: "hotte-browser-evidence/widget-expanded-" + width + ".png", fullPage: true });
      await page.locator("#v11-hotte-minimize").click();
      assert(await page.locator("#v11-hotte-expand").isVisible());
      assert.equal(await page.locator("#v11-hotte-float-expanded").isVisible(), false);
      await page.locator("#v11-hotte-expand").click();
      assert(await page.locator("#v11-hotte-float-expanded").isVisible());
      await page.locator('[data-v11-widget-tab="helloasso"]').click();
      assert(await page.locator("#v11-widget-helloasso").isVisible());
      assert((await page.locator("#v11-widget-helloasso").innerText()).includes("Aucun paiement"));
      await page.locator('[data-v11-widget-tab="agenda"]').click();
      assert(await page.locator(".v11-partner-widget-shell").isVisible());
      await page.evaluate(() => window.DEDICALIVRES_V11_HOTTE_TOOLS.openHotte());
      assert.equal((await page.locator("#v11-hotte-total-lots").innerText()).trim(), "4");
      await page.screenshot({ path: "hotte-browser-evidence/gestion-" + width + ".png", fullPage: true });
      assert.equal((await page.locator("#v11-hotte-accepted-lots").innerText()).trim(), "3");
      assert((await page.locator("#v11-hotte-total-value").innerText()).includes("60,30"));
      await page.locator('#v11-hotte-lot-form [name="title"]').fill("Nouveau livre fictif");
      await page.locator('#v11-hotte-lot-form [name="author"]').fill("Auteure fictive");
      await page.locator('#v11-hotte-lot-form [name="price"]').fill("15.50");
      await page.locator('#v11-hotte-lot-form button[type="submit"]').click();
      assert.equal((await page.locator("#v11-hotte-total-lots").innerText()).trim(), "5");
      assert.equal((await page.locator("#v11-hotte-accepted-lots").innerText()).trim(), "3");
      await page.locator("#v11-hotte-reset").click();
      assert.equal((await page.locator("#v11-hotte-total-lots").innerText()).trim(), "4");
      await page.locator('[data-v11-hotte-tab="visiteur"]').click();
      const frame = page.locator("#v11-hotte-visitor-iframe");
      assert.equal(await frame.getAttribute("sandbox"), "allow-scripts");
      assert((await frame.getAttribute("src")).startsWith("https://dedicalivres-hotte-he08-demonstration-"));
      assert(await page.locator("#v11-hotte-visiteur").isVisible());
      assert.equal(errors.length, 0, "No browser JS errors: " + errors.join("; "));
      assert(external.every(url => url.startsWith("https://dedicalivres-hotte-he08-demonstration-")),
        "No production, payment or third-party network requests");
      console.log("PASS isolated Hotte/Widgets browser " + width);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
