// Chromium UI regression with an isolated context mock; no production request.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const css = await fs.readFile(new URL("../admin-v11.css", import.meta.url), "utf8");
const shell = await fs.readFile(new URL("../admin-shell.js", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
try {
  for (const name of ["admin.html", "admin-v11.html"]) {
    let html = await fs.readFile(new URL(`../${name}`, import.meta.url), "utf8");
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<link\b[^>]*>/gi, "")
      .replace("</head>", `<style>${css}</style></head>`)
      .replace("</body>", '<script src="/admin-shell.js"></script></body>');
    for (const width of [320, 390, 430, 760, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(() => {
        const emptyMetrics = { eventsTotal: null, eventsPending: null, eventsValidated: null,
          eventsRejected: null, eventsActive: null, qualityMissingImage: null,
          qualityMissingCoords: null, qualityMissingWebsite: null, qualitySoon: null,
          qualityFeaturedPast: null, visitsToday: null, visits7d: null, visits30d: null,
          visitsTotal: null, visitsStatus: "Chargement du trafic" };
        let state = { status: "unauthenticated", authenticated: false, session: null,
          events: [], metrics: emptyMetrics, community: { presences: [], authors: [], testimonials: [] },
          communityMetrics: {}, trafficDetails: { topPages: [], topReferrers: [] } };
        const listeners = [];
        const publish = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn(state)); return state; };
        window.__calls = { signOut: Number(sessionStorage.getItem("signOutCount") || 0) };
        window.DEDICALIVRES_ADMIN_CONTEXT = {
          getState: () => state,
          getClient: () => null,
          subscribe(fn) { listeners.push(fn); fn(state); },
          restoreSession: async () => state,
          refresh: async () => state,
          signIn: async email => publish(email.startsWith("admin")
            ? { status: "ready", authenticated: true, session: { user: { id: "admin" } } }
            : { status: "forbidden", authenticated: false, session: { user: { id: "reader" } } }),
          signOut: async () => {
            window.__calls.signOut++;
            sessionStorage.setItem("signOutCount", String(window.__calls.signOut));
            return publish({ status: "unauthenticated", authenticated: false, session: null });
          }
        };
      });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.pathname === `/${name}`) return route.fulfill({ contentType: "text/html", body: html });
        if (url.pathname === "/admin-shell.js") return route.fulfill({ contentType: "text/javascript", body: shell });
        return route.abort();
      });
      await page.goto(`http://isolated.test/${name}`);
      assert.equal(await page.locator("#v11-auth-gate").isVisible(), true);
      assert.equal(await page.locator(".v11-app").isVisible(), false);
      await page.locator("#v11-email").fill("reader@example.test");
      await page.locator("#v11-password").fill("local-test");
      await page.locator("#v11-login-form button[type=submit]").click();
      await page.locator("#v11-auth-title").getByText("Accès refusé").waitFor();
      assert.equal(await page.locator(".v11-app").isVisible(), false);
      assert.equal(await page.locator("#v11-denied-logout").isVisible(), true);
      await page.locator("#v11-denied-logout").click();
      await page.waitForFunction(() => sessionStorage.getItem("signOutCount") === "1" &&
        document.querySelector("#v11-email")?.offsetParent !== null);
      await page.locator("#v11-email").fill("admin@example.test");
      await page.locator("#v11-password").fill("local-test");
      await page.locator("#v11-login-form button[type=submit]").click();
      await page.waitForFunction(() => document.body.classList.contains("v11-is-authorized"));
      for (const selector of ["#v11-refresh", "#v11-logout"]) {
        const button = page.locator(selector);
        assert.equal(await button.isVisible(), true, `${name} ${width} ${selector}`);
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${name} ${width} ${selector} target`);
        await button.focus();
        assert.equal(await button.evaluate(el => document.activeElement === el), true);
      }
      assert.equal(await page.locator("#v11-logout").getAttribute("aria-label"), "Déconnexion");
      const overlap = await page.evaluate(() => {
        const selectors = ["#v11-refresh", "#v11-logout", ".v11-profile"];
        const rects = selectors.map(selector => document.querySelector(selector).getBoundingClientRect());
        return rects.some((a, i) => rects.slice(i + 1).some(b =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
      });
      assert.equal(overlap, false, `${name} ${width} topbar overlap`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
        `${name} ${width} horizontal overflow`);
      await page.evaluate(() => { document.getElementById("v11-events-list").textContent = "private-marker"; });
      await page.locator("#v11-logout").click();
      await page.waitForFunction(() => sessionStorage.getItem("signOutCount") === "2" &&
        document.querySelector("#v11-email")?.offsetParent !== null);
      assert.equal(await page.locator("body").textContent().then(text => text.includes("private-marker")), false);
      assert.deepEqual(errors, [], `${name} ${width} page errors`);
      await page.close();
      console.log(`PASS mock Chromium ${name} ${width}px: gate, denial, 44px controls, signOut`);
    }
  }
} finally {
  await browser.close();
}
