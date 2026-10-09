(function exposeAuthorLocalProfile(root) {
  "use strict";
  const VERSION = 2;
  const KEY = "dedicalivres_author_profile_v2";
  const LEGACY_KEYS = ["dedicalivres_author_draft_v1_author-profile-submission-form", "dedicalivres_author_draft_v1_author-presence-form", "dedicalivres_author_draft_v1_submission-form"];
  const SAFE_FIELDS = new Set(["pseudo", "bio", "location", "profile_type", "website", "shop_url", "publication_mode", "author_profile_url_type", "book_or_publisher_url_type", "publisher_name"]);
  const SAFE_PUBLISHER_FIELDS = new Set(["organization_name", "organization_website"]);
  const FORMS = new Set(["author-profile-submission-form", "author-presence-form", "submission-form"]);
  const REUSABLE_FORM_FIELDS = Object.freeze({
    "author-profile-submission-form": new Set(["pseudo", "bio", "location", "profile_type", "website", "shop_url"]),
    "author-presence-form": new Set(["pseudo", "author_profile_url", "book_or_publisher_url", "publication_mode", "author_profile_url_type", "book_or_publisher_url_type", "publisher_name", "organization_name", "organization_website"]),
    "submission-form": new Set(["author_pseudo", "author_profile_url"])
  });

  function resolveStorage(storage) {
    if (storage) return storage;
    try { return root.localStorage; }
    catch (_) { return { getItem() { return null; }, setItem() { throw new Error("storage unavailable"); }, removeItem() { throw new Error("storage unavailable"); } }; }
  }

  function value(form, name) {
    const field = form?.elements?.namedItem(name);
    return field && typeof field.value === "string" ? field.value.trim() : "";
  }
  function cleanObject(input, allowed) {
    const output = {};
    if (!input || typeof input !== "object") return output;
    allowed.forEach((name) => {
      if (typeof input[name] !== "string") return;
      const cleaned = input[name].trim().slice(0, name === "bio" ? 5000 : 1000);
      if (cleaned) output[name] = cleaned;
    });
    return output;
  }
  function parseRecord(raw) {
    try {
      const parsed = JSON.parse(raw || "null");
      if (parsed?.version !== VERSION) return null;
      const fields = cleanObject(parsed.fields, SAFE_FIELDS);
      const publisher = cleanObject(parsed.publisher, SAFE_PUBLISHER_FIELDS);
      if (!Object.keys(fields).length && !Object.keys(publisher).length) return null;
      return { version: VERSION, fields, publisher, updatedAt: parsed.updatedAt || "" };
    } catch (_) { return null; }
  }
  function legacyToShared(key, fields) {
    if (!fields || typeof fields !== "object") return { fields: {}, publisher: {} };
    if (key.includes("author-profile-submission-form")) return { fields: cleanObject(fields, SAFE_FIELDS), publisher: {} };
    if (key.includes("author-presence-form")) {
      if (fields.participant_type === "publisher") {
        return { fields: {}, publisher: cleanObject(fields, SAFE_PUBLISHER_FIELDS) };
      }
      return { fields: cleanObject({
        pseudo: fields.pseudo, profile_type: fields.participant_type,
        website: fields.author_profile_url, shop_url: fields.book_or_publisher_url,
        publication_mode: fields.publication_mode,
        author_profile_url_type: fields.author_profile_url_type,
        book_or_publisher_url_type: fields.book_or_publisher_url_type,
        publisher_name: fields.publisher_name
      }, SAFE_FIELDS), publisher: {} };
    }
    return { fields: cleanObject({ pseudo: fields.author_pseudo, website: fields.author_profile_url }, SAFE_FIELDS), publisher: {} };
  }
  function migrateLegacy(storage) {
    const merged = { fields: {}, publisher: {} };
    const migratedKeys = [];
    for (const key of LEGACY_KEYS) {
      let parsed;
      try { parsed = JSON.parse(storage.getItem(key) || "null"); } catch (_) { parsed = null; }
      if (parsed?.version !== 1 || !parsed.fields) continue;
      const mapped = legacyToShared(key, parsed.fields);
      Object.entries(mapped.fields).forEach(([name, entry]) => { if (!merged.fields[name]) merged.fields[name] = entry; });
      Object.entries(mapped.publisher).forEach(([name, entry]) => { if (!merged.publisher[name]) merged.publisher[name] = entry; });
      migratedKeys.push(key);
    }
    if (!Object.keys(merged.fields).length && !Object.keys(merged.publisher).length) return null;
    const record = { version: VERSION, ...merged, updatedAt: new Date().toISOString() };
    storage.setItem(KEY, JSON.stringify(record));
    migratedKeys.forEach((key) => storage.removeItem(key));
    return record;
  }
  function read(storage) {
    storage = resolveStorage(storage);
    try { return parseRecord(storage.getItem(KEY)) || migrateLegacy(storage); }
    catch (_) { return null; }
  }
  function collect(form) {
    if (form.id === "author-profile-submission-form") return { fields: cleanObject({
      pseudo: value(form, "pseudo"), bio: value(form, "bio"), location: value(form, "location"),
      profile_type: value(form, "profile_type"), website: value(form, "website"), shop_url: value(form, "shop_url")
    }, SAFE_FIELDS), publisher: {} };
    if (form.id === "author-presence-form") {
      if (value(form, "participant_type") === "publisher") return { fields: {}, publisher: cleanObject({
        organization_name: value(form, "organization_name"), organization_website: value(form, "organization_website")
      }, SAFE_PUBLISHER_FIELDS) };
      return { fields: cleanObject({
        pseudo: value(form, "pseudo"), profile_type: value(form, "participant_type"),
        website: value(form, "author_profile_url"), shop_url: value(form, "book_or_publisher_url"),
        publication_mode: value(form, "publication_mode"), author_profile_url_type: value(form, "author_profile_url_type"),
        book_or_publisher_url_type: value(form, "book_or_publisher_url_type"), publisher_name: value(form, "publisher_name")
      }, SAFE_FIELDS), publisher: {} };
    }
    return { fields: cleanObject({ pseudo: value(form, "author_pseudo"), website: value(form, "author_profile_url") }, SAFE_FIELDS), publisher: {} };
  }
  function write(storage, current, next) {
    const record = { version: VERSION, fields: { ...(current?.fields || {}), ...next.fields }, publisher: { ...(current?.publisher || {}), ...next.publisher }, updatedAt: new Date().toISOString() };
    storage.setItem(KEY, JSON.stringify(record));
    return record;
  }
  function canReplaceDefault(field) {
    return ((field.name === "profile_type" || field.name === "participant_type") && field.value === "author")
      || (field.name === "publication_mode" && field.value === "unknown");
  }
  function shouldSave(form, field) {
    return Boolean(field?.name && REUSABLE_FORM_FIELDS[form.id]?.has(field.name));
  }
  function fill(form, name, nextValue) {
    if (!nextValue) return false;
    const field = form.elements.namedItem(name);
    if (!field || typeof field.value !== "string") return false;
    if (field.value.trim() && !canReplaceDefault(field)) return false;
    field.value = nextValue;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  function selectPresenceType(form, nextValue) {
    const field = form.elements.namedItem("participant_type");
    if (!field || field.value === nextValue) return;
    field.value = nextValue;
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function apply(form, record, identity = "author") {
    if (!record) return 0;
    let count = 0;
    const put = (name, entry) => { if (fill(form, name, entry)) count += 1; };
    if (form.id === "author-profile-submission-form") {
      ["pseudo", "bio", "location", "profile_type", "website", "shop_url"].forEach((name) => put(name, record.fields[name]));
    } else if (form.id === "author-presence-form") {
      if (identity === "publisher") {
        selectPresenceType(form, "publisher");
        put("organization_name", record.publisher.organization_name);
        put("organization_website", record.publisher.organization_website);
      } else {
        selectPresenceType(form, record.fields.profile_type || "author");
        put("pseudo", record.fields.pseudo);
        put("author_profile_url", record.fields.website); put("book_or_publisher_url", record.fields.shop_url);
        put("publication_mode", record.fields.publication_mode); put("author_profile_url_type", record.fields.author_profile_url_type);
        put("book_or_publisher_url_type", record.fields.book_or_publisher_url_type); put("publisher_name", record.fields.publisher_name);
      }
    } else {
      put("author_pseudo", record.fields.pseudo); put("author_profile_url", record.fields.website);
    }
    return count;
  }
  function bind(form, storage) {
    if (!FORMS.has(form.id) || form.dataset.localDraft) return;
    storage = resolveStorage(storage);
    form.dataset.localDraft = "v2";
    const box = document.createElement("fieldset");
    box.className = `local-author-draft${form.id === "author-profile-submission-form" ? " local-author-draft-compact" : ""}`;
    box.innerHTML = `<legend>Mes informations auteur sur cet appareil</legend>
      <label><input type="checkbox" data-author-memory-consent> Conserver mes informations réutilisables dans ce navigateur</label>
      <p>Appareil personnel uniquement. Aucun fichier, consentement légal, contact privé, token ou donnée propre à un événement n’est mémorisé.</p>
      <div class="local-author-draft-actions" hidden><button type="button" data-author-reuse="author">Réutiliser mes informations auteur</button><button type="button" data-author-reuse="publisher" hidden>Réutiliser mes informations éditeur</button><button type="button" data-author-skip>Continuer sans récupération</button></div>
      <button type="button" data-author-forget>Effacer les informations sauvegardées</button><p data-author-memory-feedback role="status"></p>`;
    const intro = form.id === "submission-form" ? form.querySelector("#dedicace-author-fields .submission-author-intro") : null;
    if (intro) intro.insertAdjacentElement("afterend", box); else form.prepend(box);
    const toggle = box.querySelector("[data-author-memory-consent]");
    const actions = box.querySelector(".local-author-draft-actions");
    const reuseAuthor = box.querySelector('[data-author-reuse="author"]');
    const reusePublisher = box.querySelector('[data-author-reuse="publisher"]');
    const feedback = box.querySelector("[data-author-memory-feedback]");
    let record = read(storage);
    function refreshState(nextRecord, message = "Des informations compatibles sont disponibles.") {
      record = nextRecord;
      const hasAuthor = Boolean(record && Object.keys(record.fields).length);
      const hasPublisher = Boolean(record && form.id === "author-presence-form" && Object.keys(record.publisher).length);
      toggle.checked = Boolean(record);
      reuseAuthor.hidden = !hasAuthor;
      reusePublisher.hidden = !hasPublisher;
      actions.hidden = !hasAuthor && !hasPublisher;
      feedback.textContent = record ? message : "Aucune information réutilisable n’est sauvegardée.";
    }
    if (record) refreshState(record);
    function save() {
      if (!toggle.checked) return;
      try { record = write(storage, read(storage), collect(form)); feedback.textContent = "Informations réutilisables enregistrées."; }
      catch (_) { feedback.textContent = "Stockage local indisponible. Votre saisie reste dans cette page."; }
    }
    function clear() {
      try {
        storage.removeItem(KEY); LEGACY_KEYS.forEach((key) => storage.removeItem(key)); record = null;
        toggle.checked = false; actions.hidden = true;
        feedback.textContent = "Informations sauvegardées effacées. La saisie actuelle est conservée.";
      } catch (_) { feedback.textContent = "Impossible d’effacer le stockage de ce navigateur."; }
    }
    toggle.addEventListener("change", () => toggle.checked ? save() : clear());
    box.querySelectorAll("[data-author-reuse]").forEach((button) => button.addEventListener("click", () => {
      const applied = apply(form, read(storage), button.dataset.authorReuse); actions.hidden = true;
      feedback.textContent = applied ? `${applied} information${applied > 1 ? "s" : ""} récupérée${applied > 1 ? "s" : ""}.` : "Aucun champ vide compatible à compléter.";
    }));
    box.querySelector("[data-author-skip]").addEventListener("click", () => { actions.hidden = true; feedback.textContent = "Récupération ignorée. Vos champs actuels sont conservés."; });
    box.querySelector("[data-author-forget]").addEventListener("click", clear);
    form.addEventListener("input", (event) => { if (shouldSave(form, event.target)) save(); });
    form.addEventListener("change", (event) => { if (shouldSave(form, event.target)) save(); });
    form.addEventListener("reset", () => {
      const sync = () => refreshState(read(storage), "Informations sauvegardées disponibles après la réinitialisation.");
      if (typeof root.setTimeout === "function") root.setTimeout(sync, 0); else sync();
    });
    root.addEventListener?.("storage", (event) => { if (event.key === KEY && event.newValue === null) clear(); });
  }
  function scan() {
    document.querySelectorAll("#author-presence-form, #submission-form, #author-profile-submission-form").forEach((form) => bind(form));
  }
  root.DEDICALIVRES_AUTHOR_DRAFT = Object.freeze({ VERSION, KEY, LEGACY_KEYS, parseRecord, migrateLegacy, collect, apply, read, write, shouldSave, bind });
  if (!root.document) return;
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})(typeof window !== "undefined" ? window : globalThis);
