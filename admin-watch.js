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
  const PRODUCTIVE_COMPLETE_THRESHOLD = 10;
  const WATCH_PAGE_SIZE = 15;

  let initialized = false;
  let client = null;
  let lastResults = [];
  let lastPagination = getEmptyPagination();
  let watchOffset = 0;
  let eventWatchAlerts = [];
  let eventWatchCategory = "all";

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
        <article class="watch-card event-watch-admin-card">
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

            <label class="event-watch-state-field">
              <span>État de revue</span>
              <select id="event-watch-review-state">
                <option value="pending">À vérifier</option>
                <option value="verified">Vérifiées</option>
                <option value="ignored">Ignorées</option>
                <option value="all">Toutes</option>
              </select>
            </label>
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

        <article class="watch-card">
          <div class="watch-card-head">
            <div>
              <h3>Résultats de veille</h3>
              <p>Les champs manquants ou incertains sont affichés clairement avant copie.</p>
            </div>
          </div>

          <div id="watch-results" class="watch-results">
            <p class="priority-empty">Aucune analyse lancée pour le moment.</p>
          </div>
        </article>

        <article class="watch-card watch-history-card">
          <div class="watch-card-head">
            <div>
              <h3>Sources mémorisées sur cet appareil</h3>
              <p>Les URL qui donnent plus de 10 fiches complètes sont conservées ici avec l’historique de traitement.</p>
            </div>
            <button id="watch-clear-history-btn" class="cyber-btn-danger" type="button">Vider</button>
          </div>
          <div id="watch-history" class="watch-history"></div>
        </article>
      </section>
    `;
  }

  function bindControls() {
    document.getElementById("event-watch-refresh")?.addEventListener("click", loadEventWatchAlerts);
    document.getElementById("event-watch-review-state")?.addEventListener("change", loadEventWatchAlerts);
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
    ["watch-urls", "watch-country", "watch-type", "watch-mode"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        watchOffset = 0;
        lastPagination = getEmptyPagination();
        updatePagingControls();
      });
    });
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

      lastResults = sortWatchResultsByCompleteness(Array.isArray(payload.results) ? payload.results : []);
      lastPagination = normalizeWatchPagination(payload);
      renderResults(lastResults);
      const productiveSaved = rememberProductiveSources(urls, lastResults);
      renderHistory();
      updatePagingControls();
      setStatus([
        `${lastResults.length} fiche(s) candidate(s) préparée(s), classée(s) par complétude${formatPaginationStatus()}.`,
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
    const reviewState = document.getElementById("event-watch-review-state")?.value || "pending";
    if (!container) return;

    setEventWatchStatus("Connexion à Auto-Matte local…");

    try {
      const endpoint = getEventWatchAdminEndpoint();
      const url = new URL(endpoint);
      url.searchParams.set("review_state", reviewState);
      const response = await fetchEventWatch(url.toString());
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      eventWatchAlerts = Array.isArray(payload.changes) ? payload.changes : [];
      renderEventWatchAlerts();
      const counts = payload.review_counts || {};
      setEventWatchStatus(
        `${eventWatchAlerts.length} alerte(s) chargée(s) · ` +
        `${Number(counts.pending || 0)} à vérifier · ` +
        `${Number(counts.verified || 0)} vérifiée(s) · ` +
        `${Number(counts.ignored || 0)} ignorée(s).`
      );
    } catch (error) {
      eventWatchAlerts = [];
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

    const alerts = eventWatchAlerts.filter(matchesEventWatchCategory);
    if (!alerts.length) {
      container.innerHTML = `<p class="priority-empty">Aucune alerte dans cette catégorie.</p>`;
      return;
    }

    container.innerHTML = alerts.map((alert) => {
      const remoteId = cleanText(alert.dedicalivres_event_id);
      const eventHref = isUuid(remoteId) ? `event.html?id=${encodeURIComponent(remoteId)}` : "";
      const reviewState = alert.review_state || "pending";
      const pendingActions = reviewState === "pending" ? `
        <button class="cyber-btn-primary" data-event-watch-review="verified" data-event-watch-id="${escapeAttr(alert.id || "")}" type="button">Marquer comme vérifié</button>
        <button class="cyber-btn-secondary" data-event-watch-review="ignored" data-event-watch-id="${escapeAttr(alert.id || "")}" type="button">Ignorer</button>
      ` : `<span class="event-watch-reviewed">${reviewState === "verified" ? "Vérifiée" : "Ignorée"}${alert.reviewed_at ? ` · ${escapeHtml(formatDetectedAt(alert.reviewed_at))}` : ""}</span>`;

      return `
        <article class="event-watch-alert event-watch-alert-${escapeAttr(reviewState)}">
          <div class="event-watch-alert-head">
            <div>
              <span class="watch-pill">${escapeHtml(alert.field_label || "Changement")}</span>
              <h4>${escapeHtml(alert.event_title || "Événement")}</h4>
              <p class="watch-meta">${escapeHtml([
                alert.event_date ? formatDate(alert.event_date) : "",
                alert.event_city,
                `Détecté le ${formatDetectedAt(alert.detected_at)}`
              ].filter(Boolean).join(" · "))}</p>
            </div>
            <strong class="event-watch-confidence">${Math.round(Number(alert.confidence || 0) * 100)}%</strong>
          </div>

          <div class="event-watch-values">
            <div><small>ANCIENNE VALEUR</small><span>${escapeHtml(formatEventWatchValue(alert.old_value))}</span></div>
            <div><small>NOUVELLE VALEUR</small><span>${escapeHtml(formatEventWatchValue(alert.new_value))}</span></div>
          </div>

          <p class="event-watch-source">
            Source : <a href="${escapeAttr(alert.source || alert.proof?.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(alert.source || alert.proof?.url || "Non renseignée")}</a>
            ${alert.status_label ? ` · ${escapeHtml(alert.status_label)}` : ""}
          </p>

          <div class="watch-result-actions">
            ${eventHref
              ? `<a class="cyber-btn-secondary" href="${escapeAttr(eventHref)}" target="_blank" rel="noopener noreferrer">Voir la fiche</a>`
              : `<span class="event-watch-unmatched">Fiche Dédicalivres non associée</span>`}
            ${pendingActions}
          </div>
        </article>
      `;
    }).join("");

    container.querySelectorAll("[data-event-watch-review]").forEach((button) => {
      button.addEventListener("click", () => reviewEventWatchAlert(
        button.dataset.eventWatchId,
        button.dataset.eventWatchReview,
        button
      ));
    });
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

  async function reviewEventWatchAlert(id, action, button) {
    const label = action === "verified" ? "marquer cette alerte comme vérifiée" : "ignorer cette alerte";
    if (!id || !window.confirm(`Confirmer : ${label} ?`)) return;
    if (button) button.disabled = true;

    try {
      const endpoint = getEventWatchAdminEndpoint().replace(/\/api\/event-watch\/?$/, "/api/event-watch/review");
      const response = await fetchEventWatch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, confirm: "EVENT_WATCH_REVIEW" })
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setEventWatchStatus(action === "verified" ? "Alerte marquée comme vérifiée." : "Alerte ignorée.");
      await loadEventWatchAlerts();
    } catch (error) {
      setEventWatchStatus(`Action impossible · ${error.message || "Event Watch indisponible"}`, "warning");
      if (button) button.disabled = false;
    }
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
    if (value === null || value === undefined || value === "") return "Non renseignée";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
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

    if (!results.length) {
      container.innerHTML = `<p class="priority-empty">Aucun résultat à afficher.</p>`;
      return;
    }

    container.innerHTML = results.map((result, index) => renderResultCard(result, index)).join("");

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
        renderHistory();
        setStatus("Source marquée comme traitée sur cet appareil.");
      });
    });

    container.querySelectorAll("[data-watch-submit]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.watchSubmit);
        const item = lastResults[index];
        if (!item) return;
        createSubmissionFromWatch(item, button);
      });
    });
  }

  function sortWatchResultsByCompleteness(results) {
    return [...results].map((result, index) => ({ result, index }))
      .sort((a, b) => {
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

  function renderResultCard(result, index) {
    const score = Number(result.confidence || 0);
    const missing = Array.isArray(result.missingFields) ? result.missingFields : [];
    const warnings = Array.isArray(result.filterWarnings) ? result.filterWarnings : [];
    const history = readHistory();
    const alreadyHandled = history.some((item) => item.sourceUrl === result.sourceUrl);
    const isNonEvent = String(result.status || "").trim().toLowerCase() === "non événement";
    const statusClass = isNonEvent
      ? "low"
      : (score >= 82 ? "good" : score >= 58 ? "medium" : "low");
    const rawDescription = String(result.description || result.evidence || "").trim();
    const hasPlaceholderDescription = /\blorem\s+ipsum\b/i.test(rawDescription);
    const visibleDescription = hasPlaceholderDescription
      ? ""
      : rawDescription;

    return `
      <article class="watch-result ${statusClass}${isNonEvent ? " is-non-event" : ""}">
        <div class="watch-result-main">
          <div class="watch-result-image ${result.imageUrl ? "" : "is-empty"}">
            ${result.imageUrl ? `<img src="${escapeAttr(result.imageUrl)}" alt="">` : "Image non détectée"}
          </div>

          <div class="watch-result-body">
            <div class="watch-result-topline">
              <span>${escapeHtml(result.status || "À vérifier")}</span>
              <span>${escapeHtml(result.type || "Type inconnu")}</span>
              ${alreadyHandled ? "<span>Déjà traité</span>" : ""}
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
          isNonEvent
            ? `
              <div class="watch-copy-block">
                <strong>Élément écarté</strong>
              </div>
            `
            : `
              <details class="watch-copy-block">
                <summary>Fiche prête à copier</summary>
                <textarea readonly rows="13">${escapeHtml(result.adminText || "")}</textarea>
              </details>
            `
        }

        <div class="watch-result-actions">
          ${
            isNonEvent
              ? ""
              : `
                <button class="cyber-btn-primary" data-watch-submit="${index}" type="button">Envoyer en soumission</button>
                <button class="cyber-btn-primary" data-watch-copy="${index}" type="button">Copier la fiche</button>
              `
          }
          <a class="cyber-btn-secondary" href="${escapeAttr(result.sourceUrl || result.officialUrl || "#")}" target="_blank" rel="noopener noreferrer">Ouvrir la source</a>
          <button class="cyber-btn-secondary" data-watch-handled="${index}" type="button">Marquer traité</button>
        </div>
      </article>
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
      const duplicate = await findExistingSubmission(item);

      if (duplicate) {
        setStatus("Soumission déjà présente ou événement similaire détecté en base.", "warning");
        if (button) button.textContent = "Déjà présent";
        return;
      }

      const payload = buildSubmissionPayload(item);
      const { error } = await client.from("events").insert([payload]);

      if (error) throw error;

      markHandled(item);
      renderHistory();
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

      return matches[0]?.event || null;
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
    return (data || []).find((row) => {
      const rowTitle = normalizeForCompare(row.title || "");
      return rowTitle === normalizedTitle || rowTitle.includes(normalizedTitle) || normalizedTitle.includes(rowTitle);
    }) || null;
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
    const completeCount = countCompleteResults(results);
    if (completeCount <= PRODUCTIVE_COMPLETE_THRESHOLD) return 0;

    const urls = normalizeWatchUrlInput(rawUrls);
    if (!urls.length) return 0;

    const stored = readProductiveSources();
    const now = new Date().toISOString();
    const country = document.getElementById("watch-country")?.value || "Tous";
    const type = document.getElementById("watch-type")?.value || "Tous";

    const nextItems = urls.map((sourceUrl) => ({
      sourceUrl,
      title: getUrlDisplayName(sourceUrl),
      completeCount,
      totalCount: lastPagination.hasKnownTotal ? lastPagination.total : (Array.isArray(results) ? results.length : 0),
      offset: watchOffset,
      country,
      type,
      lastSeenAt: now
    }));

    const merged = [...nextItems, ...stored]
      .filter((item, index, array) => {
        return array.findIndex((candidate) => candidate.sourceUrl === item.sourceUrl) === index;
      })
      .slice(0, 40);

    writeProductiveSources(merged);
    return nextItems.length;
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

  function renderHistory() {
    const container = document.getElementById("watch-history");
    if (!container) return;

    const history = readHistory();
    const productiveSources = readProductiveSources();

    if (!history.length && !productiveSources.length) {
      container.innerHTML = `<p class="priority-empty">Aucune source marquée comme traitée ou productive sur cet appareil.</p>`;
      return;
    }

    const productiveHtml = productiveSources.length ? `
      <section class="watch-history-group">
        <h4>URL à fort rendement</h4>
        ${productiveSources.slice(0, 12).map((item) => `
          <a class="watch-history-item watch-history-item-productive" href="${escapeAttr(item.sourceUrl || "#")}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(item.title || item.sourceUrl || "Source productive")}</strong>
            <span>${escapeHtml(`${item.completeCount || 0} fiches complètes sur ${item.totalCount || 0}${item.offset ? ` · lot depuis ${Number(item.offset) + 1}` : ""} · ${[item.country, item.type].filter(Boolean).join(" · ")}`)}</span>
          </a>
        `).join("")}
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
    renderHistory();
    setStatus("Historique local et URL à fort rendement vidés.");
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
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCTIVE_SOURCES_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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

      .watch-result-actions {
        flex-wrap: wrap;
        margin-top: 14px;
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

      .event-watch-category {
        border: 1px solid rgba(25, 215, 255, .22);
        border-radius: 999px;
        padding: 8px 12px;
        color: var(--cyber-text);
        background: rgba(255, 255, 255, .04);
        cursor: pointer;
        font: inherit;
        font-weight: 900;
      }

      .event-watch-category.is-active {
        color: #06120f;
        border-color: var(--cyber-cyan);
        background: var(--cyber-cyan);
      }

      .event-watch-state-field {
        min-width: 180px;
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

      .event-watch-alert-verified {
        border-left-color: var(--cyber-green);
      }

      .event-watch-alert-ignored {
        border-left-color: var(--cyber-muted);
        opacity: .82;
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

      @media (max-width: 900px) {
        .watch-form-grid,
        .watch-result-main,
        .event-watch-values {
          grid-template-columns: 1fr;
          display: grid;
        }

        .event-watch-toolbar {
          align-items: stretch;
          flex-direction: column;
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
