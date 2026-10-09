import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("author-local-draft.js", "utf8");
const context = vm.createContext({ console, Date, Event });
vm.runInContext(source, context);
const api = context.DEDICALIVRES_AUTHOR_DRAFT;

assert.equal(api.VERSION, 2);
assert.equal(api.KEY, "dedicalivres_author_profile_v2");

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, entry) => memory.set(key, entry),
  removeItem: (key) => memory.delete(key)
};

assert.equal(api.read(storage), null, "premier utilisateur sans données");

memory.set(api.LEGACY_KEYS[0], JSON.stringify({ version: 1, fields: {
  pseudo: "Auteure Test",
  website: "https://example.test",
  profile_type: "artist_author",
  legal_accept: "on",
  author_portrait: "secret-file",
  submitter_email: "private@example.test",
  start_date: "2026-12-01",
  token: "secret"
} }));
const migrated = api.read(storage);
assert.equal(migrated.fields.pseudo, "Auteure Test");
assert.equal(migrated.fields.profile_type, "artist_author");
for (const forbidden of ["legal_accept", "author_portrait", "submitter_email", "start_date", "token"]) {
  assert.equal(migrated.fields[forbidden], undefined, `${forbidden} ne doit pas être mémorisé`);
}
assert.equal(memory.has(api.LEGACY_KEYS[0]), false, "ancien brouillon migré puis retiré");

function makeForm(id, values) {
  const fields = Object.fromEntries(Object.entries(values).map(([name, entry]) => [name, {
    name,
    value: entry,
    dispatchEvent() {}
  }]));
  return { id, elements: { namedItem: (name) => fields[name] || null }, fields };
}

const presence = makeForm("author-presence-form", {
  pseudo: "", participant_type: "author", author_profile_url: "",
  book_or_publisher_url: "", publication_mode: "unknown",
  author_profile_url_type: "", book_or_publisher_url_type: "", publisher_name: ""
});
assert.ok(api.apply(presence, migrated, "author") >= 2, "fiche auteur vers présence");
assert.equal(presence.fields.pseudo.value, "Auteure Test");
assert.equal(presence.fields.participant_type.value, "artist_author");
assert.equal(presence.fields.author_profile_url.value, "https://example.test");

const dedication = makeForm("submission-form", { author_pseudo: "", author_profile_url: "" });
assert.equal(api.apply(dedication, migrated), 2, "fiche auteur vers dédicace");
assert.equal(dedication.fields.author_pseudo.value, "Auteure Test");

const existing = makeForm("submission-form", { author_pseudo: "Déjà saisi", author_profile_url: "" });
api.apply(existing, migrated);
assert.equal(existing.fields.author_pseudo.value, "Déjà saisi", "aucun écrasement silencieux");

const publisher = makeForm("author-presence-form", {
  participant_type: "publisher", organization_name: "Maison Test",
  organization_website: "https://publisher.test", contact_name: "Privé",
  contact_email: "private@publisher.test"
});
const publisherData = api.collect(publisher);
assert.equal(publisherData.publisher.organization_name, "Maison Test");
assert.equal(publisherData.publisher.contact_name, undefined);
assert.equal(publisherData.publisher.contact_email, undefined);
assert.equal(publisherData.fields.pseudo, undefined, "éditeur séparé de l’identité auteur");

const publisherMemory = new Map();
const publisherStorage = {
  getItem: (key) => publisherMemory.get(key) ?? null,
  setItem: (key, entry) => publisherMemory.set(key, entry),
  removeItem: (key) => publisherMemory.delete(key)
};
api.write(publisherStorage, null, publisherData);
const publisherReload = makeForm("author-presence-form", {
  participant_type: "author", organization_name: "", organization_website: "",
  pseudo: "", author_profile_url: "", book_or_publisher_url: "", publication_mode: "unknown",
  author_profile_url_type: "", book_or_publisher_url_type: "", publisher_name: ""
});
assert.equal(api.apply(publisherReload, api.read(publisherStorage), "publisher"), 2, "récupération éditeur explicite après rechargement");
assert.equal(publisherReload.fields.participant_type.value, "publisher");
assert.equal(publisherReload.fields.organization_name.value, "Maison Test");
assert.equal(publisherReload.fields.organization_website.value, "https://publisher.test");
assert.equal(publisherReload.fields.contact_email, undefined, "aucun contact privé restauré");

const modes = makeForm("author-profile-submission-form", {
  request_type: "modify", target_author_id: "uuid", legal_accept: "on", pseudo: "Auteure Test",
  bio: "", location: "", profile_type: "author", website: "", shop_url: ""
});
assert.equal(api.shouldSave(modes, modes.fields.request_type), false, "le changement create/modify ne sauvegarde pas");
assert.equal(api.shouldSave(modes, modes.fields.target_author_id), false, "la sélection d’une fiche ne sauvegarde pas");
assert.equal(api.shouldSave(modes, modes.fields.legal_accept), false, "le consentement légal ne sauvegarde pas");
assert.equal(api.shouldSave(modes, modes.fields.pseudo), true, "un champ auteur réutilisable sauvegarde");

const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
assert.equal(api.read(blocked), null, "navigation privée ou stockage indisponible");
assert.match(source, /function resolveStorage\(storage\)/);
assert.match(source, /storage unavailable/);
assert.match(source, /form\.addEventListener\("reset"/);
assert.match(source, /Informations sauvegardées disponibles après la réinitialisation/);

const contribution = fs.readFileSync("author-contribute.js", "utf8");
assert.match(contribution, /const authorsPromise = loadAuthors\(\)/);
assert.match(contribution, /await authorsPromise/);
assert.match(contribution, /selectedLoadedId/);
assert.match(contribution, /window\.confirm\("Remplacer la saisie actuelle/);

const html = fs.readFileSync("author-contribute.html", "utf8");
assert.match(html, /author-contribute\.js\?v=2/);
assert.match(html, /author-local-draft\.js\?v=4/);
assert.match(fs.readFileSync("soumettre.html", "utf8"), /author-local-draft\.js\?v=4/);
assert.match(fs.readFileSync("event.html", "utf8"), /author-local-draft\.js\?v=4/);
assert.match(fs.readFileSync("scripts/event-publisher/generate-events.py", "utf8"), /author-local-draft\.js\?v=4/);

console.log("PASS author prefill v2: migration, consent, mappings, privacy, modes and versioning");
