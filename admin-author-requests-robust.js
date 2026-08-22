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
  let authorMergeHistory = [];
  let authorMergeHistoryError = "";

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

      <section
        class="author-merge-history"
        aria-labelledby="author-merge-history-title"
      >
        <div class="author-preparation-head">
          <div>
            <h4 id="author-merge-history-title">HISTORIQUE DES FUSIONS</h4>
            <p>
              Journal interne des rapprochements de fiches auteurs.
              Consultation uniquement.
            </p>
          </div>
          <div
            id="author-merge-history-count"
            class="author-preparation-counts"
          ></div>
        </div>

        <div
          id="author-merge-history-list"
          class="author-merge-history-list"
        >
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
    await loadAuthorMergeHistory();
    refreshDuplicateIndex();
    publishAuthorRequestCounter(rows.filter(isPending).length, false);
  }

  async function loadAuthorProfiles() {
    const publicationColumns =
      "id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at, merged_into, merged_at, publication_ready, publication_ready_at, publication_ready_by, published, published_at, published_by";

    const readinessColumns =
      "id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at, merged_into, merged_at, publication_ready, publication_ready_at, publication_ready_by";

    const mergeColumns =
      "id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at, merged_into, merged_at";

    const enrichedColumns =
      "id, pseudo, slug, website, bio, avatar_url, location, shop_url, profile_type, validated, created_at";

    const legacyColumns =
      "id, pseudo, slug, website, validated, created_at";

    let response = await supabaseClient
      .from("authors")
      .select(publicationColumns)
      .order("created_at", { ascending: false })
      .limit(300);

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabaseClient
        .from("authors")
        .select(readinessColumns)
        .order("created_at", { ascending: false })
        .limit(300);
    }

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabaseClient
        .from("authors")
        .select(mergeColumns)
        .order("created_at", { ascending: false })
        .limit(300);
    }

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabaseClient
        .from("authors")
        .select(enrichedColumns)
        .order("created_at", { ascending: false })
        .limit(300);
    }

    if (response.error && isMissingColumnError(response.error)) {
      response = await supabaseClient
        .from("authors")
        .select(legacyColumns)
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

  async function loadAuthorMergeHistory() {
    const response = await supabaseClient
      .from("author_merge_audit")
      .select(
        "id, primary_author_id, secondary_author_id, primary_author_snapshot, secondary_author_snapshot, reassigned_presences, created_at, reverted_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (response.error) {
      authorMergeHistory = [];
      authorMergeHistoryError =
        response.error.message || "Historique des fusions indisponible";

      console.warn(
        "Admin auteurs : historique des fusions indisponible",
        response.error
      );
      return;
    }

    authorMergeHistory = Array.isArray(response.data)
      ? response.data
      : [];

    authorMergeHistoryError = "";
  }

  function getMergeSnapshotName(snapshot, fallback) {
    if (!snapshot || typeof snapshot !== "object") {
      return fallback || "Auteur inconnu";
    }

    return (
      snapshot.pseudo ||
      snapshot.name ||
      snapshot.pen_name ||
      snapshot.slug ||
      fallback ||
      "Auteur inconnu"
    );
  }

  function formatMergeHistoryDate(value) {
    if (!value) return "Date inconnue";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date inconnue";
    }

    return date.toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function renderAuthorMergeHistory() {
    const count = document.getElementById(
      "author-merge-history-count"
    );

    const list = document.getElementById(
      "author-merge-history-list"
    );

    if (!list) return;

    if (authorMergeHistoryError) {
      if (count) count.innerHTML = "";

      list.innerHTML = `
        <p class="priority-empty">
          Historique indisponible.
        </p>
      `;
      return;
    }

    const activeCount = authorMergeHistory.filter(
      (entry) => !entry.reverted_at
    ).length;

    const revertedCount =
      authorMergeHistory.length - activeCount;

    if (count) {
      count.innerHTML = `
        <span class="author-preparation-count">
          ${authorMergeHistory.length} fusion(s)
        </span>
        <span class="author-preparation-count is-ready">
          ${activeCount} active(s)
        </span>
        <span class="author-preparation-count is-incomplete">
          ${revertedCount} annulée(s)
        </span>
      `;
    }

    if (!authorMergeHistory.length) {
      list.innerHTML = `
        <p class="priority-empty">
          Aucune fusion enregistrée pour le moment.
        </p>
      `;
      return;
    }

    list.innerHTML = authorMergeHistory.map((entry) => {
      const primaryName = getMergeSnapshotName(
        entry.primary_author_snapshot,
        entry.primary_author_id
      );

      const secondaryName = getMergeSnapshotName(
        entry.secondary_author_snapshot,
        entry.secondary_author_id
      );

      const reverted = Boolean(entry.reverted_at);

      return `
        <article class="author-merge-history-card">
          <div class="author-merge-history-card-head">
            <div>
              <strong>
                ${escapeHtml(secondaryName)}
                →
                ${escapeHtml(primaryName)}
              </strong>
              <span>
                ${escapeHtml(formatMergeHistoryDate(entry.created_at))}
              </span>
            </div>

            <div class="author-merge-history-head-actions">
              <span
                class="author-merge-history-status ${
                  reverted ? "is-reverted" : "is-active"
                }"
              >
                ${reverted ? "Annulée" : "Active"}
              </span>

              ${
                reverted
                  ? ""
                  : `
                    <button
                      type="button"
                      class="cyber-btn-secondary author-merge-revert-button"
                      data-author-merge-action="revert"
                      data-author-merge-audit-id="${escapeAttribute(entry.id)}"
                      data-author-merge-primary="${escapeAttribute(primaryName)}"
                      data-author-merge-secondary="${escapeAttribute(secondaryName)}"
                    >
                      Annuler cette fusion
                    </button>
                  `
              }
            </div>
          </div>

          <dl class="author-merge-history-details">
            <div>
              <dt>Fiche conservée</dt>
              <dd>${escapeHtml(primaryName)}</dd>
            </div>

            <div>
              <dt>Fiche archivée</dt>
              <dd>${escapeHtml(secondaryName)}</dd>
            </div>

            <div>
              <dt>Présences déplacées</dt>
              <dd>${Number(entry.reassigned_presences || 0)}</dd>
            </div>

            <div>
              <dt>Retour arrière</dt>
              <dd>
                ${
                  reverted
                    ? escapeHtml(formatMergeHistoryDate(entry.reverted_at))
                    : "Non"
                }
              </dd>
            </div>
          </dl>
        </article>
      `;
    }).join("");
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

    const activeAuthors = authors.filter(
      (author) => !author?.merged_into
    );

    authorDuplicateGroups =
      authorEngine && typeof authorEngine.findProbableAuthorDuplicates === "function"
        ? authorEngine.findProbableAuthorDuplicates(activeAuthors)
        : [];

    renderAuthorPreparationCockpit();
    renderAuthorMergeHistory();

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

  function buildAuthorPublicationChecklist(item) {
    const draft = item?.draft || {};
    const author = item?.author || {};
    const presences = Array.isArray(item?.presences)
      ? item.presences
      : [];

    const validPresenceCount = presences.filter(
      (row) => row.validated === true && row.rejected !== true
    ).length;

    const profileType =
      author.profile_type ||
      draft.profileType ||
      presences[0]?.participant_type ||
      "";

    const website =
      author.website ||
      draft.website ||
      draft.profileUrl ||
      "";

    const shopUrl =
      author.shop_url ||
      draft.shopUrl ||
      presences.find((row) => row.book_or_publisher_url)
        ?.book_or_publisher_url ||
      "";

    const bio =
      author.bio ||
      draft.bio ||
      "";

    const location =
      author.location ||
      draft.location ||
      "";

    const photo =
      author.avatar_url ||
      draft.photo ||
      presences.find((row) => row.author_portrait_url)
        ?.author_portrait_url ||
      "";

    const historyCount =
      Number(draft.historyCount || 0) ||
      validPresenceCount;

    const checks = [
      {
        key: "identity",
        label: "Identité",
        ok: Boolean(draft.identity || author.pseudo)
      },
      {
        key: "photo",
        label: "Photo",
        ok: Boolean(photo)
      },
      {
        key: "profile",
        label: "Type",
        ok: ["author", "artist_author", "hybrid"].includes(profileType)
      },
      {
        key: "bio",
        label: "Biographie",
        ok: Boolean(String(bio).trim())
      },
      {
        key: "location",
        label: "Localisation",
        ok: Boolean(String(location).trim())
      },
      {
        key: "website",
        label: "Vitrine",
        ok: Boolean(String(website).trim())
      },
      {
        key: "shop",
        label: "Boutique",
        ok: Boolean(String(shopUrl).trim())
      },
      {
        key: "history",
        label: "Historique",
        ok: historyCount > 0
      }
    ];

    const completed = checks.filter((check) => check.ok).length;
    const total = checks.length;
    const percent = Math.round((completed / total) * 100);

    const blocked =
      draft.duplicate === true ||
      !checks.find((check) => check.key === "identity")?.ok ||
      !checks.find((check) => check.key === "photo")?.ok;

    return {
      checks,
      completed,
      total,
      percent,
      blocked,
      ready: completed === total && !blocked
    };
  }

  function renderAuthorPublicationChecklist(checklist) {
    return `
      <div class="author-publication-readiness">
        <div class="author-publication-readiness-head">
          <strong>
            Préparation publication
          </strong>

          <span class="author-publication-score${
            checklist.ready ? " is-ready" : ""
          }">
            ${checklist.completed}/${checklist.total}
            · ${checklist.percent} %
          </span>
        </div>

        <div
          class="author-publication-progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${checklist.percent}"
        >
          <span style="width:${checklist.percent}%"></span>
        </div>

        <div class="author-publication-checks">
          ${checklist.checks.map((check) => `
            <span
              class="author-publication-check ${
                check.ok ? "is-ok" : "is-missing"
              }"
            >
              <span aria-hidden="true">
                ${check.ok ? "✓" : "○"}
              </span>
              ${escapeHtml(check.label)}
            </span>
          `).join("")}
        </div>

        ${
          checklist.blocked
            ? `
              <p class="author-publication-warning">
                Publication bloquée tant que l’identité, la photo
                et les éventuels doublons ne sont pas sécurisés.
              </p>
            `
            : checklist.ready
              ? `
                <p class="author-publication-ready">
                  Fiche éditorialement complète.
                </p>
              `
              : ""
        }
      </div>
    `;
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
      const publicationChecklist = buildAuthorPublicationChecklist({
        draft,
        presences,
        author
      });

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

      const publicationReadyAction = author?.id
        ? author.publication_ready === true
          ? `<button
               type="button"
               class="author-publication-ready-action is-ready"
               data-author-publication-action="unset"
               data-author-id="${escapeAttribute(author.id)}"
               data-author-name="${escapeAttribute(draft.identity || author.pseudo || "")}"
             >
               Retirer le statut prêt
             </button>`
          : publicationChecklist.ready
            ? `<button
                 type="button"
                 class="author-publication-ready-action"
                 data-author-publication-action="set"
                 data-author-id="${escapeAttribute(author.id)}"
                 data-author-name="${escapeAttribute(draft.identity || author.pseudo || "")}"
               >
                 Marquer prête à publier
               </button>`
            : ""
        : "";

      const canPublishAuthor =
        author?.id &&
        author.publication_ready === true &&
        author.validated === true &&
        !author.merged_into &&
        author.published !== true;

      const publicationAction = author?.id
        ? author.published === true
          ? `<button
               type="button"
               class="author-publication-action is-published"
               data-author-live-action="unpublish"
               data-author-id="${escapeAttribute(author.id)}"
               data-author-name="${escapeAttribute(draft.identity || author.pseudo || "")}"
             >
               Dépublier
             </button>`
          : canPublishAuthor
            ? `<button
                 type="button"
                 class="author-publication-action"
                 data-author-live-action="publish"
                 data-author-id="${escapeAttribute(author.id)}"
                 data-author-name="${escapeAttribute(draft.identity || author.pseudo || "")}"
               >
                 Publier
               </button>`
            : ""
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

          ${renderAuthorPublicationChecklist(publicationChecklist)}

          <div class="author-preparation-actions">
            ${moderationAction}
            ${editAuthorAction}
            ${createAuthorAction}
            ${publicationReadyAction}
            ${publicationAction}
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
      const action = authorPreparationAction.dataset.authorPreparationAction;

      if (action === "duplicate") {
        openAuthorDuplicateCompare(authorPreparationAction);
        return;
      }

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

    const authorMergeAction = event.target.closest("[data-author-merge-action]");

    if (authorMergeAction) {
      const action = authorMergeAction.dataset.authorMergeAction;

      if (action === "revert") {
        await executeAuthorMergeRevert(authorMergeAction);
        return;
      }
    }

    const authorPublicationAction = event.target.closest(
      "[data-author-publication-action]"
    );

    if (authorPublicationAction) {
      await executeAuthorPublicationReadiness(authorPublicationAction);
      return;
    }

    const authorLiveAction = event.target.closest(
      "[data-author-live-action]"
    );

    if (authorLiveAction) {
      await executeAuthorControlledPublication(authorLiveAction);
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

    const authorDuplicateAction = event.target.closest("[data-author-duplicate-action]");

    if (authorDuplicateAction) {
      const action = authorDuplicateAction.dataset.authorDuplicateAction;

      if (action === "close") {
        closeAuthorDuplicateCompare();
        return;
      }

      if (action === "select-primary") {
        selectAuthorDuplicatePrimary(
          authorDuplicateAction.dataset.authorDuplicateSide
        );
        return;
      }

      if (action === "merge") {
        await executeAuthorDuplicateMerge(authorDuplicateAction);
        return;
      }

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

  function openAuthorDuplicateCompare(button) {
    const engine = window.DEDICALIVRES_AUTHOR_BACKOFFICE;
    const authorName = String(button?.dataset?.authorName || "").trim();

    if (!engine || !authorName) {
      toast("Comparaison des doublons indisponible");
      return;
    }

    const normalizedName = engine.normalizeAuthorIdentity(authorName);

    const duplicate = authorDuplicateGroups.find((group) => {
      const leftName = engine.normalizeAuthorIdentity(
        group?.left?.pseudo || group?.left?.name || group?.left?.pen_name || ""
      );

      const rightName = engine.normalizeAuthorIdentity(
        group?.right?.pseudo || group?.right?.name || group?.right?.pen_name || ""
      );

      return normalizedName && (
        normalizedName === leftName ||
        normalizedName === rightName
      );
    });

    if (!duplicate?.left || !duplicate?.right) {
      toast("Aucune paire de doublons trouvée pour cette fiche");
      return;
    }

    closeAuthorDuplicateCompare();

    const wrapper = document.createElement("div");
    wrapper.id = "author-duplicate-overlay";
    wrapper.className = "author-editor-overlay";
    wrapper._authorDuplicate = duplicate;

    const renderProfile = (author, label, side) => `
      <article
        class="author-duplicate-profile"
        data-author-duplicate-profile="${escapeAttribute(side)}"
      >
        <div class="author-duplicate-profile-head">
          ${
            author.avatar_url
              ? `<img
                   class="author-duplicate-avatar"
                   src="${escapeAttribute(author.avatar_url)}"
                   alt=""
                 />`
              : `<div class="author-duplicate-avatar is-empty">Sans photo</div>`
          }

          <div>
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(author.pseudo || "Nom inconnu")}</strong>
            <span>${escapeHtml(author.slug || "Slug absent")}</span>
          </div>
        </div>

        <dl class="author-duplicate-fields">
          <div>
            <dt>Type</dt>
            <dd>${escapeHtml(author.profile_type || "Non défini")}</dd>
          </div>
          <div>
            <dt>Localisation</dt>
            <dd>${escapeHtml(author.location || "Non renseignée")}</dd>
          </div>
          <div>
            <dt>Site</dt>
            <dd>${escapeHtml(author.website || "Non renseigné")}</dd>
          </div>
          <div>
            <dt>Boutique</dt>
            <dd>${escapeHtml(author.shop_url || "Non renseignée")}</dd>
          </div>
          <div>
            <dt>Biographie</dt>
            <dd>${escapeHtml(author.bio || "Non renseignée")}</dd>
          </div>
          <div>
            <dt>Validation interne</dt>
            <dd>${author.validated === true ? "Validée" : "Non validée"}</dd>
          </div>
        </dl>

        <button
          type="button"
          class="cyber-btn-secondary author-duplicate-select"
          data-author-duplicate-action="select-primary"
          data-author-duplicate-side="${escapeAttribute(side)}"
        >
          Choisir comme fiche principale
        </button>
      </article>
    `;

    wrapper.innerHTML = `
      <section
        class="author-editor-dialog author-duplicate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="author-duplicate-title"
      >
        <div class="author-editor-head">
          <div>
            <h4 id="author-duplicate-title">COMPARER LES DOUBLONS AUTEURS</h4>
            <p>
              Comparez les fiches, choisissez la principale puis contrôlez le plan
              avant toute fusion.
            </p>
          </div>

          <button
            type="button"
            class="author-editor-close"
            data-author-duplicate-action="close"
            aria-label="Fermer"
          >×</button>
        </div>

        <div class="author-duplicate-score">
          <strong>Score de rapprochement : ${Number(duplicate.score || 0)}/100</strong>
          <span>
            ${escapeHtml(
              Array.isArray(duplicate.reasons) && duplicate.reasons.length
                ? duplicate.reasons.join(" · ")
                : "Aucun motif détaillé"
            )}
          </span>
        </div>

        <div class="author-duplicate-grid">
          ${renderProfile(duplicate.left, "Fiche A", "left")}
          ${renderProfile(duplicate.right, "Fiche B", "right")}
        </div>

        <div
          id="author-duplicate-primary-status"
          class="author-editor-warning"
          aria-live="polite"
        >
          Choisissez éventuellement une fiche principale pour préparer la résolution.
          Ce choix reste local à cette fenêtre et n’est pas enregistré.
        </div>

        <div
          id="author-duplicate-merge-plan"
          class="author-duplicate-merge-plan"
          hidden
        ></div>

        <div class="author-editor-actions">
          <button
            type="button"
            class="cyber-btn-secondary"
            data-author-duplicate-action="close"
          >Fermer</button>
        </div>
      </section>
    `;

    document.body.appendChild(wrapper);
  }

  function selectAuthorDuplicatePrimary(side) {
    if (!["left", "right"].includes(side)) return;

    const overlay = document.getElementById("author-duplicate-overlay");
    if (!overlay) return;

    overlay.dataset.primarySide = side;

    overlay
      .querySelectorAll("[data-author-duplicate-profile]")
      .forEach((profile) => {
        const selected =
          profile.dataset.authorDuplicateProfile === side;

        profile.classList.toggle("is-primary", selected);
      });

    overlay
      .querySelectorAll("[data-author-duplicate-action=\"select-primary\"]")
      .forEach((button) => {
        const selected =
          button.dataset.authorDuplicateSide === side;

        button.classList.toggle("is-selected", selected);
        button.textContent = selected
          ? "Fiche principale sélectionnée"
          : "Choisir comme fiche principale";
        button.setAttribute("aria-pressed", String(selected));
      });

    const status = document.getElementById(
      "author-duplicate-primary-status"
    );

    if (status) {
      status.innerHTML = `
        <strong>
          ${side === "left" ? "Fiche A" : "Fiche B"}
          sélectionnée comme fiche principale.
        </strong>
        <br>
        Aucun changement n’est effectué tant que vous ne confirmez pas la fusion.
      `;
    }

    renderAuthorDuplicateMergePlan(side);
  }

  function getAuthorLinkedPresences(author) {
    if (!author) return [];

    const id = String(author.id || "").trim();
    const slug = String(author.slug || "").trim();

    return rows.filter((row) => {
      const rowId = String(row.author_id || "").trim();
      const rowSlug = String(
        row.author_slug || row.author_identity_key || ""
      ).trim();

      return (
        (id && rowId === id) ||
        (slug && rowSlug === slug)
      );
    });
  }

  function getAuthorNameOnlyPresences(author) {
    const engine = window.DEDICALIVRES_AUTHOR_BACKOFFICE;

    if (
      !author ||
      !engine ||
      typeof engine.normalizeAuthorIdentity !== "function"
    ) {
      return [];
    }

    const authorName = engine.normalizeAuthorIdentity(
      author.pseudo || author.name || author.pen_name || ""
    );

    if (!authorName) return [];

    return rows.filter((row) => {
      const hasTechnicalIdentity =
        String(row.author_id || "").trim() ||
        String(row.author_slug || "").trim() ||
        String(row.author_identity_key || "").trim();

      if (hasTechnicalIdentity) return false;

      const presenceName = engine.normalizeAuthorIdentity(
        row.pseudo ||
        row.author_name ||
        row.pen_name ||
        ""
      );

      return presenceName && presenceName === authorName;
    });
  }

  function renderAuthorDuplicateMergePlan(primarySide) {
    const overlay = document.getElementById("author-duplicate-overlay");
    const plan = document.getElementById("author-duplicate-merge-plan");

    if (!overlay || !plan) return;

    const duplicate = overlay._authorDuplicate;

    if (!duplicate?.left || !duplicate?.right) {
      plan.hidden = true;
      return;
    }

    const primary =
      primarySide === "left" ? duplicate.left : duplicate.right;

    const secondary =
      primarySide === "left" ? duplicate.right : duplicate.left;

    const primaryPresences = getAuthorLinkedPresences(primary);
    const secondaryPresences = getAuthorLinkedPresences(secondary);
    const ambiguousPresences = getAuthorNameOnlyPresences(secondary);

    const primaryId = String(primary.id || "").trim();
    const primarySlug = String(primary.slug || "").trim();

    const transferRows = secondaryPresences.map((row) => `
      <li>
        <strong>${escapeHtml(row.pseudo || secondary.pseudo || "Auteur")}</strong>
        <span>
          présence ${escapeHtml(String(row.id || "sans identifiant"))}
          → author_id=${escapeHtml(primaryId || "absent")}
          · author_slug=${escapeHtml(primarySlug || "absent")}
          · author_identity_key=${escapeHtml(primarySlug || "absent")}
        </span>
      </li>
    `).join("");

    plan.innerHTML = `
      <div class="author-duplicate-plan-head">
        <div>
          <small>20F.3A — SIMULATION</small>
          <strong>Plan de fusion contrôlée</strong>
        </div>
        <span>Aucune écriture en base</span>
      </div>

      <div class="author-duplicate-plan-summary">
        <div>
          <span>Fiche principale</span>
          <strong>${escapeHtml(primary.pseudo || "Sans nom")}</strong>
          <small>${escapeHtml(primary.slug || "Slug absent")}</small>
        </div>

        <div>
          <span>Fiche secondaire</span>
          <strong>${escapeHtml(secondary.pseudo || "Sans nom")}</strong>
          <small>${escapeHtml(secondary.slug || "Slug absent")}</small>
        </div>

        <div>
          <span>Présences déjà sur la principale</span>
          <strong>${primaryPresences.length}</strong>
        </div>

        <div>
          <span>Présences à réaffecter</span>
          <strong>${secondaryPresences.length}</strong>
        </div>
      </div>

      <div class="author-duplicate-plan-target">
        <strong>Identité cible simulée</strong>
        <code>author_id = ${escapeHtml(primaryId || "ABSENT")}</code>
        <code>author_slug = ${escapeHtml(primarySlug || "ABSENT")}</code>
        <code>author_identity_key = ${escapeHtml(primarySlug || "ABSENT")}</code>
      </div>

      ${
        secondaryPresences.length
          ? `
            <div class="author-duplicate-plan-list">
              <strong>Présences qui seraient réaffectées</strong>
              <ul>${transferRows}</ul>
            </div>
          `
          : `
            <p class="author-duplicate-plan-empty">
              Aucune présence techniquement reliée à la fiche secondaire.
            </p>
          `
      }

      ${
        ambiguousPresences.length
          ? `
            <div class="author-duplicate-plan-ambiguous">
              <strong>
                ${ambiguousPresences.length}
                présence${ambiguousPresences.length > 1 ? "s" : ""}
                trouvée${ambiguousPresences.length > 1 ? "s" : ""}
                uniquement par le nom
              </strong>
              <p>
                Elles sont signalées pour contrôle humain et ne sont pas incluses
                dans la fusion automatique.
              </p>
            </div>
          `
          : ""
      }

      <div class="author-editor-warning">
        La fusion réaffectera les présences techniquement liées et archivera
        logiquement la fiche secondaire. Aucune suppression physique ne sera faite.
      </div>

      <div class="author-editor-actions author-duplicate-merge-actions">
        <button
          type="button"
          class="cyber-btn-primary"
          data-author-duplicate-action="merge"
          data-author-duplicate-primary="${escapeAttribute(primaryId)}"
          data-author-duplicate-secondary="${escapeAttribute(String(secondary.id || ""))}"
        >
          Fusionner ces fiches
        </button>
      </div>
    `;

    plan.hidden = false;
  }

  async function executeAuthorDuplicateMerge(button) {
    const primaryId = String(
      button?.dataset?.authorDuplicatePrimary || ""
    ).trim();

    const secondaryId = String(
      button?.dataset?.authorDuplicateSecondary || ""
    ).trim();

    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      toast("Fusion impossible : fiches invalides");
      return;
    }

    const primary = authors.find(
      (author) => String(author.id || "") === primaryId
    );

    const secondary = authors.find(
      (author) => String(author.id || "") === secondaryId
    );

    if (!primary || !secondary) {
      toast("Fusion impossible : fiche auteur introuvable");
      return;
    }

    if (primary.merged_into || secondary.merged_into) {
      toast("Fusion impossible : une fiche est déjà fusionnée");
      return;
    }

    const confirmed = window.confirm(
      `CONFIRMER LA FUSION\n\n` +
      `Fiche conservée : ${primary.pseudo || primary.slug}\n` +
      `Fiche archivée : ${secondary.pseudo || secondary.slug}\n\n` +
      `Les présences techniquement liées seront réaffectées.\n` +
      `La fiche secondaire ne sera pas supprimée.\n\n` +
      `Continuer ?`
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Fusion en cours…";

    const { data, error } = await supabaseClient.rpc(
      "merge_author_profiles",
      {
        p_primary_id: primaryId,
        p_secondary_id: secondaryId
      }
    );

    if (error) {
      button.disabled = false;
      button.textContent = "Fusionner ces fiches";

      const message = String(error.message || "");

      if (message.includes("presence_event_conflict")) {
        toast("Fusion bloquée : présence en conflit sur un même événement");
      } else if (message.includes("already_merged")) {
        toast("Fusion bloquée : une fiche est déjà fusionnée");
      } else if (message.includes("cannot_merge_author_into_itself")) {
        toast("Fusion impossible : même fiche sélectionnée");
      } else if (message.includes("admin_required")) {
        toast("Fusion refusée : droits administrateur requis");
      } else {
        console.warn("Admin auteurs : fusion impossible", error);
        toast("Erreur lors de la fusion des fiches auteurs");
      }

      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const reassigned = Number(result?.reassigned_presences || 0);

    closeAuthorDuplicateCompare();
    await loadRows();
    render();

    toast(
      `Fusion terminée — ${reassigned} présence${reassigned > 1 ? "s" : ""} réaffectée${reassigned > 1 ? "s" : ""}`
    );
  }

  async function executeAuthorControlledPublication(button) {
    const authorId = String(button?.dataset?.authorId || "").trim();
    const action = String(button?.dataset?.authorLiveAction || "").trim();

    if (!authorId || !["publish", "unpublish"].includes(action)) {
      toast("Action de publication impossible");
      return;
    }

    const author = authors.find(
      (item) => String(item?.id || "") === authorId
    );

    if (!author) {
      toast("Fiche auteur introuvable");
      return;
    }

    const authorName =
      button.dataset.authorName || author.pseudo || "cette fiche auteur";

    if (action === "publish") {
      const canPublish =
        author.publication_ready === true &&
        author.validated === true &&
        !author.merged_into &&
        author.published !== true;

      if (!canPublish) {
        toast("Cette fiche ne remplit pas les conditions de publication");
        return;
      }
    }

    const confirmed = action === "publish"
      ? window.confirm(
          `PUBLICATION PUBLIQUE\n\n` +
          `${authorName}\n\n` +
          `Confirmer la publication de cette fiche auteur ?\n\n` +
          `Cette action marque la fiche comme publiée, mais la page publique reste encore verrouillée tant que 20I.2 n’est pas activé.`
        )
      : window.confirm(
          `DÉPUBLICATION\n\n` +
          `${authorName}\n\n` +
          `Confirmer la dépublication de cette fiche auteur ?`
        );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent =
      action === "publish" ? "Publication…" : "Dépublication…";

    let payload;

    if (action === "publish") {
      const { data: authData, error: authError } =
        await supabaseClient.auth.getUser();

      const adminId = authData?.user?.id || null;

      if (authError || !adminId) {
        button.disabled = false;
        button.textContent = "Publier";
        toast("Administrateur connecté non identifié");
        return;
      }

      payload = {
        published: true,
        published_at: new Date().toISOString(),
        published_by: adminId,
        updated_at: new Date().toISOString()
      };
    } else {
      payload = {
        published: false,
        published_at: null,
        published_by: null,
        updated_at: new Date().toISOString()
      };
    }

    const { error } = await supabaseClient
      .from("authors")
      .update(payload)
      .eq("id", authorId);

    if (error) {
      console.warn("Admin auteurs : publication impossible", error);

      button.disabled = false;
      button.textContent =
        action === "publish" ? "Publier" : "Dépublier";

      toast(
        action === "publish"
          ? "Impossible de publier cette fiche"
          : "Impossible de dépublier cette fiche"
      );
      return;
    }

    await loadRows();
    render();

    toast(
      action === "publish"
        ? "Fiche marquée publiée — page publique encore verrouillée"
        : "Fiche dépubliée"
    );
  }

  async function executeAuthorPublicationReadiness(button) {
    const authorId = String(button?.dataset?.authorId || "").trim();
    const action = String(
      button?.dataset?.authorPublicationAction || ""
    ).trim();

    if (!authorId || !["set", "unset"].includes(action)) {
      toast("Validation éditoriale impossible");
      return;
    }

    const authorName =
      button.dataset.authorName || "cette fiche auteur";

    const author = authors.find(
      (item) => String(item?.id || "") === authorId
    );

    if (!author) {
      toast("Fiche auteur introuvable");
      return;
    }

    if (action === "set") {
      const prepared = buildPreparedAuthors().find(
        (item) => String(item?.author?.id || "") === authorId
      );

      if (!prepared) {
        toast("Préparation éditoriale introuvable");
        return;
      }

      const checklist = buildAuthorPublicationChecklist(prepared);

      if (!checklist.ready) {
        toast("La fiche n’est pas encore éditorialement complète");
        return;
      }
    }

    const confirmation = action === "set"
      ? window.confirm(
          `VALIDATION ÉDITORIALE\n\n` +
          `${authorName}\n\n` +
          `Marquer cette fiche comme prête à publier ?\n\n` +
          `Cette action ne publie pas la fiche sur le site.`
        )
      : window.confirm(
          `RETIRER LE STATUT PRÊT\n\n` +
          `${authorName}\n\n` +
          `La fiche repassera en préparation interne.`
        );

    if (!confirmation) return;

    button.disabled = true;

    if (action === "set") {
      button.textContent = "Validation…";
    } else {
      button.textContent = "Mise à jour…";
    }

    let payload;

    if (action === "set") {
      const { data: authData, error: authError } =
        await supabaseClient.auth.getUser();

      const adminId = authData?.user?.id || null;

      if (authError || !adminId) {
        button.disabled = false;
        button.textContent = "Marquer prête à publier";
        toast("Administrateur connecté non identifié");
        return;
      }

      payload = {
        publication_ready: true,
        publication_ready_at: new Date().toISOString(),
        publication_ready_by: adminId,
        updated_at: new Date().toISOString()
      };
    } else {
      payload = {
        publication_ready: false,
        publication_ready_at: null,
        publication_ready_by: null,
        updated_at: new Date().toISOString()
      };
    }

    const { error } = await supabaseClient
      .from("authors")
      .update(payload)
      .eq("id", authorId);

    if (error) {
      console.warn(
        "Admin auteurs : statut publication impossible",
        error
      );

      button.disabled = false;
      button.textContent =
        action === "set"
          ? "Marquer prête à publier"
          : "Retirer le statut prêt";

      toast("Impossible de modifier le statut éditorial");
      return;
    }

    await loadRows();
    render();

    toast(
      action === "set"
        ? "Fiche marquée prête à publier — aucune publication automatique"
        : "Statut prêt à publier retiré"
    );
  }

  async function executeAuthorMergeRevert(button) {
    const auditId = String(
      button?.dataset?.authorMergeAuditId || ""
    ).trim();

    if (!auditId) {
      toast("Retour arrière impossible : journal introuvable");
      return;
    }

    const primaryName =
      button.dataset.authorMergePrimary || "fiche principale";

    const secondaryName =
      button.dataset.authorMergeSecondary || "fiche archivée";

    const confirmed = window.confirm(
      `CONFIRMER LE RETOUR ARRIÈRE\n\n` +
      `Fusion à annuler : ${secondaryName} → ${primaryName}\n\n` +
      `La fiche archivée sera restaurée ainsi que les présences ` +
      `enregistrées dans le journal de fusion.\n\n` +
      `Si l’état a changé depuis la fusion, l’opération sera bloquée.\n\n` +
      `Continuer ?`
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Annulation en cours…";

    const { data, error } = await supabaseClient.rpc(
      "revert_author_merge",
      {
        p_audit_id: auditId
      }
    );

    if (error) {
      button.disabled = false;
      button.textContent = "Annuler cette fusion";

      const message = String(error.message || "");

      if (message.includes("merge_already_reverted")) {
        toast("Cette fusion a déjà été annulée");
      } else if (message.includes("merge_state_changed")) {
        toast("Retour arrière bloqué : l’état des fiches a changé");
      } else if (message.includes("presence_restore_count_mismatch")) {
        toast("Retour arrière bloqué : certaines présences ont changé");
      } else if (message.includes("merge_audit_not_found")) {
        toast("Retour arrière impossible : journal introuvable");
      } else if (message.includes("admin_required")) {
        toast("Retour arrière refusé : droits administrateur requis");
      } else {
        console.warn(
          "Admin auteurs : retour arrière fusion impossible",
          error
        );
        toast("Erreur lors du retour arrière de la fusion");
      }

      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const restored = Number(result?.restored_presences || 0);

    await loadRows();
    render();

    toast(
      `Fusion annulée — ${restored} présence${restored > 1 ? "s" : ""} restaurée${restored > 1 ? "s" : ""}`
    );
  }

  function closeAuthorDuplicateCompare() {
    document.getElementById("author-duplicate-overlay")?.remove();
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

      .author-merge-history {
        margin: 18px 0 24px;
        padding: 18px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 22px;
        background: rgba(7,18,22,.62);
      }

      .author-merge-history-list {
        display: grid;
        gap: 12px;
      }

      .author-merge-history-card {
        padding: 14px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 16px;
        background: rgba(255,255,255,.035);
      }

      .author-merge-history-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }

      .author-merge-history-card-head strong {
        display: block;
      }

      .author-merge-history-card-head span {
        display: block;
        margin-top: 4px;
        color: var(--cyber-muted);
        font-size: .78rem;
      }

      .author-merge-history-head-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
      }

      .author-merge-revert-button {
        min-height: 34px;
        padding: 7px 10px;
        font-size: .72rem;
      }

      .author-merge-history-status {
        flex: 0 0 auto;
        padding: 5px 9px;
        border-radius: 999px;
        font-size: .72rem;
        font-weight: 900;
      }

      .author-merge-history-status.is-active {
        background: rgba(50,205,130,.13);
        border: 1px solid rgba(50,205,130,.35);
      }

      .author-merge-history-status.is-reverted {
        background: rgba(255,255,255,.07);
        border: 1px solid rgba(255,255,255,.14);
      }

      .author-merge-history-details {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin: 14px 0 0;
      }

      .author-merge-history-details div {
        min-width: 0;
      }

      .author-merge-history-details dt {
        color: var(--cyber-muted);
        font-size: .68rem;
        text-transform: uppercase;
        letter-spacing: .04em;
      }

      .author-merge-history-details dd {
        margin: 4px 0 0;
        overflow-wrap: anywhere;
        font-size: .82rem;
      }

      @media (max-width: 760px) {
        .author-merge-history-details {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 480px) {
        .author-merge-history-card-head {
          display: block;
        }

        .author-merge-history-status {
          display: inline-block;
          margin-top: 10px;
        }

        .author-merge-history-details {
          grid-template-columns: 1fr;
        }
      }

      .author-publication-action {
        min-height: 36px;
        padding: 8px 12px;
        border: 1px solid rgba(58, 28, 113, .38);
        border-radius: 10px;
        background: rgba(58, 28, 113, .12);
        color: inherit;
        font: inherit;
        font-size: .74rem;
        font-weight: 900;
        cursor: pointer;
      }

      .author-publication-action.is-published {
        border-color: rgba(190, 70, 70, .35);
        background: rgba(190, 70, 70, .08);
      }

      .author-publication-action:disabled {
        cursor: wait;
        opacity: .58;
      }

      .author-publication-ready-action {
        min-height: 36px;
        padding: 8px 11px;
        border: 1px solid rgba(50,205,130,.36);
        border-radius: 10px;
        background: rgba(50,205,130,.11);
        color: inherit;
        font: inherit;
        font-size: .74rem;
        font-weight: 900;
        cursor: pointer;
      }

      .author-publication-ready-action.is-ready {
        border-color: rgba(255,190,70,.3);
        background: rgba(255,190,70,.08);
      }

      .author-publication-ready-action:disabled {
        cursor: wait;
        opacity: .58;
      }

      .author-publication-readiness {
        margin-top: 14px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 14px;
        background: rgba(255,255,255,.025);
      }

      .author-publication-readiness-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .author-publication-readiness-head strong {
        font-size: .78rem;
      }

      .author-publication-score {
        font-size: .72rem;
        font-weight: 900;
        color: var(--cyber-muted);
      }

      .author-publication-score.is-ready {
        color: #5de2a5;
      }

      .author-publication-progress {
        height: 7px;
        margin-top: 9px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255,255,255,.08);
      }

      .author-publication-progress span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: currentColor;
      }

      .author-publication-checks {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 10px;
      }

      .author-publication-check {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 8px;
        border-radius: 999px;
        font-size: .69rem;
        border: 1px solid rgba(255,255,255,.1);
      }

      .author-publication-check.is-ok {
        background: rgba(50,205,130,.1);
        border-color: rgba(50,205,130,.28);
      }

      .author-publication-check.is-missing {
        background: rgba(255,180,70,.08);
        border-color: rgba(255,180,70,.22);
      }

      .author-publication-warning,
      .author-publication-ready {
        margin: 10px 0 0;
        font-size: .72rem;
        line-height: 1.4;
      }

      .author-publication-warning {
        color: #ffcf7a;
      }

      .author-publication-ready {
        color: #5de2a5;
        font-weight: 800;
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

      .author-duplicate-dialog {
        width: min(1100px, calc(100vw - 32px));
      }

      .author-duplicate-score {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 16px;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.04);
      }

      .author-duplicate-score span {
        opacity: .75;
      }

      .author-duplicate-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .author-duplicate-profile {
        padding: 16px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.03);
        transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
      }

      .author-duplicate-profile.is-primary {
        border-color: rgba(46, 204, 113, .75);
        background: rgba(46, 204, 113, .08);
        box-shadow: 0 0 0 1px rgba(46, 204, 113, .18);
      }

      .author-duplicate-select {
        width: 100%;
        margin-top: 14px;
      }

      .author-duplicate-select.is-selected {
        font-weight: 700;
      }

      .author-duplicate-merge-plan {
        margin-top: 18px;
        padding: 16px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.025);
      }

      .author-duplicate-plan-head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 16px;
      }

      .author-duplicate-plan-head small,
      .author-duplicate-plan-head strong {
        display: block;
      }

      .author-duplicate-plan-head small {
        margin-bottom: 3px;
        opacity: .6;
      }

      .author-duplicate-plan-head > span {
        opacity: .7;
        font-size: .85rem;
      }

      .author-duplicate-plan-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
      }

      .author-duplicate-plan-summary > div {
        padding: 12px;
        border-radius: 10px;
        background: rgba(255,255,255,.04);
      }

      .author-duplicate-plan-summary span,
      .author-duplicate-plan-summary strong,
      .author-duplicate-plan-summary small {
        display: block;
      }

      .author-duplicate-plan-summary span {
        margin-bottom: 4px;
        font-size: .75rem;
        text-transform: uppercase;
        opacity: .55;
      }

      .author-duplicate-plan-summary small {
        margin-top: 3px;
        opacity: .65;
      }

      .author-duplicate-plan-target {
        display: grid;
        gap: 5px;
        margin: 14px 0;
        padding: 12px;
        border-radius: 10px;
        background: rgba(255,255,255,.04);
      }

      .author-duplicate-plan-target code {
        overflow-wrap: anywhere;
      }

      .author-duplicate-plan-list {
        margin-top: 14px;
      }

      .author-duplicate-plan-list ul {
        margin: 8px 0 0;
        padding-left: 20px;
      }

      .author-duplicate-plan-list li {
        margin-bottom: 8px;
      }

      .author-duplicate-plan-list li span {
        display: block;
        margin-top: 2px;
        opacity: .7;
        font-size: .84rem;
        overflow-wrap: anywhere;
      }

      .author-duplicate-plan-empty,
      .author-duplicate-plan-ambiguous {
        margin: 14px 0;
        padding: 12px;
        border-radius: 10px;
        background: rgba(255,255,255,.04);
      }

      .author-duplicate-plan-ambiguous p {
        margin: 5px 0 0;
        opacity: .75;
      }

      @media (max-width: 760px) {
        .author-duplicate-plan-summary {
          grid-template-columns: 1fr 1fr;
        }

        .author-duplicate-plan-head {
          flex-direction: column;
        }
      }

      @media (max-width: 480px) {
        .author-duplicate-plan-summary {
          grid-template-columns: 1fr;
        }
      }

      .author-duplicate-profile-head {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 16px;
      }

      .author-duplicate-profile-head strong,
      .author-duplicate-profile-head span,
      .author-duplicate-profile-head small {
        display: block;
      }

      .author-duplicate-profile-head small {
        opacity: .6;
        margin-bottom: 4px;
      }

      .author-duplicate-profile-head span {
        opacity: .7;
        margin-top: 4px;
        font-size: .84rem;
      }

      .author-duplicate-avatar {
        width: 74px;
        height: 74px;
        flex: 0 0 74px;
        border-radius: 50%;
        object-fit: cover;
        border: 1px solid rgba(255,255,255,.12);
      }

      .author-duplicate-avatar.is-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        text-align: center;
        font-size: .72rem;
        opacity: .65;
        background: rgba(255,255,255,.05);
      }

      .author-duplicate-fields {
        display: grid;
        gap: 10px;
        margin: 0;
      }

      .author-duplicate-fields > div {
        padding: 10px 0;
        border-top: 1px solid rgba(255,255,255,.07);
      }

      .author-duplicate-fields dt {
        margin-bottom: 3px;
        font-size: .75rem;
        text-transform: uppercase;
        opacity: .55;
      }

      .author-duplicate-fields dd {
        margin: 0;
        overflow-wrap: anywhere;
      }

      @media (max-width: 760px) {
        .author-duplicate-grid {
          grid-template-columns: 1fr;
        }

        .author-duplicate-score {
          flex-direction: column;
        }
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
