/* =========================================================
  DÉDICALIVRES — AUTEURS PRÉSENTS V9.9
  Fichier : authors-presence.js

  Compatible présence directe pseudo/website et présence reliée à authors.author_id.
  Fichier isolé : ne modifie pas event.js.
========================================================= */

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const eventDetail = document.getElementById("event-detail");

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.error("Configuration Supabase manquante pour authors-presence.js");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!eventId || !eventDetail) return;

  initAuthorPresence();

  async function initAuthorPresence() {
    const { data: event, error } = await supabaseClient
      .from("events")
      .select("id, title, validated, rejected")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !event || !event.validated || event.rejected) return;

    createAuthorPresenceBlock();
    bindAuthorPresenceForm();
    await loadAuthorsPresence();
  }

  function createAuthorPresenceBlock() {
    if (document.getElementById("authors-presence-section")) return;

    const section = document.createElement("section");
    section.id = "authors-presence-section";
    section.className = "authors-presence";

    section.innerHTML = `
      <div class="authors-presence-header">
        <p class="authors-presence-eyebrow">Participation auteurs</p>
        <h2>Auteurs présents</h2>
      </div>

      <div id="authors-presence-list" class="author-presence-list"></div>

      <p id="authors-presence-empty" class="author-presence-empty" hidden>
        Aucun auteur ne s’est encore déclaré présent pour cet événement.
      </p>

      <p class="author-presence-note">
        Les auteurs indiqués ici se sont déclarés présents via Dédicalivres.
        Cette information est participative et concerne uniquement les auteurs s’étant enregistrés sur Dédicalivres.
        Pour une information officielle à jour, notamment en cas d’annulation ou de modification,
        consultez toujours le site de l’événement.
      </p>

      <form id="author-presence-form" class="author-presence-form">
        <h3>Vous êtes auteur et vous participez à cet événement ?</h3>

        <div class="author-presence-grid">
          <input name="pseudo" type="text" placeholder="Pseudo / nom d’auteur" minlength="2" required />
          <input name="website" type="url" placeholder="Lien vers votre site ou page officielle" required />
        </div>

        <button class="btn-primary" type="submit">Indiquer ma présence</button>
        <p id="author-presence-feedback" aria-live="polite"></p>
      </form>
    `;

    eventDetail.insertAdjacentElement("afterend", section);
  }

  function bindAuthorPresenceForm() {
    const form = document.getElementById("author-presence-form");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const feedback = document.getElementById("author-presence-feedback");
      const submitButton = form.querySelector('button[type="submit"]');

      const formData = new FormData(form);
      const pseudo = cleanText(formData.get("pseudo"));
      const website = normalizeWebsite(formData.get("website"));

      try {
        if (pseudo.length < 2) throw new Error("Merci d’indiquer un pseudo valide.");
        if (!isValidUrl(website)) throw new Error("Merci d’indiquer un lien valide.");

        setButtonLoading(submitButton, true, "Envoi…");
        setFeedback(feedback, "", "Envoi de votre demande…");

        await submitAuthorPresenceRequest({ pseudo, website });

        form.reset();
        setFeedback(feedback, "success", "Merci, votre demande a bien été envoyée. Elle sera vérifiée avant affichage public.");
      } catch (error) {
        console.error("Erreur auteur présent :", error);
        setFeedback(feedback, "error", error.message || "Une erreur est survenue.");
      } finally {
        setButtonLoading(submitButton, false, "Indiquer ma présence");
      }
    });
  }

  async function submitAuthorPresenceRequest(author) {
    const directInsert = await supabaseClient
      .from("event_authors_presence")
      .insert([{ event_id: eventId, pseudo: author.pseudo, website: author.website, validated: false }]);

    if (!directInsert.error) return;

    console.warn("Insertion présence directe indisponible, tentative authors + author_id :", directInsert.error);

    const createdAuthor = await createPendingAuthor(author);
    if (!createdAuthor?.id) throw directInsert.error;

    const relationInsert = await supabaseClient
      .from("event_authors_presence")
      .insert([{ event_id: eventId, author_id: createdAuthor.id, validated: false }]);

    if (relationInsert.error) throw relationInsert.error;
  }

  async function createPendingAuthor(author) {
    const payloads = [
      { name: author.pseudo, website: author.website, validated: false },
      { pseudo: author.pseudo, website: author.website, validated: false },
      { author_name: author.pseudo, website: author.website, validated: false }
    ];

    for (const payload of payloads) {
      const { data, error } = await supabaseClient
        .from("authors")
        .insert([payload])
        .select("*")
        .maybeSingle();

      if (!error && data) return data;
      console.warn("Création auteur tentative échouée :", error);
    }

    return null;
  }

  async function loadAuthorsPresence() {
    const list = document.getElementById("authors-presence-list");
    const empty = document.getElementById("authors-presence-empty");

    if (!list || !empty) return;

    list.innerHTML = `<p class="author-presence-empty">Chargement des auteurs présents…</p>`;
    empty.hidden = true;

    const { data: presences, error } = await supabaseClient
      .from("event_authors_presence")
      .select("*")
      .eq("event_id", eventId)
      .eq("validated", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erreur chargement auteurs présents :", error);
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    const rows = Array.isArray(presences) ? presences : [];
    if (!rows.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    const authorMap = await loadAuthorsByPresenceRows(rows);
    const authors = rows
      .map((row) => normalizePresenceAuthor(row, authorMap))
      .filter((author) => author.name);

    const uniqueAuthors = dedupeAuthors(authors);

    if (!uniqueAuthors.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    list.innerHTML = uniqueAuthors.map(function (author) {
      return `
        <article class="author-presence-card">
          <div>
            <strong>${escapeHtml(author.name)}</strong>
            <small>Auteur déclaré présent</small>
          </div>
          ${
            author.website
              ? `<a href="${escapeAttribute(author.website)}" target="_blank" rel="noopener noreferrer">Voir le site</a>`
              : ""
          }
        </article>
      `;
    }).join("");
  }

  async function loadAuthorsByPresenceRows(rows) {
    const ids = rows
      .map((row) => row.author_id || row.authorId || row.author)
      .filter(Boolean)
      .map(String);

    if (!ids.length) return new Map();

    const { data, error } = await supabaseClient
      .from("authors")
      .select("*")
      .in("id", [...new Set(ids)]);

    if (error) {
      console.warn("Chargement table authors indisponible :", error);
      return new Map();
    }

    return new Map((Array.isArray(data) ? data : []).map((author) => [String(author.id), author]));
  }

  function normalizePresenceAuthor(row, authorMap) {
    const linkedAuthorId = row.author_id || row.authorId || row.author;
    const linkedAuthor = linkedAuthorId ? authorMap.get(String(linkedAuthorId)) : null;

    const name =
      cleanText(row.pseudo) ||
      cleanText(row.author_name) ||
      cleanText(row.name) ||
      cleanText(linkedAuthor?.name) ||
      cleanText(linkedAuthor?.pseudo) ||
      cleanText(linkedAuthor?.author_name);

    const website =
      normalizeOptionalWebsite(row.website) ||
      normalizeOptionalWebsite(row.url) ||
      normalizeOptionalWebsite(row.link) ||
      normalizeOptionalWebsite(linkedAuthor?.website) ||
      normalizeOptionalWebsite(linkedAuthor?.url) ||
      normalizeOptionalWebsite(linkedAuthor?.link);

    return { id: row.id || linkedAuthor?.id || name, name, website };
  }

  function dedupeAuthors(authors) {
    const seen = new Set();
    return authors.filter((author) => {
      const key = `${normalize(author.name)}::${normalize(author.website || "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeWebsite(value) {
    const raw = cleanText(value);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function normalizeOptionalWebsite(value) {
    const url = normalizeWebsite(value);
    return isValidUrl(url) ? url : "";
  }

  function isValidUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function setFeedback(element, kind, message) {
    if (!element) return;
    element.textContent = message;
    element.className = kind || "";
  }

  function setButtonLoading(button, loading, text) {
    if (!button) return;
    button.disabled = loading;
    button.textContent = text;
  }

  function normalize(value) {
    return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
