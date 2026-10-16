// Real Chromium, isolated read-only RPC mocks. No Supabase URL or key is used.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const script = await fs.readFile(new URL("../admin-canary-direct.js", import.meta.url), "utf8");
const css = await fs.readFile(new URL("../admin-v11.css", import.meta.url), "utf8");
const reference = "evidence:123456781234423489ab123456789abc";
const event = { id: "11111111-1111-4111-8111-111111111111", title: "Salon", city: "Lille",
  region: "Hauts-de-France", country_code: "FR", description: "Salle des fêtes",
  website: null, start_date: "2026-11-01", end_date: null, lat: null, lng: null };
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
try {
  for (const name of ["admin.html", "admin-v11.html"]) {
    let html = await fs.readFile(new URL(`../${name}`, import.meta.url), "utf8");
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<link\b[^>]*>/gi, "")
      .replace("</head>", `<style>${css}</style></head>`)
      .replace("</body>", '<script src="/admin-canary-direct.js"></script></body>');
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ event, reference }) => {
      window.__calls = [];
      window.__event = event;
      const data = {
        get_event_provenance: [{ observed_channel: "DIRECT_FORM", declared_origin: "DIRECT_AUTHOR",
          attested_origin: "DIRECT_ORGANIZER", attestation_state: "ATTESTED", proof_type: "DIRECT_VERIFIED" }],
        get_latest_direct_publication_canary_reference: [{ proof_id: 17,
          dossier_reference: reference, dossier_state: "VERIFIED" }],
        get_publication_canary_evidence: [{ proof_status: "valid", proof_count: 1 }],
        get_direct_publication_canary_dossier: [{ event_id: event.id,
          submission_event_id: event.id, dossier_state: "VERIFIED",
          attested_origin: "DIRECT_ORGANIZER", identity_method: "OFFICIAL_PHONE",
          independent_source_reference: "Independent source",
          verification_record: "Independent human review of the event and role" }]
      };
      window.DEDICALIVRES_ADMIN_V11_BRIDGE = {
        isAuthenticated: () => true,
        getClient: () => ({ rpc: async name => {
          window.__calls.push(name);
          if (!Object.hasOwn(data, name)) throw new Error(`Unexpected write: ${name}`);
          return { data: data[name], error: null };
        } })
      };
    }, { event, reference });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.pathname === `/${name}`) return route.fulfill({ contentType: "text/html", body: html });
      if (url.pathname === "/admin-canary-direct.js")
        return route.fulfill({ contentType: "text/javascript", body: script });
      return route.abort();
    });
    await page.goto(`http://isolated.test/${name}`);
    async function inspect() {
      await page.evaluate(selected => window.dispatchEvent(new CustomEvent(
        "dedicalivres:admin-event-detail", { detail: { event: selected } })), event);
      await page.waitForFunction(() => document.getElementById("v11-canary-direct-latest")
        ?.textContent.includes("Identifiant 17"));
      // The full Admin shell is deliberately not booted; its tab stays hidden.
      await page.evaluate(() => {
        const select = document.getElementById("v11-canary-proof-mode");
        select.value = "direct";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      assert.equal(await page.locator("#v11-canary-direct-record-proof").isDisabled(), true);
      assert.equal(await page.locator("#v11-canary-direct-reference").inputValue(), reference);
      assert.equal(await page.evaluate(() => window.__calls.some(name =>
        name === "record_direct_publication_canary_evidence_checked")), false);
    }
    await inspect();
    await page.reload(); // New JavaScript context, no remembered in-memory uncertainty.
    await inspect();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS Chromium 390x844 ${name}: server proof blocks replay after reload (read-only mocks)`);
  }
} finally {
  await browser.close();
}
