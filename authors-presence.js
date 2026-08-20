/* =========================================================
  DÉDICALIVRES — PRÉSENCES DÉCLARÉES
  Fichier : authors-presence.js
  Pack SEO-Auteurs-2 — valorisation fiche événement

  Rôle :
  - Afficher les présences déclarées sur event.html sans prétendre à l’exhaustivité.
  - Permettre à un auteur, artiste-auteur, profil hybride ou éditeur de se signaler.
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

  const supabaseClient =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = supabaseClient;
  }

  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");
  const AUTHOR_PORTRAIT_FOLDER = "author-portraits";
  const AUTHOR_PORTRAIT_FALLBACK_FOLDER = "event-images";
  const MAX_AUTHOR_PORTRAIT_SIZE = 4 * 1024 * 1024;

  if (!eventId || !eventDetail) return;

  ensureAuthorPresenceAnchorStyle();
  initAuthorPresence();

  async function initAuthorPresence() {
    const { data: event, error } = await supabaseClient
      .from("events")
      .select("id, title, validated, rejected, start_date, end_date, city, country_code, region, website")
      .eq("id", eventId)
      .maybeSingle();

    // Option visible uniquement pour événement validé et non rejeté.
    if (error || !event || !event.validated || event.rejected) return;

    createAuthorPresenceBlock(event);
    bindAuthorPresenceForm(event);
    bindShareButtons(event);
    const participants = await loadAuthorsPresence(event);
    injectAuthorsPresenceSchema(event, participants);
    scrollToAuthorPresenceIfRequested();
  }

  function createAuthorPresenceBlock(event) {
    if (document.getElementById("authors-presence-section")) return;

    const section = document.createElement("section");
    section.id = "authors-presence-section";
    section.className = "authors-presence";

    section.innerHTML = `
      <div class="authors-presence-header">
        <p class="authors-presence-eyebrow">Présences déclarées</p>
        <h2>Ils ont indiqué leur présence sur Dédicalivres</h2>
        <p class="authors-presence-seo-intro">Cette liste repose sur des déclarations volontaires et ne constitue pas la liste complète des participants.</p>
        <p id="authors-presence-counts" class="authors-presence-counts" hidden></p>
      </div>

      <div id="authors-presence-list" class="author-presence-list"></div>

      <p id="authors-presence-empty" class="author-presence-empty" hidden>
        Aucune présence n’a encore été déclarée sur Dédicalivres pour cet événement.
      </p>

      <form id="author-presence-form" class="author-presence-form">
        <h3>Vous participez à cet événement ?</h3>

        <div class="author-presence-grid author-presence-grid-extended">
          <label>
            <span>Vous participez en tant que</span>
            <select id="participant-type" name="participant_type" required>
              <option value="author">Auteur</option>
              <option value="artist_author">Artiste-auteur</option>
              <option value="hybrid">Auteur et artiste-auteur</option>
              <option value="publisher">Maison d’édition</option>
            </select>
          </label>

          <label class="participant-author-field">
            <span>Nom, prénom ou pseudo d’auteur</span>
            <input name="pseudo" type="text" placeholder="Nom d’auteur, prénom nom ou pseudonyme" minlength="2" maxlength="120" required />
          </label>

          <label class="participant-author-field">
            <span>Votre situation éditoriale</span>
            <select name="publication_mode" required>
              <option value="unknown">Je ne souhaite pas préciser</option>
              <option value="self_published">Autoédition</option>
              <option value="publisher">Maison d’édition</option>
              <option value="hybrid">Les deux / hybride</option>
            </select>
          </label>

          <label class="participant-author-field">
            <span>Lien auteur / réseau social</span>
            <input name="author_profile_url" type="url" placeholder="Site auteur, Instagram, Facebook, Linktree…" />
          </label>

          <label class="participant-author-field">
            <span>Type de lien auteur</span>
            <select name="author_profile_url_type">
              <option value="site_officiel">Site officiel</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="linktree">Linktree</option>
              <option value="autre">Autre</option>
            </select>
          </label>

          <label class="participant-author-field">
            <span>Lien livre / boutique / maison d’édition</span>
            <input name="book_or_publisher_url" type="url" placeholder="Page du livre, boutique auteur, éditeur, librairie…" />
          </label>

          <label class="participant-author-field">
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

          <label class="author-presence-field-wide participant-author-field">
            <span>Nom de la maison d’édition ou de la boutique</span>
            <input name="publisher_name" type="text" placeholder="Optionnel : nom de l’éditeur, boutique ou librairie" />
          </label>

          <label class="author-presence-field-wide author-portrait-field participant-author-field">
            <span>Portrait auteur optionnel</span>
            <input id="author-portrait-input" name="author_portrait" type="file" accept="image/*" />
            <small>
              Photo facultative, utile pour préparer votre future fiche auteur Dédicalivres V2.
              JPG, PNG ou WEBP — moins de 4 Mo.
            </small>
          </label>

          <div id="publisher-presence-fields" class="publisher-presence-fields author-presence-field-wide" hidden>
            <div class="author-presence-grid">
              <label>
                <span>Nom de la maison d’édition</span>
                <input name="organization_name" type="text" minlength="2" maxlength="160" placeholder="Raison sociale ou nom public" />
              </label>
              <label>
                <span>Site de la maison d’édition</span>
                <input name="organization_website" type="url" placeholder="https://..." />
              </label>
              <label>
                <span>Nom du contact — privé</span>
                <input name="contact_name" type="text" maxlength="160" autocomplete="name" />
              </label>
              <label>
                <span>E-mail du contact — privé</span>
                <input name="contact_email" type="email" maxlength="254" autocomplete="email" />
              </label>
            </div>
            <small>Le nom et l’e-mail du contact servent uniquement à la modération et ne sont jamais affichés publiquement.</small>
          </div>
        </div>

        <p class="author-presence-form-help">Liens et portraits vérifiés avant publication.</p>

        <label class="legal-consent">
          <input name="legal_accept" type="checkbox" required />
          <span>
            J’autorise l’association Dédicalivres à relire, modérer et publier cette déclaration de présence
            ainsi que les liens ou portraits transmis, dans le cadre de l’agenda littéraire.
            <a href="conditions-utilisation.html" target="_blank" rel="noopener noreferrer">Conditions d’utilisation</a>
          </span>
        </label>

        <button class="btn-primary" type="submit">Indiquer ma présence</button>
        <p id="author-presence-feedback" aria-live="polite"></p>
      </form>
    `;

    eventDetail.insertAdjacentElement("afterend", section);
  }

  function bindAuthorPresenceForm() {
    const form = document.getElementById("author-presence-form");
    if (!form) return;

    form.querySelector('[name="participant_type"]')?.addEventListener("change", () => {
      syncParticipantTypeForm(form);
    });
    syncParticipantTypeForm(form);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const feedback = document.getElementById("author-presence-feedback");
      const submitButton = form.querySelector('button[type="submit"]');

      const formData = new FormData(form);
      const participantType = cleanSelectValue(
        formData.get("participant_type"),
        ["author", "artist_author", "hybrid", "publisher"],
        "author"
      );
      const isPublisher = participantType === "publisher";
      const organizationName = cleanText(formData.get("organization_name")).slice(0, 160);
      const pseudo = isPublisher ? organizationName : cleanText(formData.get("pseudo"));
      const authorIdentityKey = isPublisher ? "" : slugifyAuthorIdentity(pseudo);
      const publicationMode = cleanSelectValue(formData.get("publication_mode"), ["self_published", "publisher", "hybrid", "unknown"], "unknown");

      const authorProfileUrl = normalizeWebsite(
        isPublisher ? formData.get("organization_website") : formData.get("author_profile_url")
      );
      const authorProfileUrlType = cleanSelectValue(formData.get("author_profile_url_type"), ["site_officiel", "instagram", "facebook", "linktree", "autre"], "autre");

      const bookOrPublisherUrl = normalizeOptionalWebsite(formData.get("book_or_publisher_url"));
      const bookOrPublisherUrlType = cleanSelectValue(formData.get("book_or_publisher_url_type"), ["boutique_auteur", "page_livre", "maison_edition", "librairie", "amazon", "autre"], "autre");

      const publisherName = cleanText(formData.get("publisher_name")).slice(0, 120);
      const contactName = cleanText(formData.get("contact_name")).slice(0, 160);
      const contactEmail = cleanText(formData.get("contact_email")).slice(0, 254).toLowerCase();
      const portraitFile = isPublisher ? null : formData.get("author_portrait");

      try {
        if (formData.get("legal_accept") !== "on") {
          throw new Error("Merci de valider l’autorisation de relecture, modération et publication avant l’envoi.");
        }

        if (pseudo.length < 2) throw new Error(isPublisher ? "Merci d’indiquer le nom de la maison d’édition." : "Merci d’indiquer un pseudo valide.");
        if (isPublisher && !authorProfileUrl) throw new Error("Merci d’indiquer le site de la maison d’édition.");
        if (isPublisher && contactName.length < 2) throw new Error("Merci d’indiquer le nom du contact de la maison d’édition.");
        if (isPublisher && !contactEmail) throw new Error("Merci d’indiquer l’e-mail privé du contact.");
        if (authorProfileUrl && !isValidUrl(authorProfileUrl)) throw new Error("Merci d’indiquer un lien valide ou de laisser le champ vide.");
        if (bookOrPublisherUrl && !isValidUrl(bookOrPublisherUrl)) throw new Error("Merci d’indiquer un second lien valide ou de laisser le champ vide.");
        if (contactEmail && !isValidEmail(contactEmail)) throw new Error("Merci d’indiquer une adresse e-mail de contact valide.");
        validateAuthorPortraitFile(portraitFile);

        setButtonLoading(submitButton, true, "Envoi…");
        setFeedback(feedback, "", "Envoi de votre demande…");

        let authorPortraitUrl = null;
        let authorPortraitStorageKey = null;

        if (portraitFile instanceof File && portraitFile.size > 0) {
          const uploadedPortrait = await uploadAuthorPortrait(portraitFile, authorIdentityKey);
          authorPortraitUrl = uploadedPortrait.url;
          authorPortraitStorageKey = uploadedPortrait.storageKey;
        }

        const extendedPayload = {
          event_id: eventId,
          pseudo,
          author_slug: isPublisher ? null : authorIdentityKey || null,
          author_identity_key: isPublisher ? null : authorIdentityKey || null,
          website: authorProfileUrl || null, // compatibilité avec l’ancien champ
          author_profile_url: authorProfileUrl || null,
          author_profile_url_type: authorProfileUrl ? (isPublisher ? "site_officiel" : authorProfileUrlType) : null,
          publication_mode: isPublisher ? "unknown" : publicationMode,
          book_or_publisher_url: isPublisher ? null : bookOrPublisherUrl || null,
          book_or_publisher_url_type: !isPublisher && bookOrPublisherUrl ? bookOrPublisherUrlType : null,
          publisher_name: isPublisher ? null : publisherName || null,
          author_portrait_url: authorPortraitUrl,
          author_portrait_storage_key: authorPortraitStorageKey,
          participant_type: participantType,
          organization_name: isPublisher ? organizationName : null,
          contact_name: isPublisher ? contactName || null : null,
          contact_email: isPublisher ? contactEmail || null : null,
          presence_verified: false,
          validated: false,
          rejected: false
        };

        const { error } = await supabaseClient
          .from("event_authors_presence")
          .insert([extendedPayload]);

        if (error && isMissingColumnError(error) && !isPublisher) {
          // Fallback compatibilité si la migration SQL n'a pas encore été appliquée.
          const { error: legacyError } = await supabaseClient
            .from("event_authors_presence")
            .insert([{ event_id: eventId, pseudo, website: authorProfileUrl || "https://dedicalivres.fr/", validated: false }]);

          if (legacyError) throw legacyError;
        } else if (error) {
          if (isPublisher && isMissingColumnError(error)) {
            throw new Error("La déclaration d’une maison d’édition nécessite la migration de schéma prévue. Aucune présence auteur n’a été créée à sa place.");
          }
          throw error;
        }

        form.reset();
        syncParticipantTypeForm(form);
        setFeedback(feedback, "success", "Merci, votre demande a bien été envoyée. Elle sera vérifiée avant affichage public.");
      } catch (error) {
        console.error("Erreur auteur présent :", error);
        setFeedback(feedback, "error", error.message || "Une erreur est survenue.");
      } finally {
        setButtonLoading(submitButton, false, "Indiquer ma présence");
      }
    });
  }

  function syncParticipantTypeForm(form) {
    const type = form.querySelector('[name="participant_type"]')?.value || "author";
    const isPublisher = type === "publisher";
    const publisherFields = form.querySelector("#publisher-presence-fields");

    form.querySelectorAll(".participant-author-field input, .participant-author-field select")
      .forEach((field) => {
        field.disabled = isPublisher;
      });

    if (publisherFields) {
      publisherFields.hidden = !isPublisher;
      publisherFields.querySelectorAll("input").forEach((field) => {
        field.disabled = !isPublisher;
      });
    }

    const pseudo = form.querySelector('[name="pseudo"]');
    const organization = form.querySelector('[name="organization_name"]');
    const organizationWebsite = form.querySelector('[name="organization_website"]');
    const contactName = form.querySelector('[name="contact_name"]');
    const contactEmail = form.querySelector('[name="contact_email"]');
    if (pseudo) pseudo.required = !isPublisher;
    if (organization) organization.required = isPublisher;
    if (organizationWebsite) organizationWebsite.required = isPublisher;
    if (contactName) contactName.required = isPublisher;
    if (contactEmail) contactEmail.required = isPublisher;
  }

  function bindShareButtons(event) {
    const copyButton = document.getElementById("author-presence-copy-page");
    if (!copyButton) return;

    copyButton.addEventListener("click", async () => {
      const url = window.location.href.split("#")[0];
      const text = [
        event?.title || "Événement littéraire sur Dédicalivres",
        "",
        "Retrouvez les informations pratiques et les présences déclarées sur cette fiche :",
        url
      ].join("\n");

      try {
        await navigator.clipboard.writeText(text);
        const oldText = copyButton.textContent;
        copyButton.textContent = "Lien copié ✅";
        setTimeout(() => {
          copyButton.textContent = oldText;
        }, 1600);
      } catch (error) {
        window.prompt("Copiez le lien de la fiche :", url);
      }
    });
  }

  async function loadAuthorsPresence(event) {
    const list = document.getElementById("authors-presence-list");
    const empty = document.getElementById("authors-presence-empty");
    const valueBox = document.getElementById("authors-presence-value-box");
    const counts = document.getElementById("authors-presence-counts");

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
      "author_portrait_url",
      "participant_type",
      "organization_name",
      "presence_verified",
      "created_at"
    ].join(", ");

    let response = await supabaseClient
      .from("event_authors_presence")
      .select(selectExtended)
      .eq("event_id", eventId)
      .eq("validated", true)
      .or("rejected.is.null,rejected.eq.false")
      .order("created_at", { ascending: true });

    if (response.error && isMissingColumnError(response.error)) {
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

    const participants = (Array.isArray(response.data) ? response.data : []).map((row) => ({
      ...row,
      participant_type: ["author", "artist_author", "hybrid", "publisher"].includes(row.participant_type)
        ? row.participant_type
        : "author"
    }));

    if (!participants.length) {
      list.innerHTML = "";
      empty.hidden = false;
      if (valueBox) valueBox.hidden = true;
      if (counts) counts.hidden = true;
      return [];
    }

    empty.hidden = true;
    if (valueBox) valueBox.hidden = false;
    if (counts) {
      counts.textContent = buildParticipantCountText(participants);
      counts.hidden = false;
    }

    list.innerHTML = participants.map((participant) => renderParticipantPresenceCard(participant, event)).join("");
    return participants;
  }

  function renderParticipantPresenceCard(participant) {
    const participantType = participant.participant_type || "author";
    const isPublisher = participantType === "publisher";
    const displayName = isPublisher ? participant.organization_name || participant.pseudo : participant.pseudo;
    const profileUrl = participant.author_profile_url || participant.website || "";
    const secondUrl = isPublisher ? "" : participant.book_or_publisher_url || "";
    const profileLabel = isPublisher ? "Site de la maison d’édition" : getAuthorLinkLabel(participant.author_profile_url_type);
    const secondLabel = getSecondLinkLabel(participant.book_or_publisher_url_type, participant.publisher_name);
    const portraitUrl = isPublisher ? "" : resolveImageUrl(participant.author_portrait_url);
    const typeLabel = getParticipantTypeLabel(participantType);

    return `
      <article class="author-presence-card author-presence-card-extended participant-${escapeAttribute(participantType)}">
        <div class="author-presence-avatar" aria-hidden="true">
          ${
            portraitUrl
              ? `<img src="${escapeAttribute(portraitUrl)}" alt="" loading="lazy" decoding="async" />`
              : `<span>${escapeHtml(getAuthorInitials(displayName))}</span>`
          }
        </div>

        <div class="author-presence-card-main">
          <strong>${escapeHtml(displayName)}</strong>
          <small>${escapeHtml(typeLabel)} · présence déclarée${participant.presence_verified ? " · vérifiée" : ""}</small>
        </div>

        <div class="author-presence-links" aria-label="Liens utiles pour ${escapeAttribute(displayName)}">
          ${profileUrl ? `
            <a href="${escapeAttribute(profileUrl)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(profileLabel)}
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

  function buildParticipantCountText(participants) {
    const labels = {
      author: ["auteur", "auteurs"],
      artist_author: ["artiste-auteur", "artistes-auteurs"],
      hybrid: ["profil hybride", "profils hybrides"],
      publisher: ["maison d’édition", "maisons d’édition"]
    };
    const counts = participants.reduce((result, participant) => {
      const type = participant.participant_type || "author";
      result[type] = (result[type] || 0) + 1;
      return result;
    }, {});
    const details = Object.entries(labels)
      .filter(([type]) => counts[type])
      .map(([type, label]) => `${counts[type]} ${label[counts[type] > 1 ? 1 : 0]}`);
    const total = participants.length;
    return `${total} participant${total > 1 ? "s se sont signalés" : " s’est signalé"}${details.length ? ` · ${details.join(" · ")}` : ""}`;
  }

  function getParticipantTypeLabel(type) {
    return {
      author: "Auteur",
      artist_author: "Artiste-auteur",
      hybrid: "Auteur et artiste-auteur",
      publisher: "Maison d’édition"
    }[type] || "Auteur";
  }

  function injectAuthorsPresenceSchema(event, participants) {
    if (!participants || !participants.length) return;

    const performers = participants.map((participant) => {
      const sameAs = [
        participant.author_profile_url || participant.website || "",
        participant.participant_type === "publisher" ? "" : participant.book_or_publisher_url || ""
      ].filter(isValidUrl);

      const performer = {
        "@type": participant.participant_type === "publisher" ? "Organization" : "Person",
        "name": participant.participant_type === "publisher"
          ? participant.organization_name || participant.pseudo
          : participant.pseudo
      };

      if (sameAs.length) performer.sameAs = [...new Set(sameAs)];
      if (participant.participant_type !== "publisher" && participant.author_portrait_url) {
        performer.image = resolveImageUrl(participant.author_portrait_url);
      }
      return performer;
    }).filter((performer) => performer.name);

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
    if (event.city || event.region || event.country_code) {
      const countryName = window.DEDICALIVRES_GEO?.getCountryName(event.country_code) || undefined;
      schema.location = {
        "@type": "Place",
        "name": [event.city, event.region, countryName].filter(Boolean).join(", "),
        "address": {
          "@type": "PostalAddress",
          "addressLocality": event.city || undefined,
          "addressRegion": event.region || undefined,
          "addressCountry": countryName
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

      .authors-presence-seo-intro {
        margin: 8px 0 0;
        color: var(--muted);
        font-weight: 700;
        line-height: 1.65;
      }

      .authors-presence-value-box,
      .authors-presence-share-box {
        margin: 18px 0;
        padding: 18px;
        border-radius: 22px;
        border: 1px solid rgba(255,107,53,.14);
        background:
          radial-gradient(circle at top left, rgba(255,107,53,.12), transparent 34%),
          rgba(255,255,255,.78);
      }

      .authors-presence-value-box strong,
      .authors-presence-value-box summary,
      .authors-presence-share-box strong {
        display: block;
        color: var(--purple);
        font-weight: 900;
        margin-bottom: 6px;
      }

      .authors-presence-value-box summary {
        cursor: pointer;
      }

      .authors-presence-value-box p,
      .authors-presence-share-box p,
      .author-presence-card-main p {
        margin: 0;
        color: var(--muted);
        font-weight: 700;
        line-height: 1.55;
      }

      .authors-presence-share-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .authors-presence-share-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
      }

      .author-presence-card-main p {
        margin-top: 6px;
        font-size: .92rem;
      }

      .author-presence-form-help {
        color: var(--muted);
        font-weight: 700;
        line-height: 1.6;
      }

      @media (max-width: 760px) {
        .authors-presence-share-box {
          align-items: flex-start;
          flex-direction: column;
        }

        .authors-presence-share-actions {
          justify-content: flex-start;
        }
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

  function resolveImageUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${config.assetsBaseUrl || ""}${path}`;
  }

  function getAuthorInitials(value) {
    const words = cleanText(value)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    const initials = words.map((word) => word[0]).join("").toUpperCase();
    return initials || "A";
  }

  function validateAuthorPortraitFile(file) {
    if (!(file instanceof File) || !file.size) return;

    if (!file.type.startsWith("image/")) {
      throw new Error("Le portrait doit être une image.");
    }

    if (file.size > MAX_AUTHOR_PORTRAIT_SIZE) {
      throw new Error("Le portrait est trop lourd. Merci d’utiliser une image de moins de 4 Mo.");
    }
  }

  async function uploadAuthorPortrait(file, authorIdentityKey) {
    if (!shouldUseR2Upload()) {
      throw new Error("L’upload du portrait n’est pas disponible pour le moment.");
    }

    const compressed = await compressAuthorPortrait(file, authorIdentityKey);
    let url = "";

    try {
      url = await uploadImageToR2(compressed, AUTHOR_PORTRAIT_FOLDER, authorIdentityKey);
    } catch (error) {
      console.warn("Upload portrait auteur dans author-portraits indisponible, bascule R2 event-images :", error);
      url = await uploadImageToR2(compressed, AUTHOR_PORTRAIT_FALLBACK_FOLDER, authorIdentityKey);
    }

    return {
      url,
      storageKey: getR2StorageKey(url)
    };
  }

  function shouldUseR2Upload() {
    return (
      config?.imageUploadProvider === "r2" &&
      typeof config.imageUploadEndpoint === "string" &&
      config.imageUploadEndpoint.trim().startsWith("http")
    );
  }

  async function uploadImageToR2(file, folder, authorIdentityKey) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    formData.append("file_name", file.name);
    formData.append("identity_key", authorIdentityKey || "auteur");

    const response = await fetch(config.imageUploadEndpoint, {
      method: "POST",
      body: formData
    });

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || `Upload R2 impossible (${response.status})`);
    }

    return payload.url;
  }

  function compressAuthorPortrait(file, authorIdentityKey) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Lecture du portrait impossible."));
      reader.onload = (event) => {
        img.onload = () => {
          const maxWidth = 900;
          const ratio = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");

          canvas.width = Math.max(1, Math.round(img.width * ratio));
          canvas.height = Math.max(1, Math.round(img.height * ratio));

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Compression du portrait impossible."));
                return;
              }

              const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
              const safeName = `${authorIdentityKey || "auteur"}-${stamp}-${Math.random().toString(36).slice(2, 8)}.jpg`;
              resolve(new File([blob], safeName, { type: "image/jpeg" }));
            },
            "image/jpeg",
            0.82
          );
        };

        img.onerror = () => reject(new Error("Portrait invalide."));
        img.src = event.target.result;
      };

      reader.readAsDataURL(file);
    });
  }

  function getR2StorageKey(url) {
    try {
      const parsed = new URL(url);
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    } catch {
      return "";
    }
  }

  function slugifyAuthorIdentity(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
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

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || error?.details || "").toLowerCase();
    return ["42703", "PGRST204"].includes(code) || (
      message.includes("column") &&
      (message.includes("does not exist") || message.includes("schema cache"))
    );
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
