/* =========================================================
  DÉDICALIVRES — AUTEURS PRÉSENTS
  Fichier : authors-presence.js
  Pack SEO-Auteurs-1

  Rôle :
  - Afficher le bloc "Auteurs présents" sur event.html.
  - Permettre à un auteur de déclarer sa présence.
  - Ajouter un statut éditorial AE / ME / Hybride / Non précisé.
  - Ajouter un lien auteur/réseau + un lien livre/boutique/éditeur.
  - Afficher publiquement uniquement les présences validées.
  - Enrichir la fiche événement avec performer/sameAs en JSON-LD.
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

  ensureAuthorPresenceAnchorStyle();
  initAuthorPresence();

  async function initAuthorPresence() {
    const { data: event, error } = await supabaseClient
      .from("events")
      .select("id, title, validated, rejected, start_date, end_date, city, region, website")
      .eq("id", eventId)
      .maybeSingle();

    // Option visible uniquement pour événement validé et non rejeté.
    if (error || !event || !event.validated || event.rejected) return;

    createAuthorPresenceBlock();
    bindAuthorPresenceForm(event);
    const authors = await loadAuthorsPresence();
    injectAuthorsPresenceSchema(event, authors);
    scrollToAuthorPresenceIfRequested();
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

        <div class="author-presence-grid author-presence-grid-extended">
          <label>
            <span>Nom / pseudo d’auteur</span>
            <input name="pseudo" type="text" placeholder="Pseudo / nom d’auteur" minlength="2" required />
          </label>

          <label>
            <span>Votre situation éditoriale</span>
            <select name="publication_mode" required>
              <option value="unknown">Je ne souhaite pas préciser</option>
              <option value="self_published">Autoédition</option>
              <option value="publisher">Maison d’édition</option>
              <option value="hybrid">Les deux / hybride</option>
            </select>
          </label>

          <label>
            <span>Lien auteur / réseau social</span>
            <input name="author_profile_url" type="url" placeholder="Site auteur, Instagram, Facebook, Linktree…" required />
          </label>

          <label>
            <span>Type de lien auteur</span>
            <select name="author_profile_url_type">
              <option value="site_officiel">Site officiel</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="linktree">Linktree</option>
              <option value="autre">Autre</option>
            </select>
          </label>

          <label>
            <span>Lien livre / boutique / maison d’édition</span>
            <input name="book_or_publisher_url" type="url" placeholder="Page du livre, boutique auteur, éditeur, librairie…" />
          </label>

          <label>
            <span>Type de second lien</span>
            <select name="book_or_publisher_url_type">
              <option value="page_livre">Page du livre</option>
              <option value="maison_edition">Maison d’édition</option>
              <option value="boutique_auteur">Boutique auteur</option>
              <option value="librairie">Librairie</option>
              <option value="amazon">Amazon</option>
              <option value="autre">Autre</option>
            </select>
          </label>

          <label class="author-presence-field-wide">
            <span>Nom de la maison d’édition ou de la boutique</span>
            <input name="publisher_name" type="text" placeholder="Optionnel : nom de l’éditeur, boutique ou librairie" />
          </label>
        </div>

        <p class="author-presence-form-help">
          Ces liens permettent aux visiteurs d’en savoir plus sur l’auteur, le livre présenté ou la maison d’édition.
          Ils seront affichés après validation.
        </p>

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
      const publicationMode = cleanSelectValue(formData.get("publication_mode"), ["self_published", "publisher", "hybrid", "unknown"], "unknown");

      const authorProfileUrl = normalizeWebsite(formData.get("author_profile_url"));
      const authorProfileUrlType = cleanSelectValue(formData.get("author_profile_url_type"), ["site_officiel", "instagram", "facebook", "linktree", "autre"], "autre");

      const bookOrPublisherUrl = normalizeOptionalWebsite(formData.get("book_or_publisher_url"));
      const bookOrPublisherUrlType = cleanSelectValue(formData.get("book_or_publisher_url_type"), ["boutique_auteur", "page_livre", "maison_edition", "librairie", "amazon", "autre"], "autre");

      const publisherName = cleanText(formData.get("publisher_name")).slice(0, 120);

      try {
        if (pseudo.length < 2) throw new Error("Merci d’indiquer un pseudo valide.");
        if (!isValidUrl(authorProfileUrl)) throw new Error("Merci d’indiquer un lien auteur valide.");
        if (bookOrPublisherUrl && !isValidUrl(bookOrPublisherUrl)) throw new Error("Merci d’indiquer un second lien valide ou de laisser le champ vide.");

        setButtonLoading(submitButton, true, "Envoi…");
        setFeedback(feedback, "", "Envoi de votre demande…");

        const extendedPayload = {
          event_id: eventId,
          pseudo,
          website: authorProfileUrl, // compatibilité avec l’ancien champ
          author_profile_url: authorProfileUrl,
          author_profile_url_type: authorProfileUrlType,
          publication_mode: publicationMode,
          book_or_publisher_url: bookOrPublisherUrl || null,
          book_or_publisher_url_type: bookOrPublisherUrl ? bookOrPublisherUrlType : null,
          publisher_name: publisherName || null,
          validated: false,
          rejected: false
        };

        const { error } = await supabaseClient
          .from("event_authors_presence")
          .insert([extendedPayload]);

        if (error) {
          // Fallback compatibilité si la migration SQL n'a pas encore été appliquée.
          const { error: legacyError } = await supabaseClient
            .from("event_authors_presence")
            .insert([{ event_id: eventId, pseudo, website: authorProfileUrl, validated: false }]);

          if (legacyError) throw error;
        }

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

  async function loadAuthorsPresence() {
    const list = document.getElementById("authors-presence-list");
    const empty = document.getElementById("authors-presence-empty");

    if (!list || !empty) return [];

    const selectExtended = [
      "id",
      "pseudo",
      "website",
      "author_profile_url",
      "author_profile_url_type",
      "publication_mode",
      "book_or_publisher_url",
      "book_or_publisher_url_type",
      "publisher_name",
      "created_at"
    ].join(", ");

    let response = await supabaseClient
      .from("event_authors_presence")
      .select(selectExtended)
      .eq("event_id", eventId)
      .eq("validated", true)
      .or("rejected.is.null,rejected.eq.false")
      .order("created_at", { ascending: true });

    if (response.error) {
      // Fallback ancien schéma.
      response = await supabaseClient
        .from("event_authors_presence")
        .select("id, pseudo, website, created_at")
        .eq("event_id", eventId)
        .eq("validated", true)
        .order("created_at", { ascending: true });
    }

    if (response.error) {
      console.error("Erreur chargement auteurs présents :", response.error);
      return [];
    }

    const authors = Array.isArray(response.data) ? response.data : [];

    if (!authors.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return [];
    }

    empty.hidden = true;

    list.innerHTML = authors.map(renderAuthorPresenceCard).join("");
    return authors;
  }

  function renderAuthorPresenceCard(author) {
    const authorUrl = author.author_profile_url || author.website || "";
    const secondUrl = author.book_or_publisher_url || "";
    const modeLabel = getPublicationModeLabel(author.publication_mode);
    const authorLabel = getAuthorLinkLabel(author.author_profile_url_type);
    const secondLabel = getSecondLinkLabel(author.book_or_publisher_url_type, author.publisher_name);
    const publisherLine = author.publisher_name ? `<small>${escapeHtml(author.publisher_name)}</small>` : "";

    return `
      <article class="author-presence-card author-presence-card-extended">
        <div class="author-presence-card-main">
          <strong>${escapeHtml(author.pseudo)}</strong>
          <small>${escapeHtml(modeLabel)}</small>
          ${publisherLine}
        </div>

        <div class="author-presence-links">
          ${authorUrl ? `
            <a href="${escapeAttribute(authorUrl)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(authorLabel)}
            </a>
          ` : ""}
          ${secondUrl ? `
            <a href="${escapeAttribute(secondUrl)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(secondLabel)}
            </a>
          ` : ""}
        </div>
      </article>
    `;
  }

  function injectAuthorsPresenceSchema(event, authors) {
    if (!authors || !authors.length) return;

    const performers = authors.map((author) => {
      const sameAs = [
        author.author_profile_url || author.website || "",
        author.book_or_publisher_url || ""
      ].filter(isValidUrl);

      const person = {
        "@type": "Person",
        "name": author.pseudo
      };

      if (sameAs.length) person.sameAs = sameAs;
      return person;
    }).filter((person) => person.name);

    if (!performers.length) return;

    const schema = {
      "@context": "https://schema.org",
      "@type": "Event",
      "@id": `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(eventId)}#event`,
      "name": event.title || "Événement littéraire",
      "url": window.location.href.split("#")[0],
      "performer": performers
    };

    if (event.start_date) schema.startDate = event.start_date;
    if (event.end_date) schema.endDate = event.end_date;
    if (event.city || event.region) {
      schema.location = {
        "@type": "Place",
        "name": [event.city, event.region].filter(Boolean).join(", "),
        "address": {
          "@type": "PostalAddress",
          "addressLocality": event.city || undefined,
          "addressRegion": event.region || undefined,
          "addressCountry": "FR"
        }
      };
    }

    const previous = document.getElementById("authors-presence-jsonld");
    if (previous) previous.remove();

    const script = document.createElement("script");
    script.id = "authors-presence-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
  }

  function ensureAuthorPresenceAnchorStyle() {
    if (document.getElementById("author-presence-anchor-style")) return;

    const style = document.createElement("style");
    style.id = "author-presence-anchor-style";
    style.textContent = `
      #authors-presence-section.is-anchor-focused {
        outline: 4px solid rgba(255, 107, 53, .58);
        box-shadow:
          0 0 0 8px rgba(255, 107, 53, .12),
          0 22px 55px rgba(58, 28, 113, .18);
        transition: outline .25s ease, box-shadow .25s ease;
      }
    `;
    document.head.appendChild(style);
  }

  function scrollToAuthorPresenceIfRequested() {
    if (window.location.hash !== "#authors-presence-section") return;

    const section = document.getElementById("authors-presence-section");
    if (!section) return;

    setTimeout(() => {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      section.classList.add("is-anchor-focused");

      setTimeout(() => {
        section.classList.remove("is-anchor-focused");
      }, 2600);
    }, 450);
  }

  function getPublicationModeLabel(value) {
    switch (value) {
      case "self_published":
        return "Publication : autoédition";
      case "publisher":
        return "Publication : maison d’édition";
      case "hybrid":
        return "Publication : hybride";
      default:
        return "Auteur déclaré présent";
    }
  }

  function getAuthorLinkLabel(value) {
    switch (value) {
      case "instagram":
        return "Instagram de l’auteur";
      case "facebook":
        return "Facebook de l’auteur";
      case "linktree":
        return "Liens de l’auteur";
      case "site_officiel":
        return "Site officiel de l’auteur";
      default:
        return "Site / réseau de l’auteur";
    }
  }

  function getSecondLinkLabel(value, publisherName) {
    const suffix = publisherName ? ` — ${publisherName}` : "";
    switch (value) {
      case "boutique_auteur":
        return `Boutique auteur${suffix}`;
      case "maison_edition":
        return `Maison d’édition${suffix}`;
      case "librairie":
        return `Librairie${suffix}`;
      case "amazon":
        return `Page Amazon${suffix}`;
      case "page_livre":
        return `Page du livre${suffix}`;
      default:
        return `Livre / éditeur / boutique${suffix}`;
    }
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanSelectValue(value, allowed, fallback) {
    const cleaned = cleanText(value);
    return allowed.includes(cleaned) ? cleaned : fallback;
  }

  function normalizeWebsite(value) {
    const raw = cleanText(value);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function normalizeOptionalWebsite(value) {
    const raw = cleanText(value);
    if (!raw) return "";
    return normalizeWebsite(raw);
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
