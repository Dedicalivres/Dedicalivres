/* =========================================================
   DÉDICALIVRES — Veille admin
   Assistant de recherche d'événements via Worker sécurisé.
========================================================= */
(function () {
  "use strict";

  const VERSION = "2026-08-20-event-watch-admin-v1";
  const DEFAULT_WATCH_ENDPOINT = "https://dedicalivres-veille.dedicalivres.workers.dev/analyze";
  const DEFAULT_EVENT_WATCH_ENDPOINT = "http://127.0.0.1:5065/api/event-watch";
  const EVENT_WATCH_TIMEOUT_MS = 3000;
  const HISTORY_KEY = "dedicalivres_admin_watch_history_v1";
  const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1";
  const WORKFLOW_KEY = "dedicalivres_admin_watch_workflow_v2";
  const EVENT_WATCH_WORKFLOW_KEY = "dedicalivres_admin_event_watch_workflow_v1";
  const WATCH_SERVER_READ_TIMEOUT_MS = 3500;
  const WATCH_SERVER_CANDIDATES_LIMIT = 500;
  const WATCH_SERVER_SOURCES_LIMIT = 200;
  const WATCH_SERVER_ALERTS_LIMIT = 300;
  const PRODUCTIVE_COMPLETE_THRESHOLD = 10;
  const WATCH_PAGE_SIZE = 15;
  const DUPLICATE_CHECK_CONCURRENCY = 4;
  const WATCH_SUSPICIOUS_IMAGE_PATTERN = /(logo|favicon|placeholder|default|avatar|icon|no-image|noimage)/i;
  const WATCH_NON_IMAGE_EXTENSION_PATTERN = /\.(html?|php|json|xml|txt|pdf)(?:$|[?#])/i;

  let initialized = false;
  let client = null;
  let lastResults = [];
  let lastPagination = getEmptyPagination();
  let watchOffset = 0;
  let eventWatchAlerts = [];
  let eventWatchCategory = "all";
  let eventWatchQueueFilter = "review";
  let eventWatchAvailability = "unchecked";
  let lastWatchAnalysisAt = "";
  let watchQueueFilter = "all";
  let watchPersistenceSnapshot = createEmptyWatchPersistenceSnapshot();
  const duplicateCheckCache = new Map();
  const duplicateSignalCache = new Map();

  ready(() => waitForAdminAuthentication(initWhenReady));
  window.addEventListener("dedicalivres:admin-authenticated", () => waitForAdminAuthentication(initWhenReady));

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  function waitForAdminAuthentication(callback) {
    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED === true) callback();
  }

  function initWhenReady() {
    if (initialized || window.DEDICALIVRES_ADMIN_AUTHENTICATED !== true) return;

    const tab = document.getElementById("tab-watch");
    const config = window.DEDICALIVRES_CONFIG || {};
    client =
      (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
      window.DEDICALIVRES_SUPABASE_CLIENT;

    if (!tab || !client) {
      console.warn("Veille admin non initialisée : onglet ou client Supabase introuvable.");
      renderInitError(tab, !tab
        ? "Le panneau Veille est introuvable dans admin.html."
        : "Le client Supabase admin est introuvable. Recharge la page après connexion, puis vérifie que config.js et la librairie Supabase sont bien chargés."
      );
      return;
    }

    initialized = true;
    ensureWatchStyles();
    injectInterface(tab, config);
    bindControls();
    renderHistory();
    updateWatchOperationsDashboard();
    loadWatchPersistenceSnapshot().catch((error) => {
      watchPersistenceSnapshot = createEmptyWatchPersistenceSnapshot("unavailable");
      watchPersistenceSnapshot.errors = [classifyWatchPersistenceError(error)];
      updateWatchPersistenceIndicator();
      updateWatchOperationsDashboard();
      console.warn("Lecture de persistance Veille impossible :", error);
    });
    loadEventWatchAlerts();
  }

  function renderInitError(tab, message) {
    if (!tab) return;

    tab.innerHTML = `
      <section class="admin-panel admin-empty-panel">
        <div class="section-head">
          <h3>VEILLE</h3>
          <span>Assistant de recherche</span>
        </div>
        <p class="priority-empty">${escapeHtml(message)}</p>
      </section>
    `;
  }

  function injectInterface(tab, config) {
    const endpoint = getWatchEndpoint(config);

    tab.innerHTML = `
      <section class="watch-shell" data-watch-version="${VERSION}">
        <article class="watch-card watch-operations-dashboard" aria-labelledby="watch-operations-title">
          <div class="watch-card-head">
            <div>
              <h3 id="watch-operations-title">Pilotage Veille</h3>
              <p>
                Vue locale des actions en attente, enrichie par la persistance serveur lorsqu’elle est disponible.
                <span id="watch-persistence-status" class="watch-pill" data-state="local">Persistance : Locale</span>
              </p>
            </div>
            <div class="watch-operations-nav" aria-label="Navigation rapide Veille">
              <button class="cyber-btn-secondary" data-watch-dashboard-target="watch-candidates-section" type="button">Voir les candidats</button>
              <button class="cyber-btn-secondary" data-watch-dashboard-target="watch-event-watch-section" type="button">Voir Event Watch</button>
              <button class="cyber-btn-secondary" data-watch-dashboard-target="watch-sources-section" type="button">Voir les sources</button>
            </div>
          </div>

          <div class="watch-operations-grid" aria-live="polite">
            <div class="watch-operation-card">
              <span>À traiter</span>
              <strong id="watch-operations-candidates-count">0</strong>
              <small>Candidats prêts ou à vérifier</small>
            </div>
            <div class="watch-operation-card">
              <span>Event Watch</span>
              <strong id="watch-operations-event-count">0</strong>
              <small>Local : <span id="watch-operations-event-status" data-state="unchecked">Non vérifié / en attente</span></small>
            </div>
            <div class="watch-operation-card">
              <span>Sources productives</span>
              <strong id="watch-operations-sources-count">0</strong>
              <small>Sources connues sur cet appareil</small>
            </div>
            <div class="watch-operation-card">
              <span>Qualité des sources</span>
              <strong id="watch-operations-source-quality">Aucune source qualifiée</strong>
              <small>Selon le rendement existant</small>
            </div>
          </div>

          <div class="watch-operations-footer">
            <p><strong>Dernière activité :</strong> <span id="watch-operations-last-activity">Aucune activité enregistrée</span></p>
            <div class="watch-operations-top-sources">
              <strong>Meilleures sources</strong>
              <div id="watch-operations-top-sources"><span>Aucune source productive</span></div>
            </div>
          </div>
        </article>

        <article id="watch-event-watch-section" class="watch-card event-watch-admin-card">
          <div class="watch-card-head">
            <div>
              <h3>Événements à vérifier</h3>
              <p>
                Changements détectés par Auto-Matte sur des événements associés à Dédicalivres.
                Aucune information n’est appliquée sans validation humaine.
              </p>
            </div>
            <button id="event-watch-refresh" class="cyber-btn-secondary" type="button">Actualiser</button>
          </div>

          <div class="event-watch-toolbar">
            <div class="event-watch-categories" role="group" aria-label="Catégories Event Watch">
              <button class="event-watch-category is-active" data-event-watch-category="all" type="button" aria-pressed="true">Toutes</button>
              <button class="event-watch-category" data-event-watch-category="cancelled" type="button" aria-pressed="false">Annulations</button>
              <button class="event-watch-category" data-event-watch-category="postponed" type="button" aria-pressed="false">Reports</button>
              <button class="event-watch-category" data-event-watch-category="date_location" type="button" aria-pressed="false">Dates / lieux</button>
              <button class="event-watch-category" data-event-watch-category="registration" type="button" aria-pressed="false">Inscriptions</button>
              <button class="event-watch-category" data-event-watch-category="program" type="button" aria-pressed="false">Programmation</button>
              <button class="event-watch-category" data-event-watch-category="poster" type="button" aria-pressed="false">Nouvelles affiches</button>
            </div>

            <button id="event-watch-reset-workflow" class="cyber-btn-secondary" type="button">Réinitialiser les états</button>
          </div>

          <div class="event-watch-review-toolbar">
            <p id="event-watch-review-count" aria-live="polite">0 changement à vérifier</p>
            <div class="event-watch-review-filters" role="group" aria-label="Filtrer la file Event Watch">
              <button class="event-watch-review-filter is-active" data-event-watch-filter="review" type="button" aria-pressed="true">À vérifier <span data-event-watch-filter-count="review">0</span></button>
              <button class="event-watch-review-filter" data-event-watch-filter="confirmed" type="button" aria-pressed="false">Confirmées <span data-event-watch-filter-count="confirmed">0</span></button>
              <button class="event-watch-review-filter" data-event-watch-filter="handled" type="button" aria-pressed="false">Traitées <span data-event-watch-filter-count="handled">0</span></button>
              <button class="event-watch-review-filter" data-event-watch-filter="ignored" type="button" aria-pressed="false">Écartées <span data-event-watch-filter-count="ignored">0</span></button>
              <button class="event-watch-review-filter" data-event-watch-filter="all" type="button" aria-pressed="false">Toutes <span data-event-watch-filter-count="all">0</span></button>
            </div>
          </div>

          <p id="event-watch-status" class="watch-status" aria-live="polite">Connexion à Auto-Matte local…</p>
          <div id="event-watch-alerts" class="event-watch-alerts" aria-live="polite">
            <p class="priority-empty">Chargement des alertes…</p>
          </div>
        </article>

        <article class="watch-card watch-hero-card">
          <div class="watch-card-head">
            <div>
              <h3>Veille événements</h3>
              <p>
                Analyse une URL ou une liste d’URL, puis prépare une fiche candidate à relire.
                Cette entrée web complète Auto-Matte local : les deux chemins rejoignent la même modération. Vérifie les doublons avant validation.
              </p>
            </div>
            <span class="watch-pill">V${VERSION}</span>
          </div>

          <div class="watch-endpoint-box">
            <span>Worker connecté</span>
            <code id="watch-endpoint-label">${escapeHtml(endpoint)}</code>
            <button id="watch-health-btn" class="cyber-btn-secondary" type="button">Tester</button>
          </div>

          <div class="watch-form-grid">
            <label class="watch-url-field">
              <span>URL à analyser</span>
              <textarea
                id="watch-urls"
                rows="7"
                placeholder="https://site.fr/agenda/salon-du-livre&#10;https://autre-site.fr/dedicace-auteur"
              ></textarea>
            </label>

            <div class="watch-side-controls">
              <label>
                <span>Pays cible</span>
                <select id="watch-country">
                  <option>Tous</option>
                  <option>France</option>
                  <option>Belgique</option>
                  <option>Luxembourg</option>
                  <option>Suisse</option>
                  <option>Monaco</option>
                </select>
              </label>

              <label>
                <span>Type recherché</span>
                <select id="watch-type">
                  <option>Tous</option>
                  <option>Salons / festivals</option>
                  <option>Dédicaces</option>
                  <option>Rencontres</option>
                </select>
              </label>

              <label>
                <span>Mode</span>
                <select id="watch-mode">
                  <option value="prepare">Préparer pour copie admin</option>
                  <option value="audit">Audit source seulement</option>
                </select>
              </label>
            </div>
          </div>

          <div class="watch-actions">
            <button id="watch-analyze-btn" class="cyber-btn-primary" type="button">Analyser les URL</button>
            <button id="watch-next-btn" class="cyber-btn-secondary" type="button" disabled>15 suivants</button>
            <button id="watch-first-btn" class="cyber-btn-secondary" type="button" disabled>Revenir au début</button>
            <button id="watch-clear-btn" class="cyber-btn-secondary" type="button">Effacer</button>
            <button id="watch-copy-all-btn" class="cyber-btn-secondary" type="button" disabled>Copier toutes les fiches</button>
          </div>

          <p id="watch-page-label" class="watch-page-label">
            Premier lot de résultats.
          </p>

          <p id="watch-status" class="watch-status" aria-live="polite">
            En attente d’une URL. Le résultat reste à vérifier humainement.
          </p>
        </article>

        <article id="watch-candidates-section" class="watch-card">
          <div class="watch-card-head">
            <div>
              <h3>Résultats de veille</h3>
              <p>Les champs manquants ou incertains sont affichés clairement avant copie.</p>
            </div>
          </div>

          <div class="watch-queue-toolbar" role="group" aria-label="Filtrer la file de veille">
            <button class="watch-queue-filter is-active" data-watch-queue-filter="all" type="button" aria-pressed="true">Tous <span data-watch-filter-count="all">0</span></button>
            <span class="watch-queue-label">Actifs</span>
            <button class="watch-queue-filter" data-watch-queue-filter="active" type="button" aria-pressed="false">À traiter : <span data-watch-filter-count="active">0</span></button>
            <button class="watch-queue-filter" data-watch-queue-filter="ready" type="button" aria-pressed="false">Prêts <span data-watch-filter-count="ready">0</span></button>
            <button class="watch-queue-filter" data-watch-queue-filter="review" type="button" aria-pressed="false">À vérifier <span data-watch-filter-count="review">0</span></button>
            <button id="watch-next-active-btn" class="cyber-btn-secondary" type="button" disabled>Suivant à traiter</button>
            <span class="watch-queue-label">Terminés / sans action</span>
            <button class="watch-queue-filter" data-watch-queue-filter="duplicate" type="button" aria-pressed="false">Déjà présents <span data-watch-filter-count="duplicate">0</span></button>
            <button class="watch-queue-filter" data-watch-queue-filter="handled" type="button" aria-pressed="false">Traités <span data-watch-filter-count="handled">0</span></button>
            <button class="watch-queue-filter" data-watch-queue-filter="rejected" type="button" aria-pressed="false">Écartés <span data-watch-filter-count="rejected">0</span></button>
          </div>

          <div id="watch-results" class="watch-results">
            <p class="priority-empty">Aucune analyse lancée pour le moment.</p>
          </div>
        </article>

        <article id="watch-sources-section" class="watch-card watch-history-card">
          <div class="watch-card-head">
            <div>
              <h3>Sources mémorisées</h3>
              <p>Les sources locales restent disponibles et peuvent être enrichies par les métriques persistées du serveur.</p>
            </div>
            <button id="watch-clear-history-btn" class="cyber-btn-danger" type="button">Vider</button>
          </div>
          <div id="watch-history" class="watch-history"></div>
        </article>
      </section>
    `;
  }

  function bindControls() {
    document.querySelectorAll("[data-watch-dashboard-target]").forEach((button) => {
      button.addEventListener("click", () => scrollToWatchOperationsSection(button.dataset.watchDashboardTarget));
    });
    document.getElementById("event-watch-refresh")?.addEventListener("click", loadEventWatchAlerts);
    document.getElementById("event-watch-reset-workflow")?.addEventListener("click", resetEventWatchWorkflow);
    document.querySelectorAll("[data-event-watch-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        eventWatchQueueFilter = button.dataset.eventWatchFilter || "review";
        renderEventWatchAlerts();
      });
    });
    document.querySelectorAll("[data-event-watch-category]").forEach((button) => {
      button.addEventListener("click", () => {
        eventWatchCategory = button.dataset.eventWatchCategory || "all";
        document.querySelectorAll("[data-event-watch-category]").forEach((item) => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        renderEventWatchAlerts();
      });
    });
    document.getElementById("watch-analyze-btn")?.addEventListener("click", () => {
      watchOffset = 0;
      analyzeUrls();
    });
    document.getElementById("watch-next-btn")?.addEventListener("click", () => {
      watchOffset += WATCH_PAGE_SIZE;
      analyzeUrls();
    });
    document.getElementById("watch-first-btn")?.addEventListener("click", () => {
      watchOffset = 0;
      analyzeUrls();
    });
    document.getElementById("watch-clear-btn")?.addEventListener("click", clearWatch);
    document.getElementById("watch-copy-all-btn")?.addEventListener("click", copyAllResults);
    document.getElementById("watch-health-btn")?.addEventListener("click", testWorkerHealth);
    document.getElementById("watch-clear-history-btn")?.addEventListener("click", clearHistory);
    document.getElementById("watch-next-active-btn")?.addEventListener("click", goToNextActiveResult);
    document.getElementById("watch-history")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-watch-rerun-source]");
      if (!button) return;
      rerunProductiveSource(button.dataset.watchRerunSource || "");
    });

    document.querySelectorAll("[data-watch-queue-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        watchQueueFilter = String(button.dataset.watchQueueFilter || "all");
        renderResults(lastResults);
      });
    });

    ["watch-urls", "watch-country", "watch-type", "watch-mode"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        watchOffset = 0;
        lastPagination = getEmptyPagination();
        updatePagingControls();
      });
    });
  }

  function scrollToWatchOperationsSection(targetId) {
    const target = document.getElementById(String(targetId || ""));
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateWatchOperationsDashboard() {
    const dashboard = document.querySelector(".watch-operations-dashboard");
    if (!dashboard) return;

    const activeCandidateCount = (Array.isArray(lastResults) ? lastResults : [])
      .filter((item) => ["ready", "review"].includes(getWatchWorkflowState(item)))
      .length;
    const eventReviewCount = getEventWatchWorkflowCounts(eventWatchAlerts).review;
    const productiveSources = sortProductiveSources(readProductiveSources());
    const qualifiedCounts = productiveSources.reduce((counts, item) => {
      const level = getProductiveSourceYieldLevel(getProductiveSourceYieldScore(item)).state;
      if (level === "excellent") counts.excellent += 1;
      if (level === "good") counts.good += 1;
      return counts;
    }, { excellent: 0, good: 0 });

    setWatchOperationsText("watch-operations-candidates-count", activeCandidateCount);
    setWatchOperationsText("watch-operations-event-count", eventReviewCount);
    setWatchOperationsText("watch-operations-sources-count", productiveSources.length);
    setWatchOperationsText(
      "watch-operations-source-quality",
      qualifiedCounts.excellent || qualifiedCounts.good
        ? `${qualifiedCounts.excellent} excellente${qualifiedCounts.excellent === 1 ? "" : "s"} · ${qualifiedCounts.good} bonne${qualifiedCounts.good === 1 ? "" : "s"}`
        : "Aucune source qualifiée"
    );
    setWatchOperationsText(
      "watch-operations-last-activity",
      getWatchOperationsLatestActivity(productiveSources)
    );

    const eventStatus = document.getElementById("watch-operations-event-status");
    if (eventStatus) {
      eventStatus.textContent = getEventWatchAvailabilityLabel();
      eventStatus.dataset.state = eventWatchAvailability;
    }

    const topSources = document.getElementById("watch-operations-top-sources");
    if (topSources) {
      const items = productiveSources.slice(0, 3);
      topSources.innerHTML = items.length
        ? items.map(renderWatchOperationsSource).join("")
        : "<span>Aucune source productive</span>";
    }
  }

  function setWatchOperationsText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function getEventWatchAvailabilityLabel() {
    if (eventWatchAvailability === "available") return "Disponible";
    if (eventWatchAvailability === "unavailable") return "Indisponible";
    return "Non vérifié / en attente";
  }

  function createEmptyWatchPersistenceSnapshot(availability = "local") {
    return {
      availability,
      candidates: [],
      sources: [],
      eventAlerts: [],
      errors: [],
      loadedAt: ""
    };
  }

  function getWatchPersistenceLabel(availability) {
    return {
      server: "Serveur",
      mixed: "Mixte",
      unavailable: "Serveur indisponible",
      local: "Locale"
    }[availability] || "Locale";
  }

  function updateWatchPersistenceIndicator() {
    const indicator = document.getElementById("watch-persistence-status");
    if (!indicator) return;
    indicator.textContent = `Persistance : ${getWatchPersistenceLabel(watchPersistenceSnapshot.availability)}`;
    indicator.dataset.state = watchPersistenceSnapshot.availability;
  }

  function classifyWatchPersistenceError(error) {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || error || "").toLowerCase();
    if (["42P01", "PGRST205"].includes(code) || /relation .* does not exist|schema cache|table .* not found/.test(message)) {
      return "table-missing";
    }
    if (["42501", "PGRST301"].includes(code) || /row-level security|permission denied|not authorized/.test(message)) {
      return "forbidden";
    }
    if (error?.name === "AbortError" || code === "WATCH_TIMEOUT" || /timeout|timed out|aborted/.test(message)) {
      return "timeout";
    }
    return "unavailable";
  }

  async function awaitWatchPersistenceQuery(query) {
    const controller = new AbortController();
    let timer = null;
    const request = typeof query?.abortSignal === "function"
      ? query.abortSignal(controller.signal)
      : query;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const error = new Error("Lecture de persistance Veille expirée");
        error.code = "WATCH_TIMEOUT";
        reject(error);
      }, WATCH_SERVER_READ_TIMEOUT_MS);
    });

    try {
      return await Promise.race([Promise.resolve(request), timeout]);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  async function readServerWatchRows(table, columns, orderColumn, limit) {
    if (!client || typeof client.from !== "function") {
      return { state: "not-configured", rows: [], error: null };
    }

    try {
      let query = client.from(table).select(columns);
      if (orderColumn) query = query.order(orderColumn, { ascending: false });
      if (Number.isFinite(limit) && limit > 0) query = query.limit(limit);
      const response = await awaitWatchPersistenceQuery(query);
      if (response?.error) {
        return {
          state: classifyWatchPersistenceError(response.error),
          rows: [],
          error: response.error
        };
      }
      return {
        state: "available",
        rows: Array.isArray(response?.data) ? response.data : [],
        error: null
      };
    } catch (error) {
      return {
        state: classifyWatchPersistenceError(error),
        rows: [],
        error
      };
    }
  }

  function readServerWatchCandidates() {
    return readServerWatchRows(
      "admin_watch_candidates",
      "identity_key,origin_url,canonical_origin_url,title,start_date,city,source_id,workflow_status,duplicate_event_id,submitted_event_id,status_updated_at,version,last_seen_at",
      "last_seen_at",
      WATCH_SERVER_CANDIDATES_LIMIT
    );
  }

  function readServerWatchSources() {
    return readServerWatchRows(
      "admin_watch_sources",
      "canonical_url,url_hash,source_url,title,observed_count,complete_count,review_count,rejected_count,duplicate_certain_count,duplicate_probable_count,with_image_count,without_image_count,analyses_count,first_seen_at,last_seen_at,is_active,version",
      "last_seen_at",
      WATCH_SERVER_SOURCES_LIMIT
    );
  }

  function readServerEventWatchAlerts() {
    return readServerWatchRows(
      "admin_event_watch_alerts",
      "identity_key,engine_alert_id,event_id,field,event_title,event_date,event_city,source_url,detected_at,workflow_status,status_updated_at,version",
      "detected_at",
      WATCH_SERVER_ALERTS_LIMIT
    );
  }

  async function loadWatchPersistenceSnapshot() {
    const reads = await Promise.all([
      readServerWatchCandidates(),
      readServerWatchSources(),
      readServerEventWatchAlerts()
    ]);
    const availableCount = reads.filter((result) => result.state === "available").length;
    const allNotConfigured = reads.every((result) => result.state === "not-configured");
    const availability = availableCount === reads.length
      ? "server"
      : availableCount > 0
        ? "mixed"
        : allNotConfigured
          ? "local"
          : "unavailable";

    watchPersistenceSnapshot = {
      availability,
      candidates: reads[0].rows,
      sources: reads[1].rows,
      eventAlerts: reads[2].rows,
      errors: reads
        .filter((result) => !["available", "not-configured"].includes(result.state))
        .map((result) => result.state),
      loadedAt: new Date().toISOString()
    };

    updateWatchPersistenceIndicator();
    renderHistory();
    if (lastResults.length) renderResults(lastResults);
    if (eventWatchAlerts.length) renderEventWatchAlerts();
    updateWatchOperationsDashboard();
    return watchPersistenceSnapshot;
  }

  function normalizeWatchPersistenceUrl(value) {
    const raw = normalizeUrlValue(value);
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      parsed.hostname = parsed.hostname.toLowerCase();
      if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
        parsed.port = "";
      }
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  function getWatchCandidatePersistenceKeys(item) {
    const keys = [];
    const identityKey = cleanText(item?.identity_key || item?.identityKey);
    if (identityKey) keys.push(`identity:${identityKey}`);

    const canonicalUrl = normalizeWatchPersistenceUrl(
      item?.canonical_origin_url || item?.canonicalOriginUrl || item?.origin_url || item?.sourceUrl || item?.officialUrl
    );
    const title = normalizeForCompare(item?.title || "");
    const startDate = normalizeIsoDate(item?.start_date || item?.startDate || "");
    const city = normalizeForCompare(item?.city || "");
    if (canonicalUrl && title && startDate && city) {
      keys.push(`fallback:${canonicalUrl}|${title}|${startDate}|${city}`);
    }
    return keys;
  }

  function findServerWatchCandidate(item) {
    const localKeys = new Set(getWatchCandidatePersistenceKeys(item));
    if (!localKeys.size) return null;
    return watchPersistenceSnapshot.candidates.find((candidate) =>
      getWatchCandidatePersistenceKeys(candidate).some((key) => localKeys.has(key))
    ) || null;
  }

  function getEventWatchPersistenceKeys(alert) {
    const keys = [];
    const identityKey = cleanText(alert?.identity_key || alert?.identityKey);
    const engineAlertId = cleanText(alert?.engine_alert_id || alert?.engineAlertId || alert?.id);
    if (identityKey) keys.push(`identity:${identityKey}`);
    if (engineAlertId) keys.push(`engine:${engineAlertId}`);
    return keys;
  }

  function findServerEventWatchAlert(alert) {
    const localKeys = new Set(getEventWatchPersistenceKeys(alert));
    if (!localKeys.size) return null;
    return watchPersistenceSnapshot.eventAlerts.find((serverAlert) =>
      getEventWatchPersistenceKeys(serverAlert).some((key) => localKeys.has(key))
    ) || null;
  }

  function resolveWatchPersistenceWorkflow(localEntry, serverEntry, allowedStates, closedStates) {
    const localState = allowedStates.includes(localEntry?.state) ? localEntry.state : "";
    const serverState = allowedStates.includes(serverEntry?.state) ? serverEntry.state : "";
    if (!serverState) return { state: localState || allowedStates[0], updatedAt: localEntry?.updatedAt || "" };
    if (!localState) return { state: serverState, updatedAt: serverEntry?.updatedAt || "" };

    const localClosed = closedStates.includes(localState);
    const serverClosed = closedStates.includes(serverState);
    if (localClosed && serverClosed) {
      const localTime = new Date(localEntry?.updatedAt || 0).getTime();
      const serverTime = new Date(serverEntry?.updatedAt || 0).getTime();
      if (Number.isFinite(localTime) && Number.isFinite(serverTime) && localTime > serverTime) {
        return { state: localState, updatedAt: localEntry?.updatedAt || "" };
      }
      return { state: serverState, updatedAt: serverEntry?.updatedAt || "" };
    }
    if (serverClosed) return { state: serverState, updatedAt: serverEntry?.updatedAt || "" };
    if (localClosed) return { state: localState, updatedAt: localEntry?.updatedAt || "" };
    return { state: serverState, updatedAt: serverEntry?.updatedAt || "" };
  }

  function getWatchOperationsLatestActivity(productiveSources) {
    const timestamps = [
      lastWatchAnalysisAt,
      ...(Array.isArray(productiveSources) ? productiveSources : []).map((item) => item?.lastSeenAt),
      ...(Array.isArray(eventWatchAlerts) ? eventWatchAlerts : []).map((alert) => alert?.detected_at),
      ...watchPersistenceSnapshot.candidates.map((item) => item?.status_updated_at),
      ...watchPersistenceSnapshot.eventAlerts.map((alert) => alert?.status_updated_at || alert?.detected_at)
    ]
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime());

    return timestamps.length
      ? formatDetectedAt(timestamps[0].toISOString())
      : "Aucune activité enregistrée";
  }

  function renderWatchOperationsSource(item) {
    const score = getProductiveSourceYieldScore(item);
    const level = getProductiveSourceYieldLevel(score);
    const lastAnalysis = item?.lastSeenAt ? formatDetectedAt(item.lastSeenAt) : "—";
    return `
      <div class="watch-operations-source">
        <span>${escapeHtml(item?.title || getUrlDisplayName(item?.sourceUrl) || "Source productive")}</span>
        <span class="watch-source-yield-badge is-${level.state}">${level.label}</span>
        <small>${escapeHtml(lastAnalysis)}</small>
      </div>
    `;
  }

  async function analyzeUrls() {
    const urls = document.getElementById("watch-urls")?.value.trim() || "";
    if (!urls) {
      setStatus("Colle au moins une URL avant de lancer l’analyse.", "warning");
      return;
    }

    const button = document.getElementById("watch-analyze-btn");
    const copyAll = document.getElementById("watch-copy-all-btn");

    if (button) {
      button.disabled = true;
      button.textContent = "Analyse...";
    }
    if (copyAll) copyAll.disabled = true;

    setStatus("Analyse en cours via le Worker sécurisé...");

    try {
      const payload = await callWatchWorker({
        urls,
        filters: {
          country: document.getElementById("watch-country")?.value || "Tous",
          type: document.getElementById("watch-type")?.value || "Tous",
          mode: document.getElementById("watch-mode")?.value || "prepare",
          offset: watchOffset,
          limit: WATCH_PAGE_SIZE
        }
      });

      lastWatchAnalysisAt = new Date().toISOString();
      lastResults = sortWatchResultsByCompleteness(Array.isArray(payload.results) ? payload.results : []);
      lastPagination = normalizeWatchPagination(payload);
      watchQueueFilter = "active";
      renderResults(lastResults);

      const duplicateCount = await precheckWatchDuplicates(lastResults);
      lastResults = sortWatchResultsByCompleteness(lastResults);
      renderResults(lastResults);

      const productiveSaved = rememberProductiveSources(urls, lastResults);
      renderHistory();
      updatePagingControls();
      setStatus([
        `${lastResults.length} fiche(s) candidate(s) préparée(s), classée(s) par complétude${formatPaginationStatus()}.`,
        duplicateCount ? `${duplicateCount} déjà présente(s) détectée(s) automatiquement.` : "",
        productiveSaved ? "Source à fort rendement mémorisée." : ""
      ].filter(Boolean).join(" "));
      if (copyAll) copyAll.disabled = !lastResults.length;
    } catch (error) {
      console.error("Veille admin :", error);
      lastResults = [];
      lastPagination = getEmptyPagination();
      renderResults([]);
      updatePagingControls();
      setStatus(error.message || "Analyse impossible.", "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Analyser les URL";
      }
    }
  }

  async function testWorkerHealth() {
    const endpoint = getWatchEndpoint(window.DEDICALIVRES_CONFIG || {});
    const healthUrl = endpoint.replace(/\/analyze\/?$/, "/health");
    setStatus("Test de connexion au Worker...");

    try {
      const response = await fetch(`${healthUrl}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Worker indisponible : HTTP ${response.status}`);
      const payload = await response.json();
      setStatus(`Worker disponible · ${payload.version || "version non précisée"}`);
    } catch (error) {
      setStatus(error.message || "Worker indisponible.", "error");
    }
  }

  async function callWatchWorker(body) {
    const endpoint = getWatchEndpoint(window.DEDICALIVRES_CONFIG || {});
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.access_token) {
      throw new Error("Session admin expirée. Reconnecte-toi.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Worker veille indisponible (${response.status})`);
    }

    return payload;
  }

  async function loadEventWatchAlerts() {
    const container = document.getElementById("event-watch-alerts");
    if (!container) return;

    eventWatchAvailability = "pending";
    updateWatchOperationsDashboard();
    setEventWatchStatus("Connexion à Auto-Matte local…");

    try {
      const endpoint = getEventWatchAdminEndpoint();
      const url = new URL(endpoint);
      url.searchParams.set("review_state", "all");
      const response = await fetchEventWatch(url.toString());
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      eventWatchAlerts = Array.isArray(payload.changes) ? payload.changes : [];
      eventWatchAvailability = "available";
      renderEventWatchAlerts();
      const counts = getEventWatchWorkflowCounts(eventWatchAlerts);
      setEventWatchStatus(
        `${eventWatchAlerts.length} alerte(s) chargée(s) · ` +
        `${counts.review} à vérifier · ` +
        `${counts.confirmed} confirmée(s) · ` +
        `${counts.handled} traitée(s) · ` +
        `${counts.ignored} écartée(s).`
      );
    } catch (error) {
      eventWatchAlerts = [];
      eventWatchAvailability = "unavailable";
      updateEventWatchQueueControls([]);
      container.innerHTML = `
        <div class="event-watch-unavailable" role="status">
          <strong>Event Watch indisponible</strong>
          <span>Auto-Matte local n’est pas démarré ou son pont local n’est pas accessible. Le reste de l’administration demeure disponible.</span>
        </div>
      `;
      setEventWatchStatus(`Event Watch indisponible · ${error.message || "connexion impossible"}`, "warning");
    }
  }

  function renderEventWatchAlerts() {
    const container = document.getElementById("event-watch-alerts");
    if (!container) return;

    updateEventWatchQueueControls(eventWatchAlerts);
    const alerts = [...eventWatchAlerts]
      .sort(compareEventWatchAlerts)
      .filter(matchesEventWatchCategory)
      .filter((alert) => eventWatchQueueFilter === "all" || getEventWatchWorkflowState(alert) === eventWatchQueueFilter);

    if (!alerts.length) {
      container.innerHTML = `<p class="priority-empty">Aucune alerte dans cette vue.</p>`;
      return;
    }

    container.innerHTML = alerts.map((alert) => {
      const alertKey = getEventWatchAlertKey(alert);
      const workflowEntry = getEventWatchWorkflowEntry(alert);
      const workflowState = workflowEntry.state;
      const priority = getEventWatchAlertPriority(alert);
      const remoteId = cleanText(alert.dedicalivres_event_id);
      const eventHref = isUuid(remoteId) ? `event.html?id=${encodeURIComponent(remoteId)}` : "";
      const sourceUrl = getEventWatchSourceUrl(alert);
      const proof = formatEventWatchValue(alert.proof);
      const detectedAt = alert.detected_at ? formatDetectedAt(alert.detected_at) : "—";
      const localActions = workflowState === "review" ? `
        <button class="cyber-btn-primary" data-event-watch-local-state="confirmed" data-event-watch-key="${escapeAttr(alertKey)}" type="button">Confirmer le changement</button>
        <button class="cyber-btn-secondary" data-event-watch-local-state="ignored" data-event-watch-key="${escapeAttr(alertKey)}" type="button">Écarter</button>
        <button class="cyber-btn-secondary" data-event-watch-local-state="handled" data-event-watch-key="${escapeAttr(alertKey)}" type="button">Marquer traité</button>
      ` : `
        <span class="event-watch-reviewed">
          ${getEventWatchWorkflowLabel(workflowState)}${workflowEntry.updatedAt ? ` · ${escapeHtml(formatDetectedAt(workflowEntry.updatedAt))}` : ""}
        </span>
      `;

      return `
        <article class="event-watch-alert event-watch-alert-${escapeAttr(workflowState)} event-watch-priority-${priority.state}">
          <div class="event-watch-alert-head">
            <div>
              <div class="event-watch-alert-badges">
                <span class="watch-pill">${escapeHtml(alert.field_label || alert.field || "—")}</span>
                <span class="event-watch-priority is-${priority.state}">${priority.label}</span>
                <span class="event-watch-workflow-state">${getEventWatchWorkflowLabel(workflowState)}</span>
              </div>
              <h4>${escapeHtml(alert.event_title || "—")}</h4>
              <p class="watch-meta">${escapeHtml([
                alert.event_date ? formatDate(alert.event_date) : "",
                alert.event_city,
                `Détecté le ${detectedAt}`
              ].filter(Boolean).join(" · ") || "—")}</p>
            </div>
            <strong class="event-watch-confidence">${formatEventWatchConfidence(alert.confidence)}</strong>
          </div>

          <div class="event-watch-values">
            <div><small>ANCIENNE VALEUR</small><span>${escapeHtml(formatEventWatchValue(alert.old_value))}</span></div>
            <div><small>NOUVELLE VALEUR</small><span>${escapeHtml(formatEventWatchValue(alert.new_value))}</span></div>
          </div>

          <p class="event-watch-proof"><strong>Preuve :</strong> ${escapeHtml(proof)}</p>
          <p class="event-watch-source">
            Source : ${sourceUrl
              ? `<a href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a>`
              : "—"}
            ${alert.status_label ? ` · ${escapeHtml(alert.status_label)}` : ""}
          </p>

          <div class="watch-result-actions">
            ${eventHref
              ? `<a class="cyber-btn-secondary" href="${escapeAttr(eventHref)}" target="_blank" rel="noopener noreferrer">Ouvrir l’événement</a>`
              : ""}
            ${sourceUrl
              ? `<a class="cyber-btn-secondary" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Voir la source</a>`
              : ""}
            ${localActions}
          </div>
        </article>
      `;
    }).join("");

    container.querySelectorAll("[data-event-watch-local-state]").forEach((button) => {
      button.addEventListener("click", () => {
        const alert = eventWatchAlerts.find((item) => getEventWatchAlertKey(item) === button.dataset.eventWatchKey);
        if (!alert) return;
        setEventWatchWorkflowState(alert, button.dataset.eventWatchLocalState);
      });
    });
  }

  function getEventWatchAlertKey(alert) {
    const id = cleanText(alert?.id);
    if (id) return `id:${id}`;

    const parts = [
      alert?.dedicalivres_event_id,
      alert?.event_title,
      alert?.field,
      alert?.source || alert?.proof?.url,
      alert?.detected_at || alert?.event_date
    ].map((value) => normalizeForCompare(formatEventWatchValue(value)));
    return `fallback:${parts.join("|")}`;
  }

  function readEventWatchWorkflow() {
    try {
      const parsed = JSON.parse(localStorage.getItem(EVENT_WATCH_WORKFLOW_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeEventWatchWorkflow(workflow) {
    localStorage.setItem(EVENT_WATCH_WORKFLOW_KEY, JSON.stringify(workflow || {}));
  }

  function getEventWatchWorkflowEntry(alert) {
    const allowedStates = ["review", "confirmed", "ignored", "handled"];
    const localEntry = readEventWatchWorkflow()[getEventWatchAlertKey(alert)];
    const localState = allowedStates.includes(localEntry?.state)
      ? localEntry.state
      : "review";
    const serverAlert = findServerEventWatchAlert(alert);
    return resolveWatchPersistenceWorkflow(
      { state: localState, updatedAt: localEntry?.updatedAt || "" },
      {
        state: serverAlert?.workflow_status || "",
        updatedAt: serverAlert?.status_updated_at || ""
      },
      allowedStates,
      ["confirmed", "ignored", "handled"]
    );
  }

  function getEventWatchWorkflowState(alert) {
    return getEventWatchWorkflowEntry(alert).state;
  }

  function getEventWatchWorkflowLabel(state) {
    return {
      review: "À vérifier",
      confirmed: "Confirmé",
      ignored: "Écarté",
      handled: "Traité"
    }[state] || "À vérifier";
  }

  function setEventWatchWorkflowState(alert, state) {
    if (!alert || !["confirmed", "ignored", "handled"].includes(state)) return;
    const workflow = readEventWatchWorkflow();
    workflow[getEventWatchAlertKey(alert)] = {
      state,
      updatedAt: new Date().toISOString()
    };
    writeEventWatchWorkflow(workflow);
    renderEventWatchAlerts();
    setEventWatchStatus(`État local : ${getEventWatchWorkflowLabel(state)}. Aucun événement n’a été modifié.`);
  }

  function resetEventWatchWorkflow() {
    localStorage.removeItem(EVENT_WATCH_WORKFLOW_KEY);
    eventWatchQueueFilter = "review";
    renderEventWatchAlerts();
    setEventWatchStatus("États locaux Event Watch réinitialisés. Les alertes du moteur sont inchangées.");
  }

  function getEventWatchWorkflowCounts(alerts) {
    const counts = { all: 0, review: 0, confirmed: 0, handled: 0, ignored: 0 };
    (Array.isArray(alerts) ? alerts : []).forEach((alert) => {
      const state = getEventWatchWorkflowState(alert);
      counts.all += 1;
      counts[state] += 1;
    });
    return counts;
  }

  function updateEventWatchQueueControls(alerts) {
    const counts = getEventWatchWorkflowCounts(alerts);
    const reviewCount = document.getElementById("event-watch-review-count");
    if (reviewCount) {
      reviewCount.textContent = `${counts.review} changement${counts.review > 1 ? "s" : ""} à vérifier`;
    }

    document.querySelectorAll("[data-event-watch-filter-count]").forEach((node) => {
      const key = node.dataset.eventWatchFilterCount || "";
      node.textContent = String(counts[key] || 0);
    });

    document.querySelectorAll("[data-event-watch-filter]").forEach((button) => {
      const active = button.dataset.eventWatchFilter === eventWatchQueueFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    updateWatchOperationsDashboard();
  }

  function getEventWatchAlertPriority(alert) {
    const field = String(alert?.field || "").toLowerCase();
    if (["cancelled", "postponed", "date", "time", "location", "address"].includes(field)) {
      return { state: "critical", label: "Critique", rank: 0 };
    }
    if (["registration", "applications", "program", "speakers", "participants"].includes(field)) {
      return { state: "important", label: "Important", rank: 1 };
    }
    return { state: "normal", label: "Normal", rank: 2 };
  }

  function compareEventWatchAlerts(left, right) {
    const workflowRank = { review: 0, confirmed: 1, handled: 2, ignored: 3 };
    const stateDifference = workflowRank[getEventWatchWorkflowState(left)] - workflowRank[getEventWatchWorkflowState(right)];
    if (stateDifference) return stateDifference;

    const priorityDifference = getEventWatchAlertPriority(left).rank - getEventWatchAlertPriority(right).rank;
    if (priorityDifference) return priorityDifference;

    const dateDifference = new Date(right?.detected_at || 0).getTime() - new Date(left?.detected_at || 0).getTime();
    if (dateDifference) return dateDifference;
    return String(left?.event_title || "").localeCompare(String(right?.event_title || ""), "fr");
  }

  function getEventWatchSourceUrl(alert) {
    return normalizeUrlValue(alert?.source || alert?.proof?.url);
  }

  function matchesEventWatchCategory(alert) {
    const field = String(alert?.field || "");
    if (eventWatchCategory === "cancelled") return field === "cancelled";
    if (eventWatchCategory === "postponed") return field === "postponed";
    if (eventWatchCategory === "date_location") return ["date", "time", "location", "address"].includes(field);
    if (eventWatchCategory === "registration") return ["registration", "applications"].includes(field);
    if (eventWatchCategory === "program") return ["program", "speakers"].includes(field);
    if (eventWatchCategory === "poster") return field === "poster";
    return true;
  }

  async function fetchEventWatch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EVENT_WATCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        cache: "no-store",
        targetAddressSpace: "loopback",
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function getEventWatchAdminEndpoint() {
    const config = window.DEDICALIVRES_CONFIG || {};
    let endpoint = config.eventWatchEndpoint || DEFAULT_EVENT_WATCH_ENDPOINT;
    try {
      endpoint = localStorage.getItem("automatte_event_watch_endpoint") || endpoint;
    } catch {
      // Le défaut local reste utilisable si le stockage navigateur est bloqué.
    }
    const parsed = new URL(String(endpoint));
    if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
      throw new Error("endpoint Event Watch non local refusé");
    }
    if (parsed.protocol !== "http:") {
      throw new Error("protocole Event Watch local invalide");
    }
    return parsed.toString().replace(/\/+$/, "");
  }

  function setEventWatchStatus(message, tone = "") {
    const node = document.getElementById("event-watch-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function formatEventWatchValue(value) {
    if (value === true) return "Oui";
    if (value === false) return "Non";
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function formatEventWatchConfidence(value) {
    if (value === null || value === undefined || value === "") return "—";
    const confidence = Number(value);
    if (!Number.isFinite(confidence)) return "—";
    return `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%`;
  }

  function formatDetectedAt(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? String(value || "date inconnue") : date.toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short"
    });
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
  }

  function renderResults(results) {
    const container = document.getElementById("watch-results");
    if (!container) return;

    const sourceResults = Array.isArray(results) ? results : [];
    updateWatchQueueFilters(sourceResults);
    updateWatchOperationsDashboard();

    if (!sourceResults.length) {
      container.innerHTML = `<p class="priority-empty">Aucun résultat à afficher.</p>`;
      return;
    }

    const visibleItems = sourceResults
      .map((result, index) => ({
        result,
        index,
        state: getWatchWorkflowState(result)
      }))
      .filter((item) => matchesWatchQueueFilter(item.state));

    if (!visibleItems.length) {
      container.innerHTML = `
        <p class="priority-empty">
          Aucun élément dans la catégorie « ${escapeHtml(getWatchQueueFilterLabel(watchQueueFilter))} ».
        </p>
      `;
      return;
    }

    container.innerHTML = visibleItems
      .map(({ result, index }) => renderResultCard(result, index))
      .join("");

    container.querySelectorAll("[data-watch-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const index = Number(button.dataset.watchCopy);
        const item = lastResults[index];
        if (!item?.adminText) return;
        await copyText(item.adminText);
        setStatus("Fiche copiée pour l’admin.");
      });
    });

    container.querySelectorAll("[data-watch-handled]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.watchHandled);
        const item = lastResults[index];
        if (!item) return;
        markHandled(item);
        setWatchWorkflowState(item, "handled");
        lastResults = sortWatchResultsByCompleteness(lastResults);
        renderHistory();
        renderResults(lastResults);
        setStatus("Source marquée comme traitée sur cet appareil.");
      });
    });

    container.querySelectorAll("[data-watch-submit]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.watchSubmit);
        openWatchSubmissionPreview(index);
      });
    });

    container.querySelectorAll("[data-watch-editor-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveWatchCandidateEdits(Number(form.dataset.watchEditorForm), form);
      });
    });

    container.querySelectorAll("[data-watch-edit-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        const editor = button.closest("[data-watch-candidate-editor]");
        const form = editor?.querySelector("form");
        if (form) form.reset();
        if (editor) editor.open = false;
      });
    });

    container.querySelectorAll("[data-watch-preview-back]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.watchPreviewBack);
        const card = container.querySelector(`[data-watch-result-index="${index}"]`);
        const preview = card?.querySelector("[data-watch-submission-preview]");
        const editor = card?.querySelector("[data-watch-candidate-editor]");
        if (preview) preview.hidden = true;
        if (editor) {
          editor.open = true;
          editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    });

    container.querySelectorAll("[data-watch-confirm-submit]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.watchConfirmSubmit);
        const item = lastResults[index];
        if (!item) return;
        createSubmissionFromWatch(item, button);
      });
    });
  }

  function saveWatchCandidateEdits(index, form) {
    const item = lastResults[index];
    if (!item || !form) return;
    const previousDuplicateKey = getWatchDuplicateKey(item);

    const value = (name) => cleanText(form.elements.namedItem(name)?.value || "");
    const updates = {
      title: value("title"),
      startDate: value("startDate"),
      endDate: value("endDate"),
      city: value("city"),
      type: value("type"),
      country: value("country"),
      description: value("description"),
      officialUrl: value("officialUrl"),
      imageUrl: value("imageUrl")
    };

    ["venue", "address"].forEach((property) => {
      const field = form.elements.namedItem(property);
      if (field && Object.prototype.hasOwnProperty.call(item, property)) {
        updates[property] = cleanText(field.value);
      }
    });

    Object.assign(item, updates);
    item.missingFields = recalculateWatchCandidateMissingFields(item);
    item.adminText = buildWatchCandidateAdminText(item);
    if (getWatchDuplicateKey(item) !== previousDuplicateKey) {
      item.watchDuplicateSignal = getLocalWatchDuplicateSignal(item, lastResults);
    }
    lastResults = sortWatchResultsByCompleteness(lastResults);
    renderResults(lastResults);
    setStatus(`Fiche mise à jour · état : ${getWatchWorkflowLabel(getWatchWorkflowState(item))}.`);
  }

  function buildWatchCandidateAdminText(item) {
    const lines = [
      ["Titre", cleanText(item?.title)],
      ["Type", cleanText(item?.type)],
      ["Date de début", normalizeIsoDate(item?.startDate)],
      ["Date de fin", normalizeIsoDate(item?.endDate)],
      ["Ville", cleanText(item?.city)],
      ["Lieu", cleanText(item?.venue)],
      ["Adresse", cleanText(item?.address)],
      ["Pays", cleanText(item?.country)],
      ["Description", cleanText(item?.description)],
      ["Image", cleanText(item?.imageUrl)],
      ["URL officielle", cleanText(item?.officialUrl)],
      ["Source", cleanText(item?.sourceUrl)],
      [
        "À vérifier",
        Array.isArray(item?.missingFields) && item.missingFields.length
          ? item.missingFields.join(", ")
          : "Relire avant saisie"
      ]
    ];

    return lines
      .filter(([, value]) => value)
      .map(([label, value]) => `${label} : ${value}`)
      .join("\n");
  }

  function recalculateWatchCandidateMissingFields(item) {
    const essentialFields = new Set(["titre", "date", "date de debut", "ville"]);
    const missing = (Array.isArray(item?.missingFields) ? item.missingFields : [])
      .filter((field) => !essentialFields.has(normalizeForCompare(field)));

    if (!cleanText(item?.title)) missing.push("titre");
    if (!normalizeIsoDate(item?.startDate)) missing.push("date");
    if (!cleanText(item?.city)) missing.push("ville");
    return missing;
  }

  function getWatchImageQuality(item) {
    const imageUrl = normalizeUrlValue(item?.imageUrl);
    if (!imageUrl) {
      return { state: "image-absente", label: "Sans image" };
    }

    if (
      WATCH_SUSPICIOUS_IMAGE_PATTERN.test(imageUrl) ||
      WATCH_NON_IMAGE_EXTENSION_PATTERN.test(imageUrl)
    ) {
      return { state: "image-douteuse", label: "Image douteuse" };
    }

    return { state: "image-ok", label: "Image OK" };
  }

  function getWatchCandidateQualityScore(item) {
    let points = 0;
    const hasLocationProperty = ["venue", "address"].some((property) =>
      Object.prototype.hasOwnProperty.call(item || {}, property)
    );
    const maximum = hasLocationProperty ? 100 : 97;
    const descriptionLength = cleanText(item?.description).length;
    const imageQuality = getWatchImageQuality(item);

    if (cleanText(item?.title)) points += 20;
    if (normalizeIsoDate(item?.startDate)) points += 20;
    if (cleanText(item?.city)) points += 15;
    if (cleanText(item?.type)) points += 7;
    if (cleanText(item?.country)) points += 7;
    if (descriptionLength >= 80) points += 10;
    else if (descriptionLength >= 20) points += 6;
    else if (descriptionLength > 0) points += 3;
    if (imageQuality.state === "image-ok") points += 8;
    else if (imageQuality.state === "image-douteuse") points += 2;
    if (normalizeUrlValue(item?.officialUrl || item?.sourceUrl)) points += 7;
    if (normalizeIsoDate(item?.endDate)) points += 3;
    if (hasLocationProperty && cleanText(item?.venue || item?.address)) points += 3;

    return Math.min(100, Math.round((points / maximum) * 100));
  }

  function getWatchCandidateQualityLevel(score) {
    if (score >= 80) return { state: "solide", label: "solide" };
    if (score >= 55) return { state: "a-completer", label: "à compléter" };
    return { state: "faible", label: "faible" };
  }

  function createWatchDuplicateSignal(state, key, match = null) {
    return {
      state,
      key,
      label: state === "existing"
        ? "Déjà présent"
        : state === "probable"
          ? "Doublon probable"
          : "Nouveau",
      score: Number(match?.score || 0),
      reasons: Array.isArray(match?.reasons) ? match.reasons : []
    };
  }

  function recordWatchDuplicateSignal(item, state, match = null) {
    const key = getWatchDuplicateKey(item);
    const signal = createWatchDuplicateSignal(state, key, match);
    item.watchDuplicateSignal = signal;
    if (key) duplicateSignalCache.set(key, signal);
    return signal;
  }

  function getWatchDuplicateSignal(item, results = lastResults) {
    const key = getWatchDuplicateKey(item);
    if (getWatchWorkflowState(item) === "duplicate") {
      return createWatchDuplicateSignal("existing", key);
    }

    if (item?.watchDuplicateSignal?.key === key) {
      return item.watchDuplicateSignal;
    }

    if (key && duplicateSignalCache.has(key)) {
      const signal = duplicateSignalCache.get(key);
      item.watchDuplicateSignal = signal;
      return signal;
    }

    return getLocalWatchDuplicateSignal(item, results);
  }

  function getLocalWatchDuplicateSignal(item, results) {
    const key = getWatchDuplicateKey(item);
    const title = normalizeForCompare(item?.title || "");
    const city = normalizeForCompare(item?.city || "");
    const startDate = normalizeIsoDate(item?.startDate || "");
    const website = normalizeWatchWebsite(item?.officialUrl);

    const similarItem = (Array.isArray(results) ? results : []).find((candidate) => {
      if (!candidate || candidate === item) return false;

      const candidateWebsite = normalizeWatchWebsite(candidate.officialUrl);
      const sameWebsite = website && candidateWebsite && website === candidateWebsite;
      const sameCity = city && city === normalizeForCompare(candidate.city || "");
      const candidateDate = normalizeIsoDate(candidate.startDate || "");
      const dateGap = getWatchDateGap(startDate, candidateDate);
      const similarTitle = areWatchTitlesSimilar(title, normalizeForCompare(candidate.title || ""));

      return sameWebsite || (sameCity && similarTitle && dateGap !== null && dateGap <= 3);
    });

    return similarItem
      ? createWatchDuplicateSignal("probable", key, {
        reasons: ["candidat similaire dans la file"]
      })
      : createWatchDuplicateSignal("new", key);
  }

  function normalizeWatchWebsite(value) {
    const url = normalizeUrlValue(value);
    if (!url) return "";

    try {
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;
    } catch {
      return "";
    }
  }

  function areWatchTitlesSimilar(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    return Math.min(left.length, right.length) >= 8 && (left.includes(right) || right.includes(left));
  }

  function getWatchDateGap(left, right) {
    if (!left || !right) return null;
    const leftTime = new Date(`${left}T00:00:00Z`).getTime();
    const rightTime = new Date(`${right}T00:00:00Z`).getTime();
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return null;
    return Math.round(Math.abs(leftTime - rightTime) / 86400000);
  }

  function openWatchSubmissionPreview(index) {
    const item = lastResults[index];
    if (!item || !["ready", "review"].includes(getWatchWorkflowState(item))) return;

    const card = document.querySelector(`#watch-results [data-watch-result-index="${index}"]`);
    const preview = card?.querySelector("[data-watch-submission-preview]");
    if (!preview) return;

    preview.hidden = false;
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function getWatchQueueFilterLabel(filter) {
    return {
      all: "Tous",
      active: "À traiter",
      ready: "Prêts",
      review: "À vérifier",
      duplicate: "Déjà présents",
      handled: "Traités",
      rejected: "Écartés"
    }[filter] || "Tous";
  }

  function getWatchQueueCounts(results) {
    const counts = {
      all: 0,
      active: 0,
      ready: 0,
      review: 0,
      duplicate: 0,
      handled: 0,
      rejected: 0
    };

    (Array.isArray(results) ? results : []).forEach((result) => {
      const state = getWatchWorkflowState(result);
      counts.all += 1;
      if (Object.prototype.hasOwnProperty.call(counts, state)) {
        counts[state] += 1;
      }
    });

    counts.active = counts.ready + counts.review;

    return counts;
  }

  function matchesWatchQueueFilter(state) {
    if (watchQueueFilter === "all") return true;
    if (watchQueueFilter === "active") return ["ready", "review"].includes(state);
    return state === watchQueueFilter;
  }

  function updateWatchQueueFilters(results) {
    const counts = getWatchQueueCounts(results);

    document.querySelectorAll("[data-watch-filter-count]").forEach((node) => {
      const key = String(node.dataset.watchFilterCount || "");
      node.textContent = String(counts[key] || 0);
    });

    document.querySelectorAll("[data-watch-queue-filter]").forEach((button) => {
      const filter = String(button.dataset.watchQueueFilter || "all");
      const active = filter === watchQueueFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const nextActive = document.getElementById("watch-next-active-btn");
    if (nextActive) nextActive.disabled = counts.active === 0;
  }

  function goToNextActiveResult() {
    const hasActiveResult = lastResults.some((result) =>
      ["ready", "review"].includes(getWatchWorkflowState(result))
    );
    if (!hasActiveResult) return;

    if (watchQueueFilter !== "active") {
      watchQueueFilter = "active";
      renderResults(lastResults);
    }

    window.requestAnimationFrame(() => {
      const activeCards = [...document.querySelectorAll("#watch-results [data-watch-result-index]")];
      if (!activeCards.length) return;

      const nextCard = activeCards.find((card) => card.getBoundingClientRect().top > 1) || activeCards[0];
      nextCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function sortWatchResultsByCompleteness(results) {
    return [...results].map((result, index) => ({ result, index }))
      .sort((a, b) => {
        const workflowDiff =
          getWatchWorkflowPriority(a.result) -
          getWatchWorkflowPriority(b.result);
        if (workflowDiff) return workflowDiff;

        const scoreDiff = getResultCompletenessScore(b.result) - getResultCompletenessScore(a.result);
        if (scoreDiff) return scoreDiff;

        const missingDiff = getMissingCount(a.result) - getMissingCount(b.result);
        if (missingDiff) return missingDiff;

        const dateDiff = String(a.result.startDate || "").localeCompare(String(b.result.startDate || ""));
        if (dateDiff) return dateDiff;

        return a.index - b.index;
      })
      .map((item) => item.result);
  }

  function getResultCompletenessScore(result) {
    const confidence = Number(result?.confidence || 0);
    const statusBonus = isCompleteWatchResult(result) ? 1000 : 0;
    return statusBonus + confidence;
  }

  function getMissingCount(result) {
    return Array.isArray(result?.missingFields) ? result.missingFields.length : 0;
  }

  function getEmptyPagination() {
    return {
      total: null,
      offset: 0,
      limit: WATCH_PAGE_SIZE,
      hasMore: false,
      hasKnownTotal: false
    };
  }

  function normalizeWatchPagination(payload) {
    const rawTotal = payload?.total;
    const total = rawTotal === null || rawTotal === undefined || rawTotal === ""
      ? NaN
      : Number(rawTotal);
    const offset = Number(payload?.offset);
    const limit = Number(payload?.limit);
    const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : watchOffset;
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : WATCH_PAGE_SIZE;
    const receivedCount = Array.isArray(payload?.results) ? payload.results.length : 0;
    const minimumObservedTotal = normalizedOffset + receivedCount;
    const hasKnownTotal =
      Number.isFinite(total) &&
      total >= 0 &&
      total >= minimumObservedTotal;

    return {
      total: hasKnownTotal ? Math.floor(total) : null,
      offset: normalizedOffset,
      limit: normalizedLimit,
      hasMore: payload?.hasMore === true,
      hasKnownTotal
    };
  }

  function formatPaginationStatus() {
    if (lastPagination.hasKnownTotal) {
      return ` · ${lastPagination.total} résultat${lastPagination.total > 1 ? "s" : ""} au total`;
    }

    return watchOffset ? ` · lot à partir du résultat ${watchOffset + 1}` : "";
  }

  function updatePagingControls() {
    const urls = document.getElementById("watch-urls")?.value.trim() || "";
    const nextButton = document.getElementById("watch-next-btn");
    const firstButton = document.getElementById("watch-first-btn");
    const label = document.getElementById("watch-page-label");
    const hasQuery = Boolean(urls);
    const hasKnownTotal = lastPagination.hasKnownTotal;
    const total = hasKnownTotal ? Number(lastPagination.total) : null;
    const currentStart = lastResults.length ? watchOffset + 1 : 0;
    const currentEnd = lastResults.length ? watchOffset + lastResults.length : watchOffset;
    const hasMore = hasKnownTotal
      ? currentEnd < total
      : lastPagination.hasMore === true;

    if (nextButton) nextButton.disabled = !hasQuery || !hasMore;
    if (firstButton) firstButton.disabled = !hasQuery || watchOffset === 0;

    if (label) {
      if (!hasQuery) {
        label.textContent = "Premier lot de résultats.";
      } else if (!lastResults.length) {
        label.textContent = hasKnownTotal
          ? `Aucun résultat à partir du rang ${watchOffset + 1} sur ${total}.`
          : (watchOffset ? `Aucun résultat à partir du rang ${watchOffset + 1}.` : "Aucun résultat dans le premier lot.");
      } else if (hasKnownTotal) {
        label.textContent = `Résultats ${currentStart} à ${currentEnd} sur ${total}.`;
      } else {
        label.textContent = `Résultats ${currentStart} à ${currentEnd}.`;
      }
    }
  }

  function getWatchCandidateKey(item) {
    const source = String(item?.sourceUrl || item?.officialUrl || "").trim();
    if (source) return `url:${source}`;

    return [
      "event",
      normalizeForCompare(item?.title || ""),
      normalizeIsoDate(item?.startDate || ""),
      normalizeForCompare(item?.city || "")
    ].join(":");
  }

  function readWatchWorkflow() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeWatchWorkflow(workflow) {
    localStorage.setItem(WORKFLOW_KEY, JSON.stringify(workflow || {}));
  }

  function setWatchWorkflowState(item, state) {
    const key = getWatchCandidateKey(item);
    if (!key) return;

    const workflow = readWatchWorkflow();
    workflow[key] = {
      state,
      updatedAt: new Date().toISOString()
    };
    writeWatchWorkflow(workflow);
    updateWatchOperationsDashboard();
  }

  function getStoredWatchWorkflowState(item) {
    const entry = readWatchWorkflow()[getWatchCandidateKey(item)];
    return String(entry?.state || "");
  }

  function getLocalWatchWorkflowState(result) {
    const storedEntry = readWatchWorkflow()[getWatchCandidateKey(result)];
    const stored = String(storedEntry?.state || "");

    if (["handled", "duplicate", "submitted"].includes(stored)) {
      return stored;
    }
    if (stored === "rejected") return stored;

    const history = readHistory();
    const alreadyHandled = history.some((item) =>
      String(item?.sourceUrl || "") === String(result?.sourceUrl || "")
    );
    if (alreadyHandled) return "handled";

    const status = normalizeForCompare(result?.status || "");
    if (status === "non evenement") return "rejected";
    if (isCompleteWatchResult(result)) return "ready";
    return "review";
  }

  function getLocalWatchWorkflowEntry(result) {
    const state = getLocalWatchWorkflowState(result);
    const storedEntry = readWatchWorkflow()[getWatchCandidateKey(result)];
    if (String(storedEntry?.state || "") === state) {
      return { state, updatedAt: storedEntry?.updatedAt || "" };
    }
    if (state === "handled") {
      const historyEntry = readHistory().find((item) =>
        String(item?.sourceUrl || "") === String(result?.sourceUrl || "")
      );
      return { state, updatedAt: historyEntry?.handledAt || "" };
    }
    return { state, updatedAt: "" };
  }

  function getWatchWorkflowState(result) {
    const localEntry = getLocalWatchWorkflowEntry(result);
    const serverCandidate = findServerWatchCandidate(result);
    return resolveWatchPersistenceWorkflow(
      localEntry,
      {
        state: serverCandidate?.workflow_status || "",
        updatedAt: serverCandidate?.status_updated_at || ""
      },
      ["ready", "review", "duplicate", "submitted", "handled", "rejected"],
      ["duplicate", "submitted", "handled", "rejected"]
    ).state;
  }

  function getWatchWorkflowLabel(state) {
    return {
      ready: "Prêt",
      review: "À vérifier",
      handled: "Déjà traité",
      duplicate: "Déjà présent",
      submitted: "Soumis",
      rejected: "Écarté"
    }[state] || "À vérifier";
  }

  function getWatchWorkflowPriority(result) {
    return {
      ready: 0,
      review: 1,
      duplicate: 2,
      submitted: 3,
      handled: 4,
      rejected: 5
    }[getWatchWorkflowState(result)] ?? 9;
  }

  function renderResultCard(result, index) {
    const score = Number(result.confidence || 0);
    const missing = Array.isArray(result.missingFields) ? result.missingFields : [];
    const warnings = Array.isArray(result.filterWarnings) ? result.filterWarnings : [];
    const history = readHistory();
    const alreadyHandled = history.some((item) => item.sourceUrl === result.sourceUrl);
    const workflowState = getWatchWorkflowState(result);
    const workflowLabel = getWatchWorkflowLabel(workflowState);
    const isNonEvent = workflowState === "rejected";
    const isActiveWorkflow = ["ready", "review"].includes(workflowState);
    const isClosedWorkflow = ["handled", "duplicate", "submitted", "rejected"].includes(workflowState);
    const imageQuality = getWatchImageQuality(result);
    const candidateQualityScore = getWatchCandidateQualityScore(result);
    const candidateQualityLevel = getWatchCandidateQualityLevel(candidateQualityScore);
    const duplicateSignal = getWatchDuplicateSignal(result);
    const statusClass = isNonEvent
      ? "low"
      : (score >= 82 ? "good" : score >= 58 ? "medium" : "low");
    const rawDescription = String(result.description || result.evidence || "").trim();
    const hasPlaceholderDescription = /\blorem\s+ipsum\b/i.test(rawDescription);
    const visibleDescription = hasPlaceholderDescription
      ? ""
      : rawDescription;

    return `
      <article class="watch-result ${statusClass}${isNonEvent ? " is-non-event" : ""}" data-watch-result-index="${index}">
        <div class="watch-result-main">
          <div class="watch-result-image ${result.imageUrl ? "" : "is-empty"}">
            ${result.imageUrl ? `<img src="${escapeAttr(result.imageUrl)}" alt="">` : "Image non détectée"}
          </div>

          <div class="watch-result-body">
            <div class="watch-result-topline">
              <span>${escapeHtml(workflowLabel)}</span>
              <span>${escapeHtml(result.type || "Type inconnu")}</span>
              ${isActiveWorkflow ? `<span class="watch-quality-badge is-${candidateQualityLevel.state}">Qualité ${candidateQualityScore}% · ${candidateQualityLevel.label}</span>` : ""}
              ${isActiveWorkflow ? `<span class="watch-image-badge is-${imageQuality.state}">${imageQuality.label}</span>` : ""}
              ${isActiveWorkflow ? `<span class="watch-duplicate-badge is-${duplicateSignal.state}">${duplicateSignal.label}</span>` : ""}
              ${alreadyHandled && workflowState !== "handled" ? "<span>Déjà traité</span>" : ""}
            </div>
            <h4>${escapeHtml(result.title || "Titre non détecté")}</h4>
            <p class="watch-meta">
              ${escapeHtml(buildMeta(result) || "Date ou lieu à vérifier")}
            </p>
            ${
              visibleDescription
                ? `<p>${escapeHtml(visibleDescription)}</p>`
                : (isNonEvent ? "" : "<p>Description non détectée.</p>")
            }
          </div>

          <strong class="watch-score">${score}%</strong>
        </div>

        <div class="watch-warning-row">
          ${missing.length ? `<span>À vérifier : ${escapeHtml(missing.join(", "))}</span>` : "<span>Champs essentiels détectés</span>"}
          ${warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}
        </div>

        ${
          isClosedWorkflow
            ? `
              <div class="watch-copy-block">
                <strong>${escapeHtml(
                  workflowState === "duplicate"
                    ? "Événement déjà présent"
                    : workflowState === "submitted"
                      ? "Soumission créée"
                      : workflowState === "handled"
                        ? "Élément déjà traité"
                        : "Élément écarté"
                )}</strong>
              </div>
            `
            : `
              <details class="watch-copy-block">
                <summary>${workflowState === "ready" ? "Fiche prête à copier" : "Fiche à vérifier"}</summary>
                <textarea readonly rows="13">${escapeHtml(result.adminText || "")}</textarea>
              </details>
            `
        }

        ${isActiveWorkflow ? renderWatchCandidateEditor(result, index) : ""}
        ${isActiveWorkflow ? renderWatchSubmissionPreview(result, index) : ""}

        <div class="watch-result-actions">
          ${
            isClosedWorkflow
              ? ""
              : `
                <button class="cyber-btn-primary" data-watch-submit="${index}" type="button">Envoyer en soumission</button>
                <button class="cyber-btn-primary" data-watch-copy="${index}" type="button">Copier la fiche</button>
              `
          }
          <a class="cyber-btn-secondary" href="${escapeAttr(result.sourceUrl || result.officialUrl || "#")}" target="_blank" rel="noopener noreferrer">Ouvrir la source</a>
          ${
            isClosedWorkflow
              ? ""
              : `<button class="cyber-btn-secondary" data-watch-handled="${index}" type="button">Marquer traité</button>`
          }
        </div>
      </article>
    `;
  }

  function renderWatchCandidateEditor(result, index) {
    const optionalLocationFields = [
      ["venue", "Lieu"],
      ["address", "Adresse"]
    ].filter(([property]) => Object.prototype.hasOwnProperty.call(result, property));

    return `
      <details class="watch-candidate-editor" data-watch-candidate-editor>
        <summary>Modifier la fiche</summary>
        <form data-watch-editor-form="${index}">
          <div class="watch-editor-grid">
            <label>
              <span>Titre</span>
              <input name="title" type="text" value="${escapeAttr(result.title || "")}" required>
            </label>
            <label>
              <span>Date de début</span>
              <input name="startDate" type="date" value="${escapeAttr(normalizeIsoDate(result.startDate))}" required>
            </label>
            <label>
              <span>Date de fin</span>
              <input name="endDate" type="date" value="${escapeAttr(normalizeIsoDate(result.endDate))}">
            </label>
            <label>
              <span>Ville</span>
              <input name="city" type="text" value="${escapeAttr(result.city || "")}" required>
            </label>
            ${optionalLocationFields.map(([property, label]) => `
              <label>
                <span>${label}</span>
                <input name="${property}" type="text" value="${escapeAttr(result[property] || "")}">
              </label>
            `).join("")}
            <label>
              <span>Type</span>
              <input name="type" type="text" value="${escapeAttr(result.type || "")}">
            </label>
            <label>
              <span>Pays</span>
              <input name="country" type="text" value="${escapeAttr(result.country || "")}">
            </label>
            <label class="watch-editor-wide">
              <span>Description</span>
              <textarea name="description" rows="5">${escapeHtml(result.description || "")}</textarea>
            </label>
            <label class="watch-editor-wide">
              <span>URL officielle ou source utile</span>
              <input name="officialUrl" type="url" value="${escapeAttr(result.officialUrl || result.sourceUrl || "")}">
            </label>
            <label class="watch-editor-wide">
              <span>URL de l’image</span>
              <input name="imageUrl" type="url" value="${escapeAttr(result.imageUrl || "")}">
            </label>
          </div>
          <div class="watch-editor-actions">
            <button class="cyber-btn-primary" type="submit">Enregistrer</button>
            <button class="cyber-btn-secondary" data-watch-edit-cancel type="button">Annuler</button>
          </div>
        </form>
      </details>
    `;
  }

  function renderWatchSubmissionPreview(result, index) {
    const blockingFields = getSubmissionBlockingFields(result);
    const sourceUrl = result.officialUrl || result.sourceUrl || "";
    const imageQuality = getWatchImageQuality(result);
    const candidateQualityScore = getWatchCandidateQualityScore(result);
    const candidateQualityLevel = getWatchCandidateQualityLevel(candidateQualityScore);
    const duplicateSignal = getWatchDuplicateSignal(result);

    return `
      <section class="watch-submission-preview" data-watch-submission-preview hidden aria-label="Prévisualisation avant soumission">
        <h5>Prévisualisation avant soumission</h5>
        ${result.imageUrl ? `<img src="${escapeAttr(result.imageUrl)}" alt="Aperçu de ${escapeAttr(result.title || "la fiche")}">` : ""}
        <div class="watch-preview-signals" aria-label="Indicateurs qualité">
          <span class="watch-quality-badge is-${candidateQualityLevel.state}">Qualité ${candidateQualityScore}% · ${candidateQualityLevel.label}</span>
          <span class="watch-image-badge is-${imageQuality.state}">${imageQuality.label}</span>
          <span class="watch-duplicate-badge is-${duplicateSignal.state}">${duplicateSignal.label}</span>
        </div>
        <dl class="watch-preview-grid">
          <div><dt>Titre</dt><dd>${escapeHtml(result.title || "Non renseigné")}</dd></div>
          <div><dt>Type</dt><dd>${escapeHtml(result.type || "Non renseigné")}</dd></div>
          <div><dt>Date de début</dt><dd>${escapeHtml(formatDate(result.startDate) || "Non renseignée")}</dd></div>
          <div><dt>Date de fin</dt><dd>${escapeHtml(formatDate(result.endDate) || "Non renseignée")}</dd></div>
          <div><dt>Ville</dt><dd>${escapeHtml(result.city || "Non renseignée")}</dd></div>
          <div><dt>Pays</dt><dd>${escapeHtml(result.country || "Non renseigné")}</dd></div>
          <div class="watch-editor-wide"><dt>Description</dt><dd>${escapeHtml(result.description || "Non renseignée")}</dd></div>
          <div class="watch-editor-wide"><dt>URL / source</dt><dd>${sourceUrl ? `<a href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a>` : "Non renseignée"}</dd></div>
        </dl>
        <p class="watch-preview-blocking${blockingFields.length ? " has-missing" : ""}">
          ${blockingFields.length
            ? `Champs bloquants : ${escapeHtml(blockingFields.join(", "))}`
            : "Aucun champ bloquant détecté."}
        </p>
        <p class="watch-preview-duplicate-warning" data-watch-duplicate-warning${duplicateSignal.state === "probable" ? "" : " hidden"}>
          Doublon probable : vérifie les éléments similaires avant de confirmer l’envoi.
        </p>
        <div class="watch-editor-actions">
          <button class="cyber-btn-secondary" data-watch-preview-back="${index}" type="button">Retour / Corriger</button>
          <button class="cyber-btn-primary" data-watch-confirm-submit="${index}" data-watch-duplicate-reviewed="${duplicateSignal.state === "probable"}" type="button"${blockingFields.length ? " disabled" : ""}>Confirmer l’envoi</button>
        </div>
      </section>
    `;
  }

  async function createSubmissionFromWatch(item, button) {
    const missing = getSubmissionBlockingFields(item);

    if (missing.length) {
      setStatus(`Soumission impossible : ${missing.join(", ")} à compléter dans la fiche candidate.`, "warning");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Envoi...";
    }

    try {
      const duplicate = await findExistingSubmissionCached(item);

      if (duplicate) {
        setWatchWorkflowState(item, "duplicate");
        lastResults = sortWatchResultsByCompleteness(lastResults);
        renderResults(lastResults);
        setStatus("Soumission déjà présente ou événement similaire détecté en base.", "warning");
        return;
      }

      const duplicateSignal = getWatchDuplicateSignal(item);
      if (duplicateSignal.state === "probable" && button?.dataset.watchDuplicateReviewed !== "true") {
        const warning = button?.closest("[data-watch-submission-preview]")
          ?.querySelector("[data-watch-duplicate-warning]");
        if (warning) warning.hidden = false;
        if (button) {
          button.disabled = false;
          button.dataset.watchDuplicateReviewed = "true";
          button.textContent = "Confirmer malgré le doublon probable";
        }
        setStatus("Doublon probable détecté : vérifie l’avertissement avant de confirmer.", "warning");
        return;
      }

      const payload = buildSubmissionPayload(item);
      const { error } = await client.from("events").insert([payload]);

      if (error) throw error;

      markHandled(item);
      setWatchWorkflowState(item, "submitted");

      const duplicateKey = getWatchDuplicateKey(item);
      if (duplicateKey) {
        recordWatchDuplicateSignal(item, "existing");
        duplicateCheckCache.set(duplicateKey, Promise.resolve({
          id: payload.id,
          title: payload.title,
          city: payload.city,
          start_date: payload.start_date
        }));
      }

      lastResults = sortWatchResultsByCompleteness(lastResults);
      renderHistory();
      renderResults(lastResults);
      setStatus("Soumission créée : elle apparaît maintenant dans la modération des événements.");

      if (button) {
        button.textContent = "Soumission créée";
        button.dataset.created = "true";
      }

      window.dispatchEvent(new CustomEvent("dedicalivres:watch-submission-created", {
        detail: { id: payload.id, sourceUrl: item.sourceUrl || "" }
      }));
    } catch (error) {
      console.error("Création soumission veille :", error);
      setStatus(error.message || "Création de soumission impossible.", "error");

      if (button) {
        button.disabled = false;
        button.textContent = "Envoyer en soumission";
      }
    }
  }

  function getSubmissionBlockingFields(item) {
    const missing = [];
    if (!cleanText(item.title)) missing.push("titre");
    if (!normalizeIsoDate(item.startDate)) missing.push("date");
    if (!cleanText(item.city)) missing.push("ville");
    return missing;
  }

  async function findExistingSubmission(item) {
    const title = cleanText(item.title);
    const city = cleanText(item.city);
    const startDate = normalizeIsoDate(item.startDate);

    if (!title || !city || !startDate) return null;

    if (window.DEDICALIVRES_DUPLICATES) {
      const matches = await window.DEDICALIVRES_DUPLICATES.findMatches(client, {
        title,
        city,
        country_code: normalizeCountryCode(item.country),
        type: normalizeEventType(item.type),
        start_date: startDate,
        end_date: normalizeIsoDate(item.endDate),
        website: normalizeUrlValue(item.officialUrl || item.sourceUrl)
      });
      const strongestMatch = matches[0] || null;

      if (strongestMatch?.level === "certain") {
        recordWatchDuplicateSignal(item, "existing", strongestMatch);
        return strongestMatch.event || null;
      }

      if (["probable", "possible"].includes(strongestMatch?.level)) {
        recordWatchDuplicateSignal(item, "probable", strongestMatch);
        return null;
      }

      recordWatchDuplicateSignal(item, "new", strongestMatch);
      return null;
    }

    const { data, error } = await client
      .from("events")
      .select("id,title,city,start_date,validated,rejected")
      .eq("start_date", startDate)
      .ilike("city", city)
      .limit(10);

    if (error) {
      console.warn("Vérification doublon veille impossible :", error);
      return null;
    }

    const normalizedTitle = normalizeForCompare(title);
    const duplicate = (data || []).find((row) => {
      const rowTitle = normalizeForCompare(row.title || "");
      return rowTitle === normalizedTitle || rowTitle.includes(normalizedTitle) || normalizedTitle.includes(rowTitle);
    }) || null;

    recordWatchDuplicateSignal(item, duplicate ? "existing" : "new");
    return duplicate;
  }

  function getWatchDuplicateKey(item) {
    const title = normalizeForCompare(item?.title || "");
    const startDate = normalizeIsoDate(item?.startDate || "");
    const city = normalizeForCompare(item?.city || "");
    const country = normalizeForCompare(item?.country || "");
    const website = normalizeWatchWebsite(item?.officialUrl);

    if (!title || !startDate || !city) return "";

    return [title, startDate, city, country, website].join("|");
  }

  async function findExistingSubmissionCached(item) {
    const key = getWatchDuplicateKey(item);
    if (!key) return null;

    if (duplicateCheckCache.has(key)) {
      const duplicate = await duplicateCheckCache.get(key);
      if (duplicateSignalCache.has(key)) {
        item.watchDuplicateSignal = duplicateSignalCache.get(key);
      }
      return duplicate;
    }

    const pending = Promise.resolve().then(() => findExistingSubmission(item));
    duplicateCheckCache.set(key, pending);

    try {
      return await pending;
    } catch (error) {
      duplicateCheckCache.delete(key);
      duplicateSignalCache.delete(key);
      throw error;
    }
  }

  async function precheckWatchDuplicates(results) {
    const candidates = (Array.isArray(results) ? results : []).filter((item) => {
      const state = getWatchWorkflowState(item);

      if (["handled", "duplicate", "submitted", "rejected"].includes(state)) {
        return false;
      }

      return getSubmissionBlockingFields(item).length === 0;
    });

    let duplicateCount = 0;

    for (let index = 0; index < candidates.length; index += DUPLICATE_CHECK_CONCURRENCY) {
      const batch = candidates.slice(index, index + DUPLICATE_CHECK_CONCURRENCY);

      const checked = await Promise.all(batch.map(async (item) => {
        try {
          return {
            item,
            duplicate: await findExistingSubmissionCached(item)
          };
        } catch (error) {
          console.warn("Pré-vérification doublon veille impossible :", error);
          return { item, duplicate: null };
        }
      }));

      checked.forEach(({ item, duplicate }) => {
        if (!duplicate) return;
        setWatchWorkflowState(item, "duplicate");
        duplicateCount += 1;
      });
    }

    return duplicateCount;
  }

  function buildSubmissionPayload(item) {
    const descriptionParts = [
      cleanText(item.description),
      "",
      "Fiche candidate issue de la veille Dédicalivres.",
      item.sourceUrl ? `Source à vérifier : ${item.sourceUrl}` : "",
      item.authors?.length ? `Auteur(s) détecté(s) : ${item.authors.join(", ")}` : "",
      "À compléter et relire avant validation."
    ].filter((line, index, arr) => line || (index > 0 && arr[index - 1]));

    return {
      id: createClientUuid(),
      title: cleanText(item.title),
      type: normalizeEventType(item.type),
      country_code: normalizeCountryCode(item.country),
      region: cleanText(item.territory || item.region),
      city: cleanText(item.city),
      price: "",
      start_date: normalizeIsoDate(item.startDate),
      end_date: normalizeIsoDate(item.endDate),
      website: normalizeUrlValue(item.officialUrl || item.sourceUrl),
      description: descriptionParts.join("\n").trim(),
      image_url: normalizeUrlValue(item.imageUrl),
      validated: false,
      featured: false,
      rejected: false,
      verified: false
    };
  }

  function createClientUuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.random() * 16 | 0;
      const value = char === "x" ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
  }

  function normalizeEventType(value) {
    const type = cleanText(value);
    return ["Salon", "Festival", "Dédicace", "Autre"].includes(type) ? type : "Autre";
  }

  function normalizeCountryCode(value) {
    const normalized = cleanText(value).toLowerCase();
    if (normalized.includes("belg")) return "BE";
    if (normalized.includes("luxembourg")) return "LU";
    if (normalized.includes("suisse") || normalized.includes("switzerland")) return "CH";
    if (normalized.includes("monaco")) return "MC";
    return "FR";
  }

  function normalizeIsoDate(value) {
    const match = String(value || "").match(/^(20[0-9]{2})-[0-9]{2}-[0-9]{2}$/);
    return match ? match[0] : "";
  }

  function normalizeUrlValue(value) {
    const raw = cleanText(value);
    return /^https?:\/\//i.test(raw) ? raw : "";
  }

  function normalizeForCompare(value) {
    return cleanText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  async function copyAllResults() {
    const text = lastResults.map((item, index) => [
      `--- Fiche ${index + 1} ---`,
      item.adminText || ""
    ].join("\n")).join("\n\n");

    if (!text.trim()) {
      setStatus("Aucune fiche à copier.", "warning");
      return;
    }

    await copyText(text);
    setStatus("Toutes les fiches ont été copiées.");
  }

  function clearWatch() {
    const urls = document.getElementById("watch-urls");
    const results = document.getElementById("watch-results");
    const copyAll = document.getElementById("watch-copy-all-btn");
    if (urls) urls.value = "";
    if (results) results.innerHTML = `<p class="priority-empty">Aucune analyse lancée pour le moment.</p>`;
    if (copyAll) copyAll.disabled = true;
    lastResults = [];
    lastPagination = getEmptyPagination();
    watchOffset = 0;
    watchQueueFilter = "active";
    updateWatchQueueFilters([]);
    updateWatchOperationsDashboard();
    updatePagingControls();
    setStatus("En attente d’une URL. Le résultat reste à vérifier humainement.");
  }

  function markHandled(item) {
    const history = readHistory();
    const next = {
      sourceUrl: item.sourceUrl || "",
      title: item.title || "",
      date: item.startDate || "",
      city: item.city || "",
      type: item.type || "",
      handledAt: new Date().toISOString()
    };

    const filtered = history.filter((entry) => entry.sourceUrl !== next.sourceUrl);
    writeHistory([next, ...filtered].slice(0, 80));
  }

  function rememberProductiveSources(rawUrls, results) {
    const urls = normalizeWatchUrlInput(rawUrls);
    if (!urls.length) return 0;

    const stored = readLocalProductiveSources();
    const now = new Date().toISOString();
    const country = document.getElementById("watch-country")?.value || "Tous";
    const type = document.getElementById("watch-type")?.value || "Tous";
    const storedByUrl = new Map(stored.map((item) => [item?.sourceUrl, item]));

    const nextItems = urls.map((sourceUrl) => {
      const previous = storedByUrl.get(sourceUrl) || null;
      const sourceResults = getResultsForProductiveSource(sourceUrl, urls, results);
      const metrics = sourceResults ? buildProductiveSourceMetrics(sourceResults) : null;

      if (!previous && (!metrics || metrics.completeCount <= PRODUCTIVE_COMPLETE_THRESHOLD)) {
        return null;
      }

      const previousAnalysesCount = previous?.analysesCount !== null &&
        previous?.analysesCount !== undefined &&
        Number.isFinite(Number(previous.analysesCount))
        ? Number(previous.analysesCount)
        : (previous ? 1 : 0);

      return {
        ...(previous || {}),
        sourceUrl,
        title: getUrlDisplayName(sourceUrl),
        ...(metrics || {}),
        totalCount: metrics
          ? (urls.length === 1 && lastPagination.hasKnownTotal ? lastPagination.total : metrics.observedCount)
          : previous?.totalCount,
        offset: watchOffset,
        country,
        type,
        analysesCount: previousAnalysesCount + 1,
        firstSeenAt: previous?.firstSeenAt || previous?.lastSeenAt || now,
        lastSeenAt: now
      };
    }).filter(Boolean);

    const merged = [...nextItems, ...stored]
      .filter((item, index, array) => {
        return array.findIndex((candidate) => candidate.sourceUrl === item.sourceUrl) === index;
      })
      .slice(0, 40);

    writeProductiveSources(merged);
    updateWatchOperationsDashboard();
    return nextItems.length;
  }

  function getResultsForProductiveSource(sourceUrl, urls, results) {
    const sourceResults = Array.isArray(results) ? results : [];
    if (urls.length === 1) return sourceResults;

    const matches = sourceResults.filter((item) => {
      const itemSource = normalizeWatchUrlInput(item?.sourceUrl || "")[0] || "";
      return itemSource === sourceUrl;
    });

    return matches.length ? matches : null;
  }

  function buildProductiveSourceMetrics(results) {
    const sourceResults = Array.isArray(results) ? results : [];
    const observedCount = sourceResults.length;
    const metrics = {
      observedCount,
      completeCount: 0,
      reviewCount: 0,
      rejectedCount: 0,
      certainDuplicateCount: 0,
      probableDuplicateCount: 0,
      withImageCount: 0,
      withoutImageCount: 0,
      completenessRate: null,
      imageRate: null,
      duplicateRate: null
    };

    sourceResults.forEach((item) => {
      const workflowState = getWatchWorkflowState(item);
      const imageState = getWatchImageQuality(item).state;
      const duplicateState = getWatchDuplicateSignal(item, sourceResults).state;

      if (isCompleteWatchResult(item)) metrics.completeCount += 1;
      if (workflowState === "review") metrics.reviewCount += 1;
      if (workflowState === "rejected") metrics.rejectedCount += 1;
      if (workflowState === "duplicate") metrics.certainDuplicateCount += 1;
      if (duplicateState === "probable") metrics.probableDuplicateCount += 1;
      if (imageState === "image-absente") metrics.withoutImageCount += 1;
      else metrics.withImageCount += 1;
    });

    metrics.completenessRate = calculateProductiveSourceRate(metrics.completeCount, observedCount);
    metrics.imageRate = calculateProductiveSourceRate(metrics.withImageCount, observedCount);
    metrics.duplicateRate = calculateProductiveSourceRate(
      metrics.certainDuplicateCount + metrics.probableDuplicateCount,
      observedCount
    );
    return metrics;
  }

  function calculateProductiveSourceRate(count, total) {
    if (!Number.isFinite(Number(count)) || !Number.isFinite(Number(total)) || Number(total) <= 0) {
      return null;
    }
    return Math.round((Number(count) / Number(total)) * 100);
  }

  function getProductiveSourceMetric(item, rateKey, countKey) {
    if (item?.[rateKey] !== null && item?.[rateKey] !== undefined && Number.isFinite(Number(item[rateKey]))) {
      return Number(item[rateKey]);
    }

    const total = item?.observedCount !== null && item?.observedCount !== undefined && Number.isFinite(Number(item.observedCount))
      ? Number(item.observedCount)
      : Number(item?.totalCount);
    const rawCount = item?.[countKey];
    if (rawCount === null || rawCount === undefined || rawCount === "") return null;
    const count = Number(rawCount);
    return calculateProductiveSourceRate(count, total);
  }

  function getProductiveSourceYieldScore(item) {
    const completionRate = getProductiveSourceMetric(item, "completenessRate", "completeCount");
    const imageRate = getProductiveSourceMetric(item, "imageRate", "withImageCount");
    const duplicateRate = getProductiveSourceMetric(item, "duplicateRate", "certainDuplicateCount");
    if ([completionRate, imageRate, duplicateRate].some((value) => value === null)) return null;

    const weightedScore =
      completionRate * 0.5 +
      imageRate * 0.25 +
      (100 - duplicateRate) * 0.25;
    const observedCount = item?.observedCount !== null && item?.observedCount !== undefined && Number.isFinite(Number(item.observedCount))
      ? Number(item.observedCount)
      : Number(item?.totalCount);
    const sampleFactor = Number.isFinite(observedCount) && observedCount < 5
      ? 0.75
      : Number.isFinite(observedCount) && observedCount < 10
        ? 0.9
        : 1;

    return Math.max(0, Math.min(100, Math.round(weightedScore * sampleFactor)));
  }

  function getProductiveSourceYieldLevel(score) {
    if (score === null) return { state: "unknown", label: "À qualifier" };
    if (score >= 85) return { state: "excellent", label: "Excellent" };
    if (score >= 70) return { state: "good", label: "Bon" };
    if (score >= 50) return { state: "medium", label: "Moyen" };
    return { state: "low", label: "Faible" };
  }

  function sortProductiveSources(sources) {
    return [...(Array.isArray(sources) ? sources : [])].sort((left, right) => {
      const leftScore = getProductiveSourceYieldScore(left);
      const rightScore = getProductiveSourceYieldScore(right);
      if (leftScore !== rightScore) {
        if (leftScore === null) return 1;
        if (rightScore === null) return -1;
        return rightScore - leftScore;
      }

      const dateDifference = new Date(right?.lastSeenAt || 0).getTime() - new Date(left?.lastSeenAt || 0).getTime();
      if (dateDifference) return dateDifference;
      return String(left?.title || left?.sourceUrl || "").localeCompare(
        String(right?.title || right?.sourceUrl || ""),
        "fr"
      );
    });
  }

  function rerunProductiveSource(sourceUrl) {
    const normalizedSource = normalizeWatchUrlInput(sourceUrl)[0] || "";
    const urls = document.getElementById("watch-urls");
    if (!normalizedSource || !urls) return;

    urls.value = normalizedSource;
    watchOffset = 0;
    lastPagination = getEmptyPagination();
    watchQueueFilter = "active";
    renderResults(lastResults);
    updatePagingControls();
    analyzeUrls();
  }

  function countCompleteResults(results) {
    return (Array.isArray(results) ? results : []).filter(isCompleteWatchResult).length;
  }

  function isCompleteWatchResult(result) {
    const status = normalizeForCompare(result?.status || "");
    const missing = Array.isArray(result?.missingFields) ? result.missingFields.map(normalizeForCompare) : [];
    return status === "complet" ||
      (
        Number(result?.confidence || 0) >= 82 &&
        !missing.some((field) => ["titre", "date", "ville"].includes(field))
      );
  }

  function normalizeWatchUrlInput(value) {
    return [...new Set(String(value || "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => /^https?:\/\//i.test(item) ? item : `https://${item}`)
      .map((item) => {
        try {
          return new URL(item).toString();
        } catch {
          return "";
        }
      })
      .filter(Boolean))];
  }

  function getUrlDisplayName(sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      return `${url.hostname}${url.pathname}`.replace(/\/+$/, "") || sourceUrl;
    } catch {
      return sourceUrl || "Source";
    }
  }

  function formatProductiveSourceValue(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value))
      ? String(Number(value))
      : "—";
  }

  function formatProductiveSourceRate(value) {
    return value === null ? "—" : `${value}%`;
  }

  function renderProductiveSourceCard(item) {
    const score = getProductiveSourceYieldScore(item);
    const level = getProductiveSourceYieldLevel(score);
    const completionRate = getProductiveSourceMetric(item, "completenessRate", "completeCount");
    const imageRate = getProductiveSourceMetric(item, "imageRate", "withImageCount");
    const duplicateRate = getProductiveSourceMetric(item, "duplicateRate", "certainDuplicateCount");
    const observedCount = item?.observedCount ?? item?.totalCount;
    const lastAnalysis = item?.lastSeenAt ? formatDetectedAt(item.lastSeenAt) : "—";
    const lastOffset = item?.offset !== null && item?.offset !== undefined && Number.isFinite(Number(item.offset))
      ? Number(item.offset)
      : null;

    return `
      <article class="watch-history-item watch-history-item-productive watch-source-card">
        <div class="watch-source-card-head">
          <div>
            <a href="${escapeAttr(item.sourceUrl || "#")}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(item.title || item.sourceUrl || "Source productive")}</strong>
            </a>
            <small>Dernière analyse : ${escapeHtml(lastAnalysis)}</small>
          </div>
          <span class="watch-source-yield-badge is-${level.state}">${level.label}</span>
        </div>
        <div class="watch-source-metrics">
          <span><strong>${formatProductiveSourceValue(item.completeCount)} / ${formatProductiveSourceValue(observedCount)}</strong> complètes</span>
          <span><strong>${formatProductiveSourceRate(completionRate)}</strong> complétude</span>
          <span><strong>${formatProductiveSourceRate(imageRate)}</strong> images</span>
          <span><strong>${formatProductiveSourceRate(duplicateRate)}</strong> doublons</span>
          <span>Rendement <strong>${score === null ? "—" : `${score}%`}</strong></span>
        </div>
        <p class="watch-source-details">
          À vérifier ${formatProductiveSourceValue(item.reviewCount)} ·
          Écartées ${formatProductiveSourceValue(item.rejectedCount)} ·
          Doublons certains ${formatProductiveSourceValue(item.certainDuplicateCount)} ·
          probables ${formatProductiveSourceValue(item.probableDuplicateCount)} ·
          Avec image ${formatProductiveSourceValue(item.withImageCount)} ·
          Sans image ${formatProductiveSourceValue(item.withoutImageCount)}
        </p>
        <div class="watch-source-card-footer">
          <span>Analyses ${formatProductiveSourceValue(item.analysesCount)}${lastOffset === null ? "" : ` · dernier lot depuis ${lastOffset + 1}`}</span>
          <button class="cyber-btn-secondary" data-watch-rerun-source="${escapeAttr(item.sourceUrl || "")}" type="button">Relancer</button>
        </div>
      </article>
    `;
  }

  function renderHistory() {
    const container = document.getElementById("watch-history");
    if (!container) return;

    const history = readHistory();
    const productiveSources = sortProductiveSources(readProductiveSources());

    if (!history.length && !productiveSources.length) {
      container.innerHTML = `<p class="priority-empty">Aucune source marquée comme traitée ou productive.</p>`;
      return;
    }

    const productiveHtml = productiveSources.length ? `
      <section class="watch-history-group">
        <h4>URL à fort rendement</h4>
        ${productiveSources.slice(0, 12).map(renderProductiveSourceCard).join("")}
      </section>
    ` : "";

    const historyHtml = history.length ? `
      <section class="watch-history-group">
        <h4>Sources traitées</h4>
        ${history.slice(0, 12).map((item) => `
          <a class="watch-history-item" href="${escapeAttr(item.sourceUrl || "#")}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(item.title || item.sourceUrl || "Source")}</strong>
            <span>${escapeHtml([item.date, item.city, item.type].filter(Boolean).join(" · ") || "Source traitée")}</span>
          </a>
        `).join("")}
      </section>
    ` : "";

    container.innerHTML = `${productiveHtml}${historyHtml}`;
  }

  function clearHistory() {
    writeHistory([]);
    writeProductiveSources([]);
    writeWatchWorkflow({});
    lastResults = sortWatchResultsByCompleteness(lastResults);
    renderHistory();
    renderResults(lastResults);
    updateWatchOperationsDashboard();
    setStatus("Historique local, workflow et URL à fort rendement vidés.");
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function readProductiveSources() {
    return mergeServerWatchSources(readLocalProductiveSources(), watchPersistenceSnapshot.sources);
  }

  function readLocalProductiveSources() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCTIVE_SOURCES_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizeServerWatchSourceMetric(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function mapServerWatchSource(row) {
    const sourceUrl = normalizeUrlValue(row?.source_url || row?.canonical_url);
    const source = {
      sourceUrl,
      canonicalUrl: normalizeWatchPersistenceUrl(row?.canonical_url || sourceUrl),
      urlHash: cleanText(row?.url_hash),
      title: cleanText(row?.title) || getUrlDisplayName(sourceUrl),
      observedCount: normalizeServerWatchSourceMetric(row?.observed_count),
      completeCount: normalizeServerWatchSourceMetric(row?.complete_count),
      reviewCount: normalizeServerWatchSourceMetric(row?.review_count),
      rejectedCount: normalizeServerWatchSourceMetric(row?.rejected_count),
      certainDuplicateCount: normalizeServerWatchSourceMetric(row?.duplicate_certain_count),
      probableDuplicateCount: normalizeServerWatchSourceMetric(row?.duplicate_probable_count),
      withImageCount: normalizeServerWatchSourceMetric(row?.with_image_count),
      withoutImageCount: normalizeServerWatchSourceMetric(row?.without_image_count),
      analysesCount: normalizeServerWatchSourceMetric(row?.analyses_count),
      firstSeenAt: row?.first_seen_at || "",
      lastSeenAt: row?.last_seen_at || "",
      version: normalizeServerWatchSourceMetric(row?.version),
      isActive: row?.is_active !== false,
      serverPersisted: true
    };
    source.completenessRate = calculateProductiveSourceRate(source.completeCount, source.observedCount);
    source.imageRate = calculateProductiveSourceRate(source.withImageCount, source.observedCount);
    source.duplicateRate = source.certainDuplicateCount === null || source.probableDuplicateCount === null
      ? null
      : calculateProductiveSourceRate(
        source.certainDuplicateCount + source.probableDuplicateCount,
        source.observedCount
      );
    return source;
  }

  function getWatchSourcePersistenceKeys(item) {
    const keys = [];
    const urlHash = cleanText(item?.urlHash || item?.url_hash);
    const canonicalUrl = normalizeWatchPersistenceUrl(
      item?.canonicalUrl || item?.canonical_url || item?.sourceUrl || item?.source_url
    );
    if (urlHash) keys.push(`hash:${urlHash}`);
    if (canonicalUrl) keys.push(`url:${canonicalUrl}`);
    return keys;
  }

  function mergeServerWatchSources(localSources, serverRows) {
    const remainingLocal = [...(Array.isArray(localSources) ? localSources : [])];
    const mergedServer = (Array.isArray(serverRows) ? serverRows : [])
      .filter((row) => row?.is_active !== false)
      .map(mapServerWatchSource)
      .map((serverSource) => {
        const serverKeys = new Set(getWatchSourcePersistenceKeys(serverSource));
        const localIndex = remainingLocal.findIndex((localSource) =>
          getWatchSourcePersistenceKeys(localSource).some((key) => serverKeys.has(key))
        );
        const localSource = localIndex >= 0 ? remainingLocal.splice(localIndex, 1)[0] : null;
        return { ...(localSource || {}), ...serverSource };
      });
    return [...mergedServer, ...remainingLocal];
  }

  function writeProductiveSources(sources) {
    localStorage.setItem(PRODUCTIVE_SOURCES_KEY, JSON.stringify(Array.isArray(sources) ? sources : []));
  }

  function getWatchEndpoint(config) {
    return String(config.watchWorkerEndpoint || DEFAULT_WATCH_ENDPOINT).replace(/\/+$/, "");
  }

  function buildMeta(result) {
    return [
      formatDate(result.startDate),
      result.endDate && result.endDate !== result.startDate ? `au ${formatDate(result.endDate)}` : "",
      result.city,
      result.territory,
      result.country
    ].filter(Boolean).join(" · ");
  }

  function formatDate(value) {
    const match = String(value || "").match(/^(20[0-9]{2})-([0-9]{2})-([0-9]{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value || "";
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.focus();
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  function setStatus(message, tone = "") {
    const node = document.getElementById("watch-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ensureWatchStyles() {
    if (document.getElementById("dedicalivres-watch-styles")) return;

    const style = document.createElement("style");
    style.id = "dedicalivres-watch-styles";
    style.textContent = `
      .watch-shell {
        display: grid;
        gap: 18px;
      }

      .watch-card {
        border: 1px solid rgba(25, 215, 255, .18);
        border-radius: 24px;
        padding: 22px;
        background:
          radial-gradient(circle at top right, rgba(194, 107, 255, .10), transparent 34%),
          rgba(4, 17, 28, .86);
        box-shadow: 0 18px 42px rgba(0, 0, 0, .18);
      }

      .watch-card-head,
      .watch-endpoint-box,
      .watch-result-main,
      .watch-result-actions,
      .watch-warning-row {
        display: flex;
        gap: 14px;
      }

      .watch-card-head {
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .watch-card h3,
      .watch-card h4 {
        margin: 0 0 8px;
      }

      .watch-card h3 {
        color: var(--cyber-cyan);
        font-family: "Orbitron", sans-serif;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .watch-card p {
        color: var(--cyber-muted);
      }

      .watch-pill,
      .watch-result-topline span,
      .watch-warning-row span {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        font-weight: 900;
      }

      .watch-pill {
        padding: 8px 12px;
        color: var(--cyber-green);
        background: rgba(25, 255, 156, .12);
        border: 1px solid rgba(25, 255, 156, .18);
      }

      .watch-endpoint-box {
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 18px;
        padding: 14px;
        border: 1px solid rgba(25, 215, 255, .16);
        border-radius: 18px;
        background: rgba(255, 255, 255, .04);
      }

      .watch-endpoint-box code {
        overflow-wrap: anywhere;
        color: var(--cyber-cyan);
      }

      .watch-form-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(240px, 340px);
        gap: 18px;
      }

      .watch-card label {
        display: grid;
        gap: 8px;
        color: var(--cyber-text);
        font-weight: 900;
      }

      .watch-card input,
      .watch-card textarea,
      .watch-card select {
        width: 100%;
        border: 1px solid rgba(25, 215, 255, .24);
        border-radius: 18px;
        padding: 14px 16px;
        color: #07110d;
        background: rgba(255, 255, 255, .92);
        font: inherit;
      }

      .watch-side-controls {
        display: grid;
        gap: 14px;
      }

      .watch-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }

      .watch-status {
        margin: 16px 0 0;
        color: var(--cyber-muted);
        font-weight: 800;
      }

      .watch-page-label {
        margin: 12px 0 0;
        color: var(--cyber-cyan);
        font-size: .92rem;
        font-weight: 900;
      }

      .watch-status[data-tone="error"] {
        color: var(--cyber-red);
      }

      .watch-status[data-tone="warning"] {
        color: var(--cyber-orange);
      }

      .watch-queue-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px;
        margin: 0 0 12px;
      }

      .watch-queue-label {
        color: var(--cyber-muted);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .watch-queue-filter {
        min-height: 34px;
        padding: 6px 11px;
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 999px;
        background: rgba(255,255,255,.025);
        color: rgba(230,238,246,.72);
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .watch-queue-filter:hover {
        border-color: rgba(79,215,232,.24);
        color: #eafcff;
      }

      .watch-queue-filter.is-active {
        border-color: rgba(79,215,232,.35);
        background: rgba(79,215,232,.11);
        color: #dffcff;
      }

      .watch-queue-filter span {
        display: inline-flex;
        min-width: 20px;
        min-height: 20px;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        padding: 0 5px;
        border-radius: 999px;
        background: rgba(255,255,255,.07);
        font-size: 11px;
      }

      .watch-results {
        display: grid;
        gap: 16px;
      }

      .watch-result {
        border: 1px solid rgba(25, 215, 255, .18);
        border-left: 6px solid var(--cyber-cyan);
        border-radius: 22px;
        padding: 18px;
        background: rgba(4, 14, 24, .78);
      }

      .watch-result.medium {
        border-left-color: var(--cyber-orange);
      }

      .watch-result.low {
        border-left-color: var(--cyber-red);
      }

      .watch-result-main {
        align-items: flex-start;
      }

      .watch-result-image {
        display: grid;
        place-items: center;
        flex: 0 0 180px;
        min-height: 140px;
        border-radius: 18px;
        overflow: hidden;
        color: var(--cyber-muted);
        background: rgba(255, 255, 255, .07);
        font-weight: 900;
        text-align: center;
      }

      .watch-result-image img {
        width: 100%;
        height: 100%;
        max-height: 180px;
        object-fit: contain;
      }

      .watch-result-body {
        flex: 1;
        min-width: 0;
      }

      .watch-result-body h4 {
        color: var(--cyber-text);
        font-size: 1.3rem;
      }

      .watch-meta {
        margin-bottom: 10px;
        font-weight: 900;
      }

      .watch-result-topline,
      .watch-warning-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }

      .watch-result-topline span {
        padding: 6px 10px;
        color: var(--cyber-cyan);
        background: rgba(25, 215, 255, .10);
      }

      .watch-quality-badge,
      .watch-image-badge,
      .watch-duplicate-badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: .78rem;
        font-weight: 900;
      }

      .watch-result-topline .watch-quality-badge.is-solide,
      .watch-result-topline .watch-image-badge.is-image-ok,
      .watch-preview-signals .is-solide,
      .watch-preview-signals .is-image-ok {
        color: var(--cyber-green);
        background: rgba(25, 255, 156, .12);
      }

      .watch-result-topline .watch-quality-badge.is-a-completer,
      .watch-result-topline .watch-image-badge.is-image-douteuse,
      .watch-result-topline .watch-duplicate-badge.is-probable,
      .watch-preview-signals .is-a-completer,
      .watch-preview-signals .is-image-douteuse,
      .watch-preview-signals .is-probable {
        color: var(--cyber-orange);
        background: rgba(255, 158, 68, .12);
      }

      .watch-result-topline .watch-quality-badge.is-faible,
      .watch-preview-signals .is-faible {
        color: var(--cyber-red);
        background: rgba(255, 82, 118, .12);
      }

      .watch-result-topline .watch-image-badge.is-image-absente,
      .watch-preview-signals .is-image-absente {
        color: var(--cyber-muted);
        background: rgba(255, 255, 255, .06);
      }

      .watch-result-topline .watch-duplicate-badge.is-new,
      .watch-preview-signals .is-new {
        color: var(--cyber-cyan);
        background: rgba(25, 215, 255, .10);
      }

      .watch-result-topline .watch-duplicate-badge.is-existing,
      .watch-preview-signals .is-existing {
        color: var(--cyber-red);
        background: rgba(255, 82, 118, .12);
      }

      .watch-score {
        display: grid;
        place-items: center;
        flex: 0 0 66px;
        height: 66px;
        border-radius: 50%;
        color: #06120f;
        background: var(--cyber-green);
        font-size: 1.05rem;
      }

      .watch-warning-row {
        margin: 14px 0;
      }

      .watch-warning-row span {
        padding: 7px 10px;
        color: var(--cyber-orange);
        background: rgba(255, 158, 68, .10);
      }

      .watch-copy-block {
        border: 1px solid rgba(25, 215, 255, .14);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, .04);
      }

      .watch-copy-block summary {
        cursor: pointer;
        color: var(--cyber-cyan);
        font-weight: 900;
      }

      .watch-copy-block textarea {
        margin-top: 10px;
        color: #07110d;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: .9rem;
      }

      .watch-candidate-editor,
      .watch-submission-preview {
        margin-top: 14px;
        border: 1px solid rgba(25, 215, 255, .18);
        border-radius: 16px;
        padding: 14px;
        background: rgba(255, 255, 255, .04);
      }

      .watch-candidate-editor summary {
        cursor: pointer;
        color: var(--cyber-cyan);
        font-weight: 900;
      }

      .watch-candidate-editor form {
        margin-top: 14px;
      }

      .watch-editor-grid,
      .watch-preview-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .watch-editor-wide {
        grid-column: 1 / -1;
      }

      .watch-editor-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .watch-submission-preview h5 {
        margin: 0 0 12px;
        color: var(--cyber-cyan);
        font-size: 1rem;
      }

      .watch-submission-preview > img {
        display: block;
        width: min(100%, 360px);
        max-height: 240px;
        margin-bottom: 14px;
        border-radius: 14px;
        object-fit: cover;
      }

      .watch-preview-signals {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }

      .watch-preview-grid {
        margin: 0;
      }

      .watch-preview-grid > div {
        min-width: 0;
        padding: 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, .04);
      }

      .watch-preview-grid dt {
        color: var(--cyber-muted);
        font-size: .8rem;
        font-weight: 900;
      }

      .watch-preview-grid dd {
        margin: 4px 0 0;
        color: var(--cyber-text);
        overflow-wrap: anywhere;
      }

      .watch-preview-grid a {
        color: var(--cyber-cyan);
      }

      .watch-preview-blocking {
        margin-top: 12px;
        color: var(--cyber-green);
        font-weight: 900;
      }

      .watch-preview-blocking.has-missing {
        color: var(--cyber-orange);
      }

      .watch-preview-duplicate-warning {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 158, 68, .25);
        border-radius: 12px;
        color: var(--cyber-orange);
        background: rgba(255, 158, 68, .10);
        font-weight: 900;
      }

      .watch-result-actions {
        flex-wrap: wrap;
        margin-top: 14px;
      }

      .watch-operations-dashboard {
        display: grid;
        gap: 16px;
      }

      .watch-operations-nav {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .watch-operations-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .watch-operation-card {
        display: grid;
        gap: 5px;
        min-width: 0;
        padding: 14px;
        border: 1px solid rgba(25, 215, 255, .16);
        border-radius: 16px;
        background: rgba(255, 255, 255, .04);
      }

      .watch-operation-card > span,
      .watch-operation-card small {
        color: var(--cyber-muted);
      }

      .watch-operation-card > strong {
        color: var(--cyber-cyan);
        font-size: clamp(1.15rem, 2vw, 1.8rem);
        overflow-wrap: anywhere;
      }

      #watch-operations-source-quality {
        font-size: 1rem;
      }

      #watch-operations-event-status[data-state="available"] {
        color: var(--cyber-green);
      }

      #watch-operations-event-status[data-state="unavailable"] {
        color: var(--cyber-orange);
      }

      .watch-operations-footer {
        display: grid;
        grid-template-columns: minmax(180px, .7fr) minmax(0, 1.3fr);
        align-items: start;
        gap: 14px;
      }

      .watch-operations-footer > p {
        margin: 0;
        color: var(--cyber-muted);
      }

      .watch-operations-footer > p strong,
      .watch-operations-top-sources > strong {
        color: var(--cyber-text);
      }

      .watch-operations-top-sources,
      #watch-operations-top-sources {
        display: grid;
        gap: 7px;
      }

      .watch-operations-source {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 8px;
        padding: 7px 9px;
        border-radius: 12px;
        background: rgba(255, 255, 255, .04);
      }

      .watch-operations-source > span:first-child {
        overflow-wrap: anywhere;
      }

      .watch-operations-source small,
      #watch-operations-top-sources > span {
        color: var(--cyber-muted);
      }

      .watch-operations-source .watch-source-yield-badge.is-excellent,
      .watch-operations-source .watch-source-yield-badge.is-good {
        color: var(--cyber-green);
        background: rgba(25, 255, 156, .12);
      }

      .watch-operations-source .watch-source-yield-badge.is-medium {
        color: var(--cyber-orange);
        background: rgba(255, 158, 68, .12);
      }

      .watch-operations-source .watch-source-yield-badge.is-low {
        color: var(--cyber-red);
        background: rgba(255, 82, 118, .12);
      }

      .watch-operations-source .watch-source-yield-badge.is-unknown {
        color: var(--cyber-muted);
        background: rgba(255, 255, 255, .06);
      }

      .event-watch-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
        margin-bottom: 16px;
      }

      .event-watch-categories {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .event-watch-category,
      .event-watch-review-filter {
        border: 1px solid rgba(25, 215, 255, .22);
        border-radius: 999px;
        padding: 8px 12px;
        color: var(--cyber-text);
        background: rgba(255, 255, 255, .04);
        cursor: pointer;
        font: inherit;
        font-weight: 900;
      }

      .event-watch-category.is-active,
      .event-watch-review-filter.is-active {
        color: #06120f;
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan);
      }

      .event-watch-review-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .event-watch-review-toolbar > p {
        margin: 0;
        color: var(--cyber-cyan);
        font-weight: 900;
      }

      .event-watch-review-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .event-watch-review-filter span {
        display: inline-flex;
        min-width: 20px;
        min-height: 20px;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        padding: 0 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .10);
        font-size: .72rem;
      }

      .event-watch-alerts {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .event-watch-alert {
        padding: 16px;
        border: 1px solid rgba(25, 215, 255, .16);
        border-left: 5px solid var(--cyber-orange);
        border-radius: 18px;
        background: rgba(4, 14, 24, .76);
      }

      .event-watch-alert-confirmed {
        border-left-color: var(--cyber-green);
      }

      .event-watch-alert-ignored {
        border-left-color: var(--cyber-muted);
        opacity: .82;
      }

      .event-watch-alert-handled {
        border-left-color: var(--cyber-cyan);
        opacity: .82;
      }

      .event-watch-alert-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .event-watch-priority,
      .event-watch-workflow-state {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: .78rem;
        font-weight: 900;
      }

      .event-watch-priority.is-critical {
        color: var(--cyber-red);
        background: rgba(255, 82, 118, .12);
      }

      .event-watch-priority.is-important {
        color: var(--cyber-orange);
        background: rgba(255, 158, 68, .12);
      }

      .event-watch-priority.is-normal,
      .event-watch-workflow-state {
        color: var(--cyber-cyan);
        background: rgba(25, 215, 255, .10);
      }

      .event-watch-alert-head,
      .event-watch-values {
        display: grid;
        gap: 12px;
      }

      .event-watch-alert-head {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
      }

      .event-watch-alert-head h4 {
        margin-top: 10px;
        color: var(--cyber-text);
      }

      .event-watch-confidence {
        padding: 8px 10px;
        border-radius: 12px;
        color: #06120f;
        background: var(--cyber-green);
      }

      .event-watch-values {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin: 12px 0;
      }

      .event-watch-values > div {
        display: grid;
        gap: 5px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, .05);
        overflow-wrap: anywhere;
      }

      .event-watch-values small {
        color: var(--cyber-muted);
        font-weight: 900;
      }

      .event-watch-source {
        overflow-wrap: anywhere;
        font-size: .92rem;
      }

      .event-watch-proof {
        overflow-wrap: anywhere;
        font-size: .92rem;
      }

      .event-watch-source a {
        color: var(--cyber-cyan);
      }

      .event-watch-reviewed,
      .event-watch-unmatched {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        color: var(--cyber-muted);
        background: rgba(255, 255, 255, .06);
        font-weight: 900;
      }

      .event-watch-unavailable {
        display: grid;
        gap: 6px;
        padding: 16px;
        border: 1px solid rgba(255, 158, 68, .24);
        border-radius: 16px;
        color: var(--cyber-muted);
        background: rgba(255, 158, 68, .08);
      }

      .event-watch-unavailable strong {
        color: var(--cyber-orange);
      }

      .watch-history {
        display: grid;
        gap: 16px;
      }

      .watch-history-group {
        display: grid;
        gap: 10px;
      }

      .watch-history-group h4 {
        margin: 0;
        color: var(--cyber-cyan);
        font-size: 1rem;
        letter-spacing: .05em;
        text-transform: uppercase;
      }

      .watch-history-item {
        display: grid;
        gap: 4px;
        padding: 12px 14px;
        border: 1px solid rgba(25, 215, 255, .12);
        border-radius: 16px;
        color: var(--cyber-text);
        background: rgba(255, 255, 255, .04);
        text-decoration: none;
      }

      .watch-history-item-productive {
        border-color: rgba(25, 255, 156, .24);
        background:
          linear-gradient(90deg, rgba(25, 255, 156, .10), rgba(25, 215, 255, .04)),
          rgba(255, 255, 255, .04);
      }

      .watch-history-item span {
        color: var(--cyber-muted);
      }

      .watch-source-card {
        gap: 12px;
      }

      .watch-source-card-head,
      .watch-source-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .watch-source-card-head > div {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .watch-source-card-head a {
        color: var(--cyber-text);
        overflow-wrap: anywhere;
        text-decoration: none;
      }

      .watch-source-card-head small {
        color: var(--cyber-muted);
      }

      .watch-source-yield-badge {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: .78rem;
        font-weight: 900;
      }

      .watch-history-item .watch-source-yield-badge.is-excellent,
      .watch-history-item .watch-source-yield-badge.is-good {
        color: var(--cyber-green);
        background: rgba(25, 255, 156, .12);
      }

      .watch-history-item .watch-source-yield-badge.is-medium {
        color: var(--cyber-orange);
        background: rgba(255, 158, 68, .12);
      }

      .watch-history-item .watch-source-yield-badge.is-low {
        color: var(--cyber-red);
        background: rgba(255, 82, 118, .12);
      }

      .watch-history-item .watch-source-yield-badge.is-unknown {
        color: var(--cyber-muted);
        background: rgba(255, 255, 255, .06);
      }

      .watch-source-metrics {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
      }

      .watch-source-metrics span {
        display: grid;
        gap: 2px;
        padding: 8px;
        border-radius: 12px;
        background: rgba(255, 255, 255, .04);
        font-size: .78rem;
      }

      .watch-source-metrics strong {
        color: var(--cyber-text);
        font-size: .9rem;
      }

      .watch-source-details {
        margin: 0;
        font-size: .78rem;
      }

      .watch-source-card-footer > span {
        font-size: .82rem;
      }

      @media (max-width: 900px) {
        .watch-operations-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .watch-operations-footer {
          grid-template-columns: 1fr;
        }

        .watch-form-grid,
        .watch-result-main,
        .event-watch-values,
        .watch-editor-grid,
        .watch-preview-grid {
          grid-template-columns: 1fr;
          display: grid;
        }

        .watch-editor-wide {
          grid-column: auto;
        }

        .event-watch-toolbar {
          align-items: stretch;
          flex-direction: column;
        }

        .event-watch-review-toolbar {
          align-items: stretch;
          flex-direction: column;
        }

        .watch-source-card-head,
        .watch-source-card-footer {
          align-items: stretch;
          flex-direction: column;
        }

        .watch-source-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .watch-result-image,
        .watch-score {
          width: 100%;
          flex-basis: auto;
        }

        .watch-score {
          border-radius: 16px;
        }
      }

      @media (max-width: 560px) {
        .watch-operations-grid,
        .watch-operations-source {
          grid-template-columns: 1fr;
        }

        .watch-operations-nav {
          justify-content: flex-start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
