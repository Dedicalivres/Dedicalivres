/* =========================================================
   DÉDICALIVRES — Veille admin
   Assistant de recherche d'événements via Worker sécurisé.
========================================================= */
(function () {
  "use strict";

  const VERSION = "2026-06-18-watch-submissions-5";
  const DEFAULT_WATCH_ENDPOINT = "https://dedicalivres-veille.dedicalivres.workers.dev/analyze";
  const HISTORY_KEY = "dedicalivres_admin_watch_history_v1";
  const PRODUCTIVE_SOURCES_KEY = "dedicalivres_admin_watch_productive_sources_v1";
  const PRODUCTIVE_COMPLETE_THRESHOLD = 10;
  const WATCH_PAGE_SIZE = 15;

  let initialized = false;
  let client = null;
  let lastResults = [];
  let watchOffset = 0;

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
                Analyse une URL ou une liste d’URL, puis prépare une fiche candidate à relire.
                Tu peux l’envoyer dans les soumissions publiques pour la compléter, la valider ou la refuser.
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
      renderResults(lastResults);
      const productiveSaved = rememberProductiveSources(urls, lastResults);
      renderHistory();
      updatePagingControls();
      setStatus([
        `${lastResults.length} fiche(s) candidate(s) préparée(s), classée(s) par complétude${watchOffset ? ` · lot à partir du résultat ${watchOffset + 1}` : ""}.`,
        productiveSaved ? "Source à fort rendement mémorisée." : ""
      ].filter(Boolean).join(" "));
      if (copyAll) copyAll.disabled = !lastResults.length;
    } catch (error) {
      console.error("Veille admin :", error);
      lastResults = [];
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

  function updatePagingControls() {
    const urls = document.getElementById("watch-urls")?.value.trim() || "";
    const nextButton = document.getElementById("watch-next-btn");
    const firstButton = document.getElementById("watch-first-btn");
    const label = document.getElementById("watch-page-label");
    const hasQuery = Boolean(urls);
    const hasFullPage = lastResults.length >= WATCH_PAGE_SIZE;

    if (nextButton) nextButton.disabled = !hasQuery || !hasFullPage;
    if (firstButton) firstButton.disabled = !hasQuery || watchOffset === 0;

    if (label) {
      if (!hasQuery) {
        label.textContent = "Premier lot de résultats.";
      } else if (!lastResults.length) {
        label.textContent = watchOffset ? `Aucun résultat à partir du rang ${watchOffset + 1}.` : "Aucun résultat dans le premier lot.";
      } else {
        label.textContent = `Résultats ${watchOffset + 1} à ${watchOffset + lastResults.length}.`;
      }
    }
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
          <button class="cyber-btn-primary" data-watch-submit="${index}" type="button">Envoyer en soumission</button>
          <button class="cyber-btn-primary" data-watch-copy="${index}" type="button">Copier la fiche</button>
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
      totalCount: Array.isArray(results) ? results.length : 0,
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
