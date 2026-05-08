/* =========================================================
  DÉDICALIVRES — Auteurs présents sur fiche événement
  Fichier : authors-presence.js
  Version : 7.5.4

  Rôle :
  - Afficher les auteurs présents validés directement sur event.html.
  - Permettre à un auteur de demander son association à l’événement.
  - Enregistrer les nouvelles demandes avec validated:false.

  Note :
  Ce module ne dépend pas du rendu interne de event.js. Il attend que la fiche
  événement soit rendue puis injecte un bloc visible dans la page.
========================================================= */

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const eventDetail = document.getElementById("event-detail");
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.error("Configuration Supabase manquante pour authors-presence.js");
    return;
  }

  if (!eventId || !eventDetail) return;

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const state = {
    eventTitle: "",
    retries: 0,
    maxRetries: 50
  };

  waitForEventRender();

  function waitForEventRender() {
    const detailBody = eventDetail.querySelector(".detail-body");
    const loading = eventDetail.querySelector(".loader");

    if (detailBody || !loading) {
      initAuthorPresence();
      return;
    }

    state.retries += 1;

    if (state.retries >= state.maxRetries) {
      initAuthorPresence();
      return;
    }

    setTimeout(waitForEventRender, 120);
  }

  async function initAuthorPresence() {
    if (document.getElementById("authors-presence-section")) return;

    await loadEventTitleSafely();
    createAuthorPresenceBlock();
    bindAuthorPresenceForm();
    await loadAuthorsPresence();
  }

  async function loadEventTitleSafely() {
    try {
      const { data, error } = await supabaseClient
        .from("events")
        .select("title")
        .eq("id", eventId)
        .maybeSingle();

      if (!error && data?.title) {
        state.eventTitle = data.title;
      }
    } catch {
      state.eventTitle = "";
    }
  }

  function createAuthorPresenceBlock() {
    const section = document.createElement("section");
    section.id = "authors-presence-section";
    section.className = "authors-presence";

    section.innerHTML = `
      <div class="authors-presence-header">
        <p class="authors-presence-eyebrow">Participation auteurs</p>
        <h2>Auteurs présents</h2>
        <p>
          Retrouvez les auteurs qui se sont déclarés présents pour cet événement.
          Les présences sont vérifiées avant affichage public.
        </p>
      </div>

      <div id="authors-presence-list" class="author-presence-list">
        <article class="author-presence-loading">Chargement des auteurs présents…</article>
      </div>

      <p id="authors-presence-empty" class="author-presence-empty" hidden>
        Aucun auteur n’est encore affiché pour cet événement.
      </p>

      <form id="author-presence-form" class="author-presence-form">
        <h3>Vous êtes auteur et vous participez à cet événement ?</h3>
        <p>
          Demandez à être associé à cette fiche. Votre demande sera examinée avant publication.
        </p>

        <div class="author-presence-grid">
          <input name="pseudo" type="text" placeholder="Pseudo / nom d’auteur" minlength="2" required />
          <input name="website" type="url" placeholder="Lien vers votre site ou page officielle" required />
        </div>

        <button class="btn-primary" type="submit">Demander à être associé</button>
        <p id="author-presence-feedback" aria-live="polite"></p>
      </form>
    `;

    const detailBody = eventDetail.querySelector(".detail-body");
    const detailActions = eventDetail.querySelector(".detail-actions");
    const mapBlock = eventDetail.querySelector(".detail-map-block");

    if (detailActions) {
      detailActions.insertAdjacentElement("afterend", section);
      return;
    }

    if (mapBlock && detailBody) {
      detailBody.insertBefore(section, mapBlock);
      return;
    }

    if (detailBody) {
      detailBody.appendChild(section);
      return;
    }

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
        if (pseudo.length < 2) throw new Error("Merci d’indiquer un nom d’auteur valide.");
        if (!isValidUrl(website)) throw new Error("Merci d’indiquer un lien valide vers votre site ou page officielle.");

        setButtonLoading(submitButton, true, "Envoi…");
        setFeedback(feedback, "", "Envoi de votre demande…");

        const payload = {
          event_id: eventId,
          pseudo,
          website,
          validated: false
        };

        const { error } = await supabaseClient
          .from("event_authors_presence")
          .insert([payload]);

        if (error) throw error;

        form.reset();
        setFeedback(
          feedback,
          "success",
          "Votre demande a bien été envoyée. Elle sera vérifiée avant affichage public."
        );
      } catch (error) {
        console.error("Erreur demande association auteur :", error);
        setFeedback(feedback, "error", error.message || "Une erreur est survenue.");
      } finally {
        setButtonLoading(submitButton, false, "Demander à être associé");
      }
    });
  }

  async function loadAuthorsPresence() {
    const list = document.getElementById("authors-presence-list");
    const empty = document.getElementById("authors-presence-empty");

    if (!list || !empty) return;

    try {
      const { data, error } = await supabaseClient
        .from("event_authors_presence")
        .select("id, pseudo, website, author_slug, created_at")
        .eq("event_id", eventId)
        .eq("validated", true)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const authors = Array.isArray(data) ? data : [];

      if (!authors.length) {
        list.innerHTML = "";
        empty.hidden = false;
        return;
      }

      empty.hidden = true;
      list.innerHTML = authors.map(renderAuthorCard).join("");
    } catch (error) {
      console.error("Erreur chargement auteurs présents :", error);
      list.innerHTML = `
        <article class="author-presence-error">
          Impossible de charger les auteurs présents pour le moment.
        </article>
      `;
    }
  }

  function renderAuthorCard(author) {
    const name = escapeHtml(author.pseudo || "Auteur");
    const website = cleanText(author.website);
    const authorSlug = cleanText(author.author_slug);

    return `
      <article class="author-presence-card">
        <div>
          <strong>${name}</strong>
          <small>Auteur déclaré présent</small>
        </div>

        <div class="author-presence-card-actions">
          ${website ? `
            <a href="${escapeAttribute(website)}" target="_blank" rel="noopener noreferrer">
              Site de l’auteur
            </a>
          ` : ""}

          ${authorSlug ? `
            <a href="author.html?slug=${encodeURIComponent(authorSlug)}">
              Fiche Dédicalivres
            </a>
          ` : ""}
        </div>
      </article>
    `;
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
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
