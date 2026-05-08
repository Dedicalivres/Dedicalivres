/* =========================================================
  DÉDICALIVRES — AUTEURS PRÉSENTS
  Fichier : authors-presence.js

  Rôle :
  - Afficher le bloc "Auteurs présents" sur event.html.
  - Permettre à un auteur de déclarer sa présence.
  - Afficher publiquement les auteurs déclarés.

  Ce fichier est volontairement isolé : il ne modifie pas event.js.
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

    // Condition demandée : option visible uniquement pour événement validé et non rejeté.
    if (error || !event || !event.validated || event.rejected) return;

    createAuthorPresenceBlock();
    bindAuthorPresenceForm();
    loadAuthorsPresence();
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

        setButtonLoading(submitButton, true, "Enregistrement…");
        setFeedback(feedback, "", "Enregistrement en cours…");

        const { error } = await supabaseClient
          .from("event_authors_presence")
          .insert([{ event_id: eventId, pseudo, website, validated: true }]);

        if (error) throw error;

        form.reset();
        setFeedback(feedback, "success", "Merci, votre présence a bien été ajoutée 👍");
        loadAuthorsPresence();
      } catch (error) {
        console.error("Erreur auteur présent :", error);
        setFeedback(feedback, "error", error.message || "Une erreur est survenue.");
      } finally {
        setButtonLoading(submitButton, false, "Indiquer ma présence");
      }
    });
  }

  async function loadAuthorsPresence() {
    const list = document.getElementById("authors-presence-list");
    const empty = document.getElementById("authors-presence-empty");

    if (!list || !empty) return;

    const { data, error } = await supabaseClient
      .from("event_authors_presence")
      .select("id, pseudo, website, created_at")
      .eq("event_id", eventId)
      .eq("validated", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erreur chargement auteurs présents :", error);
      return;
    }

    const authors = Array.isArray(data) ? data : [];

    if (!authors.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    list.innerHTML = authors.map(function (author) {
      return `
        <article class="author-presence-card">
          <div>
            <strong>${escapeHtml(author.pseudo)}</strong>
            <small>Auteur déclaré présent</small>
          </div>
          <a href="${escapeAttribute(author.website)}" target="_blank" rel="noopener noreferrer">
            Voir le site
          </a>
        </article>
      `;
    }).join("");
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
