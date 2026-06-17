/* =========================================================
   DÉDICALIVRES — Veille admin
   Assistant de recherche d'événements via Worker sécurisé.
========================================================= */
(function () {
  "use strict";

  const VERSION = "2026-06-17-watch-1";
  const DEFAULT_WATCH_ENDPOINT = "https://dedicalivres-veille.dedicalivres.workers.dev/analyze";
  const HISTORY_KEY = "dedicalivres_admin_watch_history_v1";

  let initialized = false;
  let client = null;
  let lastResults = [];

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
        <article class="watch-card watch-hero-card">
          <div class="watch-card-head">
            <div>
              <h3>Veille événements</h3>
              <p>
                Analyse une URL ou une liste d’URL, puis prépare une fiche candidate à relire
                et copier dans l’admin. Aucun import automatique.
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
            <button id="watch-clear-btn" class="cyber-btn-secondary" type="button">Effacer</button>
            <button id="watch-copy-all-btn" class="cyber-btn-secondary" type="button" disabled>Copier toutes les fiches</button>
          </div>

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
              <h3>Sources traitées sur cet appareil</h3>
              <p>Historique local simple, utile pour éviter les doublons lors de la veille.</p>
            </div>
            <button id="watch-clear-history-btn" class="cyber-btn-danger" type="button">Vider</button>
          </div>
          <div id="watch-history" class="watch-history"></div>
        </article>
      </section>
    `;
  }

  function bindControls() {
    document.getElementById("watch-analyze-btn")?.addEventListener("click", analyzeUrls);
    document.getElementById("watch-clear-btn")?.addEventListener("click", clearWatch);
    document.getElementById("watch-copy-all-btn")?.addEventListener("click", copyAllResults);
    document.getElementById("watch-health-btn")?.addEventListener("click", testWorkerHealth);
    document.getElementById("watch-clear-history-btn")?.addEventListener("click", clearHistory);
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
          mode: document.getElementById("watch-mode")?.value || "prepare"
        }
      });

      lastResults = Array.isArray(payload.results) ? payload.results : [];
      renderResults(lastResults);
      setStatus(`${lastResults.length} fiche(s) candidate(s) préparée(s).`);
      if (copyAll) copyAll.disabled = !lastResults.length;
    } catch (error) {
      console.error("Veille admin :", error);
      lastResults = [];
      renderResults([]);
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
  }

  function renderResultCard(result, index) {
    const score = Number(result.confidence || 0);
    const missing = Array.isArray(result.missingFields) ? result.missingFields : [];
    const warnings = Array.isArray(result.filterWarnings) ? result.filterWarnings : [];
    const history = readHistory();
    const alreadyHandled = history.some((item) => item.sourceUrl === result.sourceUrl);
    const statusClass = score >= 82 ? "good" : score >= 58 ? "medium" : "low";

    return `
      <article class="watch-result ${statusClass}">
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
            <p>${escapeHtml(result.description || result.evidence || "Description non détectée.")}</p>
          </div>

          <strong class="watch-score">${score}%</strong>
        </div>

        <div class="watch-warning-row">
          ${missing.length ? `<span>À vérifier : ${escapeHtml(missing.join(", "))}</span>` : "<span>Champs essentiels détectés</span>"}
          ${warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}
        </div>

        <details class="watch-copy-block">
          <summary>Fiche prête à copier</summary>
          <textarea readonly rows="13">${escapeHtml(result.adminText || "")}</textarea>
        </details>

        <div class="watch-result-actions">
          <button class="cyber-btn-primary" data-watch-copy="${index}" type="button">Copier la fiche</button>
          <a class="cyber-btn-secondary" href="${escapeAttr(result.sourceUrl || result.officialUrl || "#")}" target="_blank" rel="noopener noreferrer">Ouvrir la source</a>
          <button class="cyber-btn-secondary" data-watch-handled="${index}" type="button">Marquer traité</button>
        </div>
      </article>
    `;
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

  function renderHistory() {
    const container = document.getElementById("watch-history");
    if (!container) return;

    const history = readHistory();
    if (!history.length) {
      container.innerHTML = `<p class="priority-empty">Aucune source marquée comme traitée sur cet appareil.</p>`;
      return;
    }

    container.innerHTML = history.slice(0, 12).map((item) => `
      <a class="watch-history-item" href="${escapeAttr(item.sourceUrl || "#")}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(item.title || item.sourceUrl || "Source")}</strong>
        <span>${escapeHtml([item.date, item.city, item.type].filter(Boolean).join(" · ") || "Source traitée")}</span>
      </a>
    `).join("");
  }

  function clearHistory() {
    writeHistory([]);
    renderHistory();
    setStatus("Historique local vidé.");
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

      .watch-history {
        display: grid;
        gap: 10px;
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

      .watch-history-item span {
        color: var(--cyber-muted);
      }

      @media (max-width: 900px) {
        .watch-form-grid,
        .watch-result-main {
          grid-template-columns: 1fr;
          display: grid;
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
