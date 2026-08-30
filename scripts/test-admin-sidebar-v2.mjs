import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = fs.readFileSync("admin.html", "utf8");
const css = fs.readFileSync("admin-cockpit.css", "utf8");
const source = fs.readFileSync("admin.js", "utf8");

const expectedTabs = [
  "overview",
  "events",
  "moderation",
  "quality",
  "stats",
  "premium",
  "exports",
  "watch",
  "social",
  "settings"
];
assert.ok(html.includes("admin-cockpit.css?v=2.4-sidebar-v2"));
assert.ok(html.includes("admin.js?v=sidebar-v2"));
const tabMatches = [...html.matchAll(/<button class="admin-tab(?: active)?" data-tab="([^"]+)"[^>]*>/g)];
assert.deepEqual(tabMatches.map((match) => match[1]), expectedTabs, "Les dix data-tab doivent rester intacts et ordonnés");
for (const tab of expectedTabs) {
  const tag = tabMatches.find((match) => match[1] === tab)?.[0] || "";
  assert.ok(tag.includes(`aria-controls="tab-${tab}"`), `aria-controls absent pour ${tab}`);
  assert.ok(tag.includes("aria-label="), `Nom accessible absent pour ${tab}`);
  assert.ok(tag.includes("title="), `Tooltip compact absent pour ${tab}`);
  assert.ok(html.includes(`id="tab-${tab}"`), `Panneau tab-${tab} absent`);
}
assert.equal((html.match(/aria-current="page"/g) || []).length, 1, "Un seul onglet initial doit être courant");
for (const group of ["Pilotage", "Analyse / services", "Système"]) {
  assert.ok(html.includes(`>${group}</span>`), `Groupe de navigation absent : ${group}`);
}
assert.match(html, /id="admin-sidebar-toggle"[\s\S]*aria-expanded="true"/);

// Navigation : un clic conserve un seul bouton et un seul panneau actifs.
const activateStart = source.indexOf("function activateAdminTab(");
const activateEnd = source.indexOf("function bindTabs(", activateStart);
assert.ok(activateStart >= 0 && activateEnd > activateStart);
const activateSource = source.slice(activateStart, activateEnd);

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    toggle(name, force) {
      if (force) values.add(name);
      else values.delete(name);
    },
    contains(name) { return values.has(name); }
  };
}

function createNode({ tab = "", active = false } = {}) {
  const attributes = new Map();
  return {
    dataset: tab ? { tab } : {},
    classList: createClassList(active ? ["active"] : []),
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };
}

const buttons = expectedTabs.map((tab, index) => createNode({ tab, active: index === 0 }));
const panels = expectedTabs.map((tab, index) => ({
  id: `tab-${tab}`,
  classList: createClassList(index === 0 ? ["active"] : [])
}));
const activateSandbox = {
  document: {
    getElementById(id) { return panels.find((panel) => panel.id === id) || null; },
    querySelectorAll(selector) { return selector === ".admin-tab" ? buttons : panels; }
  },
  map: null,
  setTimeout,
  loadAdminExportsDashboard() {},
  loadAdminEventsInventory() {}
};
vm.runInNewContext(`${activateSource}; globalThis.activate = activateAdminTab;`, activateSandbox);
buttons.forEach((button, index) => {
  assert.equal(activateSandbox.activate(button), true);
  assert.equal(buttons.filter((item) => item.classList.contains("active")).length, 1);
  assert.equal(button.getAttribute("aria-current"), "page");
  assert.equal(panels.filter((panel) => panel.classList.contains("active")).length, 1);
  assert.equal(panels[index].classList.contains("active"), true);
});

// Repli : classes, aria-expanded et préférence locale restent synchronisés.
const sidebarStart = source.indexOf("function readAdminSidebarState(");
const sidebarEnd = source.indexOf("function bindMobileSwipeTabs(", sidebarStart);
assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart);
const sidebarSource = source.slice(sidebarStart, sidebarEnd);
const stored = new Map();
const dashboard = { classList: createClassList() };
const sidebar = { dataset: {} };
const icon = { textContent: "" };
const toggleAttributes = new Map();
const toggle = {
  title: "",
  setAttribute(name, value) { toggleAttributes.set(name, String(value)); },
  querySelector() { return icon; },
  addEventListener() {}
};
const sidebarSandbox = {
  ADMIN_SIDEBAR_STATE_KEY: "dedicalivres_admin_sidebar_v2",
  dashboard,
  localStorage: {
    getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { stored.set(key, String(value)); }
  },
  document: {
    querySelector() { return sidebar; },
    getElementById() { return toggle; }
  },
  window: {
    matchMedia() { return { matches: true, addEventListener() {} }; }
  }
};
vm.runInNewContext(`${sidebarSource}; globalThis.apply = applyAdminSidebarState;`, sidebarSandbox);
sidebarSandbox.apply(true, { persist: true });
assert.equal(dashboard.classList.contains("admin-sidebar-collapsed"), true);
assert.equal(dashboard.classList.contains("admin-sidebar-expanded"), false);
assert.equal(toggleAttributes.get("aria-expanded"), "false");
assert.equal(stored.get("dedicalivres_admin_sidebar_v2"), "collapsed");
sidebarSandbox.apply(false, { persist: true });
assert.equal(dashboard.classList.contains("admin-sidebar-expanded"), true);
assert.equal(toggleAttributes.get("aria-expanded"), "true");
assert.equal(stored.get("dedicalivres_admin_sidebar_v2"), "expanded");

for (const fragment of [
  "@media (min-width: 681px)",
  "grid-template-columns: 236px minmax(0, 1fr)",
  "grid-template-columns: 76px minmax(0, 1fr)",
  "@media (min-width: 681px) and (max-width: 1180px)",
  "@media (max-width: 680px)",
  "overflow-x: auto",
  "scroll-snap-type: x proximity",
  ".admin-tab:focus-visible",
  "@media (prefers-reduced-motion: reduce)"
]) {
  assert.ok(css.includes(fragment), `Règle responsive/accessibilité absente : ${fragment}`);
}

for (const forbidden of ["fetch(", "supabaseClient", '.from("events")', "admin-watch"]) {
  assert.ok(!sidebarSource.includes(forbidden), `Effet métier interdit dans la sidebar : ${forbidden}`);
}

console.log("ADMIN_SIDEBAR_V2_OK");
