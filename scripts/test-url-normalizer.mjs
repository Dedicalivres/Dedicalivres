import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("url-normalizer.js", "utf8");
const context = vm.createContext({ URL });
vm.runInContext(source, context);
const urls = context.DEDICALIVRES_URLS;

for (const [input, expected] of [
  ["monsite.fr", "https://monsite.fr"],
  ["www.monsite.fr", "https://www.monsite.fr"],
  ["https://monsite.fr", "https://monsite.fr"],
  ["http://monsite.fr", "http://monsite.fr"],
  ["instagram.com/test", "https://instagram.com/test"],
  ["facebook.com/test", "https://facebook.com/test"],
  ["", ""]
]) {
  assert.equal(urls.normalize(input), expected);
}

for (const input of [
  "javascript:alert(1)",
  "data:text/html,test",
  "file:///tmp/test",
  "vbscript:msgbox(1)",
  "ftp://example.com"
]) {
  assert.throws(() => urls.normalize(input), /Adresse web invalide/);
}

assert.equal(urls.normalize("https://https.example"), "https://https.example");
assert.equal(urls.normalize("http://http.example"), "http://http.example");
assert.equal(urls.isValid("monsite.fr"), true);
assert.equal(urls.isValid("javascript:alert(1)"), false);

const listeners = {};
const document = {
  addEventListener(type, listener) {
    listeners[type] = listener;
  }
};
const browserContext = vm.createContext({ URL, document });
browserContext.window = browserContext;
vm.runInContext(source, browserContext);

function fakeUrlInput(value) {
  return {
    type: "url",
    value,
    message: "",
    matches(selector) {
      return selector === 'input[type="url"]';
    },
    setCustomValidity(message) {
      this.message = message;
    }
  };
}

const blurInput = fakeUrlInput("monsite.fr");
listeners.blur({ target: blurInput });
assert.equal(blurInput.value, "https://monsite.fr");
assert.equal(blurInput.message, "");

const invalidInput = fakeUrlInput("javascript:alert(1)");
let prevented = false;
let stopped = false;
listeners.submit({
  target: { querySelectorAll: () => [invalidInput] },
  preventDefault: () => { prevented = true; },
  stopImmediatePropagation: () => { stopped = true; }
});
assert.equal(prevented, true);
assert.equal(stopped, true);
assert.equal(invalidInput.message, "Adresse web invalide");

const files = {
  author: fs.readFileSync("author-contribute.html", "utf8"),
  event: fs.readFileSync("soumettre.html", "utf8"),
  presence: fs.readFileSync("event.html", "utf8"),
  admin: fs.readFileSync("admin.html", "utf8"),
  adminAlias: fs.readFileSync("admin-v11.html", "utf8"),
  legacyAuthor: fs.readFileSync("auteur.html", "utf8")
};

for (const [name, html] of Object.entries(files)) {
  assert.match(html, /url-normalizer\.js\?v=1/, `${name}: helper absent`);
}

assert.match(fs.readFileSync("app.js", "utf8"), /website: normalizeOptionalWebsite/);
assert.match(fs.readFileSync("admin-shell.js", "utf8"), /normalizeV11OptionalUrl/);
assert.match(fs.readFileSync("authors-presence.js", "utf8"), /DEDICALIVRES_URLS\.normalizeOptional/);

console.log("URL_NORMALIZER_OK");
