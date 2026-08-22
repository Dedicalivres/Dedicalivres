/* =========================================================
   DÉDICALIVRES — ADMIN PRÉSENCES DÉCLARÉES
   Pack SEO-Auteurs-1
   Fichier : admin-author-requests-robust.js

   Rôle :
   - Modérer les déclarations de présence liées aux événements.
   - Gérer le statut AE / ME / Hybride.
   - Gérer les deux liens : auteur/réseau + livre/boutique/éditeur.
========================================================= */

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    console.warn("Admin auteurs : configuration Supabase indisponible.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  let rows = [];
  let authors = [];
  let authorsLoadError = "";
  let currentFilter = "pending";
  let currentProfileFilter = "all";
  let currentSearch = "";
  let currentAuthorPreparationFilter = "all";
  let currentAuthorPreparationSearch = "";
  let currentAuthorPreparationSort = "priority";
  let duplicateGroups = [];
  let duplicateById = new Map();
  let authorDuplicateGroups = [];

  ensureStyles();
  bindAuthEvents();

  function bindAuthEvents() {
    window.addEventListener("dedicalivres:admin-authenticated", init);
    window.addEventListener("dedicalivres:admin-dashboard-refreshed", refreshIfVisible);

    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED) {
      init();
    }
  }

  async function init() {
    ensurePanel();
    await loadRows();
    render();
  }

  async function refreshIfVisible() {
    if (!document.getElementById("author-requests-admin-panel")) return;
    await loadRows();
    render();
  }

  function ensurePanel() {
    const moderationTab = document.getElementById("tab-moderation");
    if (!moderationTab || document.getElementById("author-requests-admin-panel")) return;

    const panel = document.createElement("section");
    panel.id = "author-requests-admin-panel";
    panel.className = "admin-panel author-requests-admin-panel";
    panel.innerHTML = `
      <div class="section-head">
        <h3>PRÉSENCES DÉCLARÉES</h3>
        <span id="author-requests-count">Chargement…</span>
      </div>

      <div class="author-requests-toolbar">
        <button type="button" class="cyber-btn-secondary is-active" data-author-filter="pending">À vérifier</button>
        <button type="button" class="cyber-btn-secondary" data-author-filter="validated">Validées</button>
        <button type="button" class="cyber-btn-secondary" data-author-filter="rejected">Rejetées</button>
        <button type="button" class="cyber-btn-secondary" data-author-filter="duplicates">Doublons probables</button>
        <button type="button" class="cyber-btn-secondary" data-author-filter="all">Toutes</button>
        <button type="button" class="cyber-btn-primary" id="author-requests-refresh">Actualiser</button>
      </div>

      <div class="author-requests-filters" aria-label="Filtres des présences déclarées">
        <label>
          <span>Rechercher</span>
          <input id="author-requests-search" type="search" placeholder="Nom ou événement" autocomplete="off" />
        </label>
        <label>
          <span>Type de profil</span>
          <select id="author-requests-profile-filter">
            <option value="all">Tous les profils</option>
            <option value="author">Auteur</option>
            <option value="artist_author">Artiste-auteur</option>
            <option value="hybrid">Hybride</option>
            <option value="publisher">Maison d’édition</option>
          </select>
        </label>
      </div>

      <section class="author-preparation-cockpit" aria-labelledby="author-preparation-title">
        <div class="author-preparation-head">
          <div>
            <h4 id="author-preparation-title">FICHES AUTEURS PRÉPARÉES</h4>
            <p>
              Préparation interne uniquement. Aucune fiche n’est publiée ou créée automatiquement en base.
            </p>
          </div>
          <div id="author-preparation-counts" class="author-preparation-counts"></div>
        </div>

        <div class="author-preparation-tools">
          <div class="author-preparation-filters" aria-label="Filtres des fiches auteurs préparées">
            <button type="button" class="is-active" data-author-preparation-filter="all">Toutes</button>
            <button type="button" data-author-preparation-filter="ready">Prêtes</button>
            <button type="button" data-author-preparation-filter="enrich">À enrichir</button>
            <button type="button" data-author-preparation-filter="incomplete">Incomplètes</button>
            <button type="button" data-author-preparation-filter="duplicate">Doublons</button>
            <button type="button" data-author-preparation-filter="photo">Photo manquante</button>
          </div>

          <div class="author-preparation-controls">
            <label>
              <span>Rechercher un auteur</span>
              <input
                id="author-preparation-search"
                type="search"
                placeholder="Nom, profil, élément manquant…"
                autocomplete="off"
              />
            </label>

            <label>
              <span>Trier par</span>
              <select id="author-preparation-sort">
                <option value="priority">Priorité de traitement</option>
                <option value="name">Nom A → Z</option>
                <option value="presence">Plus de présences</option>
              </select>
            </label>
          </div>

          <p id="author-preparation-visible-count" class="author-preparation-visible-count"></p>
        </div>

        <div id="author-preparation-list" class="author-preparation-list">
          Chargement…
        </div>
      </section>

      <div id="author-requests-list" class="author-requests-list">
        Chargement…
      </div>
    `;

    moderationTab.prepend(panel);

    panel.addEventListener("click", handlePanelClick);
    panel.addEventListener("change", handlePanelChange);
    panel.addEventListener("input", handlePanelInput);
  }

  async function loadRows() {
    const selectExtended = [
      "id",
      "event_id",
      "pseudo",
      "website",
      "author_profile_url",
      "author_profile_url_type",
      "publication_mode",
      "book_or_publisher_url",
      "book_or_publisher_url_type",
      "publisher_name",
      "author_id",
      "author_slug",
      "author_identity_key",
      "author_portrait_url",
      "participant_type",
      "organization_name",
      "contact_name",
      "contact_email",
      "presence_verified",
      "admin_note",
      "validated",
      "rejected",
      "created_at",
      "events(id, title, city, region, start_date, end_date, validated, rejected)"
    ].join(", ");

    let response = await supabaseClient
      .from("event_authors_presence")
      .select(selectExtended)
      .order("created_at", { ascending: false })
      .limit(200);

    if (response.error && isMissingColumnError(response.error)) {
      // Fallback si la relation events ou les nouvelles colonnes ne sont pas encore disponibles.
      response = await supabaseClient
        .from("event_authors_presence")
        .select("id, event_id, pseudo, website, validated, rejected, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
    }

    if (response.error) {
      console.warn("Admin auteurs : chargement impossible", response.error);
      rows = [];
      authors = [];
      refreshDuplicateIndex();
      publishAuthorRequestCounter(0, true);
      showListError(response.error.message || "Chargement impossible.");
      return;
    }

    rows = (Array.isArray(response.data) ? response.data : []).map((row) => ({
      ...row,
      participant_type: ["author", "artist_author", "hybrid", "publisher"].includes(row.participant_type)
        ? row.participant_type
        : "author"
    }));
    await loadAuthorProfiles();
    refreshDuplicateIndex();
    publishAuthorRequestCounter(rows.filter(isPending).length, false);
  }

  async function loadAuthorProfiles() {
    const columns = "id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at";
    let response = await supabaseClient
      .from("authors")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(300);

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabaseClient
        .from("authors")
        .select("id, pseudo, slug, website, validated, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
    }

    if (response.error) {
      authors = [];
      authorsLoadError = response.error.message || "Fiches authors indisponibles";
      console.warn("Admin auteurs : fiches auteurs indisponibles", response.error);
      return;
    }

    authors = Array.isArray(response.data) ? response.data : [];
    authorsLoadError = "";
  }

  function render() {
    const count = document.getElementById("author-requests-count");
    const list = document.getElementById("author-requests-list");

    if (!list) return;

    const filtered = filterBySearch(
      filterByProfile(filterRows(rows, currentFilter), currentProfileFilter),
      currentSearch
    );

    if (count) {
      const pending = rows.filter(isPending).length;
      const profileCounts = buildProfileCounts(rows);

      count.innerHTML = `
        <span>${filtered.length} affichée(s)</span>
        <span>${pending} à vérifier</span>
        <span>${duplicateGroups.length} doublon(s) probable(s)</span>
        <span class="author-admin-profile-count is-author">${profileCounts.author} auteur${profileCounts.author > 1 ? "s" : ""}</span>
        <span class="author-admin-profile-count is-artist_author">${profileCounts.artist_author} artiste${profileCounts.artist_author > 1 ? "s-auteurs" : "-auteur"}</span>
        <span class="author-admin-profile-count is-hybrid">${profileCounts.hybrid} hybride${profileCounts.hybrid > 1 ? "s" : ""}</span>
        <span class="author-admin-profile-count is-publisher">${profileCounts.publisher} maison${profileCounts.publisher > 1 ? "s d’édition" : " d’édition"}</span>
      `;

      publishAuthorRequestCounter(pending, false);
    }

    const authorEngine = window.DEDICALIVRES_AUTHOR_BACKOFFICE;

    authorDuplicateGroups =
      authorEngine && typeof authorEngine.findProbableAuthorDuplicates === "function"
        ? authorEngine.findProbableAuthorDuplicates(authors)
        : [];

    renderAuthorPreparationCockpit();

    const preparationList = document.getElementById("author-preparation-list");

    if (preparationList && authorDuplicateGroups.length) {
      preparationList.insertAdjacentHTML(
        "afterbegin",
        renderAuthorDuplicateSummary()
      );
    }

    if (!filtered.length) {
      list.innerHTML = `<p class="priority-empty">Aucune déclaration de présence pour ce filtre.</p>`;
      return;
    }

    list.innerHTML = filtered.map(renderCard).join("");
  }

  function renderAuthorDuplicateSummary() {
    const count = authorDuplicateGroups.length;

    if (!count) return "";

    return `
      <div class="author-duplicate-summary" data-author-duplicate-summary>
        <strong>
          ${count} doublon${count > 1 ? "s" : ""} auteur probable${count > 1 ? "s" : ""}
        </strong>
        <span>Détection uniquement — aucune fusion automatique.</span>
      </div>
    `;
  }

  function buildPreparedAuthors() {
    const engine = window.DEDICALIVRES_AUTHOR_BACKOFFICE;
    if (!engine) return [];

    const grouped = new Map();

    rows
      .filter((row) => row.participant_type !== "publisher")
      .forEach((row) => {
        const key = engine.getIdentityKey(row);
        if (!key) return;

        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
      });

    return Array.from(grouped.entries()).map(([key, presences]) => {
      const reference = presences[0];
      const author = engine.findAuthorForPresence(authors, reference);
      const duplicate = presences.some((row) => duplicateById.has(String(row.id || "")));
      const draft = engine.buildAuthorDraft({
        author: author || {
          pseudo: engine.getPresenceName(reference),
          slug: reference.author_slug || reference.author_identity_key || "",
          participant_type: reference.participant_type,
          avatar_url: reference.author_portrait_url || null,
          website: reference.author_profile_url || reference.website || null,
          validated: presences.some((row) => row.validated === true)
        },
        presences,
        duplicate
      });

      return {
        key,
        draft,
        presences,
        author: author || null
      };
    }).sort((left, right) => {
      const rank = {
        ready: 0,
        enrich: 1,
        incomplete: 2
      };

      const statusDiff =
        (rank[left.draft.status] ?? 9) -
        (rank[right.draft.status] ?? 9);

      if (statusDiff) return statusDiff;

      return String(left.draft.identity || "")
        .localeCompare(String(right.draft.identity || ""), "fr");
    });
  }

  function filterPreparedAuthors(items) {
    let filtered = Array.isArray(items) ? [...items] : [];

    if (currentAuthorPreparationFilter === "ready") {
      filtered = filtered.filter((item) => item.draft.status === "ready");
    } else if (currentAuthorPreparationFilter === "enrich") {
      filtered = filtered.filter((item) => item.draft.status === "enrich");
    } else if (currentAuthorPreparationFilter === "incomplete") {
      filtered = filtered.filter((item) => item.draft.status === "incomplete");
    } else if (currentAuthorPreparationFilter === "duplicate") {
      filtered = filtered.filter((item) => item.draft.duplicate === true);
    } else if (currentAuthorPreparationFilter === "photo") {
      filtered = filtered.filter((item) => !item.draft.photo);
    }

    const query = normalizeSearch(currentAuthorPreparationSearch);

    if (query) {
      filtered = filtered.filter((item) => {
        const draft = item.draft || {};

        return normalizeSearch([
          draft.identity,
          draft.profileLabel,
          draft.location,
          ...(draft.missingLabels || [])
        ].filter(Boolean).join(" ")).includes(query);
      });
    }

    return sortPreparedAuthors(filtered, currentAuthorPreparationSort);
  }

  function sortPreparedAuthors(items, sortMode) {
    const result = [...items];

    if (sortMode === "name") {
      return result.sort((left, right) =>
        String(left.draft.identity || "")
          .localeCompare(String(right.draft.identity || ""), "fr")
      );
    }

    if (sortMode === "presence") {
      return result.sort((left, right) => {
        const leftCount = left.presences.filter(
          (row) => row.validated === true && row.rejected !== true
        ).length;

        const rightCount = right.presences.filter(
          (row) => row.validated === true && row.rejected !== true
        ).length;

        if (rightCount !== leftCount) return rightCount - leftCount;

        return String(left.draft.identity || "")
          .localeCompare(String(right.draft.identity || ""), "fr");
      });
    }

    return result.sort((left, right) => {
      const priority = (item) => {
        if (item.draft.duplicate === true) return 0;
        if (!item.draft.photo) return 1;
        if (item.draft.status === "incomplete") return 2;
        if (item.draft.status === "enrich") return 3;
        if (item.draft.status === "ready") return 4;
        return 5;
      };

      const priorityDiff = priority(left) - priority(right);
      if (priorityDiff) return priorityDiff;

      const historyDiff =
        (right.draft.historyCount || 0) -
        (left.draft.historyCount || 0);

      if (historyDiff) return historyDiff;

      return String(left.draft.identity || "")
        .localeCompare(String(right.draft.identity || ""), "fr");
    });
  }

  function renderAuthorPreparationCockpit() {
    const counts = document.getElementById("author-preparation-counts");
    const list = document.getElementById("author-preparation-list");
    const visibleCount = document.getElementById("author-preparation-visible-count");

    if (!counts || !list) return;

    const prepared = buildPreparedAuthors();

    const summary = {
      ready: prepared.filter((item) => item.draft.status === "ready").length,
      enrich: prepared.filter((item) => item.draft.status === "enrich").length,
      incomplete: prepared.filter((item) => item.draft.status === "incomplete").length,
      duplicate: prepared.filter((item) => item.draft.duplicate === true).length,
      photo: prepared.filter((item) => !item.draft.photo).length
    };

    counts.innerHTML = `
      <span class="author-preparation-count is-ready">${summary.ready} prête(s)</span>
      <span class="author-preparation-count is-enrich">${summary.enrich} à enrichir</span>
      <span class="author-preparation-count is-incomplete">${summary.incomplete} incomplète(s)</span>
      <span class="author-preparation-count is-duplicate">${summary.duplicate} doublon(s)</span>
      <span class="author-preparation-count is-photo">${summary.photo} photo(s) manquante(s)</span>
    `;

    const filtered = filterPreparedAuthors(prepared);

    if (visibleCount) {
      visibleCount.textContent =
        `${filtered.length} fiche(s) affichée(s) sur ${prepared.length}`;
    }

    document.querySelectorAll("[data-author-preparation-filter]").forEach((button) => {
      const active =
        button.dataset.authorPreparationFilter === currentAuthorPreparationFilter;

      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const searchInput = document.getElementById("author-preparation-search");
    if (searchInput && searchInput.value !== currentAuthorPreparationSearch) {
      searchInput.value = currentAuthorPreparationSearch;
    }

    const sortSelect = document.getElementById("author-preparation-sort");
    if (sortSelect && sortSelect.value !== currentAuthorPreparationSort) {
      sortSelect.value = currentAuthorPreparationSort;
    }

    if (!prepared.length) {
      list.innerHTML =
        `<p class="priority-empty">Aucune identité auteur exploitable pour le moment.</p>`;
      return;
    }

    if (!filtered.length) {
      list.innerHTML =
        `<p class="priority-empty">Aucune fiche auteur ne correspond à ces critères.</p>`;
      return;
    }

    list.innerHTML = filtered.map(({ draft, presences, author }) => {
      const validPresenceCount = presences.filter(
        (row) => row.validated === true && row.rejected !== true
      ).length;

      const slug = draft.slug || "";
      const targetPresence = presences.find(
        (row) => row.validated === true && row.rejected !== true
      ) || presences[0] || {};
      const targetPresenceId = String(targetPresence.id || "");

      const previewLink = slug
        ? `<a href="author.html?slug=${encodeURIComponent(slug)}&preview=admin" target="_blank" rel="noopener noreferrer">Aperçu interne</a>`
        : `<span class="author-preparation-no-preview">Aperçu indisponible</span>`;

      const moderationAction = targetPresenceId
        ? `<button
             type="button"
             class="author-preparation-jump"
             data-author-preparation-action="${draft.duplicate ? "duplicate" : "presence"}"
             data-presence-id="${escapeAttribute(targetPresenceId)}"
             data-author-name="${escapeAttribute(draft.identity || "")}"
           >${draft.duplicate ? "Voir les doublons" : "Voir la présence"}</button>`
        : "";

      const editAuthorAction = author?.id
        ? `<button
             type="button"
             class="author-preparation-edit"
             data-author-edit-id="${escapeAttribute(author.id)}"
           >Modifier la fiche</button>`
        : "";

      const canCreateAuthor =
        !author?.id &&
        draft.duplicate !== true &&
        validPresenceCount > 0 &&
        draft.profileType !== "publisher" &&
        Boolean(slug) &&
        Boolean(draft.identity);

      const createAuthorAction = canCreateAuthor
        ? `<button
             type="button"
             class="author-preparation-create"
             data-author-create-key="${escapeAttribute(String(slug))}"
           >Créer la fiche</button>`
        : "";

      const missing = draft.missingLabels.length
        ? draft.missingLabels.join(" · ")
        : "Aucun élément bloquant";

      let priorityLabel = "Prête pour plus tard";

      if (draft.duplicate) {
        priorityLabel = "Priorité : résoudre le doublon";
      } else if (!draft.photo) {
        priorityLabel = "Priorité : ajouter une photo";
      } else if (draft.status === "incomplete") {
        priorityLabel = "Priorité : compléter la fiche";
      } else if (draft.status === "enrich") {
        priorityLabel = "À enrichir";
      }

      return `
        <article
          class="author-preparation-card is-${escapeAttribute(draft.status)}${draft.duplicate ? " has-duplicate" : ""}"
          data-author-preparation-status="${escapeAttribute(draft.status)}"
        >
          <div class="author-preparation-main">
            <div>
              <strong>${escapeHtml(draft.identity || "Identité inconnue")}</strong>
              <small>${escapeHtml(draft.profileLabel || "Auteur")}</small>
            </div>

            <span class="author-preparation-status is-${escapeAttribute(draft.status)}">
              ${escapeHtml(draft.statusLabel)}
            </span>
          </div>

          <div class="author-preparation-priority">
            ${escapeHtml(priorityLabel)}
          </div>

          <div class="author-preparation-meta">
            <span>${validPresenceCount} présence(s) validée(s)</span>
            <span>${draft.historyCount || 0} événement(s) historique(s)</span>
            ${draft.photo
              ? `<span class="is-photo-ok">Photo OK</span>`
              : `<span class="is-photo-missing">Photo manquante</span>`}
            ${draft.duplicate
              ? `<span class="is-warning">Doublon à résoudre</span>`
              : ""}
          </div>

          <p class="author-preparation-missing">
            ${escapeHtml(missing)}
          </p>

          <div class="author-preparation-actions">
            ${moderationAction}
            ${editAuthorAction}
            ${createAuthorAction}
            ${previewLink}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderCard(row) {
    const event = row.events || {};
    const eventTitle = event.title || `Événement ${row.event_id || ""}`;
    const eventMeta = [event.start_date, event.city, event.region].filter(Boolean).join(" · ");
    const status = row.validated ? "validée" : row.rejected ? "refusée" : "en attente";
    const isPublisher = row.participant_type === "publisher";
    const displayName = isPublisher ? row.organization_name || row.pseudo : row.pseudo;
    const duplicate = duplicateById.get(String(row.id || ""));
    const submissionDate = formatSubmissionDate(row.created_at);
    const authorContext = getAuthorContext(row, !!duplicate);

    return `
      <article class="author-request-card${duplicate ? " is-duplicate" : ""}" data-request-id="${escapeAttribute(row.id)}">
        <div class="author-request-head">
          <div>
            <strong>${escapeHtml(displayName || "Participant sans nom")}</strong>
            <small>${escapeHtml(eventTitle)}${eventMeta ? ` — ${escapeHtml(eventMeta)}` : ""}</small>
            <div class="author-request-meta">
              <span class="author-request-profile is-${escapeAttribute(row.participant_type)}">${escapeHtml(getParticipantTypeLabel(row.participant_type))}</span>
              ${submissionDate ? `<time datetime="${escapeAttribute(String(row.created_at || ""))}">Soumise le ${escapeHtml(submissionDate)}</time>` : ""}
              ${duplicate ? `<span class="author-request-duplicate" title="${escapeAttribute(duplicate.reasons.join(" · "))}">Doublon probable · groupe ${duplicate.group}</span>` : ""}
            </div>
          </div>
          <span class="author-request-status is-${statusToClass(status)}">${escapeHtml(status)}</span>
        </div>

        <div class="author-request-grid">
          <label>
            <span>Type de participant</span>
            <select data-field="participant_type">
              ${option("author", "Auteur", row.participant_type)}
              ${option("artist_author", "Artiste-auteur", row.participant_type)}
              ${option("hybrid", "Auteur et artiste-auteur", row.participant_type)}
              ${option("publisher", "Maison d’édition", row.participant_type)}
            </select>
          </label>

          <label>
            <span>Nom / pseudo historique</span>
            <input data-field="pseudo" value="${escapeAttribute(row.pseudo || "")}" />
          </label>

          <label>
            <span>Organisation</span>
            <input data-field="organization_name" value="${escapeAttribute(row.organization_name || "")}" />
          </label>

          <label>
            <span>Situation éditoriale</span>
            <select data-field="publication_mode">
              ${option("unknown", "Non précisé", row.publication_mode)}
              ${option("self_published", "Autoédition", row.publication_mode)}
              ${option("publisher", "Maison d’édition", row.publication_mode)}
              ${option("hybrid", "Hybride", row.publication_mode)}
            </select>
          </label>

          <label>
            <span>Lien auteur / réseau</span>
            <input data-field="author_profile_url" value="${escapeAttribute(row.author_profile_url || row.website || "")}" placeholder="https://..." />
          </label>

          <label>
            <span>Type lien auteur</span>
            <select data-field="author_profile_url_type">
              ${option("site_officiel", "Site officiel", row.author_profile_url_type)}
              ${option("instagram", "Instagram", row.author_profile_url_type)}
              ${option("facebook", "Facebook", row.author_profile_url_type)}
              ${option("linktree", "Linktree", row.author_profile_url_type)}
              ${option("autre", "Autre", row.author_profile_url_type)}
            </select>
          </label>

          <label>
            <span>Lien livre / boutique / éditeur</span>
            <input data-field="book_or_publisher_url" value="${escapeAttribute(row.book_or_publisher_url || "")}" placeholder="https://..." />
          </label>

          <label>
            <span>Type second lien</span>
            <select data-field="book_or_publisher_url_type">
              ${option("page_livre", "Page du livre", row.book_or_publisher_url_type)}
              ${option("maison_edition", "Maison d’édition", row.book_or_publisher_url_type)}
              ${option("boutique_auteur", "Boutique auteur", row.book_or_publisher_url_type)}
              ${option("librairie", "Librairie", row.book_or_publisher_url_type)}
              ${option("amazon", "Amazon", row.book_or_publisher_url_type)}
              ${option("autre", "Autre", row.book_or_publisher_url_type)}
            </select>
          </label>

          <label>
            <span>Nom éditeur / boutique</span>
            <input data-field="publisher_name" value="${escapeAttribute(row.publisher_name || "")}" />
          </label>

          <label>
            <span>Note admin</span>
            <input data-field="admin_note" value="${escapeAttribute(row.admin_note || "")}" />
          </label>

          <label>
            <span>Contact privé</span>
            <input data-field="contact_name" value="${escapeAttribute(row.contact_name || "")}" />
          </label>

          <label>
            <span>E-mail privé</span>
            <input data-field="contact_email" type="email" value="${escapeAttribute(row.contact_email || "")}" />
          </label>

          <label class="author-request-check">
            <span>Vérification</span>
            <input data-field="presence_verified" type="checkbox" ${row.presence_verified ? "checked" : ""} />
            Présence vérifiée
          </label>
        </div>

        <div class="author-request-links">
          ${renderCheckLink("Lien auteur", row.author_profile_url || row.website)}
          ${renderCheckLink("Lien livre/éditeur", row.book_or_publisher_url)}
        </div>

        ${renderAuthorReadiness(authorContext, row)}

        <div class="author-request-actions">
          <button type="button" class="cyber-btn-secondary" data-action="save">Enregistrer</button>
          <button type="button" class="cyber-btn-primary" data-action="validate">Valider</button>
          <button type="button" class="cyber-btn-danger" data-action="reject">Refuser</button>
          <button type="button" class="cyber-btn-secondary" data-action="hide">Masquer</button>
        </div>
      </article>
    `;
  }

  async function handlePanelClick(event) {
    const authorPreparationAction = event.target.closest("[data-author-preparation-action]");

    if (authorPreparationAction) {
      focusPresenceFromCockpit(authorPreparationAction);
      return;
    }

    const authorPreparationFilter = event.target.closest("[data-author-preparation-filter]");

    if (authorPreparationFilter) {
      currentAuthorPreparationFilter =
        authorPreparationFilter.dataset.authorPreparationFilter || "all";

      renderAuthorPreparationCockpit();
      return;
    }

    const filterButton = event.target.closest("[data-author-filter]");
    if (filterButton) {
      currentFilter = filterButton.dataset.authorFilter || "pending";
      document.querySelectorAll("[data-author-filter]").forEach((button) => {
        button.classList.toggle("is-active", button === filterButton);
        button.setAttribute("aria-pressed", String(button === filterButton));
      });
      render();
      return;
    }

    if (event.target.closest("#author-requests-refresh")) {
      await loadRows();
      render();
      toast("Présences déclarées actualisées");
      return;
    }

    const authorEditButton = event.target.closest("[data-author-edit-id]");

    if (authorEditButton) {
      openAuthorEditor(authorEditButton.dataset.authorEditId);
      return;
    }

    const authorCreateButton = event.target.closest("[data-author-create-key]");

    if (authorCreateButton) {
      await createAuthorFromCockpit(authorCreateButton);
      return;
    }

    const authorEditorAction = event.target.closest("[data-author-editor-action]");

    if (authorEditorAction) {
      const action = authorEditorAction.dataset.authorEditorAction;

      if (action === "cancel") {
        closeAuthorEditor();
        return;
      }

      if (action === "save") {
        await saveAuthorEditor();
        return;
      }
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const card = actionButton.closest(".author-request-card");
    if (!card) return;

    const id = card.dataset.requestId;
    const action = actionButton.dataset.action;

    await updateRequestFromCard(id, card, action);
  }

  async function createAuthorFromCockpit(button) {
    const key = String(button.dataset.authorCreateKey || "").trim();

    if (!key) {
      toast("Identité auteur inexploitable");
      return;
    }

    const prepared = buildPreparedAuthors().find((item) => {
      const slug = String(item?.draft?.slug || "").trim();
      return slug === key;
    });

    if (!prepared) {
      toast("Fiche préparée introuvable");
      return;
    }

    if (prepared.author?.id) {
      toast("Cette fiche auteur existe déjà");
      return;
    }

    const draft = prepared.draft || {};
    const presences = Array.isArray(prepared.presences) ? prepared.presences : [];
    const validPresences = presences.filter(
      (row) => row.validated === true && row.rejected !== true
    );

    if (!validPresences.length) {
      toast("Une présence validée est nécessaire");
      return;
    }

    if (draft.duplicate === true) {
      toast("Résolvez le doublon avant de créer la fiche");
      return;
    }

    if (draft.profileType === "publisher") {
      toast("Les maisons d’édition ne créent pas de fiche auteur");
      return;
    }

    const pseudo = String(draft.identity || "").trim();
    const slug = String(draft.slug || "").trim();

    if (!pseudo || !slug) {
      toast("Nom ou identifiant auteur manquant");
      return;
    }

    const alreadyExists = authors.some((author) =>
      String(author?.slug || "").trim() === slug
    );

    if (alreadyExists) {
      toast("Une fiche avec cet identifiant existe déjà");
      return;
    }

    const confirmed = window.confirm(
      `Créer une fiche auteur interne pour « ${pseudo} » ?\n\n` +
      "Cette fiche sera créée non validée et ne sera pas publiée automatiquement."
    );

    if (!confirmed) return;

    const sourcePresence =
      validPresences.find((row) => row.author_portrait_url) ||
      validPresences[0];

    const website =
      normalizeOptionalUrl(
        sourcePresence.author_profile_url ||
        sourcePresence.website ||
        draft.primaryLink ||
        ""
      ) || null;

    const avatarUrl =
      normalizeOptionalUrl(
        sourcePresence.author_portrait_url ||
        draft.photo ||
        ""
      ) || null;

    const profileType = ["author", "artist_author", "hybrid"].includes(draft.profileType)
      ? draft.profileType
      : null;

    const payload = {
      pseudo,
      slug,
      website,
      bio: null,
      avatar_url: avatarUrl,
      location: draft.location || null,
      shop_url: draft.secondaryLink || null,
      profile_type: profileType,
      validated: false
    };

    button.disabled = true;

    const { data, error } = await supabaseClient
      .from("authors")
      .insert(payload)
      .select("id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at, updated_at")
      .single();

    if (error) {
      button.disabled = false;
      console.warn("Admin auteurs : création fiche impossible", error);
      toast("Erreur lors de la création de la fiche auteur");
      return;
    }

    if (!data?.id) {
      button.disabled = false;
      toast("La fiche auteur n’a pas pu être confirmée");
      return;
    }

    await loadRows();
    render();

    toast("Fiche auteur créée — à enrichir et valider");
  }

  function openAuthorEditor(authorId) {
    const author = authors.find((item) => String(item.id || "") === String(authorId || ""));

    if (!author) {
      toast("Fiche auteur introuvable");
      return;
    }

    closeAuthorEditor();

    const wrapper = document.createElement("div");
    wrapper.id = "author-editor-overlay";
    wrapper.className = "author-editor-overlay";

    wrapper.innerHTML = `
      <section class="author-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="author-editor-title">
        <div class="author-editor-head">
          <div>
            <h4 id="author-editor-title">MODIFIER LA FICHE AUTEUR</h4>
            <p>Modification interne. Cette action ne publie pas la fiche auteur.</p>
          </div>
          <button type="button" class="author-editor-close" data-author-editor-action="cancel" aria-label="Fermer">×</button>
        </div>

        <input type="hidden" id="author-editor-id" value="${escapeAttribute(author.id)}" />

        <div class="author-editor-grid">
          <label>
            <span>Nom / pseudo</span>
            <input id="author-editor-pseudo" value="${escapeAttribute(author.pseudo || "")}" />
          </label>

          <label>
            <span>Slug</span>
            <input id="author-editor-slug" value="${escapeAttribute(author.slug || "")}" readonly />
          </label>

          <label class="author-editor-full">
            <span>Biographie</span>
            <textarea id="author-editor-bio" rows="7">${escapeHtml(author.bio || "")}</textarea>
          </label>

          <label>
            <span>Site principal</span>
            <input id="author-editor-website" type="url" value="${escapeAttribute(author.website || "")}" placeholder="https://..." />
          </label>

          <label>
            <span>Photo / avatar</span>
            <input id="author-editor-avatar" type="url" value="${escapeAttribute(author.avatar_url || "")}" placeholder="https://..." />
          </label>

          <label>
            <span>Localisation</span>
            <input id="author-editor-location" value="${escapeAttribute(author.location || "")}" placeholder="Ex. Bretagne" />
          </label>

          <label>
            <span>Boutique / précommande</span>
            <input id="author-editor-shop" type="url" value="${escapeAttribute(author.shop_url || "")}" placeholder="https://..." />
          </label>

          <label>
            <span>Type de profil</span>
            <select id="author-editor-profile-type">
              <option value="">Non défini</option>
              <option value="author" ${author.profile_type === "author" ? "selected" : ""}>Auteur</option>
              <option value="artist_author" ${author.profile_type === "artist_author" ? "selected" : ""}>Artiste-auteur</option>
              <option value="hybrid" ${author.profile_type === "hybrid" ? "selected" : ""}>Hybride</option>
            </select>
          </label>

          <label class="author-editor-check">
            <input id="author-editor-validated" type="checkbox" ${author.validated === true ? "checked" : ""} />
            <span>Fiche validée en interne</span>
          </label>
        </div>

        <div class="author-editor-warning">
          Aucun changement n’est publié automatiquement sur le site public.
        </div>

        <div class="author-editor-actions">
          <button type="button" class="cyber-btn-secondary" data-author-editor-action="cancel">Annuler</button>
          <button type="button" class="cyber-btn-primary" data-author-editor-action="save">Enregistrer la fiche</button>
        </div>
      </section>
    `;

    document.body.appendChild(wrapper);

    const firstInput = wrapper.querySelector("#author-editor-pseudo");
    if (firstInput) firstInput.focus();
  }

  function closeAuthorEditor() {
    document.getElementById("author-editor-overlay")?.remove();
  }

  async function saveAuthorEditor() {
    const id = document.getElementById("author-editor-id")?.value || "";
    const pseudo = String(document.getElementById("author-editor-pseudo")?.value || "").trim();
    const bio = String(document.getElementById("author-editor-bio")?.value || "").trim();
    const websiteRaw = String(document.getElementById("author-editor-website")?.value || "").trim();
    const avatarRaw = String(document.getElementById("author-editor-avatar")?.value || "").trim();
    const location = String(document.getElementById("author-editor-location")?.value || "").trim();
    const shopRaw = String(document.getElementById("author-editor-shop")?.value || "").trim();
    const profileType = String(document.getElementById("author-editor-profile-type")?.value || "").trim();
    const validated = document.getElementById("author-editor-validated")?.checked === true;

    if (!id) {
      toast("Identifiant auteur manquant");
      return;
    }

    if (!pseudo) {
      toast("Le nom / pseudo est obligatoire");
      return;
    }

    const website = normalizeOptionalUrl(websiteRaw);
    const avatarUrl = normalizeOptionalUrl(avatarRaw);
    const shopUrl = normalizeOptionalUrl(shopRaw);

    if (websiteRaw && !website) {
      toast("URL du site invalide");
      return;
    }

    if (avatarRaw && !avatarUrl) {
      toast("URL de la photo invalide");
      return;
    }

    if (shopRaw && !shopUrl) {
      toast("URL de la boutique invalide");
      return;
    }

    if (profileType && !["author", "artist_author", "hybrid"].includes(profileType)) {
      toast("Type de profil invalide");
      return;
    }

    const payload = {
      pseudo,
      bio: bio || null,
      website: website || null,
      avatar_url: avatarUrl || null,
      location: location || null,
      shop_url: shopUrl || null,
      profile_type: profileType || null,
      validated,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from("authors")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.warn("Admin auteurs : mise à jour fiche impossible", error);
      toast("Erreur lors de l’enregistrement de la fiche auteur");
      return;
    }

    closeAuthorEditor();
    await loadRows();
    render();
    toast("Fiche auteur enregistrée");
  }

  function focusPresenceFromCockpit(button) {
    const presenceId = String(button.dataset.presenceId || "");
    const authorName = String(button.dataset.authorName || "");
    const action = button.dataset.authorPreparationAction || "presence";

    if (!presenceId) {
      toast("Présence introuvable");
      return;
    }

    currentFilter = action === "duplicate" ? "duplicates" : "all";
    currentProfileFilter = "all";
    currentSearch = authorName;

    document.querySelectorAll("[data-author-filter]").forEach((filterButton) => {
      const active = filterButton.dataset.authorFilter === currentFilter;
      filterButton.classList.toggle("is-active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });

    const profileFilter = document.getElementById("author-requests-profile-filter");
    if (profileFilter) profileFilter.value = "all";

    const searchInput = document.getElementById("author-requests-search");
    if (searchInput) searchInput.value = currentSearch;

    render();

    window.requestAnimationFrame(() => {
      const card = document.querySelector(
        `.author-request-card[data-request-id="${escapeSelectorValue(presenceId)}"]`
      );

      if (!card) {
        toast("Présence non visible avec ce filtre");
        return;
      }

      card.classList.add("is-cockpit-focused");
      card.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      window.setTimeout(() => {
        card.classList.remove("is-cockpit-focused");
      }, 3200);
    });
  }

  function escapeSelectorValue(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value || ""));
    }

    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function handlePanelChange(event) {
    const authorPreparationSort = event.target.closest("#author-preparation-sort");

    if (authorPreparationSort) {
      currentAuthorPreparationSort = authorPreparationSort.value || "priority";
      renderAuthorPreparationCockpit();
      return;
    }

    const profileFilter = event.target.closest("#author-requests-profile-filter");
    if (profileFilter) {
      currentProfileFilter = profileFilter.value || "all";
      render();
      return;
    }

    const select = event.target.closest("select[data-field]");
    if (!select) return;
    // Réservé : changement immédiat possible plus tard.
  }

  function handlePanelInput(event) {
    const authorPreparationSearch = event.target.closest("#author-preparation-search");

    if (authorPreparationSearch) {
      currentAuthorPreparationSearch = authorPreparationSearch.value || "";
      renderAuthorPreparationCockpit();
      return;
    }

    const search = event.target.closest("#author-requests-search");
    if (!search) return;

    currentSearch = search.value || "";
    render();
  }

  async function updateRequestFromCard(id, card, action) {
    const payload = readPayload(card);

    if (action === "validate") {
      payload.validated = true;
      payload.rejected = false;
    } else if (action === "reject") {
      payload.validated = false;
      payload.rejected = true;
    } else if (action === "hide") {
      payload.validated = false;
      payload.rejected = false;
    }

    payload.updated_at = new Date().toISOString();

    let { error } = await supabaseClient
      .from("event_authors_presence")
      .update(payload)
      .eq("id", id);

    if (error && isMissingColumnError(error) && payload.participant_type !== "publisher") {
      const legacyPayload = { ...payload };
      ["participant_type", "organization_name", "contact_name", "contact_email", "presence_verified"]
        .forEach((key) => delete legacyPayload[key]);
      const legacyResponse = await supabaseClient
        .from("event_authors_presence")
        .update(legacyPayload)
        .eq("id", id);
      error = legacyResponse.error;
    }

    if (error) {
      console.warn("Admin auteurs : update impossible", error);
      toast("Erreur mise à jour de la présence");
      return;
    }

    await loadRows();
    render();
    toast("Présence mise à jour");
  }

  function readPayload(card) {
    const payload = {};

    card.querySelectorAll("[data-field]").forEach((field) => {
      const key = field.dataset.field;
      let value = field.type === "checkbox" ? field.checked : field.value || "";

      if (["author_profile_url", "book_or_publisher_url"].includes(key)) {
        value = normalizeOptionalUrl(value);
      }

      if (key === "author_profile_url") {
        payload.website = value || null; // compatibilité ancien champ
      }

      payload[key] = typeof value === "boolean" ? value : value || null;
    });

    if (payload.participant_type === "publisher") {
      payload.publication_mode = "unknown";
      payload.author_id = null;
      payload.author_slug = null;
      payload.author_identity_key = null;
      payload.author_portrait_url = null;
      payload.author_portrait_storage_key = null;
      payload.book_or_publisher_url = null;
      payload.book_or_publisher_url_type = null;
      payload.publisher_name = null;
    } else {
      payload.organization_name = null;
      payload.contact_name = null;
      payload.contact_email = null;
    }

    return payload;
  }

  function buildProfileCounts(items) {
    const counts = {
      author: 0,
      artist_author: 0,
      hybrid: 0,
      publisher: 0
    };

    items.forEach((row) => {
      const type = ["author", "artist_author", "hybrid", "publisher"].includes(row.participant_type)
        ? row.participant_type
        : "author";

      counts[type] += 1;
    });

    return counts;
  }

  function filterRows(items, filter) {
    if (filter === "validated") return items.filter((row) => row.validated === true);
    if (filter === "rejected") return items.filter((row) => row.rejected === true);
    if (filter === "pending") return items.filter(isPending);
    if (filter === "duplicates") return items.filter((row) => duplicateById.has(String(row.id || "")));
    return items;
  }

  function filterByProfile(items, profile) {
    if (!profile || profile === "all") return items;
    return items.filter((row) => row.participant_type === profile);
  }

  function filterBySearch(items, search) {
    const query = normalizeSearch(search);
    if (!query) return items;

    return items.filter((row) => {
      const event = row.events || {};
      return normalizeSearch([
        row.pseudo,
        row.organization_name,
        event.title,
        event.city,
        event.region
      ].filter(Boolean).join(" ")).includes(query);
    });
  }

  function refreshDuplicateIndex() {
    const detector = window.DEDICALIVRES_DUPLICATES;
    duplicateGroups = typeof detector?.groupPresences === "function"
      ? detector.groupPresences(rows)
      : [];
    duplicateById = new Map();

    duplicateGroups.forEach((group, index) => {
      group.rows.forEach((row) => {
        duplicateById.set(String(row.id || ""), {
          group: index + 1,
          score: group.score,
          reasons: group.reasons || []
        });
      });
    });
  }

  function getAuthorContext(row, duplicate) {
    const engine = window.DEDICALIVRES_AUTHOR_BACKOFFICE;
    if (!engine) return null;

    const author = engine.findAuthorForPresence(authors, row);
    const presences = engine.getRelatedPresences(rows, row);
    return engine.buildAuthorDraft({ author, presences, duplicate });
  }

  function renderAuthorReadiness(context, row) {
    if (!context) {
      return `<div class="author-readiness is-incomplete"><strong>Fiche auteur indisponible</strong><small>Moteur de préparation non chargé.</small></div>`;
    }

    const missing = context.missingLabels.length
      ? `Manque : ${context.missingLabels.join(" · ")}`
      : "Aucun élément manquant détecté";
    const slug = context.slug || row.author_slug || row.author_identity_key || "";
    const previewLink = slug
      ? `<a href="author.html?slug=${encodeURIComponent(slug)}&preview=admin" target="_blank" rel="noopener noreferrer">Aperçu interne</a>`
      : "";
    const schemaNote = authorsLoadError
      ? `<small class="author-readiness-warning">Table authors : ${escapeHtml(authorsLoadError)}</small>`
      : "";

    return `
      <div class="author-readiness is-${escapeAttribute(context.status)}" data-author-ready="${context.ready ? "true" : "false"}">
        <div>
          <span class="author-readiness-status">${escapeHtml(context.statusLabel)}</span>
          ${context.publishableLater ? `<span class="author-readiness-later">Publiable plus tard</span>` : ""}
          <strong>AUTEUR_PRÊT : ${context.ready ? "oui" : "non"}</strong>
          <small>${escapeHtml(missing)}</small>
          ${schemaNote}
        </div>
        ${previewLink}
      </div>
    `;
  }

  function normalizeSearch(value) {
    const detector = window.DEDICALIVRES_DUPLICATES;
    if (typeof detector?.normalizeText === "function") return detector.normalizeText(value);
    return String(value || "").toLowerCase().trim();
  }

  function isPending(row) {
    return row.validated !== true && row.rejected !== true;
  }

  function publishAuthorRequestCounter(total, hasError) {
    if (typeof window.updateAdminModerationCounter === "function") {
      window.updateAdminModerationCounter("authorRequests", total, {
        hasError: !!hasError
      });
    }

    window.dispatchEvent(new CustomEvent("dedicalivres:authorRequestsUpdated", {
      detail: { total, hasError: !!hasError }
    }));
  }

  function renderCheckLink(label, url) {
    if (!url) return "";
    return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function option(value, label, current) {
    return `<option value="${escapeAttribute(value)}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function statusToClass(status) {
    if (status === "validée") return "validated";
    if (status === "refusée") return "rejected";
    return "pending";
  }

  function getParticipantTypeLabel(type) {
    return {
      author: "Auteur",
      artist_author: "Artiste-auteur",
      hybrid: "Hybride",
      publisher: "Maison d’édition"
    }[type] || "Auteur";
  }

  function formatSubmissionDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function normalizeOptionalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  function isMissingColumnError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || error?.details || "").toLowerCase();
    return ["42703", "PGRST204"].includes(code) || (
      message.includes("column") &&
      (message.includes("does not exist") || message.includes("schema cache"))
    );
  }

  function showListError(message) {
    const list = document.getElementById("author-requests-list");
    if (list) list.innerHTML = `<p class="priority-empty">${escapeHtml(message)}</p>`;
  }

  function toast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    } else {
      console.log(message);
    }
  }

  function ensureStyles() {
    if (document.getElementById("admin-author-requests-seo-styles")) return;

    const style = document.createElement("style");
    style.id = "admin-author-requests-seo-styles";
    style.textContent = `
      .author-requests-toolbar,
      .author-request-actions,
      .author-request-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 14px 0;
      }

      .author-requests-toolbar .is-active {
        outline: 2px solid rgba(25,255,156,.42);
        color: var(--cyber-green);
      }

      .author-requests-toolbar [data-author-filter="pending"].is-active {
        outline-color: rgba(255,158,68,.62);
        color: var(--cyber-orange);
      }

      .author-requests-filters {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) minmax(190px, .45fr);
        gap: 12px;
        margin: 0 0 16px;
      }

      .author-requests-filters label {
        display: grid;
        gap: 6px;
      }

      .author-requests-filters span {
        color: var(--cyber-muted);
        font-size: .78rem;
        font-weight: 900;
      }

      .author-requests-filters input,
      .author-requests-filters select {
        width: 100%;
        min-height: 42px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 12px;
        padding: 10px 12px;
        background: rgba(255,255,255,.94);
        color: #111;
        font: inherit;
      }

      .author-preparation-cockpit {
        margin: 18px 0 24px;
        padding: 18px;
        border: 1px solid rgba(45,214,255,.18);
        border-radius: 22px;
        background: rgba(7,18,22,.82);
      }

      .author-preparation-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }

      .author-preparation-head h4 {
        margin: 0;
        font-size: .95rem;
        letter-spacing: .04em;
      }

      .author-preparation-head p {
        margin: 6px 0 0;
        max-width: 720px;
        color: var(--cyber-muted);
        font-size: .8rem;
        line-height: 1.45;
      }

      .author-preparation-counts {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 7px;
      }

      .author-preparation-count {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 5px 9px;
        border-radius: 999px;
        font-size: .72rem;
        font-weight: 900;
        white-space: nowrap;
      }

      .author-preparation-count.is-ready,
      .author-preparation-status.is-ready {
        color: #91e6af;
        background: rgba(22,128,60,.22);
      }

      .author-preparation-count.is-enrich,
      .author-preparation-status.is-enrich {
        color: #ffd26f;
        background: rgba(255,210,111,.14);
      }

      .author-preparation-count.is-incomplete,
      .author-preparation-status.is-incomplete {
        color: #c7d6f0;
        background: rgba(91,111,153,.22);
      }

      .author-preparation-count.is-duplicate {
        color: var(--cyber-orange);
        background: rgba(255,158,68,.14);
      }

      .author-preparation-tools {
        display: grid;
        gap: 12px;
        margin: 0 0 16px;
        padding: 12px;
        border-radius: 16px;
        background: rgba(255,255,255,.035);
        border: 1px solid rgba(255,255,255,.08);
      }

      .author-preparation-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .author-preparation-filters button {
        min-height: 34px;
        padding: 7px 10px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 999px;
        background: rgba(255,255,255,.05);
        color: var(--cyber-muted);
        font: inherit;
        font-size: .72rem;
        font-weight: 900;
        cursor: pointer;
      }

      .author-preparation-filters button:hover,
      .author-preparation-filters button.is-active {
        color: var(--cyber-cyan);
        border-color: rgba(45,214,255,.46);
        background: rgba(45,214,255,.10);
      }

      .author-preparation-controls {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) minmax(180px, .4fr);
        gap: 10px;
      }

      .author-preparation-controls label {
        display: grid;
        gap: 5px;
      }

      .author-preparation-controls label > span {
        color: var(--cyber-muted);
        font-size: .72rem;
        font-weight: 900;
      }

      .author-preparation-controls input,
      .author-preparation-controls select {
        width: 100%;
        min-height: 40px;
        padding: 9px 11px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 11px;
        background: rgba(255,255,255,.94);
        color: #111;
        font: inherit;
      }

      .author-preparation-visible-count {
        margin: 0;
        color: var(--cyber-muted);
        font-size: .74rem;
        font-weight: 800;
      }

      .author-preparation-count.is-photo {
        color: #ffb58a;
        background: rgba(255,107,53,.14);
      }

      .author-preparation-priority {
        display: inline-flex;
        margin-top: 10px;
        padding: 4px 8px;
        border-radius: 8px;
        background: rgba(255,255,255,.055);
        color: #e8edf2;
        font-size: .7rem;
        font-weight: 900;
      }

      .author-preparation-card.has-duplicate .author-preparation-priority {
        color: var(--cyber-orange);
        background: rgba(255,158,68,.12);
      }

      .author-preparation-card.is-incomplete:not(.has-duplicate) .author-preparation-priority {
        color: #ffb58a;
      }

      .author-preparation-meta .is-photo-ok {
        color: #91e6af;
        font-weight: 800;
      }

      .author-preparation-meta .is-photo-missing {
        color: #ffb58a;
        font-weight: 900;
      }

      .author-preparation-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
      }

      .author-duplicate-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        padding: 12px 14px;
        border: 1px solid rgba(255, 107, 53, .45);
        border-radius: 12px;
        background: rgba(255, 107, 53, .08);
      }

      .author-duplicate-summary strong {
        color: #ffb08a;
      }

      .author-duplicate-summary span {
        opacity: .75;
        font-size: .86rem;
      }

      @media (max-width: 640px) {
        .author-duplicate-summary {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      .author-preparation-card {
        padding: 14px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 16px;
        background: rgba(255,255,255,.035);
      }

      .author-preparation-card.is-ready {
        border-color: rgba(22,128,60,.48);
      }

      .author-preparation-card.is-enrich {
        border-color: rgba(255,210,111,.30);
      }

      .author-preparation-card.has-duplicate {
        border-color: rgba(255,158,68,.72);
        box-shadow: inset 4px 0 0 var(--cyber-orange);
      }

      .author-preparation-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .author-preparation-main strong,
      .author-preparation-main small {
        display: block;
      }

      .author-preparation-main small {
        margin-top: 4px;
        color: var(--cyber-muted);
      }

      .author-preparation-status {
        flex: 0 0 auto;
        padding: 5px 8px;
        border-radius: 999px;
        font-size: .7rem;
        font-weight: 900;
      }

      .author-preparation-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
        margin-top: 12px;
        color: var(--cyber-muted);
        font-size: .74rem;
      }

      .author-preparation-meta .is-warning {
        color: var(--cyber-orange);
        font-weight: 900;
      }

      .author-preparation-missing {
        margin: 10px 0 0;
        color: var(--cyber-muted);
        font-size: .76rem;
        line-height: 1.4;
      }

      .author-preparation-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 11px;
      }

      .author-preparation-actions a,
      .author-preparation-no-preview,
      .author-preparation-jump {
        font-size: .76rem;
        font-weight: 900;
      }

      .author-preparation-actions a {
        color: var(--cyber-cyan);
      }

      .author-preparation-jump {
        min-height: 34px;
        padding: 6px 10px;
        border: 1px solid rgba(45,214,255,.35);
        border-radius: 9px;
        background: rgba(45,214,255,.08);
        color: var(--cyber-cyan);
        font: inherit;
        cursor: pointer;
      }

      .author-preparation-jump:hover,
      .author-preparation-jump:focus-visible {
        border-color: var(--cyber-cyan);
        background: rgba(45,214,255,.15);
      }

      .author-preparation-edit {
        min-height: 34px;
        padding: 6px 10px;
        border: 1px solid rgba(25,255,156,.35);
        border-radius: 9px;
        background: rgba(25,255,156,.08);
        color: var(--cyber-green);
        font: inherit;
        font-size: .76rem;
        font-weight: 900;
        cursor: pointer;
      }

      .author-preparation-edit:hover,
      .author-preparation-edit:focus-visible {
        border-color: var(--cyber-green);
        background: rgba(25,255,156,.14);
      }

      .author-preparation-create {
        min-height: 34px;
        padding: 6px 10px;
        border: 1px solid rgba(255,210,111,.42);
        border-radius: 9px;
        background: rgba(255,210,111,.09);
        color: #ffe5a3;
        font: inherit;
        font-size: .76rem;
        font-weight: 900;
        cursor: pointer;
      }

      .author-preparation-create:hover,
      .author-preparation-create:focus-visible {
        border-color: #ffe5a3;
        background: rgba(255,210,111,.16);
      }

      .author-preparation-create:disabled {
        opacity: .55;
        cursor: wait;
      }

      .author-editor-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(0,0,0,.72);
        backdrop-filter: blur(6px);
      }

      .author-editor-dialog {
        width: min(760px, 100%);
        max-height: 90vh;
        overflow: auto;
        padding: 20px;
        border: 1px solid rgba(45,214,255,.28);
        border-radius: 18px;
        background: #09130f;
        box-shadow: 0 24px 80px rgba(0,0,0,.55);
      }

      .author-editor-head {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .author-editor-head h4 {
        margin: 0 0 5px;
      }

      .author-editor-head p {
        margin: 0;
        color: var(--cyber-muted);
        font-size: .78rem;
      }

      .author-editor-close {
        min-width: 36px;
        min-height: 36px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 10px;
        background: rgba(255,255,255,.06);
        color: #fff;
        font-size: 1.4rem;
        cursor: pointer;
      }

      .author-editor-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .author-editor-grid label {
        display: grid;
        gap: 6px;
      }

      .author-editor-grid label > span {
        color: var(--cyber-muted);
        font-size: .74rem;
        font-weight: 900;
      }

      .author-editor-grid input,
      .author-editor-grid textarea {
        width: 100%;
        padding: 10px 11px;
        border: 1px solid rgba(255,255,255,.15);
        border-radius: 10px;
        background: rgba(255,255,255,.95);
        color: #111;
        font: inherit;
      }

      .author-editor-grid textarea {
        resize: vertical;
      }

      .author-editor-full {
        grid-column: 1 / -1;
      }

      .author-editor-check {
        grid-column: 1 / -1;
        display: flex !important;
        align-items: center;
        gap: 8px !important;
      }

      .author-editor-check input {
        width: 18px;
        height: 18px;
      }

      .author-editor-warning {
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(255,210,111,.08);
        color: #ffe5a3;
        font-size: .75rem;
      }

      .author-editor-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
      }

      .author-request-card.is-cockpit-focused {
        outline: 3px solid var(--cyber-cyan);
        outline-offset: 4px;
        box-shadow:
          0 0 0 6px rgba(45,214,255,.12),
          0 14px 36px rgba(0,0,0,.32);
      }

      .author-preparation-no-preview {
        color: var(--cyber-muted);
      }

      @media (max-width: 760px) {
        .author-preparation-head {
          flex-direction: column;
        }

        .author-preparation-counts {
          justify-content: flex-start;
        }

        .author-preparation-controls {
          grid-template-columns: 1fr;
        }

        .author-editor-grid {
          grid-template-columns: 1fr;
        }

        .author-editor-full,
        .author-editor-check {
          grid-column: auto;
        }

        .author-editor-actions {
          flex-direction: column-reverse;
        }

        .author-editor-actions button {
          width: 100%;
        }

        .author-preparation-filters {
          gap: 6px;
        }

        .author-preparation-filters button {
          flex: 1 1 auto;
        }

        .author-preparation-list {
          grid-template-columns: 1fr;
        }
      }

      .author-requests-list {
        display: grid;
        gap: 16px;
      }

      .author-request-card {
        padding: 16px;
        border-radius: 22px;
        background: rgba(8,18,14,.92);
        border: 1px solid rgba(25,255,156,.12);
      }

      .author-request-card.is-duplicate {
        border-color: rgba(255,158,68,.72);
        box-shadow: inset 4px 0 0 var(--cyber-orange);
      }

      .author-request-card:has([data-field="participant_type"] option[value="artist_author"]:checked) {
        border-color: #9b6ad6;
        box-shadow: inset 4px 0 0 #9b6ad6;
      }

      .author-request-check {
        align-content: start;
      }

      .author-request-check input[type="checkbox"] {
        width: auto;
        min-height: auto;
      }

      .author-request-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 14px;
      }

      .author-request-head strong {
        display: block;
        font-size: 1rem;
      }

      .author-request-head small {
        display: block;
        margin-top: 4px;
        color: var(--cyber-muted);
        line-height: 1.35;
      }

      .author-request-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px;
        margin-top: 9px;
        color: var(--cyber-muted);
        font-size: .76rem;
      }

      .author-request-profile,
      .author-request-duplicate {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 4px 8px;
        border-radius: 999px;
        font-weight: 900;
      }

      .author-request-profile.is-author,
      .author-admin-profile-count.is-author {
        color: #91e6af;
        background: rgba(22,128,60,.20);
      }

      .author-request-profile.is-artist_author,
      .author-admin-profile-count.is-artist_author {
        color: #d5b3ff;
        background: rgba(155,106,214,.22);
      }

      .author-request-profile.is-hybrid,
      .author-admin-profile-count.is-hybrid {
        color: #c7d6f0;
        background:
          linear-gradient(
            135deg,
            rgba(155,106,214,.20),
            rgba(22,128,60,.18)
          );
      }

      .author-request-profile.is-publisher,
      .author-admin-profile-count.is-publisher {
        color: #b9c9df;
        background: rgba(48,67,94,.34);
      }

      #author-requests-count {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 7px;
      }

      #author-requests-count > span {
        display: inline-flex;
        align-items: center;
        min-height: 25px;
      }

      .author-admin-profile-count {
        padding: 4px 8px;
        border-radius: 999px;
        font-size: .72rem;
        font-weight: 900;
        white-space: nowrap;
      }

      .author-request-card:has([data-field="participant_type"] option[value="author"]:checked) {
        border-color: rgba(22,128,60,.72);
        box-shadow: inset 4px 0 0 #16803c;
      }

      .author-request-card:has([data-field="participant_type"] option[value="artist_author"]:checked) {
        border-color: #9b6ad6;
        box-shadow: inset 4px 0 0 #9b6ad6;
      }

      .author-request-card:has([data-field="participant_type"] option[value="hybrid"]:checked) {
        border-color: rgba(91,111,153,.82);
        box-shadow: inset 4px 0 0 #536288;
      }

      .author-request-card:has([data-field="participant_type"] option[value="publisher"]:checked) {
        border-color: rgba(48,67,94,.88);
        box-shadow: inset 4px 0 0 #30435e;
      }

      .author-request-duplicate {
        color: var(--cyber-orange);
        background: rgba(255,158,68,.14);
      }

      .author-request-status {
        flex: 0 0 auto;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: .75rem;
        font-weight: 900;
        text-transform: uppercase;
      }

      .author-request-status.is-pending {
        color: var(--cyber-orange);
        background: rgba(255,158,68,.12);
      }

      .author-request-status.is-validated {
        color: var(--cyber-green);
        background: rgba(25,255,156,.12);
      }

      .author-request-status.is-rejected {
        color: var(--cyber-red);
        background: rgba(255,95,115,.12);
      }

      .author-request-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .author-request-grid label {
        display: grid;
        gap: 6px;
      }

      .author-request-grid span {
        color: var(--cyber-muted);
        font-weight: 900;
        font-size: .78rem;
      }

      .author-request-grid input,
      .author-request-grid select {
        width: 100%;
        min-height: 42px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.14);
        padding: 10px 12px;
        background: rgba(255,255,255,.94);
        color: #111;
        font: inherit;
      }

      .author-request-links a {
        color: var(--cyber-cyan);
        font-weight: 900;
      }

      .author-readiness {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin: 14px 0;
        padding: 13px 14px;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 16px;
        background: rgba(255,255,255,.055);
      }

      .author-readiness > div {
        display: grid;
        gap: 5px;
      }

      .author-readiness-status,
      .author-readiness-later {
        display: inline-flex;
        width: fit-content;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: .72rem;
        font-weight: 950;
      }

      .author-readiness.is-incomplete .author-readiness-status {
        color: var(--cyber-red);
        background: rgba(255,95,115,.13);
      }

      .author-readiness.is-enrich .author-readiness-status {
        color: var(--cyber-orange);
        background: rgba(255,158,68,.13);
      }

      .author-readiness.is-ready .author-readiness-status,
      .author-readiness-later {
        color: var(--cyber-green);
        background: rgba(25,255,156,.12);
      }

      .author-readiness small {
        color: var(--cyber-muted);
      }

      .author-readiness-warning {
        color: var(--cyber-orange) !important;
      }

      .author-readiness a {
        flex: 0 0 auto;
        color: var(--cyber-cyan);
        font-weight: 900;
      }

      @media (max-width: 760px) {
        .author-requests-filters {
          grid-template-columns: 1fr;
        }

        .author-request-head {
          flex-direction: column;
        }

        .author-request-grid {
          grid-template-columns: 1fr;
        }

        .author-readiness {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
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
