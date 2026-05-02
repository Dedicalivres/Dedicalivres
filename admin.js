/* =========================================================
  DÉDICALIVRES — ADMIN
  Fichier : admin.js
  Dépendances :
  - config.js avec window.DEDICALIVRES_CONFIG
  - Supabase JS v2
  - Leaflet
  - JavaScript vanilla uniquement
========================================================= */

(function () {
  "use strict";

  /* =========================================================
    CONFIGURATION
  ========================================================= */

  const TABLE_NAME = "events";

  /*
    Compteurs de visites optionnels.
    Si tu n’as pas encore de table de visites, l’admin continuera de fonctionner.
    Si ta table a un autre nom, change uniquement TRAFFIC_TABLE_NAME.
  */
  const TRAFFIC_TABLE_NAME = "site_visits";
  const TRAFFIC_DATE_COLUMN = "created_at";

  /*
    Important :
    Dans Supabase, ajoute aussi cette URL dans :
    Authentication → URL Configuration → Redirect URLs
  */
  const RECOVERY_REDIRECT_URL = "https://dedicalivres.fr/admin.html";

  const OPTIONAL_COLUMNS = [
    "type",
    "region",
    "city",
    "price",
    "start_date",
    "end_date",
    "website",
    "description",
    "image_url",
    "lat",
    "lng",
    "validated",
    "rejected",
    "featured",
    "verified",
    "source_label",
    "created_at"
  ];

  const BASE_COLUMNS = [
    "id",
    "title",
    ...OPTIONAL_COLUMNS
  ];

  const DEFAULT_MAP_CENTER = [46.7, 2.5];
  const DEFAULT_MAP_ZOOM = 6;
  const MAX_MAP_MARKERS = 300;

  let supabaseClient = null;
  let els = {};

  const state = {
    session: null,
    events: [],
    filteredEvents: [],
    selectedIds: new Set(),
    currentView: "list",
    currentEditEvent: null,
    map: null,
    markerLayer: null,
    availableColumns: new Set(BASE_COLUMNS),
    unavailableColumns: new Set(),
    pendingConfirmAction: null,
    isRecoveryMode: false,
    trafficDisabled: false,
    initialized: false
  };

  /* =========================================================
    INIT
  ========================================================= */

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    cacheDom();

    try {
      ensureDependencies();
      bindEvents();

      state.isRecoveryMode = isRecoveryUrl();

      supabaseClient.auth.onAuthStateChange(async function (eventName, session) {
        state.session = session || null;

        if (eventName === "PASSWORD_RECOVERY") {
          state.isRecoveryMode = true;
          showRecovery();
          return;
        }

        if (state.isRecoveryMode) {
          showRecovery();
          return;
        }

        if (state.session) {
          showAdmin();
          await loadEvents();
        } else {
          showLogin();
        }
      });

      const { data, error } = await supabaseClient.auth.getSession();

      if (error) {
        showMessage(els.loginMessage, "error", "Impossible de vérifier la session admin.");
        showLogin();
        return;
      }

      state.session = data.session || null;

      if (state.isRecoveryMode) {
        showRecovery();
        return;
      }

      if (state.session) {
        showAdmin();
        await loadEvents();
      } else {
        showLogin();
      }
    } catch (error) {
      showFatalError(getErrorMessage(error));
    }
  }

  function cacheDom() {
    els = {
      app: document.getElementById("admin-app"),

      loginView: document.getElementById("login-view"),
      adminView: document.getElementById("admin-view"),
      recoveryView: document.getElementById("recovery-view"),

      loginForm: document.getElementById("login-form"),
      loginEmail: document.getElementById("login-email"),
      loginPassword: document.getElementById("login-password"),
      loginMessage: document.getElementById("login-message"),
      forgotPasswordBtn: document.getElementById("forgot-password-btn"),

      recoveryForm: document.getElementById("recovery-form"),
      newPassword: document.getElementById("new-password"),
      newPasswordConfirm: document.getElementById("new-password-confirm"),
      recoveryMessage: document.getElementById("recovery-message"),

      adminUserEmail: document.getElementById("admin-user-email"),
      logoutBtn: document.getElementById("logout-btn"),
      refreshBtn: document.getElementById("refresh-btn"),
      globalMessage: document.getElementById("global-message"),

      statTotal: document.getElementById("stat-total"),
      statPending: document.getElementById("stat-pending"),
      statValidated: document.getElementById("stat-validated"),
      statRejected: document.getElementById("stat-rejected"),
      statFeatured: document.getElementById("stat-featured"),
      statVerified: document.getElementById("stat-verified"),

      trafficToday: document.getElementById("traffic-today"),
      trafficWeek: document.getElementById("traffic-week"),
      trafficTotal: document.getElementById("traffic-total"),
      trafficMessage: document.getElementById("traffic-message"),

      tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
      viewList: document.getElementById("view-list"),
      viewMap: document.getElementById("view-map"),
      viewTools: document.getElementById("view-tools"),

      searchInput: document.getElementById("search-input"),
      statusFilter: document.getElementById("status-filter"),
      regionFilter: document.getElementById("region-filter"),
      typeFilter: document.getElementById("type-filter"),
      dateFilter: document.getElementById("date-filter"),

      selectAllCheckbox: document.getElementById("select-all-checkbox"),
      selectedCount: document.getElementById("selected-count"),
      bulkValidateBtn: document.getElementById("bulk-validate-btn"),
      bulkRejectBtn: document.getElementById("bulk-reject-btn"),
      bulkFeatureBtn: document.getElementById("bulk-feature-btn"),
      bulkUnfeatureBtn: document.getElementById("bulk-unfeature-btn"),

      eventsTbody: document.getElementById("events-tbody"),
      eventsMobileList: document.getElementById("events-mobile-list"),

      adminMap: document.getElementById("admin-map"),
      missingCoordinatesList: document.getElementById("missing-coordinates-list"),

      exportCsvBtn: document.getElementById("export-csv-btn"),
      exportCsvBtnTools: document.getElementById("export-csv-btn-tools"),

      instagramEventSelect: document.getElementById("instagram-event-select"),
      generateInstagramBtn: document.getElementById("generate-instagram-btn"),
      instagramOutput: document.getElementById("instagram-output"),
      copyInstagramBtn: document.getElementById("copy-instagram-btn"),

      editModal: document.getElementById("edit-modal"),
      closeEditModalBtn: document.getElementById("close-edit-modal-btn"),
      cancelEditBtn: document.getElementById("cancel-edit-btn"),
      editForm: document.getElementById("edit-form"),
      editMessage: document.getElementById("edit-message"),

      editId: document.getElementById("edit-id"),
      editTitle: document.getElementById("edit-title"),
      editDescription: document.getElementById("edit-description"),
      editType: document.getElementById("edit-type"),
      editRegion: document.getElementById("edit-region"),
      editCity: document.getElementById("edit-city"),
      editPrice: document.getElementById("edit-price"),
      editStartDate: document.getElementById("edit-start-date"),
      editEndDate: document.getElementById("edit-end-date"),
      editWebsite: document.getElementById("edit-website"),
      editImageUrl: document.getElementById("edit-image-url"),
      editLat: document.getElementById("edit-lat"),
      editLng: document.getElementById("edit-lng"),
      editSourceLabel: document.getElementById("edit-source-label"),
      editValidated: document.getElementById("edit-validated"),
      editRejected: document.getElementById("edit-rejected"),
      editFeatured: document.getElementById("edit-featured"),
      editVerified: document.getElementById("edit-verified"),
      deleteEventBtn: document.getElementById("delete-event-btn"),

      confirmModal: document.getElementById("confirm-modal"),
      confirmMessage: document.getElementById("confirm-message"),
      confirmCancelBtn: document.getElementById("confirm-cancel-btn"),
      confirmOkBtn: document.getElementById("confirm-ok-btn")
    };
  }

  function ensureDependencies() {
    const config = window.DEDICALIVRES_CONFIG;

    if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Configuration Supabase manquante. Vérifie le fichier config.js.");
    }

    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase JS v2 est introuvable.");
    }

    supabaseClient = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );
  }

  function bindEvents() {
    if (els.loginForm) {
      els.loginForm.addEventListener("submit", handleLogin);
    }

    if (els.forgotPasswordBtn) {
      els.forgotPasswordBtn.addEventListener("click", handleForgotPassword);
    }

    if (els.recoveryForm) {
      els.recoveryForm.addEventListener("submit", handlePasswordRecoverySubmit);
    }

    if (els.logoutBtn) {
      els.logoutBtn.addEventListener("click", handleLogout);
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener("click", loadEvents);
    }

    els.tabButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        switchView(button.dataset.view);
      });
    });

    [
      els.searchInput,
      els.statusFilter,
      els.regionFilter,
      els.typeFilter,
      els.dateFilter
    ].forEach(function (input) {
      if (!input) return;
      input.addEventListener("input", applyFiltersAndRender);
      input.addEventListener("change", applyFiltersAndRender);
    });

    if (els.selectAllCheckbox) {
      els.selectAllCheckbox.addEventListener("change", handleSelectAll);
    }

    if (els.bulkValidateBtn) {
      els.bulkValidateBtn.addEventListener("click", function () {
        bulkUpdate({ validated: true, rejected: false }, "Valider les événements sélectionnés ?");
      });
    }

    if (els.bulkRejectBtn) {
      els.bulkRejectBtn.addEventListener("click", function () {
        bulkUpdate({ rejected: true, validated: false }, "Rejeter les événements sélectionnés ?");
      });
    }

    if (els.bulkFeatureBtn) {
      els.bulkFeatureBtn.addEventListener("click", function () {
        bulkUpdate({ featured: true }, "Mettre en avant les événements sélectionnés ?");
      });
    }

    if (els.bulkUnfeatureBtn) {
      els.bulkUnfeatureBtn.addEventListener("click", function () {
        bulkUpdate({ featured: false }, "Retirer la mise en avant des événements sélectionnés ?");
      });
    }

    if (els.eventsTbody) {
      els.eventsTbody.addEventListener("click", handleListClick);
      els.eventsTbody.addEventListener("change", handleListChange);
    }

    if (els.eventsMobileList) {
      els.eventsMobileList.addEventListener("click", handleListClick);
      els.eventsMobileList.addEventListener("change", handleListChange);
    }

    if (els.exportCsvBtn) {
      els.exportCsvBtn.addEventListener("click", exportFilteredCsv);
    }

    if (els.exportCsvBtnTools) {
      els.exportCsvBtnTools.addEventListener("click", exportFilteredCsv);
    }

    if (els.instagramEventSelect) {
      els.instagramEventSelect.addEventListener("change", function () {
        if (els.instagramOutput) {
          els.instagramOutput.value = "";
        }
      });
    }

    if (els.generateInstagramBtn) {
      els.generateInstagramBtn.addEventListener("click", generateInstagramText);
    }

    if (els.copyInstagramBtn) {
      els.copyInstagramBtn.addEventListener("click", copyInstagramText);
    }

    if (els.closeEditModalBtn) {
      els.closeEditModalBtn.addEventListener("click", closeEditModal);
    }

    if (els.cancelEditBtn) {
      els.cancelEditBtn.addEventListener("click", closeEditModal);
    }

    if (els.editForm) {
      els.editForm.addEventListener("submit", handleEditSubmit);
    }

    if (els.deleteEventBtn) {
      els.deleteEventBtn.addEventListener("click", function () {
        if (!state.currentEditEvent) return;

        confirmAction(
          "Supprimer définitivement cet événement ?",
          async function () {
            await deleteEvent(state.currentEditEvent.id);
            closeEditModal();
          }
        );
      });
    }

    document.addEventListener("click", function (event) {
      if (event.target && event.target.dataset.closeModal === "true") {
        closeEditModal();
      }

      if (event.target && event.target.dataset.closeConfirm === "true") {
        closeConfirmModal();
      }
    });

    if (els.confirmCancelBtn) {
      els.confirmCancelBtn.addEventListener("click", closeConfirmModal);
    }

    if (els.confirmOkBtn) {
      els.confirmOkBtn.addEventListener("click", async function () {
        if (typeof state.pendingConfirmAction !== "function") {
          closeConfirmModal();
          return;
        }

        const action = state.pendingConfirmAction;
        closeConfirmModal();

        try {
          await action();
        } catch (error) {
          showMessage(els.globalMessage, "error", getErrorMessage(error));
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeEditModal();
        closeConfirmModal();
      }
    });
  }

  /* =========================================================
    AUTH
  ========================================================= */

  async function handleLogin(event) {
    event.preventDefault();
    clearMessage(els.loginMessage);

    const email = valueOf(els.loginEmail);
    const password = valueOf(els.loginPassword);

    if (!email || !password) {
      showMessage(els.loginMessage, "error", "Email et mot de passe obligatoires.");
      return;
    }

    setLoadingButton(event.submitter, true, "Connexion...");

    try {
      const { data, error } = await withTimeout(
        supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        }),
        12000,
        "Connexion trop longue. Vérifie ta connexion internet."
      );

      if (error) throw error;

      state.session = data.session || null;
      state.isRecoveryMode = false;

      showAdmin();
      await loadEvents();
    } catch (error) {
      showMessage(els.loginMessage, "error", getErrorMessage(error));
    } finally {
      setLoadingButton(event.submitter, false);
    }
  }

  async function handleForgotPassword() {
    clearMessage(els.loginMessage);

    const email = valueOf(els.loginEmail);

    if (!email) {
      showMessage(
        els.loginMessage,
        "error",
        "Entre ton email admin avant de demander la récupération."
      );
      return;
    }

    setLoadingButton(els.forgotPasswordBtn, true, "Envoi...");

    try {
      const { error } = await withTimeout(
        supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: RECOVERY_REDIRECT_URL
        }),
        12000,
        "L’envoi de l’email prend trop de temps."
      );

      if (error) throw error;

      showMessage(
        els.loginMessage,
        "success",
        "Email de récupération envoyé. Vérifie ta boîte mail."
      );
    } catch (error) {
      showMessage(els.loginMessage, "error", getErrorMessage(error));
    } finally {
      setLoadingButton(els.forgotPasswordBtn, false);
    }
  }

  async function handlePasswordRecoverySubmit(event) {
    event.preventDefault();

    clearMessage(els.recoveryMessage);

    const password = valueOf(els.newPassword);
    const confirmation = valueOf(els.newPasswordConfirm);

    if (!password || !confirmation) {
      showMessage(els.recoveryMessage, "error", "Les deux champs sont obligatoires.");
      return;
    }

    if (password.length < 8) {
      showMessage(
        els.recoveryMessage,
        "error",
        "Le mot de passe doit contenir au moins 8 caractères."
      );
      return;
    }

    if (password !== confirmation) {
      showMessage(
        els.recoveryMessage,
        "error",
        "Les deux mots de passe ne correspondent pas."
      );
      return;
    }

    setLoadingButton(event.submitter, true, "Enregistrement...");

    try {
      const { data } = await supabaseClient.auth.getSession();

      if (!data || !data.session) {
        throw new Error(
          "Session de récupération absente. Redemande un email de récupération et ouvre le dernier lien reçu."
        );
      }

      const { error } = await withTimeout(
        supabaseClient.auth.updateUser({
          password: password
        }),
        12000,
        "La mise à jour du mot de passe prend trop de temps."
      );

      if (error) throw error;

      showMessage(
        els.recoveryMessage,
        "success",
        "Mot de passe modifié. Tu peux maintenant te reconnecter."
      );

      if (els.newPassword) els.newPassword.value = "";
      if (els.newPasswordConfirm) els.newPasswordConfirm.value = "";

      state.isRecoveryMode = false;

      window.history.replaceState({}, document.title, "admin.html");

      await supabaseClient.auth.signOut();

      setTimeout(function () {
        showLogin();
      }, 1200);
    } catch (error) {
      showMessage(els.recoveryMessage, "error", getErrorMessage(error));
    } finally {
      setLoadingButton(event.submitter, false);
    }
  }

  async function handleLogout() {
    clearMessage(els.globalMessage);

    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;

      state.session = null;
      state.events = [];
      state.filteredEvents = [];
      state.selectedIds.clear();
      state.isRecoveryMode = false;

      showLogin();
    } catch (error) {
      showMessage(els.globalMessage, "error", getErrorMessage(error));
    }
  }

  function showLogin() {
    if (els.loginView) els.loginView.classList.remove("is-hidden");
    if (els.adminView) els.adminView.classList.add("is-hidden");
    if (els.recoveryView) els.recoveryView.classList.add("is-hidden");

    if (els.loginPassword) {
      els.loginPassword.value = "";
    }
  }

  function showRecovery() {
    if (els.loginView) els.loginView.classList.add("is-hidden");
    if (els.adminView) els.adminView.classList.add("is-hidden");
    if (els.recoveryView) els.recoveryView.classList.remove("is-hidden");
  }

  function showAdmin() {
    if (els.loginView) els.loginView.classList.add("is-hidden");
    if (els.recoveryView) els.recoveryView.classList.add("is-hidden");
    if (els.adminView) els.adminView.classList.remove("is-hidden");

    const email = state.session && state.session.user ? state.session.user.email : "";

    if (els.adminUserEmail) {
      els.adminUserEmail.textContent = email || "Admin connecté";
      els.adminUserEmail.title = email || "";
    }
  }

  function isRecoveryUrl() {
    return (
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery")
    );
  }

  /* =========================================================
    LOAD EVENTS
  ========================================================= */

  async function loadEvents() {
    clearMessage(els.globalMessage);

    if (!state.session) return;

    setLoadingState(true);

    try {
      const events = await fetchEventsWithFallback();

      state.events = normalizeEvents(events);
      state.selectedIds.clear();

      populateFilters();
      populateInstagramSelect();
      applyFiltersAndRender();

      await loadTrafficStats();

      showMessage(
        els.globalMessage,
        "success",
        `${state.events.length} événement${state.events.length > 1 ? "s" : ""} chargé${state.events.length > 1 ? "s" : ""}.`
      );
    } catch (error) {
      showMessage(els.globalMessage, "error", getErrorMessage(error));
      renderEmpty("Impossible de charger les événements.");
    } finally {
      setLoadingState(false);
    }
  }

  async function fetchEventsWithFallback() {
    const fullSelect = BASE_COLUMNS.join(",");

    let response = await supabaseClient
      .from(TABLE_NAME)
      .select(fullSelect)
      .order("start_date", { ascending: false, nullsFirst: false });

    if (!response.error) {
      response.data.forEach(function (event) {
        Object.keys(event || {}).forEach(function (key) {
          state.availableColumns.add(key);
        });
      });

      return response.data || [];
    }

    const firstError = response.error;

    if (!isMissingColumnError(firstError)) {
      throw firstError;
    }

    response = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .order("created_at", { ascending: false, nullsFirst: false });

    if (response.error) {
      response = await supabaseClient
        .from(TABLE_NAME)
        .select("*");
    }

    if (response.error) {
      throw response.error;
    }

    const rows = response.data || [];

    state.availableColumns.clear();
    state.unavailableColumns.clear();

    rows.forEach(function (event) {
      Object.keys(event || {}).forEach(function (key) {
        state.availableColumns.add(key);
      });
    });

    BASE_COLUMNS.forEach(function (column) {
      if (!state.availableColumns.has(column)) {
        state.unavailableColumns.add(column);
      }
    });

    return rows;
  }

  function normalizeEvents(events) {
    return (events || []).map(function (event) {
      const normalized = Object.assign({}, event);

      normalized.id = event.id;
      normalized.title = safeString(event.title) || "Sans titre";

      OPTIONAL_COLUMNS.forEach(function (column) {
        if (!(column in normalized)) {
          normalized[column] = null;
        }
      });

      normalized.validated = toBoolean(normalized.validated);
      normalized.rejected = toBoolean(normalized.rejected);
      normalized.featured = toBoolean(normalized.featured);
      normalized.verified = toBoolean(normalized.verified);

      normalized.lat = toNumberOrNull(normalized.lat);
      normalized.lng = toNumberOrNull(normalized.lng);

      return normalized;
    });
  }

  function setLoadingState(isLoading) {
    if (els.refreshBtn) {
      els.refreshBtn.disabled = isLoading;
      els.refreshBtn.textContent = isLoading ? "Chargement..." : "Rafraîchir";
    }
  }

  /* =========================================================
    TRAFFIC STATS
  ========================================================= */

  async function loadTrafficStats() {
    if (state.trafficDisabled) return;
    if (!els.trafficToday && !els.trafficWeek && !els.trafficTotal) return;

    clearTrafficMessage();

    setText(els.trafficToday, "…");
    setText(els.trafficWeek, "…");
    setText(els.trafficTotal, "…");

    try {
      const todayStart = getTodayStartIso();
      const weekStart = getLastSevenDaysStartIso();

      const today = await countVisitsFrom(todayStart);
      const week = await countVisitsFrom(weekStart);
      const total = await countAllVisits();

      setText(els.trafficToday, formatNumber(today));
      setText(els.trafficWeek, formatNumber(week));
      setText(els.trafficTotal, formatNumber(total));
    } catch (_error) {
      state.trafficDisabled = true;

      setText(els.trafficToday, "—");
      setText(els.trafficWeek, "—");
      setText(els.trafficTotal, "—");

      showTrafficMessage(
        `Compteurs de visites indisponibles. Vérifie la table Supabase "${TRAFFIC_TABLE_NAME}".`
      );
    }
  }

  async function countVisitsFrom(isoDate) {
    const { count, error } = await supabaseClient
      .from(TRAFFIC_TABLE_NAME)
      .select("*", {
        count: "exact",
        head: true
      })
      .gte(TRAFFIC_DATE_COLUMN, isoDate);

    if (error) throw error;

    return count || 0;
  }

  async function countAllVisits() {
    const { count, error } = await supabaseClient
      .from(TRAFFIC_TABLE_NAME)
      .select("*", {
        count: "exact",
        head: true
      });

    if (error) throw error;

    return count || 0;
  }

  function showTrafficMessage(message) {
    if (!els.trafficMessage) return;

    els.trafficMessage.textContent = message;
    els.trafficMessage.classList.add("is-visible");
  }

  function clearTrafficMessage() {
    if (!els.trafficMessage) return;

    els.trafficMessage.textContent = "";
    els.trafficMessage.classList.remove("is-visible");
  }

  /* =========================================================
    FILTERS / RENDER
  ========================================================= */

  function populateFilters() {
    fillSelectWithUniqueValues(els.regionFilter, state.events, "region", "Toutes");
    fillSelectWithUniqueValues(els.typeFilter, state.events, "type", "Tous");
  }

  function fillSelectWithUniqueValues(select, events, key, defaultLabel) {
    if (!select) return;

    const currentValue = select.value || "all";

    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "all";
    defaultOption.textContent = defaultLabel;
    select.appendChild(defaultOption);

    const values = uniqueSorted(
      events
        .map(function (event) {
          return safeString(event[key]);
        })
        .filter(Boolean)
    );

    values.forEach(function (value) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    if (Array.from(select.options).some(function (option) {
      return option.value === currentValue;
    })) {
      select.value = currentValue;
    } else {
      select.value = "all";
    }
  }

  function applyFiltersAndRender() {
    const query = normalizeSearch(valueOf(els.searchInput));
    const status = valueOf(els.statusFilter) || "all";
    const region = valueOf(els.regionFilter) || "all";
    const type = valueOf(els.typeFilter) || "all";
    const dateFilter = valueOf(els.dateFilter) || "all";

    state.filteredEvents = state.events.filter(function (event) {
      const haystack = normalizeSearch([
        event.title,
        event.city,
        event.region,
        event.description
      ].join(" "));

      if (query && !haystack.includes(query)) return false;
      if (status !== "all" && getEventStatus(event) !== status) return false;
      if (region !== "all" && safeString(event.region) !== region) return false;
      if (type !== "all" && safeString(event.type) !== type) return false;
      if (!matchesDateFilter(event, dateFilter)) return false;

      return true;
    });

    cleanSelection();
    renderStats();
    renderList();
    renderMobileList();
    renderSelectionState();
    populateInstagramSelect();

    if (state.currentView === "map") {
      scheduleMapRender();
    }
  }

  function matchesDateFilter(event, filter) {
    if (filter === "all") return true;

    const startDate = parseDate(event.start_date);
    const endDate = parseDate(event.end_date);
    const today = startOfToday();

    if (filter === "no-date") {
      return !startDate && !endDate;
    }

    if (filter === "past") {
      const referenceDate = endDate || startDate;
      return referenceDate ? referenceDate < today : false;
    }

    if (filter === "upcoming") {
      const referenceDate = endDate || startDate;
      return referenceDate ? referenceDate >= today : false;
    }

    return true;
  }

  function renderStats() {
    const all = state.events;

    setText(els.statTotal, all.length);

    setText(
      els.statPending,
      all.filter(function (event) {
        return getEventStatus(event) === "pending";
      }).length
    );

    setText(
      els.statValidated,
      all.filter(function (event) {
        return event.validated === true;
      }).length
    );

    setText(
      els.statRejected,
      all.filter(function (event) {
        return event.rejected === true;
      }).length
    );

    setText(
      els.statFeatured,
      all.filter(function (event) {
        return event.featured === true;
      }).length
    );

    setText(
      els.statVerified,
      all.filter(function (event) {
        return event.verified === true;
      }).length
    );
  }

  function renderList() {
    if (!els.eventsTbody) return;

    if (!state.filteredEvents.length) {
      els.eventsTbody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">Aucun événement ne correspond aux filtres.</td>
        </tr>
      `;
      return;
    }

    els.eventsTbody.innerHTML = state.filteredEvents.map(function (event) {
      const status = getEventStatus(event);
      const checked = state.selectedIds.has(String(event.id)) ? "checked" : "";

      return `
        <tr data-event-id="${escapeHtml(event.id)}">
          <td class="col-select">
            <input
              type="checkbox"
              class="event-select-checkbox"
              data-event-id="${escapeHtml(event.id)}"
              ${checked}
              aria-label="Sélectionner ${escapeHtml(event.title)}"
            />
          </td>

          <td>
            <div class="event-title-cell">
              <strong>${escapeHtml(event.title)}</strong>
              <small>${escapeHtml(truncate(event.description || "", 120) || "Aucune description")}</small>
              <div class="badges-row">
                ${event.source_label ? `<span class="badge">${escapeHtml(event.source_label)}</span>` : ""}
                ${!hasCoordinates(event) ? `<span class="badge missing">Sans coordonnées</span>` : ""}
              </div>
            </div>
          </td>

          <td>
            <div class="event-location-cell">
              <span>${escapeHtml(event.city || "Ville inconnue")}</span>
              <small>${escapeHtml(event.region || "Région inconnue")}</small>
            </div>
          </td>

          <td>
            <div class="event-date-cell">
              <span>${escapeHtml(formatDateRange(event.start_date, event.end_date))}</span>
              <small>${escapeHtml(event.type || "Type non renseigné")}</small>
            </div>
          </td>

          <td>
            <div class="badges-row">
              ${statusBadge(status)}
            </div>
          </td>

          <td>
            <div class="badges-row">
              ${event.featured ? `<span class="badge featured">Mis en avant</span>` : ""}
              ${event.verified ? `<span class="badge verified">Vérifié</span>` : ""}
              ${event.price ? `<span class="badge">${escapeHtml(event.price)}</span>` : ""}
            </div>
          </td>

          <td class="col-actions">
            ${rowActionsHtml(event)}
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderMobileList() {
    if (!els.eventsMobileList) return;

    if (!state.filteredEvents.length) {
      els.eventsMobileList.innerHTML = `
        <div class="empty-state">Aucun événement ne correspond aux filtres.</div>
      `;
      return;
    }

    els.eventsMobileList.innerHTML = state.filteredEvents.map(function (event) {
      const checked = state.selectedIds.has(String(event.id)) ? "checked" : "";
      const status = getEventStatus(event);

      return `
        <article class="mobile-event-card" data-event-id="${escapeHtml(event.id)}">
          <div class="mobile-card-top">
            <label class="checkbox-line">
              <input
                type="checkbox"
                class="event-select-checkbox"
                data-event-id="${escapeHtml(event.id)}"
                ${checked}
              />
              <span>Sélectionner</span>
            </label>

            <div class="badges-row">
              ${statusBadge(status)}
            </div>
          </div>

          <div class="mobile-card-title">
            <strong>${escapeHtml(event.title)}</strong>
            <small>${escapeHtml(event.type || "Type non renseigné")}</small>
          </div>

          <div class="mobile-card-meta">
            <span>${escapeHtml(event.city || "Ville inconnue")} · ${escapeHtml(event.region || "Région inconnue")}</span>
            <span>${escapeHtml(formatDateRange(event.start_date, event.end_date))}</span>
            ${!hasCoordinates(event) ? `<span class="badge missing">Sans coordonnées</span>` : ""}
          </div>

          <div class="badges-row">
            ${event.featured ? `<span class="badge featured">Mis en avant</span>` : ""}
            ${event.verified ? `<span class="badge verified">Vérifié</span>` : ""}
            ${event.price ? `<span class="badge">${escapeHtml(event.price)}</span>` : ""}
          </div>

          <div class="mobile-card-actions">
            ${rowActionsHtml(event)}
          </div>
        </article>
      `;
    }).join("");
  }

  function rowActionsHtml(event) {
    const id = escapeHtml(event.id);

    return `
      <div class="row-actions">
        <button type="button" class="btn btn-small" data-action="validate" data-id="${id}">
          Valider
        </button>

        <button type="button" class="btn btn-small btn-warning" data-action="reject" data-id="${id}">
          Rejeter
        </button>

        <button type="button" class="btn btn-small btn-secondary" data-action="toggle-featured" data-id="${id}">
          ${event.featured ? "Retirer une" : "Mettre en"} avant
        </button>

        <button type="button" class="btn btn-small btn-secondary" data-action="toggle-verified" data-id="${id}">
          ${event.verified ? "Retirer vérif." : "Vérifier"}
        </button>

        <button type="button" class="btn btn-small btn-primary" data-action="edit" data-id="${id}">
          Modifier
        </button>

        <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${id}">
          Supprimer
        </button>
      </div>
    `;
  }

  function statusBadge(status) {
    if (status === "validated") {
      return `<span class="badge validated">Validé</span>`;
    }

    if (status === "rejected") {
      return `<span class="badge rejected">Rejeté</span>`;
    }

    return `<span class="badge pending">En attente</span>`;
  }

  function renderEmpty(message) {
    if (els.eventsTbody) {
      els.eventsTbody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">${escapeHtml(message)}</td>
        </tr>
      `;
    }

    if (els.eventsMobileList) {
      els.eventsMobileList.innerHTML = `
        <div class="empty-state">${escapeHtml(message)}</div>
      `;
    }

    renderStats();
  }

  /* =========================================================
    SELECTION
  ========================================================= */

  function handleSelectAll() {
    if (!els.selectAllCheckbox) return;

    if (els.selectAllCheckbox.checked) {
      state.filteredEvents.forEach(function (event) {
        state.selectedIds.add(String(event.id));
      });
    } else {
      state.filteredEvents.forEach(function (event) {
        state.selectedIds.delete(String(event.id));
      });
    }

    renderList();
    renderMobileList();
    renderSelectionState();
  }

  function handleListChange(event) {
    const target = event.target;

    if (!target.classList.contains("event-select-checkbox")) return;

    const id = String(target.dataset.eventId);

    if (target.checked) {
      state.selectedIds.add(id);
    } else {
      state.selectedIds.delete(id);
    }

    renderList();
    renderMobileList();
    renderSelectionState();
  }

  function renderSelectionState() {
    const selectedCount = state.selectedIds.size;

    if (els.selectedCount) {
      els.selectedCount.textContent =
        selectedCount + " sélectionné" + (selectedCount > 1 ? "s" : "");
    }

    if (els.selectAllCheckbox) {
      const visibleIds = state.filteredEvents.map(function (event) {
        return String(event.id);
      });

      const allVisibleSelected =
        visibleIds.length > 0 &&
        visibleIds.every(function (id) {
          return state.selectedIds.has(id);
        });

      const someVisibleSelected =
        visibleIds.some(function (id) {
          return state.selectedIds.has(id);
        });

      els.selectAllCheckbox.checked = allVisibleSelected;
      els.selectAllCheckbox.indeterminate = !allVisibleSelected && someVisibleSelected;
    }

    [
      els.bulkValidateBtn,
      els.bulkRejectBtn,
      els.bulkFeatureBtn,
      els.bulkUnfeatureBtn
    ].forEach(function (button) {
      if (button) button.disabled = selectedCount === 0;
    });
  }

  function cleanSelection() {
    const existingIds = new Set(
      state.events.map(function (event) {
        return String(event.id);
      })
    );

    Array.from(state.selectedIds).forEach(function (id) {
      if (!existingIds.has(id)) {
        state.selectedIds.delete(id);
      }
    });
  }

  /* =========================================================
    ACTIONS
  ========================================================= */

  async function handleListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;
    const currentEvent = findEventById(id);

    if (!currentEvent) {
      showMessage(els.globalMessage, "error", "Événement introuvable.");
      return;
    }

    try {
      if (action === "validate") {
        await updateEvent(id, { validated: true, rejected: false });
      }

      if (action === "reject") {
        await updateEvent(id, { rejected: true, validated: false });
      }

      if (action === "toggle-featured") {
        await updateEvent(id, { featured: !currentEvent.featured });
      }

      if (action === "toggle-verified") {
        await updateEvent(id, { verified: !currentEvent.verified });
      }

      if (action === "edit") {
        openEditModal(currentEvent);
      }

      if (action === "delete") {
        confirmAction(
          `Supprimer définitivement « ${currentEvent.title} » ?`,
          async function () {
            await deleteEvent(id);
          }
        );
      }
    } catch (error) {
      showMessage(els.globalMessage, "error", getErrorMessage(error));
    }
  }

  async function updateEvent(id, patch) {
    const cleanPatch = sanitizePatch(patch);

    if (!Object.keys(cleanPatch).length) {
      showMessage(
        els.globalMessage,
        "warning",
        "Aucune colonne compatible à mettre à jour. Vérifie la structure de la table events."
      );
      return;
    }

    const { data, error } = await withTimeout(
      supabaseClient
        .from(TABLE_NAME)
        .update(cleanPatch)
        .eq("id", id)
        .select("id"),
      12000,
      "La mise à jour prend trop de temps. Vérifie la connexion ou les règles Supabase."
    );

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "Aucune ligne n’a été modifiée. Vérifie les règles RLS Supabase pour UPDATE sur la table events."
      );
    }

    state.events = state.events.map(function (event) {
      if (String(event.id) !== String(id)) return event;
      return normalizeEvents([Object.assign({}, event, cleanPatch)])[0];
    });

    applyFiltersAndRender();
    showMessage(els.globalMessage, "success", "Événement mis à jour.");
  }

  function bulkUpdate(patch, confirmationMessage) {
    if (!state.selectedIds.size) {
      showMessage(els.globalMessage, "warning", "Aucun événement sélectionné.");
      return;
    }

    confirmAction(confirmationMessage, async function () {
      const ids = Array.from(state.selectedIds);
      const cleanPatch = sanitizePatch(patch);

      if (!Object.keys(cleanPatch).length) {
        showMessage(
          els.globalMessage,
          "warning",
          "Aucune colonne compatible à mettre à jour."
        );
        return;
      }

      const { data, error } = await withTimeout(
        supabaseClient
          .from(TABLE_NAME)
          .update(cleanPatch)
          .in("id", ids)
          .select("id"),
        12000,
        "L’action en masse prend trop de temps. Vérifie la connexion ou les règles Supabase."
      );

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(
          "Aucune ligne n’a été modifiée. Vérifie les règles RLS Supabase pour UPDATE sur la table events."
        );
      }

      state.events = state.events.map(function (event) {
        if (!state.selectedIds.has(String(event.id))) return event;
        return normalizeEvents([Object.assign({}, event, cleanPatch)])[0];
      });

      state.selectedIds.clear();
      applyFiltersAndRender();

      showMessage(els.globalMessage, "success", "Actions en masse appliquées.");
    });
  }

  async function deleteEvent(id) {
    const { data, error } = await withTimeout(
      supabaseClient
        .from(TABLE_NAME)
        .delete()
        .eq("id", id)
        .select("id"),
      12000,
      "La suppression prend trop de temps. Vérifie la connexion ou les règles Supabase."
    );

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "Aucune ligne n’a été supprimée. Vérifie les règles RLS Supabase pour DELETE sur la table events."
      );
    }

    state.events = state.events.filter(function (event) {
      return String(event.id) !== String(id);
    });

    state.selectedIds.delete(String(id));
    applyFiltersAndRender();

    showMessage(els.globalMessage, "success", "Événement supprimé.");
  }

  function sanitizePatch(patch) {
    const cleanPatch = {};

    Object.keys(patch).forEach(function (key) {
      if (key === "id") return;
      if (state.unavailableColumns.has(key)) return;

      if (state.availableColumns.size && !state.availableColumns.has(key)) {
        return;
      }

      cleanPatch[key] = patch[key];
    });

    return cleanPatch;
  }

  /* =========================================================
    EDIT MODAL
  ========================================================= */

  function openEditModal(event) {
    state.currentEditEvent = event;
    clearMessage(els.editMessage);

    setValue(els.editId, event.id);
    setValue(els.editTitle, event.title);
    setValue(els.editDescription, event.description);
    setValue(els.editType, event.type);
    setValue(els.editRegion, event.region);
    setValue(els.editCity, event.city);
    setValue(els.editPrice, event.price);
    setValue(els.editStartDate, toDateInputValue(event.start_date));
    setValue(els.editEndDate, toDateInputValue(event.end_date));
    setValue(els.editWebsite, event.website);
    setValue(els.editImageUrl, event.image_url);
    setValue(els.editLat, event.lat);
    setValue(els.editLng, event.lng);
    setValue(els.editSourceLabel, event.source_label);

    setChecked(els.editValidated, event.validated);
    setChecked(els.editRejected, event.rejected);
    setChecked(els.editFeatured, event.featured);
    setChecked(els.editVerified, event.verified);

    updateOptionalFieldAvailability();

    if (els.editModal) {
      els.editModal.classList.remove("is-hidden");
    }

    setTimeout(function () {
      if (els.editTitle) els.editTitle.focus();
    }, 50);
  }

  function closeEditModal() {
    if (!els.editModal) return;

    els.editModal.classList.add("is-hidden");
    state.currentEditEvent = null;
    clearMessage(els.editMessage);
  }

  async function handleEditSubmit(event) {
    event.preventDefault();

    if (!state.currentEditEvent) return;

    clearMessage(els.editMessage);
    setLoadingButton(event.submitter, true, "Enregistrement...");

    try {
      const id = valueOf(els.editId);

      const patch = {
        title: valueOf(els.editTitle) || "Sans titre",
        description: nullableString(valueOf(els.editDescription)),
        type: nullableString(valueOf(els.editType)),
        region: nullableString(valueOf(els.editRegion)),
        city: nullableString(valueOf(els.editCity)),
        price: nullableString(valueOf(els.editPrice)),
        start_date: nullableString(valueOf(els.editStartDate)),
        end_date: nullableString(valueOf(els.editEndDate)),
        website: nullableString(valueOf(els.editWebsite)),
        image_url: nullableString(valueOf(els.editImageUrl)),
        lat: nullableNumber(valueOf(els.editLat)),
        lng: nullableNumber(valueOf(els.editLng)),
        source_label: nullableString(valueOf(els.editSourceLabel)),
        validated: Boolean(els.editValidated && els.editValidated.checked),
        rejected: Boolean(els.editRejected && els.editRejected.checked),
        featured: Boolean(els.editFeatured && els.editFeatured.checked),
        verified: Boolean(els.editVerified && els.editVerified.checked)
      };

      if (patch.validated && patch.rejected) {
        patch.rejected = false;
      }

      const cleanPatch = sanitizePatch(patch);

      if (!Object.keys(cleanPatch).length) {
        showMessage(els.editMessage, "warning", "Aucune colonne compatible à enregistrer.");
        return;
      }

      const { data, error } = await withTimeout(
        supabaseClient
          .from(TABLE_NAME)
          .update(cleanPatch)
          .eq("id", id)
          .select("id"),
        12000,
        "L’enregistrement prend trop de temps. Vérifie la connexion ou les règles Supabase."
      );

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(
          "Aucune ligne n’a été modifiée. Vérifie les règles RLS Supabase pour UPDATE sur la table events."
        );
      }

      state.events = state.events.map(function (eventItem) {
        if (String(eventItem.id) !== String(id)) return eventItem;
        return normalizeEvents([Object.assign({}, eventItem, cleanPatch)])[0];
      });

      applyFiltersAndRender();

      showMessage(els.editMessage, "success", "Événement enregistré.");
      showMessage(els.globalMessage, "success", "Événement enregistré.");

      setTimeout(closeEditModal, 450);
    } catch (error) {
      showMessage(els.editMessage, "error", getErrorMessage(error));
    } finally {
      setLoadingButton(event.submitter, false);
    }
  }

  function updateOptionalFieldAvailability() {
    const fieldMap = [
      ["description", els.editDescription],
      ["type", els.editType],
      ["region", els.editRegion],
      ["city", els.editCity],
      ["price", els.editPrice],
      ["start_date", els.editStartDate],
      ["end_date", els.editEndDate],
      ["website", els.editWebsite],
      ["image_url", els.editImageUrl],
      ["lat", els.editLat],
      ["lng", els.editLng],
      ["source_label", els.editSourceLabel],
      ["validated", els.editValidated],
      ["rejected", els.editRejected],
      ["featured", els.editFeatured],
      ["verified", els.editVerified]
    ];

    fieldMap.forEach(function (item) {
      const column = item[0];
      const element = item[1];

      if (!element) return;

      const isAvailable =
        state.availableColumns.has(column) &&
        !state.unavailableColumns.has(column);

      element.disabled = !isAvailable;

      const wrapper = element.closest(".field") || element.closest(".checkbox-card");

      if (wrapper) {
        wrapper.title = isAvailable ? "" : `Colonne "${column}" absente de la table events.`;
        wrapper.style.opacity = isAvailable ? "" : "0.55";
      }
    });
  }

  /* =========================================================
    MAP
  ========================================================= */

function switchView(viewName) {
  state.currentView = viewName;

  els.tabButtons.forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });

  if (els.viewList) els.viewList.classList.toggle("is-hidden", viewName !== "list");
  if (els.viewMap) els.viewMap.classList.toggle("is-hidden", viewName !== "map");
  if (els.viewTools) els.viewTools.classList.toggle("is-hidden", viewName !== "tools");

  if (viewName === "map") {
    requestAnimationFrame(function () {
      scheduleMapRender();
    });

    setTimeout(function () {
      if (state.map) state.map.invalidateSize(true);
    }, 300);

    setTimeout(function () {
      if (state.map) state.map.invalidateSize(true);
    }, 900);

    setTimeout(function () {
      if (state.map) state.map.invalidateSize(true);
    }, 1500);
  }
}

  function scheduleMapRender() {
    window.clearTimeout(scheduleMapRender._timer);

    scheduleMapRender._timer = window.setTimeout(function () {
      renderMap();
    }, 250);
  }

  function renderMap() {
    if (!els.adminMap) return;
    if (state.currentView !== "map") return;

    if (!window.L) {
      showMessage(els.globalMessage, "error", "Leaflet est introuvable.");
      return;
    }

    if (!state.map) {
      state.map = window.L.map(els.adminMap, {
        preferCanvas: true,
        zoomControl: true
      }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 2,
        attribution: "&copy; OpenStreetMap"
      }).addTo(state.map);

      state.markerLayer = window.L.layerGroup().addTo(state.map);
    }

    state.map.invalidateSize(false);
    state.markerLayer.clearLayers();

    const bounds = [];
    const missing = [];

    const eventsWithCoordinates = state.filteredEvents
      .filter(hasCoordinates)
      .sort(function (a, b) {
        const dateA = parseDate(a.start_date) || new Date("9999-12-31");
        const dateB = parseDate(b.start_date) || new Date("9999-12-31");
        return dateA - dateB;
      })
      .slice(0, MAX_MAP_MARKERS);

    state.filteredEvents.forEach(function (event) {
      if (!hasCoordinates(event)) {
        missing.push(event);
      }
    });

    eventsWithCoordinates.forEach(function (event) {
      const latLng = [event.lat, event.lng];
      bounds.push(latLng);

      const marker = window.L.circleMarker(latLng, {
        radius: 7,
        color: getMarkerColor(event),
        fillColor: getMarkerColor(event),
        fillOpacity: 0.82,
        weight: 1
      });

      marker.bindPopup(function () {
        return `
          <div class="admin-map-popup">
            <strong>${escapeHtml(event.title)}</strong>
            <small>${escapeHtml(event.city || "Ville inconnue")} · ${escapeHtml(event.region || "Région inconnue")}</small>
            <small>${escapeHtml(formatDateRange(event.start_date, event.end_date))}</small>
            <button type="button" data-map-edit-id="${escapeHtml(event.id)}">Modifier</button>
          </div>
        `;
      });

      marker.addTo(state.markerLayer);
    });

    state.map.off("popupopen");
    state.map.on("popupopen", function (popupEvent) {
      const popupElement = popupEvent.popup.getElement();
      if (!popupElement) return;

      const button = popupElement.querySelector("[data-map-edit-id]");
      if (!button) return;

      button.addEventListener("click", function () {
        const eventItem = findEventById(button.dataset.mapEditId);
        if (eventItem) openEditModal(eventItem);
      });
    });

    renderMissingCoordinates(missing);

    setTimeout(function () {
      if (!state.map) return;

      state.map.invalidateSize(false);

      if (bounds.length) {
        state.map.fitBounds(bounds, {
          padding: [28, 28],
          maxZoom: 11,
          animate: false
        });
      } else {
        state.map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, {
          animate: false
        });
      }
    }, 300);

    setTimeout(function () {
      if (state.map) {
        state.map.invalidateSize(false);
      }
    }, 900);

    if (state.filteredEvents.filter(hasCoordinates).length > MAX_MAP_MARKERS) {
      showMessage(
        els.globalMessage,
        "info",
        `Carte optimisée : seuls les ${MAX_MAP_MARKERS} premiers événements géolocalisés sont affichés. Utilise les filtres pour affiner.`
      );
    }
  }

  function renderMissingCoordinates(events) {
    if (!els.missingCoordinatesList) return;

    if (!events.length) {
      els.missingCoordinatesList.innerHTML = `
        <div class="empty-state">Tous les événements filtrés ont des coordonnées.</div>
      `;
      return;
    }

    els.missingCoordinatesList.innerHTML = events.map(function (event) {
      return `
        <button type="button" class="missing-item" data-action="edit" data-id="${escapeHtml(event.id)}">
          <strong>${escapeHtml(event.title)}</strong>
          <small>${escapeHtml(event.city || "Ville inconnue")} · ${escapeHtml(event.region || "Région inconnue")}</small>
        </button>
      `;
    }).join("");

    els.missingCoordinatesList.querySelectorAll("[data-action='edit']").forEach(function (button) {
      button.addEventListener("click", function () {
        const eventItem = findEventById(button.dataset.id);
        if (eventItem) openEditModal(eventItem);
      });
    });
  }

  function getMarkerColor(event) {
    const status = getEventStatus(event);

    if (status === "validated") return "#16803c";
    if (status === "rejected") return "#b42318";

    return "#ff6b35";
  }

  /* =========================================================
    CSV
  ========================================================= */

  function exportFilteredCsv() {
    if (!state.filteredEvents.length) {
      showMessage(els.globalMessage, "warning", "Aucun événement à exporter.");
      return;
    }

    const columns = [
      "id",
      "title",
      "type",
      "region",
      "city",
      "price",
      "start_date",
      "end_date",
      "website",
      "description",
      "image_url",
      "lat",
      "lng",
      "validated",
      "rejected",
      "featured",
      "verified",
      "source_label",
      "created_at"
    ].filter(function (column) {
      return state.availableColumns.has(column) || column === "id" || column === "title";
    });

    const rows = [
      columns.join(","),
      ...state.filteredEvents.map(function (event) {
        return columns.map(function (column) {
          return csvEscape(event[column]);
        }).join(",");
      })
    ];

    const csv = rows.join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `dedicalivres-events-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showMessage(els.globalMessage, "success", "Export CSV généré.");
  }

  function csvEscape(value) {
    if (value === null || value === undefined) return "";

    const stringValue = String(value).replace(/\r?\n|\r/g, " ").trim();
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  /* =========================================================
    INSTAGRAM
  ========================================================= */

  function populateInstagramSelect() {
    if (!els.instagramEventSelect) return;

    const previousValue = els.instagramEventSelect.value;

    els.instagramEventSelect.innerHTML = `
      <option value="">Choisir un événement</option>
    `;

    state.filteredEvents.forEach(function (event) {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = `${event.title} — ${event.city || "Ville inconnue"}`;
      els.instagramEventSelect.appendChild(option);
    });

    if (previousValue && findEventById(previousValue)) {
      els.instagramEventSelect.value = previousValue;
    }
  }

  function generateInstagramText() {
    const id = valueOf(els.instagramEventSelect);
    const event = findEventById(id);

    if (!event) {
      showMessage(els.globalMessage, "warning", "Choisis d’abord un événement.");
      return;
    }

    const dateText = formatDateRange(event.start_date, event.end_date);
    const city = event.city || "ville à préciser";
    const region = event.region || "région à préciser";
    const type = event.type || "événement littéraire";
    const price = event.price ? `\n💶 Tarif : ${event.price}` : "";
    const website = event.website ? `\n🔗 Infos : ${event.website}` : "";
    const description = event.description
      ? `\n\n${truncate(event.description, 420)}`
      : "";

    const text = [
      `📚 ${event.title}`,
      "",
      `Un ${type} à découvrir à ${city}, en ${region}.`,
      "",
      `📍 ${city}`,
      `📅 ${dateText}`,
      price,
      website,
      description,
      "",
      "À enregistrer, partager et ajouter à ton agenda ✨",
      "",
      "#dedicalivres #livres #lecture #auteurs #dedicace #salondulivre #litterature #sortielitteraire"
    ].filter(function (line) {
      return line !== null && line !== undefined;
    }).join("\n");

    if (els.instagramOutput) {
      els.instagramOutput.value = text.replace(/\n{3,}/g, "\n\n").trim();
    }

    showMessage(els.globalMessage, "success", "Texte Instagram généré.");
  }

  async function copyInstagramText() {
    const text = els.instagramOutput ? els.instagramOutput.value : "";

    if (!text) {
      showMessage(els.globalMessage, "warning", "Aucun texte Instagram à copier.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showMessage(els.globalMessage, "success", "Texte copié.");
    } catch (_error) {
      els.instagramOutput.focus();
      els.instagramOutput.select();

      showMessage(
        els.globalMessage,
        "warning",
        "Copie automatique impossible. Le texte est sélectionné, tu peux le copier manuellement."
      );
    }
  }

  /* =========================================================
    CONFIRM MODAL
  ========================================================= */

  function confirmAction(message, callback) {
    state.pendingConfirmAction = callback;

    if (els.confirmMessage) {
      els.confirmMessage.textContent = message;
    }

    if (els.confirmModal) {
      els.confirmModal.classList.remove("is-hidden");
    }
  }

  function closeConfirmModal() {
    if (!els.confirmModal) return;

    els.confirmModal.classList.add("is-hidden");
    state.pendingConfirmAction = null;
  }

  /* =========================================================
    HELPERS
  ========================================================= */

  function findEventById(id) {
    return state.events.find(function (event) {
      return String(event.id) === String(id);
    });
  }

  function getEventStatus(event) {
    if (event.rejected === true) return "rejected";
    if (event.validated === true) return "validated";
    return "pending";
  }

 function hasCoordinates(event) {
  if (!isFiniteNumber(event.lat) || !isFiniteNumber(event.lng)) return false;

  const lat = Number(event.lat);
  const lng = Number(event.lng);

  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function toBoolean(value) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  function nullableString(value) {
    const stringValue = safeString(value).trim();
    return stringValue ? stringValue : null;
  }

  function safeString(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function valueOf(element) {
    if (!element) return "";
    return safeString(element.value).trim();
  }

  function setValue(element, value) {
    if (!element) return;
    element.value = value === null || value === undefined ? "" : value;
  }

  function setChecked(element, value) {
    if (!element) return;
    element.checked = Boolean(value);
  }

  function setText(element, value) {
    if (!element) return;
    element.textContent = String(value);
  }

  function parseDate(value) {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfToday() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function toDateInputValue(value) {
    if (!value) return "";

    const stringValue = String(value);

    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
      return stringValue;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
  }

  function formatDateRange(startValue, endValue) {
    if (!startValue && !endValue) return "Date non renseignée";

    const start = formatDate(startValue);
    const end = formatDate(endValue);

    if (start && end && start !== end) {
      return `${start} → ${end}`;
    }

    return start || end || "Date non renseignée";
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function getTodayStartIso() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString();
  }

  function getLastSevenDaysStartIso() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 6);
    return start.toISOString();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value || 0));
  }

  function normalizeSearch(value) {
    return safeString(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort(function (a, b) {
      return a.localeCompare(b, "fr", { sensitivity: "base" });
    });
  }

  function truncate(value, maxLength) {
    const stringValue = safeString(value).trim();

    if (stringValue.length <= maxLength) return stringValue;

    return stringValue.slice(0, maxLength - 1).trim() + "…";
  }

  function escapeHtml(value) {
    return safeString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showMessage(element, type, message) {
    if (!element) return;

    element.textContent = message;
    element.className = `message-box is-visible ${type}`;

    if (element === els.globalMessage) {
      window.clearTimeout(showMessage._globalTimer);
      showMessage._globalTimer = window.setTimeout(function () {
        clearMessage(element);
      }, 6500);
    }
  }

  function clearMessage(element) {
    if (!element) return;

    element.textContent = "";
    element.className = "message-box";
  }

  function getErrorMessage(error) {
    if (!error) return "Une erreur inconnue est survenue.";

    const message = error.message || String(error);

    if (message.includes("Invalid login credentials")) {
      return "Identifiants invalides.";
    }

    if (
      message.includes("Email rate limit exceeded") ||
      message.includes("email rate limit exceeded") ||
      message.includes("rate limit")
    ) {
      return "Trop d’emails envoyés en peu de temps. Attends avant de redemander un lien.";
    }

    if (message.includes("JWT")) {
      return "Session expirée. Reconnecte-toi.";
    }

    if (message.includes("permission denied")) {
      return "Permission refusée. Vérifie les règles RLS Supabase.";
    }

    if (message.includes("row-level security")) {
      return "Action bloquée par les règles RLS Supabase. Vérifie les policies SELECT / UPDATE / DELETE.";
    }

    if (message.includes("Could not find") && message.includes("schema cache")) {
      return "Une colonne semble absente dans Supabase. Le code évite les colonnes indisponibles quand c’est possible.";
    }

    return message;
  }

  function isMissingColumnError(error) {
    if (!error) return false;

    const message = [
      error.message,
      error.details,
      error.hint,
      error.code
    ].filter(Boolean).join(" ");

    return (
      message.includes("Could not find") ||
      message.includes("schema cache") ||
      message.includes("column") ||
      message.includes("42703")
    );
  }

  function setLoadingButton(button, isLoading, loadingText) {
    if (!button) return;

    if (isLoading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }

      button.textContent = loadingText || "Chargement...";
      button.disabled = true;
      return;
    }

    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }

  function withTimeout(promise, timeoutMs, message) {
    let timeoutId;

    const timeoutPromise = new Promise(function (_resolve, reject) {
      timeoutId = window.setTimeout(function () {
        reject(new Error(message || "La requête a expiré."));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(function () {
      window.clearTimeout(timeoutId);
    });
  }

  function showFatalError(message) {
    document.body.innerHTML = `
      <div style="
        max-width: 720px;
        margin: 40px auto;
        padding: 24px;
        border-radius: 18px;
        background: #fff0ee;
        color: #b42318;
        font-family: system-ui, sans-serif;
        font-weight: 800;
        line-height: 1.5;
      ">
        ${escapeHtml(message)}
      </div>
    `;
  }
})();
