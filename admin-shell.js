"use strict";

(function createAdminShell() {
  const context =
    window.DEDICALIVRES_ADMIN_CONTEXT;

  const buttons =
    document.querySelectorAll("[data-view]");

  const panels =
    document.querySelectorAll("[data-view-panel]");

  const authGate =
    document.getElementById("v11-auth-gate");

  const loginForm =
    document.getElementById("v11-login-form");

  const loginFeedback =
    document.getElementById("v11-login-feedback");

  const refreshButton =
    document.getElementById("v11-refresh");

  const logoutButton =
    document.getElementById("v11-logout");

  const toastRegion =
    document.getElementById("v11-toast-region");

  const eventSearch =
    document.getElementById("v11-event-search");

  const eventStatusFilter =
    document.getElementById("v11-event-status-filter");

  const eventTypeFilter =
    document.getElementById("v11-event-type-filter");

  const eventQualityFilter =
    document.getElementById("v11-event-quality-filter");

  const eventRegistrationFilter =
    document.getElementById(
      "v11-event-registration-filter"
    );

  const eventsList =
    document.getElementById("v11-events-list");

  const eventsEmpty =
    document.getElementById("v11-events-empty");

  const eventsLoading =
    document.getElementById("v11-events-loading");

  const eventsVisibleCount =
    document.querySelector(
      "[data-events-visible-count]"
    );

  const eventsDebug =
    document.getElementById("v11-events-debug");

  if (!authGate) {
    console.error("V11 : auth gate absent du DOM");
  }

  if (!loginForm) {
    console.error("V11 : formulaire de connexion absent du DOM");
  }

  function openView(name) {
    panels.forEach((panel) => {
      panel.classList.toggle(
        "is-active",
        panel.dataset.viewPanel === name
      );
    });


  document
    .querySelectorAll("[data-quality-filter]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        if (!eventQualityFilter) return;

        eventQualityFilter.value =
          card.dataset.qualityFilter || "all";

        openView("events");

        const state = context.getState();

        renderEvents(
          state.events || [],
          state.status
        );
      });
    });

  communityTabs.forEach((button) => {
    button.addEventListener("click", () => {
      openCommunityView(
        button.dataset.communityView
      );
    });
  });

  [
    presenceSearch,
    presenceStatus,
    presenceType
  ].forEach((control) => {
    if (!control) return;

    const eventName =
      control.tagName === "INPUT"
        ? "input"
        : "change";

    control.addEventListener(eventName, () => {
      const state = context.getState();

      renderPresences(
        state.community
          ? state.community.presences || []
          : []
      );
    });
  });


  const toolCards =
    document.querySelectorAll("[data-tool-open]");

  const toolWorkspace =
    document.getElementById("v11-tool-workspace");

  const toolWorkspaceTitle =
    document.getElementById("v11-tool-workspace-title");

  const toolPlaceholder =
    document.getElementById("v11-tool-placeholder");

  const toolClose =
    document.getElementById("v11-tool-close");

  const toolLabels = {
    watch: "Auto-Matte / Veille",
    exports: "Exports",
    social: "Social",
    partners: "Widget partenaires",
    maintenance: "Maintenance"
  };

  const toolDescriptions = {
    watch:
      "Le module de veille existant sera remonté dans cet espace sans modifier son moteur.",
    exports:
      "Les exports existants seront reconnectés ici après validation de leur comportement V10.",
    social:
      "Le générateur social existant sera remonté ici sans modifier sa logique de production.",
    partners:
      "Le configurateur partenaires conservera son moteur actuel et recevra une présentation V11.",
    maintenance:
      "Cet espace regroupera les états système, sauvegardes et contrôles techniques."
  };

  function openToolWorkspace(name) {
    if (!toolWorkspace) return;

    toolWorkspace.hidden = false;

    if (toolWorkspaceTitle) {
      toolWorkspaceTitle.textContent =
        toolLabels[name] || "Outil";
    }

    const slotMap = {
      watch: "tab-watch",
      exports: "tab-exports",
      social: "tab-social",
      maintenance: "v11-maintenance-panel"
    };

    let activeSlot = null;

    document
      .querySelectorAll(".v11-legacy-slot")
      .forEach((slot) => {
        slot.hidden = true;
      });

    const targetId = slotMap[name];

    if (targetId) {
      activeSlot =
        document.getElementById(targetId);

      if (activeSlot) {
        activeSlot.hidden = false;
      }
    }

    if (toolPlaceholder) {
      toolPlaceholder.hidden =
        Boolean(activeSlot);

      toolPlaceholder.textContent =
        toolDescriptions[name] ||
        "Module en préparation.";
    }

    toolWorkspace.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  toolCards.forEach((card) => {
    card.addEventListener("click", () => {
      openToolWorkspace(
        card.dataset.toolOpen
      );
    });
  });

  if (toolClose) {
    toolClose.addEventListener("click", () => {
      if (toolWorkspace) {
        toolWorkspace.hidden = true;
      }
    });
  }

  // V11.44 community toolbar
  document
    .querySelectorAll("[data-community-view]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const view =
            button.dataset.communityView;

          syncV11CommunityToolbar(view);

          const state =
            context.getState();

          if (view === "testimonials") {
            renderTestimonials(
              state.community?.testimonials || []
            );
          }

          if (view === "presence") {
            renderPresences(
              state.community?.presences || []
            );
          }
        }
      );
    });

  if (testimonialTraceClear) {
    testimonialTraceClear.addEventListener(
      "click",
      function () {
        if (
          v11TestimonialModerationTrace.length ===
          0
        ) {
          return;
        }

        if (
          !window.confirm(
            "Vider le journal de cette session ?"
          )
        ) {
          return;
        }

        clearV11TestimonialTrace();
      }
    );
  }

  // V11.48 pending-only shortcut
  if (communityPendingOnly) {
    communityPendingOnly.addEventListener(
      "click",
      function () {
        if (presenceSearch) {
          presenceSearch.value = "";
        }

        if (presenceStatus) {
          presenceStatus.value =
            "pending";
        }

        if (presenceType) {
          presenceType.value =
            "all";
        }

        if (testimonialPhotoFilter) {
          testimonialPhotoFilter.value =
            "all";
        }

        const activeView =
          getV11ActiveCommunityView();

        const state =
          context.getState();

        if (
          activeView ===
          "testimonials"
        ) {
          renderTestimonials(
            state.community
              ?.testimonials || []
          );
        } else {
          renderPresences(
            state.community
              ?.presences || []
          );
        }
      }
    );
  }

  // V11.47 reset community filters
  if (communityResetFilters) {
    communityResetFilters.addEventListener(
      "click",
      function () {
        if (presenceSearch) {
          presenceSearch.value = "";
        }

        if (presenceStatus) {
          presenceStatus.value = "all";
        }

        if (presenceType) {
          presenceType.value = "all";
        }

        if (testimonialPhotoFilter) {
          testimonialPhotoFilter.value =
            "all";
        }

        const activeTab =
          document.querySelector(
            "[data-community-view].is-active"
          );

        const activeView =
          activeTab
            ?.dataset
            ?.communityView ||
          "presence";

        const state =
          context.getState();

        if (activeView === "testimonials") {
          renderTestimonials(
            state.community
              ?.testimonials || []
          );
        } else if (
          activeView === "presence"
        ) {
          renderPresences(
            state.community
              ?.presences || []
          );
        }

        updateV11CommunityActiveFilters(
          activeView
        );

        if (presenceSearch) {
          presenceSearch.focus();
        }
      }
    );
  }

  syncV11CommunityToolbar("presence");

  buttons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.view === name
      );
    });
  }

  function setBoundText(name, value) {
    document
      .querySelectorAll(
        '[data-admin-bind="' + name + '"]'
      )
      .forEach((element) => {
        element.textContent = value;
      });
  }

  function toast(message, kind = "ok") {
    if (!toastRegion) return;

    const item = document.createElement("div");

    item.className =
      "v11-toast " +
      (kind === "error"
        ? "is-error"
        : "is-ok");

    item.textContent = message;

    toastRegion.appendChild(item);

    window.setTimeout(() => {
      item.remove();
    }, 3200);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function isPastEvent(event) {
    const raw =
      event.end_date ||
      event.start_date ||
      "";

    if (!raw) return false;

    const date = new Date(
      String(raw).slice(0, 10) +
      "T00:00:00"
    );

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return date < today;
  }

  function eventTypeClass(type) {
    if (type === "Salon") {
      return "event-salon";
    }

    if (type === "Festival") {
      return "event-festival";
    }

    if (type === "Dédicace") {
      return "event-signing";
    }

    return "event-other";
  }

  function formatDate(value) {
    if (!value) {
      return "Date à confirmer";
    }

    const date = new Date(
      String(value).slice(0, 10) +
      "T00:00:00"
    );

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        day: "numeric",
        month: "short",
        year: "numeric"
      }
    ).format(date);
  }

  function getEventStatus(event) {
    if (event.rejected === true) {
      return {
        label: "Rejeté",
        className: "neutral"
      };
    }

    if (event.validated === true) {
      return {
        label:
          isPastEvent(event)
            ? "Passé"
            : "Validé",
        className: "ok"
      };
    }

    return {
      label: "À vérifier",
      className: "warning"
    };
  }

  function getFilteredEvents(events) {
    const query = normalize(
      eventSearch
        ? eventSearch.value
        : ""
    );

    const status =
      eventStatusFilter
        ? eventStatusFilter.value
        : "pending";

    const type =
      eventTypeFilter
        ? eventTypeFilter.value
        : "all";

    const quality =
      eventQualityFilter
        ? eventQualityFilter.value
        : "all";

    const registrationFilter =
      eventRegistrationFilter
        ? eventRegistrationFilter.value
        : "all";

    return events.filter((event) => {
      if (
        type !== "all" &&
        event.type !== type
      ) {
        return false;
      }

      if (
        status === "pending" &&
        (
          event.validated === true ||
          event.rejected === true
        )
      ) {
        return false;
      }

      if (
        status === "validated" &&
        event.validated !== true
      ) {
        return false;
      }

      if (
        status === "rejected" &&
        event.rejected !== true
      ) {
        return false;
      }

      if (
        status === "past" &&
        isPastEvent(event) === false
      ) {
        return false;
      }

      if (
        registrationFilter !== "all"
      ) {
        const registrationStatus =
          getV11RegistrationStatus(event);

        if (
          registrationFilter ===
          "disabled"
        ) {
          if (
            event.registration_enabled ===
            true
          ) {
            return false;
          }
        } else if (
          registrationFilter ===
          "missing-link"
        ) {
          if (
            event.registration_enabled !==
              true ||
            String(
              event.registration_url || ""
            ).trim()
          ) {
            return false;
          }
        } else {
          if (
            event.registration_enabled !==
              true ||
            registrationStatus?.key !==
              registrationFilter
          ) {
            return false;
          }
        }
      }

      if (quality !== "all") {
        const upcoming =
          event.validated === true &&
          event.rejected !== true &&
          isPastEvent(event) === false;

        if (quality === "missing-image") {
          if (
            !upcoming ||
            String(event.image_url || "").trim()
          ) {
            return false;
          }
        }

        if (quality === "missing-coords") {
          const lat = Number(event.lat);
          const lng = Number(event.lng);

          if (
            !upcoming ||
            (
              Number.isFinite(lat) &&
              Number.isFinite(lng)
            )
          ) {
            return false;
          }
        }

        if (quality === "missing-website") {
          if (
            !upcoming ||
            String(event.website || "").trim()
          ) {
            return false;
          }
        }

        if (quality === "soon") {
          if (!upcoming) return false;

          const raw =
            event.start_date ||
            event.end_date ||
            "";

          if (!raw) return false;

          const date = new Date(
            String(raw).slice(0, 10) +
            "T00:00:00"
          );

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const limit = new Date(today);
          limit.setDate(limit.getDate() + 14);

          if (
            Number.isNaN(date.getTime()) ||
            date < today ||
            date > limit
          ) {
            return false;
          }
        }

        if (quality === "featured-past") {
          if (
            event.featured !== true ||
            isPastEvent(event) === false
          ) {
            return false;
          }
        }
      }

      if (query) {
        const haystack = normalize(
          [
            event.title,
            event.city,
            event.region,
            event.country_code,
            event.type
          ].join(" ")
        );

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }

  function createEventCard(event) {
    const article =
      document.createElement("article");

    const typeClass =
      eventTypeClass(event.type);

    const status =
      getEventStatus(event);

    article.className =
      "v11-real-event-card " +
      typeClass;

    const main =
      document.createElement("div");

    main.className =
      "v11-real-event-main";

    const top =
      document.createElement("div");

    top.className =
      "v11-real-event-top";

    const typeBadge =
      document.createElement("span");

    typeBadge.className =
      "v11-type-badge " +
      typeClass;

    typeBadge.textContent =
      event.type || "Autre";

    top.appendChild(typeBadge);

    if (event.featured === true) {
      const featured =
        document.createElement("span");

      featured.className =
        "v11-mini-flag";

      featured.textContent =
        "Mis en avant";

      top.appendChild(featured);
    }

    const title =
      document.createElement("h3");

    title.textContent =
      event.title || "Sans titre";

    const meta =
      document.createElement("p");

    const location =
      [
        event.city,
        event.region
      ]
        .filter(Boolean)
        .join(" · ");

    meta.textContent =
      formatDate(event.start_date) +
      (
        location
          ? " · " + location
          : ""
      );

    main.appendChild(top);
    main.appendChild(title);
    main.appendChild(meta);

    const side =
      document.createElement("div");

    side.className =
      "v11-real-event-side";

    const statusBadge =
      document.createElement("span");

    statusBadge.className =
      "v11-chip " +
      status.className;

    statusBadge.textContent =
      status.label;

    const id =
      document.createElement("small");

    id.textContent =
      "#" + String(event.id || "");

    side.appendChild(statusBadge);

    if (event.registration_enabled === true) {
      const registrationStatus =
        getV11RegistrationStatus(event);

      const registrationBadge =
        document.createElement("span");

      registrationBadge.className =
        "v11-registration-card-chip " +
        "is-" +
        (
          registrationStatus?.key ||
          "info"
        );

      registrationBadge.textContent =
        registrationStatus?.shortLabel ||
        registrationStatus?.label ||
        "Inscriptions";

      if (
        !String(
          event.registration_url || ""
        ).trim() &&
        [
          "open",
          "last-days"
        ].includes(
          registrationStatus?.key
        )
      ) {
        registrationBadge.classList.add(
          "is-missing-link"
        );

        registrationBadge.title =
          "Inscriptions actives mais lien manquant";
      }

      side.appendChild(
        registrationBadge
      );
    }

    side.appendChild(id);

    article.appendChild(main);
    article.appendChild(side);


    const detailButton =
      document.createElement("button");

    detailButton.type = "button";
    detailButton.className =
      "v11-event-detail-trigger";

    detailButton.textContent =
      "Détails";

    detailButton.dataset.eventDetail =
      String(event.id);

    side.appendChild(detailButton);

    return article;
  }


  let selectedV11EventId = null;
  let v11EventActionRunning = false;

  const eventDetail =
    document.getElementById("v11-event-detail");

  const eventDetailTitle =
    document.getElementById("v11-event-detail-title");

  const eventDetailContent =
    document.getElementById("v11-event-detail-content");

  const eventDetailClose =
    document.getElementById("v11-event-detail-close");

  const eventPublicLink =
    document.getElementById("v11-event-public-link");

  const eventValidateButton =
    document.getElementById("v11-event-validate");

  const eventRejectButton =
    document.getElementById("v11-event-reject");

  const eventFeaturedButton =
    document.getElementById("v11-event-featured");

  const eventDeleteButton =
    document.getElementById("v11-event-delete");

  const eventEditButton =
    document.getElementById("v11-event-edit");

  const eventEditor =
    document.getElementById("v11-event-editor");

  const eventEditorTitle =
    document.getElementById("v11-event-editor-title");

  const eventEditorClose =
    document.getElementById("v11-event-editor-close");

  const eventEditorForm =
    document.getElementById("v11-event-editor-form");

  const editCancel =
    document.getElementById("v11-edit-cancel");

  const editSave =
    document.getElementById("v11-edit-save");

  const editTitle =
    document.getElementById("v11-edit-title");

  const editType =
    document.getElementById("v11-edit-type");

  const editCountry =
    document.getElementById("v11-edit-country");

  const editCity =
    document.getElementById("v11-edit-city");

  const editRegion =
    document.getElementById("v11-edit-region");

  const editStart =
    document.getElementById("v11-edit-start");

  const editEnd =
    document.getElementById("v11-edit-end");

  const editWebsite =
    document.getElementById("v11-edit-website");

  const editLat =
    document.getElementById("v11-edit-lat");

  const editLng =
    document.getElementById("v11-edit-lng");

  const editImage =
    document.getElementById("v11-edit-image");

  const editImagePreview =
    document.getElementById("v11-edit-image-preview");

  const editImageEmpty =
    document.getElementById("v11-edit-image-empty");

  const editDescription =
    document.getElementById("v11-edit-description");

  const editRegistration =
    document.getElementById("v11-edit-registration");

  const editRegistrationEnabled =
    document.getElementById("v11-edit-registration-enabled");

  const editRegistrationOpen =
    document.getElementById("v11-edit-registration-open");

  const editRegistrationDeadline =
    document.getElementById("v11-edit-registration-deadline");

  const editRegistrationUrl =
    document.getElementById("v11-edit-registration-url");

  const editRegistrationAudienceInputs =
    document.querySelectorAll(
      "[data-v11-registration-audience]"
    );

  const editRegistrationNote =
    document.getElementById("v11-edit-registration-note");

  const editRegistrationStatus =
    document.getElementById("v11-edit-registration-status");

  function renderEventDetail(event) {
    if (!eventDetail || !eventDetailContent || !event) {
      return;
    }

    eventDetail.hidden = false;
    selectedV11EventId = String(event.id);

    if (eventValidateButton) {
      eventValidateButton.disabled =
        v11EventActionRunning ||
        (
          event.validated === true &&
          event.rejected !== true
        );
    }

    if (eventRejectButton) {
      eventRejectButton.disabled =
        v11EventActionRunning ||
        event.rejected === true;
    }

    if (eventFeaturedButton) {
      eventFeaturedButton.disabled =
        v11EventActionRunning ||
        event.rejected === true;

      eventFeaturedButton.textContent =
        event.featured === true
          ? "Retirer la mise en avant"
          : "Mettre en avant";
    }

    if (eventDeleteButton) {
      eventDeleteButton.disabled =
        v11EventActionRunning ||
        event.rejected !== true;
    }

    if (eventDetailTitle) {
      eventDetailTitle.textContent =
        event.title || "Événement";
    }

    eventDetailContent.replaceChildren();

    const lat = Number(event.lat);
    const lng = Number(event.lng);

    const hasCoords =
      Number.isFinite(lat) &&
      Number.isFinite(lng);

    const rows = [
      ["Type", event.type],
      ["Ville", event.city],
      ["Région", event.region],
      ["Début", event.start_date],
      ["Fin", event.end_date],
      ["Site officiel", event.website],
      ["Image", event.image_url ? "Présente" : "Absente"],
      [
        "Coordonnées",
        hasCoords
          ? String(event.lat) + ", " + String(event.lng)
          : "Absentes"
      ],
      [
        "Statut",
        event.rejected === true
          ? "Rejeté"
          : event.validated === true
            ? "Validé"
            : "À vérifier"
      ],
      ["Mise en avant", event.featured === true ? "Oui" : "Non"],
      ["Vérifié", event.verified === true ? "Oui" : "Non"]
    ];

    if (
      event.type === "Salon" ||
      event.type === "Festival"
    ) {
      const registrationStatus =
        getV11RegistrationStatus(event);

      rows.push(
        [
          "Inscriptions",
          event.registration_enabled === true
            ? "Activées"
            : "Non activées"
        ]
      );

      if (
        event.registration_enabled === true
      ) {
        rows.push(
          [
            "État inscriptions",
            registrationStatus?.label ||
            "Informations à vérifier"
          ],
          [
            "Ouverture inscriptions",
            event.registration_open_date
          ],
          [
            "Date limite inscriptions",
            event.registration_deadline
          ],
          [
            "Lien inscription",
            event.registration_url
          ],
          [
            "Profils concernés",
            v11RegistrationAudienceLabel(
              event.registration_audience
            )
          ],
          [
            "État forcé",
            event.registration_force_status
          ],
          [
            "Note inscriptions",
            event.registration_note
          ]
        );
      }
    }

    rows.push(
      ["Identifiant", event.id]
    );

    rows.forEach(function (entry) {
      const row =
        document.createElement("div");

      row.className =
        "v11-event-detail-row";

      const key =
        document.createElement("span");

      key.textContent = entry[0];

      const value =
        document.createElement("strong");

      value.textContent =
        entry[1] == null || entry[1] === ""
          ? "Non renseigné"
          : String(entry[1]);

      row.appendChild(key);
      row.appendChild(value);

      eventDetailContent.appendChild(row);
    });

    if (eventPublicLink) {
      eventPublicLink.href =
        "event.html?id=" +
        encodeURIComponent(event.id);
    }

    eventDetail.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  if (eventDetailClose) {
    eventDetailClose.addEventListener(
      "click",
      function () {
        eventDetail.hidden = true;
      }
    );
  }


  document.addEventListener(
    "click",
    function (clickEvent) {
      const button =
        clickEvent.target.closest(
          "[data-event-detail]"
        );

      if (!button) {
        return;
      }

      const state =
        context.getState();

      const selected =
        (state.events || []).find(
          function (item) {
            return (
              String(item.id) ===
              String(
                button.dataset.eventDetail
              )
            );
          }
        );

      if (selected) {
        renderEventDetail(selected);
      }
    }
  );


  function getSelectedV11Event() {
    if (!selectedV11EventId) return null;

    const state = context.getState();

    return (state.events || []).find(
      function (event) {
        return String(event.id) === String(selectedV11EventId);
      }
    ) || null;
  }

  function setV11EventActionsBusy(busy) {
    v11EventActionRunning = busy;

    [
      eventValidateButton,
      eventRejectButton,
      eventFeaturedButton,
      eventDeleteButton
    ].forEach(function (button) {
      if (button) button.disabled = busy;
    });
  }

  function v11ActionMessage(message) {
    const region =
      document.getElementById("v11-toast-region");

    if (!region) {
      console.info(message);
      return;
    }

    const toast =
      document.createElement("div");

    toast.className =
      "v11-action-toast";

    toast.textContent = message;

    region.appendChild(toast);

    window.setTimeout(function () {
      toast.remove();
    }, 3200);
  }

  function duplicateSummary(matches) {
    return matches
      .slice(0, 6)
      .map(function (match, index) {
        const existing =
          match.event || {};

        const level =
          window.DEDICALIVRES_DUPLICATES
          && window.DEDICALIVRES_DUPLICATES.LEVELS
          && window.DEDICALIVRES_DUPLICATES.LEVELS[match.level]
          ? window.DEDICALIVRES_DUPLICATES.LEVELS[match.level].label
          : match.level || "Doublon potentiel";

        const date =
          existing.start_date
            ? String(existing.start_date).slice(0, 10)
            : "date inconnue";

        return (
          String(index + 1)
          + ". "
          + level
          + " · "
          + String(Math.round(Number(match.score || 0)))
          + "%\n"
          + (existing.title || "Sans titre")
          + "\n"
          + [date, existing.city]
              .filter(Boolean)
              .join(" · ")
        );
      })
      .join("\n\n");
  }

  async function checkV11Duplicates(event) {
    const detector =
      window.DEDICALIVRES_DUPLICATES;

    const client =
      context.getClient();

    if (!detector || !client) {
      return window.confirm(
        "Le contrôle des doublons est indisponible.\n\n"
        + "Valider tout de même cet événement ?"
      );
    }

    try {
      v11ActionMessage(
        "Analyse des doublons…"
      );

      const matches =
        await detector.findMatches(
          client,
          event,
          {
            excludeId: event.id,
            limit: 250
          }
        );

      if (!matches.length) {
        return true;
      }

      return window.confirm(
        "VÉRIFICATION OBLIGATOIRE AVANT VALIDATION\n\n"
        + "Cette fiche ressemble à "
        + String(matches.length)
        + " événement(s) existant(s).\n\n"
        + duplicateSummary(matches)
        + "\n\nValider malgré cette alerte ?"
      );
    } catch (error) {
      console.warn(
        "Contrôle doublon V11 indisponible",
        error
      );

      return window.confirm(
        "Le contrôle des doublons est momentanément indisponible.\n\n"
        + "Valider tout de même cet événement ?"
      );
    }
  }

  async function refreshV11AfterEventAction(id) {
    await context.refresh();

    const state =
      context.getState();

    const refreshed =
      (state.events || []).find(
        function (event) {
          return String(event.id) === String(id);
        }
      );

    if (refreshed) {
      renderEventDetail(refreshed);
    } else if (eventDetail) {
      eventDetail.hidden = true;
      selectedV11EventId = null;
    }
  }

  async function runV11EventAction(action) {
    if (v11EventActionRunning) return;

    const state =
      context.getState();

    if (state.authenticated !== true) {
      window.alert(
        "Session admin absente."
      );
      return;
    }

    const client =
      context.getClient();

    const event =
      getSelectedV11Event();

    if (!client || !event) {
      window.alert(
        "Événement ou client Supabase indisponible."
      );
      return;
    }

    setV11EventActionsBusy(true);

    try {
      if (action === "validate") {
        try {
          if (
            event.registration_enabled ===
            true
          ) {
            validateV11RegistrationPayload(
              event
            );
          }
        } catch (error) {
          window.alert(
            "INSCRIPTIONS À CORRIGER AVANT VALIDATION\n\n" +
            (
              error?.message ||
              "Informations d’inscription invalides."
            )
          );

          v11ActionMessage(
            "Validation bloquée : inscriptions à corriger."
          );

          return;
        }

        const approved =
          await checkV11Duplicates(event);

        if (!approved) {
          v11ActionMessage(
            "Validation annulée."
          );
          return;
        }

        const response =
          await client
            .from("events")
            .update({
              validated: true,
              rejected: false
            })
            .eq("id", event.id);

        if (response.error) {
          throw response.error;
        }

        v11ActionMessage(
          "Événement validé."
        );

        await refreshV11AfterEventAction(
          event.id
        );

        return;
      }

      if (action === "reject") {
        const confirmed =
          window.confirm(
            "Rejeter cet événement ?\n\n"
            + (event.title || "Sans titre")
          );

        if (!confirmed) return;

        const response =
          await client
            .from("events")
            .update({
              rejected: true,
              validated: false
            })
            .eq("id", event.id);

        if (response.error) {
          throw response.error;
        }

        v11ActionMessage(
          "Événement rejeté."
        );

        await refreshV11AfterEventAction(
          event.id
        );

        return;
      }

      if (action === "featured") {
        const nextValue =
          event.featured !== true;

        const response =
          await client
            .from("events")
            .update({
              featured: nextValue
            })
            .eq("id", event.id);

        if (response.error) {
          throw response.error;
        }

        v11ActionMessage(
          nextValue
            ? "Événement mis en avant."
            : "Mise en avant retirée."
        );

        await refreshV11AfterEventAction(
          event.id
        );

        return;
      }

      if (action === "delete") {
        if (event.rejected !== true) {
          window.alert(
            "Suppression réservée aux événements refusés."
          );
          return;
        }

        const confirmed =
          window.confirm(
            "Supprimer définitivement l’événement refusé :\n\n"
            + (event.title || "Sans titre")
            + "\n\nCette action est irréversible."
          );

        if (!confirmed) {
          return;
        }

        const response =
          await client
            .from("events")
            .delete()
            .eq("id", event.id)
            .eq("rejected", true);

        if (response.error) {
          throw response.error;
        }

        v11ActionMessage(
          "Événement refusé supprimé."
        );

        selectedV11EventId = null;

        if (eventDetail) {
          eventDetail.hidden = true;
        }

        if (eventEditor) {
          eventEditor.hidden = true;
        }

        await context.refresh();

        return;
      }
    } catch (error) {
      console.error(
        "Action événement V11 impossible",
        error
      );

      window.alert(
        "Action impossible.\n\n"
        + (
          error && error.message
            ? error.message
            : "Erreur Supabase"
        )
      );
    } finally {
      setV11EventActionsBusy(false);

      const current =
        getSelectedV11Event();

      if (current) {
        renderEventDetail(current);
      }
    }
  }

  if (eventValidateButton) {
    eventValidateButton.addEventListener(
      "click",
      function () {
        runV11EventAction("validate");
      }
    );
  }

  if (eventRejectButton) {
    eventRejectButton.addEventListener(
      "click",
      function () {
        runV11EventAction("reject");
      }
    );
  }

  if (eventFeaturedButton) {
    eventFeaturedButton.addEventListener(
      "click",
      function () {
        runV11EventAction("featured");
      }
    );
  }

  if (eventDeleteButton) {
    eventDeleteButton.addEventListener(
      "click",
      function () {
        runV11EventAction("delete");
      }
    );
  }


  function isoInputDate(value) {
    const raw =
      String(value || "").trim();

    return /^\d{4}-\d{2}-\d{2}/.test(raw)
      ? raw.slice(0, 10)
      : "";
  }

  const V11_REGISTRATION_AUDIENCE = new Set([
    "author",
    "artist_author",
    "hybrid",
    "publisher"
  ]);

  const V11_REGISTRATION_FORCE_STATUS = new Set([
    "complet",
    "cloture",
    "annule"
  ]);

  function normalizeV11RegistrationAudience(value) {
    const values =
      Array.isArray(value)
        ? value
        : [];

    return [
      ...new Set(
        values.filter(function (item) {
          return V11_REGISTRATION_AUDIENCE.has(
            String(item || "")
          );
        })
      )
    ];
  }

  function v11RegistrationAudienceLabel(value) {
    const helper =
      window.DEDICALIVRES_REGISTRATION;

    if (
      helper &&
      typeof helper.getAudienceLabels ===
        "function"
    ) {
      return helper
        .getAudienceLabels(value)
        .join(", ");
    }

    const labels = {
      author: "Auteurs",
      artist_author: "Artistes-auteurs",
      hybrid: "Profils hybrides",
      publisher: "Maisons d’édition"
    };

    return normalizeV11RegistrationAudience(
      value
    )
      .map(function (item) {
        return labels[item] || item;
      })
      .join(", ");
  }

  function getV11RegistrationStatus(event) {
    const helper =
      window.DEDICALIVRES_REGISTRATION;

    if (
      !helper ||
      typeof helper.getStatus !== "function"
    ) {
      return null;
    }

    return helper.getStatus(event);
  }

  function validateV11RegistrationPayload(
    payload
  ) {
    if (
      !payload ||
      payload.registration_enabled !== true
    ) {
      return;
    }

    const audience =
      normalizeV11RegistrationAudience(
        payload.registration_audience
      );

    if (!audience.length) {
      throw new Error(
        "Sélectionne au moins un profil pouvant s’inscrire."
      );
    }

    const openDate =
      payload.registration_open_date;

    const deadline =
      payload.registration_deadline;

    if (
      openDate &&
      deadline &&
      openDate > deadline
    ) {
      throw new Error(
        "La date d’ouverture doit précéder ou être identique à la date limite."
      );
    }

    const url =
      String(
        payload.registration_url || ""
      ).trim();

    if (
      url &&
      !/^https?:\/\//i.test(url)
    ) {
      throw new Error(
        "Le lien d’inscription doit commencer par http:// ou https://."
      );
    }

    const forcedStatus =
      payload.registration_force_status;

    if (
      forcedStatus &&
      !V11_REGISTRATION_FORCE_STATUS.has(
        forcedStatus
      )
    ) {
      throw new Error(
        "Statut forcé d’inscription invalide."
      );
    }

    if (
      !openDate &&
      !deadline &&
      !url &&
      !forcedStatus
    ) {
      throw new Error(
        "Indique au moins une date, un lien ou un état d’inscription."
      );
    }
  }

  function renderV11EditImage(url) {
    const value =
      String(url || "").trim();

    if (!editImagePreview || !editImageEmpty) {
      return;
    }

    if (!value) {
      editImagePreview.hidden = true;
      editImagePreview.removeAttribute("src");
      editImageEmpty.hidden = false;
      return;
    }

    editImagePreview.src = value;
    editImagePreview.hidden = false;
    editImageEmpty.hidden = true;
  }

  function updateRegistrationVisibility() {
    if (!editRegistration || !editType) {
      return;
    }

    const eligible =
      editType.value === "Salon" ||
      editType.value === "Festival";

    editRegistration.hidden =
      !eligible;
  }

  function openV11EventEditor(event) {
    if (!event || !eventEditor) {
      return;
    }

    eventEditor.hidden = false;

    if (eventEditorTitle) {
      eventEditorTitle.textContent =
        "Modifier · " +
        (event.title || "Sans titre");
    }

    if (editTitle) {
      editTitle.value =
        event.title || "";
    }

    if (editType) {
      editType.value =
        event.type || "Autre";
    }

    if (editCountry) {
      editCountry.value =
        event.country_code || "FR";
    }

    if (editCity) {
      editCity.value =
        event.city || "";
    }

    if (editRegion) {
      editRegion.value =
        event.region || "";
    }

    if (editStart) {
      editStart.value =
        isoInputDate(event.start_date);
    }

    if (editEnd) {
      editEnd.value =
        isoInputDate(event.end_date);
    }

    if (editWebsite) {
      editWebsite.value =
        event.website || "";
    }

    if (editLat) {
      editLat.value =
        event.lat == null
          ? ""
          : String(event.lat);
    }

    if (editLng) {
      editLng.value =
        event.lng == null
          ? ""
          : String(event.lng);
    }

    if (editImage) {
      editImage.value =
        event.image_url || "";
    }

    renderV11EditImage(
      event.image_url
    );

    if (editDescription) {
      editDescription.value =
        event.description || "";
    }

    if (editRegistrationEnabled) {
      editRegistrationEnabled.checked =
        event.registration_enabled === true;
    }

    if (editRegistrationOpen) {
      editRegistrationOpen.value =
        isoInputDate(
          event.registration_open_date
        );
    }

    if (editRegistrationDeadline) {
      editRegistrationDeadline.value =
        isoInputDate(
          event.registration_deadline
        );
    }

    if (editRegistrationUrl) {
      editRegistrationUrl.value =
        event.registration_url || "";
    }

    const registrationAudience =
      normalizeV11RegistrationAudience(
        event.registration_audience
      );

    editRegistrationAudienceInputs
      .forEach(function (input) {
        input.checked =
          registrationAudience.includes(
            input.value
          );
      });

    if (editRegistrationNote) {
      editRegistrationNote.value =
        event.registration_note || "";
    }

    if (editRegistrationStatus) {
      editRegistrationStatus.value =
        event.registration_force_status || "";
    }

    updateRegistrationVisibility();

    eventEditor.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function closeV11EventEditor() {
    if (eventEditor) {
      eventEditor.hidden = true;
    }
  }

  if (eventEditButton) {
    eventEditButton.addEventListener(
      "click",
      function () {
        const event =
          getSelectedV11Event();

        if (event) {
          openV11EventEditor(event);
        }
      }
    );
  }

  if (eventEditorClose) {
    eventEditorClose.addEventListener(
      "click",
      closeV11EventEditor
    );
  }

  if (editCancel) {
    editCancel.addEventListener(
      "click",
      closeV11EventEditor
    );
  }

  if (editType) {
    editType.addEventListener(
      "change",
      updateRegistrationVisibility
    );
  }

  if (editImage) {
    editImage.addEventListener(
      "input",
      function () {
        renderV11EditImage(
          editImage.value
        );
      }
    );
  }

  if (eventEditorForm) {
    eventEditorForm.addEventListener(
      "submit",
      function (event) {
        event.preventDefault();
        saveV11EventEdition();
      }
    );
  }


  function isV11MissingColumnError(error) {
    const code =
      String(error?.code || "");

    const message =
      String(error?.message || "").toLowerCase();

    return (
      code === "42703" ||
      code === "PGRST204" ||
      message.includes("column") ||
      message.includes("schema cache")
    );
  }

  function cleanV11Value(value) {
    const text =
      String(value || "").trim();

    return text || null;
  }

  function buildV11RegistrationPayload() {
    const eligible =
      editType &&
      (
        editType.value === "Salon" ||
        editType.value === "Festival"
      );

    const enabled =
      eligible &&
      Boolean(
        editRegistrationEnabled?.checked
      );

    if (!enabled) {
      return {
        registration_enabled: false,
        registration_open_date: null,
        registration_deadline: null,
        registration_url: null,
        registration_audience: [],
        registration_note: null,
        registration_force_status: null
      };
    }

    const audience =
      normalizeV11RegistrationAudience(
        Array.from(
          editRegistrationAudienceInputs
        )
          .filter(function (input) {
            return input.checked;
          })
          .map(function (input) {
            return input.value;
          })
      );

    const payload = {
      registration_enabled: true,

      registration_open_date:
        cleanV11Value(
          editRegistrationOpen?.value
        ),

      registration_deadline:
        cleanV11Value(
          editRegistrationDeadline?.value
        ),

      registration_url:
        cleanV11Value(
          editRegistrationUrl?.value
        ),

      registration_audience:
        audience,

      registration_note:
        cleanV11Value(
          editRegistrationNote?.value
        ),

      registration_force_status:
        V11_REGISTRATION_FORCE_STATUS.has(
          String(
            editRegistrationStatus?.value ||
            ""
          )
        )
          ? editRegistrationStatus.value
          : null
    };

    validateV11RegistrationPayload(
      payload
    );

    return payload;
  }

  function buildV11EventEditPayload() {
    const latText =
      String(editLat?.value || "").trim();

    const lngText =
      String(editLng?.value || "").trim();

    const lat =
      latText === ""
        ? null
        : Number(latText);

    const lng =
      lngText === ""
        ? null
        : Number(lngText);

    if (
      latText !== "" &&
      !Number.isFinite(lat)
    ) {
      throw new Error(
        "Latitude invalide."
      );
    }

    if (
      lngText !== "" &&
      !Number.isFinite(lng)
    ) {
      throw new Error(
        "Longitude invalide."
      );
    }

    const title =
      String(
        editTitle?.value || ""
      ).trim();

    if (!title) {
      throw new Error(
        "Le titre est obligatoire."
      );
    }

    const payload = {
      title: title,

      type:
        editType?.value || "Autre",

      country_code:
        editCountry?.value || "FR",

      city:
        String(
          editCity?.value || ""
        ).trim(),

      region:
        String(
          editRegion?.value || ""
        ).trim(),

      start_date:
        cleanV11Value(
          editStart?.value
        ),

      end_date:
        cleanV11Value(
          editEnd?.value
        ),

      website:
        String(
          editWebsite?.value || ""
        ).trim(),

      description:
        String(
          editDescription?.value || ""
        ).trim(),

      image_url:
        cleanV11Value(
          editImage?.value
        ),

      lat: lat,
      lng: lng
    };

    Object.assign(
      payload,
      buildV11RegistrationPayload()
    );

    return payload;
  }

  async function saveV11EventEdition() {
    if (v11EventActionRunning) {
      return;
    }

    const state =
      context.getState();

    if (
      state.authenticated !== true
    ) {
      window.alert(
        "Session admin absente."
      );
      return;
    }

    const event =
      getSelectedV11Event();

    const client =
      context.getClient();

    if (!event || !client) {
      window.alert(
        "Événement ou client Supabase indisponible."
      );
      return;
    }

    let payload;

    try {
      payload =
        buildV11EventEditPayload();
    } catch (error) {
      window.alert(
        error?.message ||
        "Formulaire invalide."
      );
      return;
    }

    const confirmed =
      window.confirm(
        "Enregistrer les modifications de cet événement ?\n\n" +
        (event.title || "Sans titre")
      );

    if (!confirmed) {
      return;
    }

    v11EventActionRunning = true;

    if (editSave) {
      editSave.disabled = true;
      editSave.textContent =
        "Enregistrement…";
    }

    try {
      let response =
        await client
          .from("events")
          .update(payload)
          .eq("id", event.id);

      if (
        response.error &&
        isV11MissingColumnError(
          response.error
        )
      ) {
        const legacyPayload = {
          ...payload
        };

        Object.keys(
          legacyPayload
        )
          .filter(function (key) {
            return key.startsWith(
              "registration_"
            );
          })
          .forEach(function (key) {
            delete legacyPayload[key];
          });

        response =
          await client
            .from("events")
            .update(legacyPayload)
            .eq("id", event.id);
      }

      if (response.error) {
        throw response.error;
      }

      v11ActionMessage(
        "Événement modifié."
      );

      closeV11EventEditor();

      await refreshV11AfterEventAction(
        event.id
      );

    } catch (error) {
      console.error(
        "Erreur édition événement V11",
        error
      );

      window.alert(
        "Enregistrement impossible.\n\n" +
        (
          error?.message ||
          "Erreur Supabase"
        )
      );

    } finally {
      v11EventActionRunning = false;

      if (editSave) {
        editSave.disabled = false;
        editSave.textContent =
          "Enregistrer";
      }
    }
  }

function renderEvents(events, status) {
    if (!eventsList) return;

    const loading =
      status === "loading" ||
      status === "booting";

    if (eventsLoading) {
      if (loading) {
        eventsLoading.hidden = false;
        eventsLoading.textContent =
          "Chargement des événements...";
      } else if (status === "error") {
        eventsLoading.hidden = false;
        eventsLoading.textContent =
          "Chargement impossible.";
      } else {
        eventsLoading.hidden = true;
      }
    }

    if (loading || status === "error") {
      if (eventsVisibleCount) {
        eventsVisibleCount.textContent = "0";
      }

      return;
    }

    const filtered =
      getFilteredEvents(events);

    eventsList.replaceChildren();

    filtered
      .slice(0, 150)
      .forEach((event) => {
        eventsList.appendChild(
          createEventCard(event)
        );
      });

    if (eventsVisibleCount) {
      eventsVisibleCount.textContent =
        String(filtered.length);
    }

    if (eventsEmpty) {
      eventsEmpty.hidden =
        filtered.length !== 0;
    }
  }


  const priorityList =
    document.getElementById("v11-priority-list");

  const topPages =
    document.getElementById("v11-top-pages");

  const topReferrers =
    document.getElementById("v11-top-referrers");

  function renderPriority(events) {
    if (!priorityList) return;

    const pending = events.filter((event) => {
      return event.validated === false && event.rejected === false;
    });

    priorityList.replaceChildren();

    if (pending.length === 0) {
      const empty = document.createElement("div");
      empty.className = "v11-priority-empty";
      empty.innerHTML =
        "<strong>Aucun événement en attente</strong>" +
        "<span>La file de modération est à jour.</span>";

      priorityList.appendChild(empty);
      return;
    }

    pending.slice(0, 5).forEach((event) => {
      priorityList.appendChild(
        createEventCard(event)
      );
    });
  }

  function renderRanking(container, items) {
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(items) || items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "v11-inline-status";
      empty.textContent = "Aucune donnée disponible.";
      container.appendChild(empty);
      return;
    }

    const max = Math.max(...items.map((item) => item.value), 1);

    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "v11-ranking-row";

      const info = document.createElement("div");
      info.className = "v11-ranking-info";

      const rank = document.createElement("span");
      rank.className = "v11-ranking-rank";
      rank.textContent = String(index + 1).padStart(2, "0");

      const label = document.createElement("strong");
      label.textContent = item.label;

      info.appendChild(rank);
      info.appendChild(label);

      const meter = document.createElement("div");
      meter.className = "v11-ranking-meter";

      const fill = document.createElement("span");
      fill.style.width =
        String(Math.max(4, Math.round((item.value / max) * 100))) + "%";

      meter.appendChild(fill);

      const value = document.createElement("span");
      value.className = "v11-ranking-value";
      value.textContent = String(item.value);

      row.appendChild(info);
      row.appendChild(meter);
      row.appendChild(value);

      container.appendChild(row);
    });
  }


  const communityTabs =
    document.querySelectorAll("[data-community-view]");

  const presenceSearch =
    document.getElementById("v11-presence-search");

  const presenceStatus =
    document.getElementById("v11-presence-status");

  const presenceType =
    document.getElementById("v11-presence-type");

  const testimonialPhotoFilter =
    document.getElementById(
      "v11-testimonial-photo"
    );

  const testimonialPhotoField =
    document.getElementById(
      "v11-testimonial-photo-field"
    );


  const communityResetFilters =
    document.getElementById(
      "v11-community-reset-filters"
    );

  const communityResultsCount =
    document.getElementById(
      "v11-community-results-count"
    );


  const communityPendingOnly =
    document.getElementById(
      "v11-community-pending-only"
    );

  const communityActiveFilters =
    document.getElementById(
      "v11-community-active-filters"
    );


  const communityStatusSummaryTitle =
    document.getElementById(
      "v11-community-status-summary-title"
    );

  const communityStatusSummaryDetail =
    document.getElementById(
      "v11-community-status-summary-detail"
    );

  const communityTabPresenceCount =
    document.getElementById(
      "v11-tab-presence-count"
    );

  const communityTabAuthorsCount =
    document.getElementById(
      "v11-tab-authors-count"
    );

  const communityTabTestimonialsCount =
    document.getElementById(
      "v11-tab-testimonials-count"
    );

  const presenceTypeField =
    presenceType
      ? presenceType.closest("label")
      : null;


  const presenceList =
    document.getElementById("v11-presence-list");

  const presenceEmpty =
    document.getElementById("v11-presence-empty");

  const authorsList =
    document.getElementById("v11-authors-list");

  const authorsEmpty =
    document.getElementById("v11-authors-empty");

  const authorEditorialFilter =
    document.getElementById(
      "v11-author-editorial-filter"
    );

  const authorEditorialSort =
    document.getElementById(
      "v11-author-editorial-sort"
    );

  const authorEditorialCount =
    document.getElementById(
      "v11-author-editorial-count"
    );

  const testimonialsList =
    document.getElementById("v11-testimonials-list");

  const testimonialsEmpty =
    document.getElementById("v11-testimonials-empty");


  const testimonialTraceList =
    document.getElementById(
      "v11-testimonial-trace-list"
    );

  const testimonialTraceCount =
    document.getElementById(
      "v11-testimonial-trace-count"
    );


  const testimonialTraceClear =
    document.getElementById(
      "v11-testimonial-trace-clear"
    );

  const v11TestimonialModerationTrace = [];

  function syncV11CommunityToolbar(view) {
    const testimonialMode =
      view === "testimonials";

    if (testimonialPhotoField) {
      testimonialPhotoField.hidden =
        !testimonialMode;
    }

    if (presenceTypeField) {
      presenceTypeField.hidden =
        testimonialMode;
    }

    if (presenceSearch) {
      presenceSearch.placeholder =
        testimonialMode
          ? "Pseudo, événement, message..."
          : "Nom, maison d’édition, événement...";
    }


    if (communityPendingOnly) {
      const isPending =
        presenceStatus?.value ===
        "pending";

      communityPendingOnly.classList.toggle(
        "is-active",
        isPending
      );

      communityPendingOnly.setAttribute(
        "aria-pressed",
        isPending
          ? "true"
          : "false"
      );
    }

    if (
      testimonialMode &&
      presenceStatus &&
      presenceStatus.value === "pending"
    ) {
      const state =
        context.getState();

      const testimonials =
        state.community?.testimonials || [];

      const pending =
        testimonials.some(
          (item) =>
            item.validated !== true &&
            item.rejected !== true
        );

      if (!pending) {
        presenceStatus.value = "all";
      }
    }
  }

  function getV11ActiveCommunityView() {
    const activeTab =
      document.querySelector(
        "[data-community-view].is-active"
      );

    return (
      activeTab
        ?.dataset
        ?.communityView ||
      "presence"
    );
  }

  function updateV11CommunityResultsCount(
    visible,
    total
  ) {
    if (!communityResultsCount) {
      return;
    }

    const safeVisible =
      Number.isFinite(visible)
        ? visible
        : 0;

    const safeTotal =
      Number.isFinite(total)
        ? total
        : safeVisible;

    communityResultsCount.textContent =
      safeVisible === safeTotal
        ? safeVisible + " résultat" +
          (safeVisible > 1 ? "s" : "")
        : safeVisible +
          " / " +
          safeTotal +
          " affiché" +
          (safeVisible > 1 ? "s" : "");
  }

  function updateV11CommunityActiveFilters(
    view
  ) {
    if (!communityActiveFilters) {
      return;
    }

    const activeView =
      view ||
      getV11ActiveCommunityView();

    let count = 0;

    if (
      presenceSearch &&
      String(presenceSearch.value || "")
        .trim()
    ) {
      count += 1;
    }

    if (
      presenceStatus &&
      presenceStatus.value !== "all"
    ) {
      count += 1;
    }

    if (
      activeView === "presence" &&
      presenceType &&
      presenceType.value !== "all"
    ) {
      count += 1;
    }

    if (
      activeView === "testimonials" &&
      testimonialPhotoFilter &&
      testimonialPhotoFilter.value !== "all"
    ) {
      count += 1;
    }

    communityActiveFilters.hidden =
      count === 0;

    communityActiveFilters.textContent =
      count +
      " filtre" +
      (count > 1 ? "s" : "");

    communityActiveFilters.classList.toggle(
      "is-active",
      count > 0
    );
  }

  function getV11ModerationCounts(items) {
    const list =
      Array.isArray(items)
        ? items
        : [];

    let pending = 0;
    let validated = 0;
    let rejected = 0;

    list.forEach(function (item) {
      if (item?.rejected === true) {
        rejected += 1;
        return;
      }

      if (item?.validated === true) {
        validated += 1;
        return;
      }

      pending += 1;
    });

    return {
      total: list.length,
      pending,
      validated,
      rejected
    };
  }

  function updateV11CommunityTabCounts() {
    const state =
      context.getState();

    const presences =
      state.community?.presences || [];

    const authors =
      state.community?.authors || [];

    const testimonials =
      state.community?.testimonials || [];

    const presenceCounts =
      getV11ModerationCounts(
        presences
      );

    const testimonialCounts =
      getV11ModerationCounts(
        testimonials
      );

    if (communityTabPresenceCount) {
      communityTabPresenceCount.textContent =
        presenceCounts.pending > 0
          ? String(presenceCounts.pending)
          : "0";

      communityTabPresenceCount.classList.toggle(
        "has-pending",
        presenceCounts.pending > 0
      );
    }

    if (communityTabAuthorsCount) {
      const visibleAuthors =
        authors.filter(function (item) {
          return !item.merged_into;
        });

      communityTabAuthorsCount.textContent =
        String(visibleAuthors.length);
    }

    if (communityTabTestimonialsCount) {
      communityTabTestimonialsCount.textContent =
        testimonialCounts.pending > 0
          ? String(testimonialCounts.pending)
          : "0";

      communityTabTestimonialsCount.classList.toggle(
        "has-pending",
        testimonialCounts.pending > 0
      );
    }
  }

  function updateV11CommunityOperationalSummary(
    view,
    items
  ) {
    if (
      !communityStatusSummaryDetail ||
      !communityStatusSummaryTitle
    ) {
      return;
    }

    const activeView =
      getV11ActiveCommunityView();

    /*
     * Seul l'onglet Communauté réellement visible
     * peut modifier le résumé opérationnel.
     */
    if (view !== activeView) {
      return;
    }

    const list =
      Array.isArray(items)
        ? items
        : [];

    if (view === "authors") {
      const visible =
        list.filter(function (item) {
          return !item.merged_into;
        });

      const ready =
        visible.filter(function (item) {
          return (
            item.publication_ready === true &&
            item.published !== true
          );
        }).length;

      const published =
        visible.filter(function (item) {
          return item.published === true;
        }).length;

      communityStatusSummaryTitle.textContent =
        "Fiches auteurs";

      communityStatusSummaryDetail.textContent =
        visible.length +
        " fiche" +
        (visible.length > 1 ? "s" : "") +
        " · " +
        ready +
        " prête" +
        (ready > 1 ? "s" : "") +
        " · " +
        published +
        " publiée" +
        (published > 1 ? "s" : "");

      return;
    }

    const counts =
      getV11ModerationCounts(list);

    communityStatusSummaryTitle.textContent =
      view === "testimonials"
        ? "Modération témoignages"
        : "Modération présences";

    communityStatusSummaryDetail.textContent =
      counts.pending +
      " à traiter · " +
      counts.validated +
      " validé" +
      (counts.validated > 1 ? "s" : "") +
      " · " +
      counts.rejected +
      " rejeté" +
      (counts.rejected > 1 ? "s" : "");

    if (communityPendingOnly) {
      const isPending =
        presenceStatus?.value ===
        "pending";

      communityPendingOnly.classList.toggle(
        "is-active",
        isPending
      );

      communityPendingOnly.setAttribute(
        "aria-pressed",
        isPending
          ? "true"
          : "false"
      );
    }

    updateV11CommunityTabCounts();
  }

  function profileLabel(type) {
    if (type === "artist_author") return "Artiste-auteur";
    if (type === "hybrid") return "Hybride";
    if (type === "publisher") return "Maison d’édition";
    return "Auteur";
  }

  function profileClass(type) {
    if (type === "artist_author") return "profile-artist-author";
    if (type === "hybrid") return "profile-hybrid";
    if (type === "publisher") return "profile-publisher";
    return "profile-author";
  }

  function presenceDisplayName(item) {
    if (item.participant_type === "publisher") {
      return (
        item.organization_name ||
        item.publisher_name ||
        item.pseudo ||
        "Maison d’édition"
      );
    }

    return item.pseudo || "Sans nom";
  }

  function renderPresences(items) {
    if (!presenceList) return;

    const query = normalize(
      presenceSearch ? presenceSearch.value : ""
    );

    const status =
      presenceStatus ? presenceStatus.value : "pending";

    const type =
      presenceType ? presenceType.value : "all";

    const filtered = items.filter((item) => {
      if (type !== "all" && item.participant_type !== type) {
        return false;
      }

      if (
        status === "pending" &&
        (item.validated === true || item.rejected === true)
      ) {
        return false;
      }

      if (
        status === "validated" &&
        (item.validated !== true || item.rejected === true)
      ) {
        return false;
      }

      if (
        status === "rejected" &&
        item.rejected !== true
      ) {
        return false;
      }

      if (query) {
        const haystack = normalize(
          [
            item.pseudo,
            item.publisher_name,
            item.organization_name,
            item.source,
            item.participant_type
          ].join(" ")
        );

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });

    updateV11CommunityResultsCount(
      filtered.length,
      items.length
    );

    updateV11CommunityActiveFilters(
      "presence"
    );

    updateV11CommunityOperationalSummary(
      "presence",
      items
    );

    presenceList.replaceChildren();

    filtered.forEach((item) => {
      const card = document.createElement("article");

      const typeClass =
        profileClass(item.participant_type);

      card.className =
        "v11-community-card " + typeClass;

      const body = document.createElement("div");
      body.className = "v11-community-card-body";

      const badge = document.createElement("span");
      badge.className =
        "v11-profile-badge " + typeClass;

      badge.textContent =
        profileLabel(item.participant_type);

      const title = document.createElement("h3");
      title.textContent =
        presenceDisplayName(item);

      const meta = document.createElement("p");

      const parts = [];

      if (item.presence_verified === true) {
        parts.push("Présence vérifiée");
      } else {
        parts.push("Présence déclarée");
      }

      if (item.source) {
        parts.push(String(item.source));
      }

      meta.textContent = parts.join(" · ");

      body.appendChild(badge);
      body.appendChild(title);
      body.appendChild(meta);

      const side = document.createElement("div");
      side.className = "v11-community-card-side";

      const statusBadge = document.createElement("span");

      if (item.rejected === true) {
        statusBadge.className = "v11-chip neutral";
        statusBadge.textContent = "Rejetée";
      } else if (item.validated === true) {
        statusBadge.className = "v11-chip ok";
        statusBadge.textContent = "Validée";
      } else {
        statusBadge.className = "v11-chip warning";
        statusBadge.textContent = "À traiter";
      }

      side.appendChild(statusBadge);

      const detailButton =
        document.createElement("button");

      detailButton.type = "button";
      detailButton.className =
        "v11-community-detail-trigger";

      detailButton.textContent =
        "Détails";

      detailButton.dataset.communityPresence =
        String(item.id);

      side.appendChild(detailButton);

      card.appendChild(body);
      card.appendChild(side);

      presenceList.appendChild(card);
    });

    if (presenceEmpty) {
      presenceEmpty.hidden =
        filtered.length !== 0;

      if (filtered.length === 0) {
        presenceEmpty.textContent =
          items.length === 0
            ? "Aucune présence enregistrée."
            : "Aucune présence ne correspond aux filtres actuels.";
      }
    }
  }


  function getV11AuthorEditorialReadiness(author) {
    const guide =
      buildV11AuthorEnrichmentGuide(
        author
      );

    const mandatory =
      guide.fields.filter(
        (field) =>
          field.required === true
      );

    const completed =
      mandatory.filter(
        (field) =>
          field.ok === true
      );

    const missing =
      mandatory.filter(
        (field) =>
          field.ok !== true
      );

    const score =
      mandatory.length
        ? Math.round(
            (
              completed.length /
              mandatory.length
            ) * 100
          )
        : 0;

    let state = "incomplete";

    if (author?.published === true) {
      state = "published";
    } else if (score === 100) {
      state = "complete";
    } else if (score >= 80) {
      state = "almost";
    }

    return {
      score,
      state,
      completedCount:
        completed.length,
      totalCount:
        mandatory.length,
      missing,
      nextPriority:
        missing[0]?.label || null
    };
  }

  function matchesV11AuthorEditorialFilter(
    author
  ) {
    const filter =
      authorEditorialFilter?.value ||
      "all";

    if (filter === "all") {
      return true;
    }

    const readiness =
      getV11AuthorEditorialReadiness(
        author
      );

    if (filter === "published") {
      return author.published === true;
    }

    return readiness.state === filter;
  }



  function sortV11AuthorsEditorially(items) {
    const mode =
      authorEditorialSort?.value ||
      "priority";

    return [...items].sort((a, b) => {
      if (mode === "name") {
        return String(
          a?.pseudo || ""
        ).localeCompare(
          String(b?.pseudo || ""),
          "fr",
          {
            sensitivity: "base"
          }
        );
      }

      const aReady =
        getV11AuthorEditorialReadiness(a);

      const bReady =
        getV11AuthorEditorialReadiness(b);

      if (
        a.published === true &&
        b.published !== true
      ) {
        return 1;
      }

      if (
        b.published === true &&
        a.published !== true
      ) {
        return -1;
      }

      if (aReady.score !== bReady.score) {
        return (
          bReady.score -
          aReady.score
        );
      }

      return String(
        a?.pseudo || ""
      ).localeCompare(
        String(b?.pseudo || ""),
        "fr",
        {
          sensitivity: "base"
        }
      );
    });
  }

  function getV11AuthorPriorityTargetId(
    readiness
  ) {
    const targets = {
      "Identité":
        "v11-author-edit-pseudo",
      "Portrait":
        "v11-author-edit-avatar",
      "Type":
        "v11-author-edit-type",
      "Biographie":
        "v11-author-edit-bio"
    };

    return (
      targets[
        readiness?.nextPriority
      ] || null
    );
  }

  function openV11AuthorPriorityEditor(
    author,
    readiness
  ) {
    openV11AuthorEditor(author);

    const targetId =
      getV11AuthorPriorityTargetId(
        readiness
      );

    if (!targetId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const target =
        document.getElementById(
          targetId
        );

      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      target.focus({
        preventScroll: true
      });
    });
  }


  function renderAuthors(items) {
    if (!authorsList) return;

    authorsList.replaceChildren();

    const visible =
      sortV11AuthorsEditorially(
        items.filter((item) => {
          return (
            !item.merged_into &&
            matchesV11AuthorEditorialFilter(
              item
            )
          );
        })
      );

    if (authorEditorialCount) {
      authorEditorialCount.textContent =
        visible.length +
        (
          visible.length > 1
            ? " fiches dans la file"
            : " fiche dans la file"
        );
    }

    updateV11CommunityOperationalSummary(
      "authors",
      items
    );

    visible.forEach((item) => {
      const card = document.createElement("article");

      const typeClass =
        profileClass(item.profile_type);

      card.className =
        "v11-community-card " + typeClass;

      const body = document.createElement("div");
      body.className = "v11-community-card-body";

      const badge = document.createElement("span");
      badge.className =
        "v11-profile-badge " + typeClass;

      badge.textContent =
        profileLabel(item.profile_type);

      const title = document.createElement("h3");
      title.textContent =
        item.pseudo || "Auteur sans nom";

      const meta = document.createElement("p");

      const readiness =
        getV11AuthorEditorialReadiness(
          item
        );

      const readinessLine =
        document.createElement("div");

      readinessLine.className =
        "v11-author-card-readiness";

      const readinessScore =
        document.createElement("strong");

      readinessScore.textContent =
        readiness.score + "%";

      const readinessText =
        document.createElement("span");

      readinessText.textContent =
        readiness.nextPriority
          ? "Priorité : " +
            readiness.nextPriority
          : "Critères obligatoires complets";

      readinessLine.appendChild(
        readinessScore
      );

      readinessLine.appendChild(
        readinessText
      );

      const parts = [];

      if (item.location) {
        parts.push(item.location);
      }

      if (item.publication_ready === true) {
        parts.push("Prêt à publier");
      }

      if (item.published === true) {
        parts.push("Publié");
      }

      meta.textContent =
        parts.length ? parts.join(" · ") : "Fiche auteur";

      body.appendChild(badge);
      body.appendChild(title);
      body.appendChild(readinessLine);
      body.appendChild(meta);

      const side = document.createElement("div");
      side.className = "v11-community-card-side";

      const statusBadge = document.createElement("span");

      if (item.published === true) {
        statusBadge.className = "v11-chip ok";
        statusBadge.textContent = "Publié";
      } else if (item.publication_ready === true) {
        statusBadge.className = "v11-chip info";
        statusBadge.textContent = "Prêt";
      } else {
        statusBadge.className = "v11-chip warning";
        statusBadge.textContent = "À compléter";
      }

      side.appendChild(statusBadge);

      const priorityTarget =
        getV11AuthorPriorityTargetId(
          readiness
        );

      if (
        item.published !== true &&
        readiness.nextPriority &&
        priorityTarget
      ) {
        const quickEdit =
          document.createElement("button");

        quickEdit.type = "button";
        quickEdit.className =
          "v11-author-quick-edit";

        quickEdit.textContent =
          "Compléter";

        quickEdit.title =
          "Ouvrir : " +
          readiness.nextPriority;

        quickEdit.addEventListener(
          "click",
          () => {
            openV11AuthorPriorityEditor(
              item,
              readiness
            );
          }
        );

        side.appendChild(
          quickEdit
        );
      }

      const detailButton =
        document.createElement("button");

      detailButton.type = "button";
      detailButton.className =
        "v11-community-detail-trigger";

      detailButton.textContent =
        "Détails";

      detailButton.dataset.communityAuthor =
        String(item.id);

      side.appendChild(detailButton);

      card.appendChild(body);
      card.appendChild(side);

      authorsList.appendChild(card);
    });

    if (authorsEmpty) {
      authorsEmpty.hidden = visible.length !== 0;
    }

    renderV11AuthorConsolidation();
  }

  function formatV11TraceTime(date) {
    try {
      return new Intl.DateTimeFormat(
        "fr-FR",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      ).format(date);
    } catch {
      return date.toLocaleTimeString();
    }
  }

  function formatV11ModerationDate(value) {
    if (!value) {
      return "Jamais";
    }

    try {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      return new Intl.DateTimeFormat(
        "fr-FR",
        {
          dateStyle: "short",
          timeStyle: "short"
        }
      ).format(date);
    } catch {
      return String(value);
    }
  }

  function testimonialStatusLabel(item) {
    if (item?.rejected === true) {
      return "Rejeté";
    }

    if (item?.validated === true) {
      return "Validé";
    }

    return "À traiter";
  }

  function renderV11TestimonialTrace() {
    if (!testimonialTraceList) {
      return;
    }

    testimonialTraceList.replaceChildren();

    if (testimonialTraceClear) {
      testimonialTraceClear.disabled =
        v11TestimonialModerationTrace.length ===
        0;
    }

    if (testimonialTraceCount) {
      testimonialTraceCount.textContent =
        String(
          v11TestimonialModerationTrace.length
        );

      const count =
        v11TestimonialModerationTrace.length;

      const label =
        testimonialTraceCount
          .parentElement
          ?.querySelector("span");

      if (label) {
        label.textContent =
          count > 1
            ? "actions"
            : "action";
      }
    }

    if (
      v11TestimonialModerationTrace.length === 0
    ) {
      const empty =
        document.createElement("p");

      empty.className =
        "v11-testimonial-trace-empty";

      empty.textContent =
        "Aucune action de modération effectuée pendant cette session.";

      testimonialTraceList.appendChild(empty);

      return;
    }

    v11TestimonialModerationTrace
      .slice(0, 8)
      .forEach((entry) => {
        const row =
          document.createElement("article");

        row.className =
          "v11-testimonial-trace-row";

        const time =
          document.createElement("time");

        time.dateTime =
          entry.date.toISOString();

        time.textContent =
          formatV11TraceTime(entry.date);

        const content =
          document.createElement("div");

        content.className =
          "v11-testimonial-trace-content";

        const title =
          document.createElement("strong");

        title.textContent =
          entry.pseudo ||
          "Témoignage anonyme";

        const meta =
          document.createElement("span");

        meta.textContent =
          entry.actionLabel +
          " → " +
          entry.statusLabel;

        content.appendChild(title);
        content.appendChild(meta);

        const chip =
          document.createElement("span");

        chip.className =
          "v11-chip " +
          (
            entry.statusLabel === "Validé"
              ? "ok"
              : entry.statusLabel === "À traiter"
                ? "warning"
                : "neutral"
          );

        chip.textContent =
          entry.statusLabel;

        row.appendChild(time);
        row.appendChild(content);
        row.appendChild(chip);

        testimonialTraceList.appendChild(row);
      });
  }

  // V11.47 clear moderation trace
  function clearV11TestimonialTrace() {
    v11TestimonialModerationTrace.length =
      0;

    renderV11TestimonialTrace();
  }

  function addV11TestimonialTrace(
    item,
    action
  ) {
    if (!item) {
      return;
    }

    const actionLabel =
      action === "validate"
        ? "Validation"
        : action === "pending"
          ? "Remise en attente"
          : "Refus";

    const statusLabel =
      action === "validate"
        ? "Validé"
        : action === "pending"
          ? "À traiter"
          : "Rejeté";

    v11TestimonialModerationTrace.unshift({
      id: String(item.id),
      pseudo:
        item.pseudo ||
        item.event_title ||
        "Témoignage",
      action,
      actionLabel,
      statusLabel,
      date: new Date()
    });

    if (
      v11TestimonialModerationTrace.length >
      25
    ) {
      v11TestimonialModerationTrace.length =
        25;
    }

    renderV11TestimonialTrace();
  }

  function updateTestimonialFilterSummary(items) {
    const source =
      Array.isArray(items)
        ? items
        : [];

    const pending =
      source.filter(
        (item) =>
          item.validated !== true &&
          item.rejected !== true
      ).length;

    const validated =
      source.filter(
        (item) =>
          item.validated === true &&
          item.rejected !== true
      ).length;

    const rejected =
      source.filter(
        (item) =>
          item.rejected === true
      ).length;

    const totalNode =
      document.querySelector(
        '[data-admin-bind="testimonials-total"]'
      );

    if (totalNode) {
      totalNode.textContent =
        String(source.length);

      totalNode.title =
        pending +
        " à traiter · " +
        validated +
        " validés · " +
        rejected +
        " rejetés";
    }
  }

  function renderTestimonials(items) {
    if (!testimonialsList) return;

    updateTestimonialFilterSummary(items);

    const testimonialQuery =
      normalize(
        presenceSearch
          ? presenceSearch.value
          : ""
      );

    const testimonialStatus =
      presenceStatus
        ? presenceStatus.value
        : "all";

    const testimonialPhoto =
      testimonialPhotoFilter
        ? testimonialPhotoFilter.value
        : "all";

    const filtered =
      items
        .filter((item) => {
          if (
            testimonialStatus === "pending" &&
            (
              item.validated === true ||
              item.rejected === true
            )
          ) {
            return false;
          }

          if (
            testimonialStatus === "validated" &&
            (
              item.validated !== true ||
              item.rejected === true
            )
          ) {
            return false;
          }

          if (
            testimonialStatus === "rejected" &&
            item.rejected !== true
          ) {
            return false;
          }

          if (
            testimonialPhoto === "with-photo" &&
            !String(item.image_url || "").trim()
          ) {
            return false;
          }

          if (
            testimonialPhoto === "without-photo" &&
            String(item.image_url || "").trim()
          ) {
            return false;
          }

          if (testimonialQuery) {
            const haystack =
              normalize(
                [
                  item.pseudo,
                  item.event_title,
                  item.message
                ].join(" ")
              );

            if (
              !haystack.includes(
                testimonialQuery
              )
            ) {
              return false;
            }
          }

          return true;
        })
        .sort((a, b) => {
          const aDate =
            Date.parse(a.created_at || "") || 0;

          const bDate =
            Date.parse(b.created_at || "") || 0;

          return bDate - aDate;
        });

    updateV11CommunityResultsCount(
      filtered.length,
      items.length
    );

    updateV11CommunityActiveFilters(
      "testimonials"
    );

    updateV11CommunityOperationalSummary(
      "testimonials",
      items
    );

    testimonialsList.replaceChildren();

    filtered.forEach((item) => {
      const card = document.createElement("article");
      card.className =
        "v11-community-card v11-testimonial-card";

      if (item.image_url) {
        const media =
          document.createElement("div");

        media.className =
          "v11-testimonial-card-media";

        const image =
          document.createElement("img");

        image.src = item.image_url;
        image.alt =
          "Photo du témoignage de " +
          (item.pseudo || "un lecteur");
        image.loading = "lazy";

        media.appendChild(image);
        card.appendChild(media);
      }

      const body = document.createElement("div");
      body.className = "v11-community-card-body";

      const badge = document.createElement("span");
      badge.className = "v11-profile-badge profile-author";
      badge.textContent = "Témoignage";

      const title = document.createElement("h3");
      title.textContent = item.pseudo || "Anonyme";

      const meta = document.createElement("p");

      const shortMessage =
        String(item.message || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);

      meta.textContent =
        shortMessage ||
        item.event_title ||
        "Témoignage enregistré";

      body.appendChild(badge);
      body.appendChild(title);
      body.appendChild(meta);

      const side = document.createElement("div");
      side.className = "v11-community-card-side";

      const statusBadge = document.createElement("span");

      if (item.rejected === true) {
        statusBadge.className = "v11-chip neutral";
        statusBadge.textContent = "Rejeté";
      } else if (item.validated === true) {
        statusBadge.className = "v11-chip ok";
        statusBadge.textContent = "Validé";
      } else {
        statusBadge.className = "v11-chip warning";
        statusBadge.textContent = "À traiter";
      }

      side.appendChild(statusBadge);

      const quickActions =
        document.createElement("div");

      quickActions.className =
        "v11-testimonial-quick-actions";

      function addQuickAction(
        action,
        label,
        className
      ) {
        const button =
          document.createElement("button");

        button.type = "button";

        button.className =
          "v11-testimonial-quick-action " +
          className;

        button.textContent = label;

        button.dataset.testimonialQuickAction =
          action;

        button.dataset.testimonialQuickId =
          String(item.id);

        quickActions.appendChild(button);
      }

      if (
        item.validated !== true &&
        item.rejected !== true
      ) {
        addQuickAction(
          "validate",
          "✓ Valider",
          "is-validate"
        );

        addQuickAction(
          "reject",
          "✕ Refuser",
          "is-reject"
        );
      } else if (item.validated === true) {
        addQuickAction(
          "pending",
          "↺ Attente",
          "is-pending"
        );

        addQuickAction(
          "reject",
          "✕ Refuser",
          "is-reject"
        );
      } else if (item.rejected === true) {
        addQuickAction(
          "pending",
          "↺ Attente",
          "is-pending"
        );

        addQuickAction(
          "validate",
          "✓ Valider",
          "is-validate"
        );
      }

      side.appendChild(quickActions);

      const detailButton =
        document.createElement("button");

      detailButton.type = "button";
      detailButton.className =
        "v11-community-detail-trigger";

      detailButton.textContent =
        "Détails";

      detailButton.dataset.communityTestimonial =
        String(item.id);

      side.appendChild(detailButton);

      card.appendChild(body);
      card.appendChild(side);

      testimonialsList.appendChild(card);
    });

    if (testimonialsEmpty) {
      testimonialsEmpty.hidden =
        filtered.length !== 0;

      if (filtered.length === 0) {
        testimonialsEmpty.textContent =
          items.length === 0
            ? "Aucun témoignage disponible."
            : "Aucun témoignage ne correspond aux filtres.";
      }
    }
  }


  let selectedV11CommunityKind = null;
  let selectedV11CommunityId = null;
  let v11CommunityActionRunning = false;

  const communityDetail =
    document.getElementById(
      "v11-community-detail"
    );

  const communityDetailLabel =
    document.getElementById(
      "v11-community-detail-label"
    );

  const communityDetailTitle =
    document.getElementById(
      "v11-community-detail-title"
    );

  const communityDetailContent =
    document.getElementById(
      "v11-community-detail-content"
    );

  const communityDetailClose =
    document.getElementById(
      "v11-community-detail-close"
    );

  const communityValidateButton =
    document.getElementById(
      "v11-community-validate"
    );

  const communityPendingButton =
    document.getElementById(
      "v11-community-pending"
    );

  const communityRejectButton =
    document.getElementById(
      "v11-community-reject"
    );

  const communityEditButton =
    document.getElementById(
      "v11-community-edit"
    );

  const communityDeleteButton =
    document.getElementById(
      "v11-community-delete"
    );

  const presenceEditor =
    document.getElementById(
      "v11-presence-editor"
    );

  const presenceEditorTitle =
    document.getElementById(
      "v11-presence-editor-title"
    );

  const presenceEditorForm =
    document.getElementById(
      "v11-presence-editor-form"
    );

  const presenceEditPseudo =
    document.getElementById(
      "v11-presence-edit-pseudo"
    );

  const presenceEditType =
    document.getElementById(
      "v11-presence-edit-type"
    );

  const presenceEditOrganization =
    document.getElementById(
      "v11-presence-edit-organization"
    );

  const presenceEditPublisher =
    document.getElementById(
      "v11-presence-edit-publisher"
    );

  const presenceEditProfileUrl =
    document.getElementById(
      "v11-presence-edit-profile-url"
    );

  const presenceEditProfileUrlType =
    document.getElementById(
      "v11-presence-edit-profile-url-type"
    );

  const presenceEditBookUrl =
    document.getElementById(
      "v11-presence-edit-book-url"
    );

  const presenceEditBookUrlType =
    document.getElementById(
      "v11-presence-edit-book-url-type"
    );

  const presenceEditContact =
    document.getElementById(
      "v11-presence-edit-contact"
    );

  const presenceEditEmail =
    document.getElementById(
      "v11-presence-edit-email"
    );

  const presenceEditNote =
    document.getElementById(
      "v11-presence-edit-note"
    );

  const presenceEditVerified =
    document.getElementById(
      "v11-presence-edit-verified"
    );

  const presenceEditCancel =
    document.getElementById(
      "v11-presence-edit-cancel"
    );

  const presenceEditClose =
    document.getElementById(
      "v11-presence-editor-close"
    );

  const presenceEditSave =
    document.getElementById(
      "v11-presence-edit-save"
    );

  let selectedV11AuthorId = null;

  const authorConsolidationRun =
    document.getElementById(
      "v11-author-consolidation-run"
    );

  const authorConsolidationSummary =
    document.getElementById(
      "v11-author-consolidation-summary"
    );

  const authorConsolidationPlanList =
    document.getElementById(
      "v11-author-consolidation-plan"
    );

  let v11AuthorConsolidationPlan = null;

  const authorDetail =
    document.getElementById(
      "v11-author-detail"
    );

  const authorDetailTitle =
    document.getElementById(
      "v11-author-detail-title"
    );

  const authorDetailContent =
    document.getElementById(
      "v11-author-detail-content"
    );

  const authorEnrichmentPanel =
    document.getElementById(
      "v11-author-enrichment"
    );

  const authorEnrichmentStatus =
    document.getElementById(
      "v11-author-enrichment-status"
    );

  const authorEnrichmentSources =
    document.getElementById(
      "v11-author-enrichment-sources"
    );

  const authorEnrichmentEdit =
    document.getElementById(
      "v11-author-enrichment-edit"
    );

  const authorDetailClose =
    document.getElementById(
      "v11-author-detail-close"
    );

  const authorPreviewLink =
    document.getElementById(
      "v11-author-preview"
    );

  const authorEditButton =
    document.getElementById(
      "v11-author-edit"
    );

  const authorReadyButton =
    document.getElementById(
      "v11-author-ready"
    );

  const authorPublishButton =
    document.getElementById(
      "v11-author-publish"
    );

  const authorMergeButton =
    document.getElementById(
      "v11-author-merge"
    );

  const authorEditor =
    document.getElementById(
      "v11-author-editor"
    );

  const authorEditorTitle =
    document.getElementById(
      "v11-author-editor-title"
    );

  const authorEditorForm =
    document.getElementById(
      "v11-author-editor-form"
    );

  const authorEditPseudo =
    document.getElementById(
      "v11-author-edit-pseudo"
    );

  const authorEditSlug =
    document.getElementById(
      "v11-author-edit-slug"
    );

  const authorEditType =
    document.getElementById(
      "v11-author-edit-type"
    );

  const authorEditLocation =
    document.getElementById(
      "v11-author-edit-location"
    );

  const authorEditWebsite =
    document.getElementById(
      "v11-author-edit-website"
    );

  const authorEditShop =
    document.getElementById(
      "v11-author-edit-shop"
    );

  const authorEditAvatar =
    document.getElementById(
      "v11-author-edit-avatar"
    );

  const authorEditAvatarFile =
    document.getElementById(
      "v11-author-edit-avatar-file"
    );

  const authorEditAvatarPreview =
    document.getElementById(
      "v11-author-edit-avatar-preview"
    );

  const authorEditAvatarPreviewImage =
    document.getElementById(
      "v11-author-edit-avatar-preview-image"
    );

  const authorEditAvatarStatus =
    document.getElementById(
      "v11-author-edit-avatar-status"
    );

  let v11SelectedAuthorPortrait = null;
  let v11AuthorPortraitObjectUrl = "";

  const authorEditBio =
    document.getElementById(
      "v11-author-edit-bio"
    );

  const authorEditCancel =
    document.getElementById(
      "v11-author-edit-cancel"
    );

  const authorEditorClose =
    document.getElementById(
      "v11-author-editor-close"
    );

  const authorEditSave =
    document.getElementById(
      "v11-author-edit-save"
    );

  const v11AuthorDetailEnrichmentObserver =
    authorDetailContent
      ? new MutationObserver(() => {
          const author =
            getSelectedV11Author();

          renderV11AuthorEnrichment(
            author
          );
        })
      : null;

  if (
    v11AuthorDetailEnrichmentObserver &&
    authorDetailContent
  ) {
    v11AuthorDetailEnrichmentObserver
      .observe(
        authorDetailContent,
        {
          childList: true,
          subtree: true
        }
      );
  }

  // V11.56 author editorial sort
  if (authorEditorialSort) {
    authorEditorialSort.addEventListener(
      "change",
      () => {
        const state =
          context.getState();

        renderAuthors(
          state.community?.authors || []
        );
      }
    );
  }

  // V11.55 author editorial filter
  if (authorEditorialFilter) {
    authorEditorialFilter.addEventListener(
      "change",
      () => {
        const state =
          context.getState();

        renderAuthors(
          state.community?.authors || []
        );
      }
    );
  }

  if (authorEnrichmentEdit) {
    authorEnrichmentEdit.addEventListener(
      "click",
      () => {
        const author =
          getSelectedV11Author();

        if (author) {
          openV11AuthorEditor(author);
        }
      }
    );
  }

  if (authorDetailClose) {
    authorDetailClose.addEventListener(
      "click",
      closeV11AuthorDetail
    );
  }

  if (authorConsolidationRun) {
    authorConsolidationRun.addEventListener(
      "click",
      applyV11AuthorConsolidation
    );
  }

  if (authorReadyButton) {
    authorReadyButton.addEventListener(
      "click",
      toggleV11AuthorReady
    );
  }

  if (authorPublishButton) {
    authorPublishButton.addEventListener(
      "click",
      toggleV11AuthorPublished
    );
  }

  if (authorEditButton) {
    authorEditButton.addEventListener(
      "click",
      function () {
        const item =
          getSelectedV11Author();

        if (item) {
          openV11AuthorEditor(item);
        }
      }
    );
  }

  if (authorEditAvatarFile) {
    authorEditAvatarFile.addEventListener(
      "change",
      function () {
        const file =
          authorEditAvatarFile.files?.[0] ||
          null;

        if (!file) {
          resetV11AuthorPortraitSelection();
          previewV11AuthorPortrait(
            null,
            authorEditAvatar?.value || ""
          );
          return;
        }

        try {
          validateV11AuthorPortrait(file);

          v11SelectedAuthorPortrait = file;

          previewV11AuthorPortrait(file);

          if (authorEditAvatarStatus) {
            authorEditAvatarStatus.textContent =
              "Portrait sélectionné · " +
              Math.round(file.size / 1024) +
              " Ko · envoi lors de l’enregistrement.";
          }
        } catch (error) {
          resetV11AuthorPortraitSelection();

          window.alert(
            error?.message ||
            "Portrait invalide."
          );
        }
      }
    );
  }

  if (authorEditCancel) {
    authorEditCancel.addEventListener(
      "click",
      closeV11AuthorEditor
    );
  }

  if (authorEditorClose) {
    authorEditorClose.addEventListener(
      "click",
      closeV11AuthorEditor
    );
  }

  if (authorEditorForm) {
    authorEditorForm.addEventListener(
      "submit",
      function (event) {
        event.preventDefault();
        saveV11AuthorEdition();
      }
    );
  }






  function getSelectedV11CommunityItem() {
    if (
      !selectedV11CommunityKind ||
      selectedV11CommunityId == null
    ) {
      return null;
    }

    const state =
      context.getState();

    const rows =
      selectedV11CommunityKind === "presence"
        ? (
            state.community
              ?.presences || []
          )
        : (
            state.community
              ?.testimonials || []
          );

    return rows.find(
      function (row) {
        return (
          String(row.id) ===
          String(
            selectedV11CommunityId
          )
        );
      }
    ) || null;
  }



  function normalizeV11OptionalUrl(value) {
    const text =
      String(value || "").trim();

    if (!text) {
      return null;
    }

    try {
      const parsed =
        new URL(text);

      if (
        parsed.protocol !== "http:" &&
        parsed.protocol !== "https:"
      ) {
        throw new Error(
          "Protocole non autorisé"
        );
      }

      return parsed.toString();

    } catch (error) {
      throw new Error(
        "Une URL saisie est invalide."
      );
    }
  }

  function buildV11PresenceEditPayload() {
    const participantType =
      presenceEditType?.value ||
      "author";

    const payload = {
      pseudo:
        String(
          presenceEditPseudo?.value || ""
        ).trim() || null,

      participant_type:
        participantType,

      organization_name:
        String(
          presenceEditOrganization?.value || ""
        ).trim() || null,

      publisher_name:
        String(
          presenceEditPublisher?.value || ""
        ).trim() || null,

      author_profile_url:
        normalizeV11OptionalUrl(
          presenceEditProfileUrl?.value
        ),

      author_profile_url_type:
        String(
          presenceEditProfileUrlType?.value || ""
        ).trim() || null,

      book_or_publisher_url:
        normalizeV11OptionalUrl(
          presenceEditBookUrl?.value
        ),

      book_or_publisher_url_type:
        String(
          presenceEditBookUrlType?.value || ""
        ).trim() || null,

      contact_name:
        String(
          presenceEditContact?.value || ""
        ).trim() || null,

      contact_email:
        String(
          presenceEditEmail?.value || ""
        ).trim() || null,

      admin_note:
        String(
          presenceEditNote?.value || ""
        ).trim() || null,

      presence_verified:
        Boolean(
          presenceEditVerified?.checked
        ),

      updated_at:
        new Date().toISOString()
    };

    payload.website =
      payload.author_profile_url;

    if (
      participantType === "publisher"
    ) {
      payload.publication_mode =
        "unknown";

      payload.author_id = null;
      payload.author_slug = null;
      payload.author_identity_key = null;
      payload.author_portrait_url = null;

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

  function isV11PresenceMissingColumnError(
    error
  ) {
    const code =
      String(error?.code || "");

    const message =
      String(
        error?.message || ""
      ).toLowerCase();

    return (
      code === "42703" ||
      code === "PGRST204" ||
      message.includes("column") ||
      message.includes("schema cache")
    );
  }

  async function saveV11PresenceEdition() {
    if (v11CommunityActionRunning) {
      return;
    }

    const state =
      context.getState();

    if (
      state.authenticated !== true
    ) {
      window.alert(
        "Session admin absente."
      );
      return;
    }

    const item =
      getSelectedV11CommunityItem();

    const client =
      context.getClient();

    if (
      selectedV11CommunityKind !==
        "presence" ||
      !item ||
      !client
    ) {
      window.alert(
        "Présence indisponible."
      );
      return;
    }

    let payload;

    try {
      payload =
        buildV11PresenceEditPayload();
    } catch (error) {
      window.alert(
        error?.message ||
        "Formulaire invalide."
      );
      return;
    }

    const confirmed =
      window.confirm(
        "Enregistrer les modifications de cette présence ?\n\n" +
        presenceDisplayName(item)
      );

    if (!confirmed) {
      return;
    }

    setV11CommunityBusy(true);

    if (presenceEditSave) {
      presenceEditSave.disabled = true;
      presenceEditSave.textContent =
        "Enregistrement…";
    }

    try {
      let response =
        await client
          .from(
            "event_authors_presence"
          )
          .update(payload)
          .eq("id", item.id);

      if (
        response.error &&
        isV11PresenceMissingColumnError(
          response.error
        ) &&
        payload.participant_type !==
          "publisher"
      ) {
        const legacyPayload = {
          ...payload
        };

        [
          "participant_type",
          "organization_name",
          "contact_name",
          "contact_email",
          "presence_verified"
        ].forEach(
          function (key) {
            delete legacyPayload[key];
          }
        );

        response =
          await client
            .from(
              "event_authors_presence"
            )
            .update(legacyPayload)
            .eq("id", item.id);
      }

      if (response.error) {
        throw response.error;
      }

      v11CommunityMessage(
        "Présence modifiée."
      );

      closeV11PresenceEditor();

      await context.refresh();

      const refreshed =
        getSelectedV11CommunityItem();

      if (refreshed) {
        renderCommunityDetail(
          "presence",
          refreshed
        );
      }

    } catch (error) {
      console.error(
        "Erreur édition présence V11",
        error
      );

      window.alert(
        "Enregistrement impossible.\n\n" +
        (
          error?.message ||
          "Erreur Supabase"
        )
      );

    } finally {
      v11CommunityActionRunning = false;

      if (presenceEditSave) {
        presenceEditSave.disabled = false;
        presenceEditSave.textContent =
          "Enregistrer";
      }

      const refreshed =
        getSelectedV11CommunityItem();

      if (refreshed) {
        setV11CommunityButtons(
          refreshed
        );
      }
    }
  }



  function normalizeV11ConsolidationName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getV11ConsolidationPresenceUrl(row) {
    return String(
      row?.author_profile_url ||
      row?.website ||
      ""
    ).trim();
  }

  function getV11ConsolidationShopUrl(row) {
    return String(
      row?.book_or_publisher_url ||
      ""
    ).trim();
  }

  function getV11ConsolidationPhoto(row) {
    return String(
      row?.author_portrait_url ||
      ""
    ).trim();
  }

  function buildV11UniqueAuthorSlug(
    source,
    authors,
    reserved
  ) {
    const base =
      normalizeV11AuthorSlug(source) ||
      "auteur";

    const used = new Set(
      (authors || [])
        .map((item) =>
          String(item.slug || "").trim()
        )
        .filter(Boolean)
    );

    (reserved || new Set()).forEach(
      (slug) => used.add(slug)
    );

    if (!used.has(base)) {
      return base;
    }

    let index = 2;

    while (used.has(base + "-" + index)) {
      index += 1;
    }

    return base + "-" + index;
  }

  function buildV11AuthorConsolidationPlan() {
    const state = context.getState();

    const presences =
      Array.isArray(
        state.community?.presences
      )
        ? state.community.presences
        : [];

    const authors =
      Array.isArray(
        state.community?.authors
      )
        ? state.community.authors.filter(
            (item) => !item.merged_into
          )
        : [];

    const eligible = presences.filter(
      (row) => {
        return (
          row.validated === true &&
          row.rejected !== true &&
          [
            "author",
            "artist_author",
            "hybrid"
          ].includes(
            row.participant_type
          ) &&
          Boolean(
            String(row.pseudo || "").trim()
          )
        );
      }
    );

    const groups = new Map();

    eligible.forEach((row) => {
      const key =
        normalizeV11ConsolidationName(
          row.pseudo
        );

      if (!key) {
        return;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(row);
    });

    const byId = new Map();
    const bySlug = new Map();
    const byName = new Map();

    authors.forEach((author) => {
      if (author.id) {
        byId.set(
          String(author.id),
          author
        );
      }

      if (author.slug) {
        bySlug.set(
          String(author.slug),
          author
        );
      }

      const key =
        normalizeV11ConsolidationName(
          author.pseudo
        );

      if (key) {
        if (!byName.has(key)) {
          byName.set(key, []);
        }

        byName.get(key).push(author);
      }
    });

    const actions = [];
    const ambiguous = [];
    const insufficient = [];
    const reservedSlugs = new Set();

    groups.forEach((rows, nameKey) => {
      const candidates = new Map();

      rows.forEach((row) => {
        const authorId =
          String(
            row.author_id || ""
          ).trim();

        const slug =
          String(
            row.author_slug ||
            row.author_identity_key ||
            ""
          ).trim();

        if (
          authorId &&
          byId.has(authorId)
        ) {
          const candidate =
            byId.get(authorId);

          candidates.set(
            String(candidate.id),
            candidate
          );
        }

        if (
          slug &&
          bySlug.has(slug)
        ) {
          const candidate =
            bySlug.get(slug);

          candidates.set(
            String(candidate.id),
            candidate
          );
        }
      });

      const nameCandidates =
        byName.get(nameKey) || [];

      if (
        candidates.size === 0 &&
        nameCandidates.length === 1
      ) {
        candidates.set(
          String(nameCandidates[0].id),
          nameCandidates[0]
        );
      }

      if (
        candidates.size > 1 ||
        (
          candidates.size === 0 &&
          nameCandidates.length > 1
        )
      ) {
        ambiguous.push({
          name:
            String(
              rows[0]?.pseudo || nameKey
            ),
          rows,
          reason:
            "plusieurs fiches possibles"
        });

        return;
      }

      if (candidates.size === 1) {
        const author =
          Array.from(
            candidates.values()
          )[0];

        const needsLink =
          rows.some((row) => {
            return (
              String(
                row.author_id || ""
              ) !== String(author.id) ||
              String(
                row.author_slug || ""
              ) !== String(author.slug) ||
              String(
                row.author_identity_key ||
                ""
              ) !== String(author.slug)
            );
          });

        const website =
          rows
            .map(
              getV11ConsolidationPresenceUrl
            )
            .find(Boolean) || "";

        const shop =
          rows
            .map(
              getV11ConsolidationShopUrl
            )
            .find(Boolean) || "";

        const photo =
          rows
            .map(
              getV11ConsolidationPhoto
            )
            .find(Boolean) || "";

        const authorPatch = {};

        if (
          !String(
            author.website || ""
          ).trim() &&
          website
        ) {
          authorPatch.website = website;
        }

        if (
          !String(
            author.shop_url || ""
          ).trim() &&
          shop
        ) {
          authorPatch.shop_url = shop;
        }

        if (
          !String(
            author.avatar_url || ""
          ).trim() &&
          photo
        ) {
          authorPatch.avatar_url = photo;
        }

        const needsEnrichment =
          Object.keys(
            authorPatch
          ).length > 0;

        if (
          needsLink ||
          needsEnrichment
        ) {
          actions.push({
            kind: "existing",
            author,
            rows,
            authorPatch,
            needsLink,
            needsEnrichment
          });
        }

        return;
      }

      const types =
        Array.from(
          new Set(
            rows.map(
              (row) =>
                row.participant_type
            )
          )
        );

      if (types.length !== 1) {
        ambiguous.push({
          name:
            String(
              rows[0]?.pseudo || nameKey
            ),
          rows,
          reason:
            "types de profil contradictoires"
        });

        return;
      }

      const photo =
        rows
          .map(
            getV11ConsolidationPhoto
          )
          .find(Boolean) || "";

      const website =
        rows
          .map(
            getV11ConsolidationPresenceUrl
          )
          .find(Boolean) || "";

      const shop =
        rows
          .map(
            getV11ConsolidationShopUrl
          )
          .find(Boolean) || "";

      const hasVerifiedPresence =
        rows.some(
          (row) =>
            row.presence_verified === true
        );

      const hasMultiplePresences =
        rows.length >= 2;

      const hasEditorialEvidence =
        Boolean(photo && website);

      /*
       * Une photo + une vitrine sont de bons éléments
       * éditoriaux, mais ne suffisent pas seules à créer
       * automatiquement une identité auteur.
       *
       * Création automatique uniquement si :
       * - présence explicitement vérifiée ;
       * - ou au moins deux présences validées.
       */
      const strongEvidence =
        hasVerifiedPresence ||
        hasMultiplePresences;

      if (!strongEvidence) {
        insufficient.push({
          name:
            String(
              rows[0]?.pseudo || nameKey
            ),
          rows,
          reason:
            hasEditorialEvidence
              ? "photo + vitrine à contrôler"
              : "preuve insuffisante"
        });

        return;
      }

      const explicitSlug =
        rows
          .map(
            (row) =>
              String(
                row.author_slug ||
                row.author_identity_key ||
                ""
              ).trim()
          )
          .find(Boolean);

      const slug =
        buildV11UniqueAuthorSlug(
          explicitSlug ||
          rows[0]?.pseudo,
          authors,
          reservedSlugs
        );

      reservedSlugs.add(slug);

      actions.push({
        kind: "create",
        rows,
        authorPayload: {
          pseudo:
            String(
              rows[0]?.pseudo || ""
            ).trim(),

          slug,

          website:
            website || null,

          shop_url:
            shop || null,

          avatar_url:
            photo || null,

          profile_type:
            types[0],

          bio: null,
          location: null,

          validated: false,
          publication_ready: false,
          published: false,

          updated_at:
            new Date().toISOString()
        }
      });
    });

    return {
      eligibleCount:
        eligible.length,

      identityCount:
        groups.size,

      actions,

      createCount:
        actions.filter(
          (action) =>
            action.kind === "create"
        ).length,

      linkCount:
        actions.filter(
          (action) =>
            action.kind === "existing" &&
            action.needsLink
        ).length,

      enrichCount:
        actions.filter(
          (action) =>
            action.kind === "existing" &&
            action.needsEnrichment
        ).length,

      ambiguous,
      insufficient
    };
  }

  function renderV11AuthorConsolidation() {
    if (
      !authorConsolidationSummary
    ) {
      return;
    }

    const plan =
      buildV11AuthorConsolidationPlan();

    v11AuthorConsolidationPlan =
      plan;

    authorConsolidationSummary
      .replaceChildren();

    const values = [
      [
        "Présences validées",
        plan.eligibleCount
      ],
      [
        "Identités détectées",
        plan.identityCount
      ],
      [
        "Fiches à créer",
        plan.createCount
      ],
      [
        "Fiches à relier",
        plan.linkCount
      ],
      [
        "Fiches à enrichir",
        plan.enrichCount
      ],
      [
        "À vérifier",
        plan.ambiguous.length
      ],
      [
        "Preuve insuffisante",
        plan.insufficient.length
      ]
    ];

    values.forEach(
      ([label, value]) => {
        const item =
          document.createElement(
            "div"
          );

        const strong =
          document.createElement(
            "strong"
          );

        const span =
          document.createElement(
            "span"
          );

        strong.textContent =
          String(value);

        span.textContent =
          label;

        item.appendChild(strong);
        item.appendChild(span);

        authorConsolidationSummary
          .appendChild(item);
      }
    );

    if (authorConsolidationRun) {
      authorConsolidationRun.disabled =
        plan.actions.length === 0;
    }

    if (authorConsolidationPlanList) {
      authorConsolidationPlanList
        .replaceChildren();

      const title =
        document.createElement("h4");

      title.textContent =
        "Plan proposé";

      authorConsolidationPlanList
        .appendChild(title);

      if (!plan.actions.length) {
        const empty =
          document.createElement("p");

        empty.textContent =
          "Aucune opération automatique proposée.";

        authorConsolidationPlanList
          .appendChild(empty);
      } else {
        plan.actions.forEach(
          (action) => {
            const row =
              document.createElement(
                "article"
              );

            row.className =
              "v11-author-consolidation-plan-row";

            const content =
              document.createElement(
                "div"
              );

            const strong =
              document.createElement(
                "strong"
              );

            const meta =
              document.createElement(
                "span"
              );

            const badge =
              document.createElement(
                "span"
              );

            const name =
              action.kind === "create"
                ? action.authorPayload
                    ?.pseudo
                : action.author?.pseudo;

            strong.textContent =
              name || "Auteur";

            const count =
              Array.isArray(action.rows)
                ? action.rows.length
                : 0;

            meta.textContent =
              count +
              " présence" +
              (count > 1 ? "s" : "") +
              " validée" +
              (count > 1 ? "s" : "");

            badge.className =
              "v11-chip " +
              (
                action.kind === "create"
                  ? "info"
                  : "ok"
              );

            if (
              action.kind === "create"
            ) {
              badge.textContent =
                "Créer";
            } else if (
              action.needsEnrichment &&
              action.needsLink
            ) {
              badge.textContent =
                "Relier + enrichir";
            } else if (
              action.needsEnrichment
            ) {
              badge.textContent =
                "Enrichir";
            } else {
              badge.textContent =
                "Relier";
            }

            content.appendChild(strong);
            content.appendChild(meta);

            row.appendChild(content);
            row.appendChild(badge);

            authorConsolidationPlanList
              .appendChild(row);
          }
        );
      }
    }
  }

  async function applyV11AuthorConsolidation() {
    if (v11CommunityActionRunning) {
      return;
    }

    const state =
      context.getState();

    const client =
      context.getClient();

    if (
      state.authenticated !== true ||
      !client
    ) {
      window.alert(
        "Session admin indisponible."
      );
      return;
    }

    const plan =
      buildV11AuthorConsolidationPlan();

    if (!plan.actions.length) {
      window.alert(
        "Aucune consolidation automatique à appliquer."
      );
      return;
    }

    const message =
      "CONSOLIDATION AUTEURS\n\n" +
      plan.createCount +
      " fiche(s) interne(s) à créer\n" +
      plan.linkCount +
      " rapprochement(s) à relier\n" +
      plan.enrichCount +
      " fiche(s) à enrichir\n\n" +
      plan.ambiguous.length +
      " cas ambigu(s) resteront intacts.\n" +
      plan.insufficient.length +
      " identité(s) sans preuve suffisante resteront intactes.\n\n" +
      "Aucune fiche ne sera publiée.\n\n" +
      "Confirmer ?";

    if (!window.confirm(message)) {
      return;
    }

    v11CommunityActionRunning = true;

    if (authorConsolidationRun) {
      authorConsolidationRun.disabled =
        true;

      authorConsolidationRun.textContent =
        "Consolidation…";
    }

    let created = 0;
    let linked = 0;
    let enriched = 0;
    let failed = 0;

    try {
      for (
        const action of plan.actions
      ) {
        try {
          let author = action.author;

          if (
            action.kind === "create"
          ) {
            const check =
              await client
                .from("authors")
                .select(
                  "id, pseudo, slug"
                )
                .eq(
                  "slug",
                  action.authorPayload.slug
                )
                .maybeSingle();

            if (check.error) {
              throw check.error;
            }

            if (check.data) {
              author =
                check.data;
            } else {
              const inserted =
                await client
                  .from("authors")
                  .insert(
                    action.authorPayload
                  )
                  .select(
                    "id, pseudo, slug"
                  )
                  .single();

              if (inserted.error) {
                throw inserted.error;
              }

              author =
                inserted.data;

              created += 1;
            }
          }

          if (
            action.kind === "existing" &&
            action.needsEnrichment
          ) {
            const authorPatch = {
              ...action.authorPatch,
              updated_at:
                new Date().toISOString()
            };

            const updated =
              await client
                .from("authors")
                .update(authorPatch)
                .eq(
                  "id",
                  author.id
                );

            if (updated.error) {
              throw updated.error;
            }

            enriched += 1;
          }

          if (
            !author?.id ||
            !author?.slug
          ) {
            throw new Error(
              "Identité auteur incomplète."
            );
          }

          const ids =
            action.rows
              .map(
                (row) =>
                  String(
                    row.id || ""
                  ).trim()
              )
              .filter(Boolean);

          if (ids.length) {
            const response =
              await client
                .from(
                  "event_authors_presence"
                )
                .update({
                  author_id:
                    author.id,

                  author_slug:
                    author.slug,

                  author_identity_key:
                    author.slug,

                  updated_at:
                    new Date()
                      .toISOString()
                })
                .in("id", ids);

            if (response.error) {
              throw response.error;
            }

            linked += ids.length;
          }

        } catch (error) {
          failed += 1;

          console.error(
            "V11 consolidation auteur",
            error
          );
        }
      }

      await context.refresh();

      renderV11AuthorConsolidation();

      v11CommunityMessage(
        "Consolidation terminée · " +
        created +
        " fiche(s) créée(s) · " +
        linked +
        " présence(s) reliée(s) · " +
        enriched +
        " fiche(s) enrichie(s)" +
        (
          failed
            ? " · " +
              failed +
              " erreur(s)"
            : ""
        )
      );

      if (failed) {
        window.alert(
          "Consolidation terminée avec " +
          failed +
          " erreur(s).\n\n" +
          "Les opérations réussies sont conservées. " +
          "Une nouvelle analyse permettra de reprendre les éléments restants."
        );
      }

    } finally {
      v11CommunityActionRunning =
        false;

      if (authorConsolidationRun) {
        authorConsolidationRun
          .textContent =
            "Appliquer la consolidation";
      }

      renderV11AuthorConsolidation();
    }
  }


  function getSelectedV11Author() {
    if (selectedV11AuthorId == null) {
      return null;
    }

    const state =
      context.getState();

    return (
      state.community
        ?.authors || []
    ).find(
      function (item) {
        return (
          String(item.id) ===
          String(selectedV11AuthorId)
        );
      }
    ) || null;
  }


  function normalizeV11AuthorSlug(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function buildV11AuthorEditPayload() {
    const pseudo =
      String(
        authorEditPseudo?.value || ""
      ).trim();

    if (!pseudo) {
      throw new Error(
        "Le nom public est obligatoire."
      );
    }

    const slug =
      normalizeV11AuthorSlug(
        authorEditSlug?.value
      );

    if (!slug) {
      throw new Error(
        "Le slug est obligatoire."
      );
    }

    const profileType =
      authorEditType?.value ||
      "author";

    if (
      ![
        "author",
        "artist_author",
        "hybrid",
        "publisher"
      ].includes(profileType)
    ) {
      throw new Error(
        "Type de profil invalide."
      );
    }

    return {
      pseudo: pseudo,
      slug: slug,
      profile_type: profileType,

      location:
        String(
          authorEditLocation?.value || ""
        ).trim() || null,

      website:
        normalizeV11OptionalUrl(
          authorEditWebsite?.value
        ),

      shop_url:
        normalizeV11OptionalUrl(
          authorEditShop?.value
        ),

      avatar_url:
        normalizeV11OptionalUrl(
          authorEditAvatar?.value
        ),

      bio:
        String(
          authorEditBio?.value || ""
        ).trim() || null,

      updated_at:
        new Date().toISOString()
    };
  }

  function resetV11AuthorPortraitSelection() {
    v11SelectedAuthorPortrait = null;

    if (v11AuthorPortraitObjectUrl) {
      URL.revokeObjectURL(
        v11AuthorPortraitObjectUrl
      );
      v11AuthorPortraitObjectUrl = "";
    }

    if (authorEditAvatarFile) {
      authorEditAvatarFile.value = "";
    }
  }

  function previewV11AuthorPortrait(file, existingUrl = "") {
    if (!authorEditAvatarPreview ||
        !authorEditAvatarPreviewImage) {
      return;
    }

    if (v11AuthorPortraitObjectUrl) {
      URL.revokeObjectURL(
        v11AuthorPortraitObjectUrl
      );
      v11AuthorPortraitObjectUrl = "";
    }

    if (file) {
      v11AuthorPortraitObjectUrl =
        URL.createObjectURL(file);

      authorEditAvatarPreviewImage.src =
        v11AuthorPortraitObjectUrl;

      authorEditAvatarPreview.hidden = false;
      return;
    }

    if (existingUrl) {
      authorEditAvatarPreviewImage.src =
        existingUrl;

      authorEditAvatarPreview.hidden = false;
      return;
    }

    authorEditAvatarPreviewImage.removeAttribute(
      "src"
    );

    authorEditAvatarPreview.hidden = true;
  }

  function validateV11AuthorPortrait(file) {
    if (!(file instanceof File) || !file.size) {
      throw new Error(
        "Aucun portrait sélectionné."
      );
    }

    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp"
    ]);

    if (!allowedTypes.has(file.type)) {
      throw new Error(
        "Format portrait non accepté. Utilise JPG, PNG ou WEBP."
      );
    }

    if (file.size > 4 * 1024 * 1024) {
      throw new Error(
        "Le portrait dépasse 4 Mo."
      );
    }
  }

  async function uploadV11AuthorPortrait(
    file,
    identityKey
  ) {
    validateV11AuthorPortrait(file);

    const config =
      window.DEDICALIVRES_CONFIG || {};

    const endpoint =
      String(
        config.imageUploadEndpoint || ""
      ).trim();

    if (
      config.imageUploadProvider !== "r2" ||
      !endpoint.startsWith("http")
    ) {
      throw new Error(
        "Upload R2 indisponible."
      );
    }

    const formData = new FormData();

    formData.append(
      "file",
      file,
      file.name || "portrait-auteur.jpg"
    );

    formData.append(
      "folder",
      "author-portraits"
    );

    formData.append(
      "file_name",
      file.name || "portrait-auteur.jpg"
    );

    formData.append(
      "identity_key",
      identityKey || "auteur"
    );

    const controller =
      new AbortController();

    const timeoutId =
      window.setTimeout(
        function () {
          controller.abort();
        },
        20000
      );

    let response;

    try {
      response = await fetch(
        endpoint,
        {
          method: "POST",
          body: formData,
          signal: controller.signal
        }
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(
          "L’envoi du portrait a dépassé 20 secondes. Aucune modification de la fiche auteur n’a été enregistrée."
        );
      }

      throw new Error(
        "Connexion au stockage du portrait impossible : " +
        (error?.message || "erreur réseau")
      );
    } finally {
      window.clearTimeout(timeoutId);
    }

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (
      !response.ok ||
      !payload?.url
    ) {
      throw new Error(
        payload?.error ||
        "Upload R2 impossible (" +
        response.status +
        ")."
      );
    }

    return payload.url;
  }

  async function checkV11AuthorSlug(
    client,
    author,
    slug
  ) {
    const response =
      await client
        .from("authors")
        .select("id, pseudo, slug")
        .eq("slug", slug)
        .limit(10);

    if (response.error) {
      throw response.error;
    }

    const collision =
      (
        Array.isArray(response.data)
          ? response.data
          : []
      ).find(
        function (row) {
          return (
            String(row.id) !==
            String(author.id)
          );
        }
      );

    return collision || null;
  }

  async function saveV11AuthorEdition() {
    if (v11CommunityActionRunning) {
      return;
    }

    const state =
      context.getState();

    if (state.authenticated !== true) {
      window.alert(
        "Session admin absente."
      );
      return;
    }

    const author =
      getSelectedV11Author();

    const client =
      context.getClient();

    if (!author || !client) {
      window.alert(
        "Auteur indisponible."
      );
      return;
    }

    if (author.merged_into) {
      window.alert(
        "Cette fiche a déjà été fusionnée vers une autre fiche et ne peut pas être modifiée ici."
      );
      return;
    }

    let payload;

    try {
      payload =
        buildV11AuthorEditPayload();
    } catch (error) {
      window.alert(
        error?.message ||
        "Formulaire invalide."
      );
      return;
    }

    if (authorEditSlug) {
      authorEditSlug.value =
        payload.slug;
    }

    let collision;

    try {
      collision =
        await checkV11AuthorSlug(
          client,
          author,
          payload.slug
        );
    } catch (error) {
      console.error(
        "Contrôle slug auteur indisponible",
        error
      );

      window.alert(
        "Impossible de vérifier l’unicité du slug. Aucune modification n’a été enregistrée."
      );
      return;
    }

    if (collision) {
      window.alert(
        "Ce slug est déjà utilisé par :\n\n"
        + (
          collision.pseudo ||
          collision.slug ||
          "un autre auteur"
        )
        + "\n\nChoisis un autre slug."
      );
      return;
    }

    const confirmed =
      window.confirm(
        "Enregistrer les modifications de la fiche auteur ?\n\n"
        + (
          author.pseudo ||
          "Auteur"
        )
      );

    if (!confirmed) {
      return;
    }

    v11CommunityActionRunning = true;

    if (authorEditSave) {
      authorEditSave.disabled = true;
      authorEditSave.textContent =
        "Enregistrement…";
    }

    try {
      if (v11SelectedAuthorPortrait) {
        if (authorEditSave) {
          authorEditSave.textContent =
            "Envoi du portrait…";
        }

        if (authorEditAvatarStatus) {
          authorEditAvatarStatus.textContent =
            "Envoi du portrait vers Dédicalivres…";
        }

        const portraitUrl =
          await uploadV11AuthorPortrait(
            v11SelectedAuthorPortrait,
            payload.slug || author.slug || "auteur"
          );

        payload.avatar_url =
          portraitUrl;

        if (authorEditAvatar) {
          authorEditAvatar.value =
            portraitUrl;
        }

        if (authorEditAvatarStatus) {
          authorEditAvatarStatus.textContent =
            "Portrait envoyé · enregistrement de la fiche…";
        }

        if (authorEditSave) {
          authorEditSave.textContent =
            "Enregistrement…";
        }
      }

      const response =
        await client
          .from("authors")
          .update(payload)
          .eq("id", author.id);

      if (response.error) {
        throw response.error;
      }

      v11CommunityMessage(
        "Fiche auteur modifiée."
      );

      closeV11AuthorEditor();

      await context.refresh();

      const refreshed =
        getSelectedV11Author();

      if (refreshed) {
        renderV11AuthorDetail(
          refreshed
        );
      }

    } catch (error) {
      console.error(
        "Erreur édition auteur V11",
        error
      );

      window.alert(
        "Enregistrement impossible.\n\n"
        + (
          error?.message ||
          "Erreur Supabase"
        )
      );

    } finally {
      v11CommunityActionRunning = false;

      if (authorEditSave) {
        authorEditSave.disabled = false;
        authorEditSave.textContent =
          "Enregistrer";
      }
    }
  }

  function closeV11AuthorEditor() {
    if (authorEditor) {
      authorEditor.hidden = true;
    }
  }

  function closeV11AuthorDetail() {
    if (authorDetail) {
      authorDetail.hidden = true;
    }

    closeV11AuthorEditor();
    selectedV11AuthorId = null;
  }

  function addV11AuthorDetailRow(
    label,
    value
  ) {
    if (!authorDetailContent) {
      return;
    }

    const row =
      document.createElement("div");

    row.className =
      "v11-community-detail-row";

    const key =
      document.createElement("span");

    key.textContent = label;

    const val =
      document.createElement("strong");

    const text =
      String(value ?? "").trim();

    val.textContent =
      text || "Non renseigné";

    row.appendChild(key);
    row.appendChild(val);

    authorDetailContent.appendChild(
      row
    );
  }



  function getV11AuthorRelatedPresences(author) {
    const state = context.getState();

    const presences =
      Array.isArray(
        state.community?.presences
      )
        ? state.community.presences
        : [];

    const authorId =
      String(author?.id || "").trim();

    const authorSlug =
      String(author?.slug || "").trim();

    const authorName =
      normalize(
        author?.pseudo || ""
      );

    return presences.filter((row) => {
      if (
        row.validated !== true ||
        row.rejected === true
      ) {
        return false;
      }

      const rowId =
        String(
          row.author_id || ""
        ).trim();

      const rowSlug =
        String(
          row.author_slug ||
          row.author_identity_key ||
          ""
        ).trim();

      const rowName =
        normalize(
          row.pseudo || ""
        );

      return (
        (
          authorId &&
          rowId === authorId
        ) ||
        (
          authorSlug &&
          rowSlug === authorSlug
        ) ||
        (
          authorName &&
          rowName === authorName
        )
      );
    });
  }

  function uniqueV11AuthorValues(values) {
    const seen = new Set();

    return values
      .map((value) =>
        String(value || "").trim()
      )
      .filter(Boolean)
      .filter((value) => {
        const key =
          value.toLowerCase();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function buildV11AuthorEnrichmentGuide(author) {
    const presences =
      getV11AuthorRelatedPresences(
        author
      );

    const profileLinks =
      uniqueV11AuthorValues(
        presences.flatMap((row) => [
          row.author_profile_url,
          row.website
        ])
      );

    const shopLinks =
      uniqueV11AuthorValues(
        presences.map(
          (row) =>
            row.book_or_publisher_url
        )
      );

    const portraitLinks =
      uniqueV11AuthorValues(
        presences.map(
          (row) =>
            row.author_portrait_url
        )
      );

    const eventIds =
      new Set(
        presences
          .map((row) =>
            row.event_id ||
            row.events?.id
          )
          .filter(Boolean)
          .map(String)
      );

    const fields = [
      {
        key: "identity",
        label: "Identité",
        ok: Boolean(
          String(
            author?.pseudo || ""
          ).trim()
        ),
        required: true
      },
      {
        key: "photo",
        label: "Portrait",
        ok: Boolean(
          String(
            author?.avatar_url || ""
          ).trim()
        ),
        required: true
      },
      {
        key: "type",
        label: "Type",
        ok: [
          "author",
          "artist_author",
          "hybrid"
        ].includes(
          author?.profile_type
        ),
        required: true
      },
      {
        key: "bio",
        label: "Biographie",
        ok: Boolean(
          String(
            author?.bio || ""
          ).trim()
        ),
        required: true
      },
      {
        key: "history",
        label: "Historique",
        ok: eventIds.size > 0,
        required: true
      },
      {
        key: "location",
        label: "Localisation",
        ok: Boolean(
          String(
            author?.location || ""
          ).trim()
        ),
        required: false
      },
      {
        key: "website",
        label: "Vitrine",
        ok: Boolean(
          String(
            author?.website || ""
          ).trim()
        ),
        required: false
      },
      {
        key: "shop",
        label: "Boutique",
        ok: Boolean(
          String(
            author?.shop_url || ""
          ).trim()
        ),
        required: false
      }
    ];

    return {
      fields,
      presences,
      eventCount:
        eventIds.size,
      profileLinks,
      shopLinks,
      portraitLinks
    };
  }

  function appendV11AuthorSourceLink(
    container,
    label,
    url
  ) {
    if (!container || !url) {
      return;
    }

    const link =
      document.createElement("a");

    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";

    link.className =
      "v11-author-enrichment-source";

    const strong =
      document.createElement("strong");

    const span =
      document.createElement("span");

    strong.textContent = label;
    span.textContent = url;

    link.appendChild(strong);
    link.appendChild(span);

    container.appendChild(link);
  }

  function renderV11AuthorEnrichment(author) {
    if (
      !authorEnrichmentPanel ||
      !authorEnrichmentStatus ||
      !authorEnrichmentSources
    ) {
      return;
    }

    if (!author) {
      authorEnrichmentPanel.hidden =
        true;

      return;
    }

    const guide =
      buildV11AuthorEnrichmentGuide(
        author
      );

    authorEnrichmentPanel.hidden =
      false;

    authorEnrichmentStatus
      .replaceChildren();

    const readiness =
      getV11AuthorEditorialReadiness(
        author
      );

    const readinessBox =
      document.createElement("div");

    readinessBox.className =
      "v11-author-enrichment-readiness";

    const readinessTop =
      document.createElement("div");

    const readinessLabel =
      document.createElement("strong");

    const readinessValue =
      document.createElement("strong");

    readinessLabel.textContent =
      "Complétude éditoriale";

    readinessValue.textContent =
      readiness.score + "%";

    readinessTop.appendChild(
      readinessLabel
    );

    readinessTop.appendChild(
      readinessValue
    );

    const readinessTrack =
      document.createElement("div");

    readinessTrack.className =
      "v11-author-readiness-track";

    const readinessProgress =
      document.createElement("span");

    readinessProgress.style.width =
      readiness.score + "%";

    readinessTrack.appendChild(
      readinessProgress
    );

    const readinessNext =
      document.createElement("p");

    readinessNext.textContent =
      readiness.nextPriority
        ? "Prochaine priorité : " +
          readiness.nextPriority
        : "Tous les critères obligatoires sont renseignés.";

    readinessBox.appendChild(
      readinessTop
    );

    readinessBox.appendChild(
      readinessTrack
    );

    readinessBox.appendChild(
      readinessNext
    );

    authorEnrichmentStatus
      .appendChild(
        readinessBox
      );

    guide.fields.forEach((field) => {
      const row =
        document.createElement("div");

      row.className =
        "v11-author-enrichment-field " +
        (
          field.ok
            ? "is-complete"
            : "is-missing"
        );

      const marker =
        document.createElement("span");

      const label =
        document.createElement("strong");

      const meta =
        document.createElement("small");

      marker.textContent =
        field.ok ? "✓" : "○";

      label.textContent =
        field.label;

      meta.textContent =
        field.ok
          ? "Renseigné"
          : field.required
            ? "À compléter"
            : "Facultatif";

      row.appendChild(marker);
      row.appendChild(label);
      row.appendChild(meta);

      authorEnrichmentStatus
        .appendChild(row);
    });

    authorEnrichmentSources
      .replaceChildren();

    const title =
      document.createElement("h5");

    title.textContent =
      "Sources disponibles";

    authorEnrichmentSources
      .appendChild(title);

    const summary =
      document.createElement("p");

    summary.textContent =
      guide.presences.length +
      " présence" +
      (
        guide.presences.length > 1
          ? "s"
          : ""
      ) +
      " validée" +
      (
        guide.presences.length > 1
          ? "s"
          : ""
      ) +
      " · " +
      guide.eventCount +
      " événement" +
      (
        guide.eventCount > 1
          ? "s"
          : ""
      ) +
      " lié" +
      (
        guide.eventCount > 1
          ? "s"
          : ""
      );

    authorEnrichmentSources
      .appendChild(summary);

    guide.profileLinks.forEach(
      (url, index) => {
        appendV11AuthorSourceLink(
          authorEnrichmentSources,
          index === 0
            ? "Vitrine / profil"
            : "Autre profil",
          url
        );
      }
    );

    guide.shopLinks.forEach(
      (url, index) => {
        appendV11AuthorSourceLink(
          authorEnrichmentSources,
          index === 0
            ? "Livre / boutique"
            : "Autre lien livre",
          url
        );
      }
    );

    if (
      !guide.profileLinks.length &&
      !guide.shopLinks.length
    ) {
      const empty =
        document.createElement("p");

      empty.className =
        "v11-author-enrichment-empty";

      empty.textContent =
        "Aucun lien source exploitable dans les présences validées.";

      authorEnrichmentSources
        .appendChild(empty);
    }
  }


  function v11AuthorReadyChecklist(author) {
    const state = context.getState();
    const presences = state.community?.presences || [];

    const id = String(author?.id || "");
    const slug = String(author?.slug || "");
    const name = String(author?.pseudo || "").trim().toLowerCase();

    const linked = presences.filter((row) => {
      const rowName = String(row.pseudo || "").trim().toLowerCase();

      return (
        (id && String(row.author_id || "") === id) ||
        (slug && String(row.author_slug || row.author_identity_key || "") === slug) ||
        (name && rowName === name)
      );
    });

    const valid = linked.filter(
      (row) => row.validated === true && row.rejected !== true
    );

    const photo =
      author?.avatar_url ||
      valid.find((row) => row.author_portrait_url)?.author_portrait_url;

    const website =
      author?.website ||
      valid.find((row) => row.author_profile_url || row.website)?.author_profile_url ||
      valid.find((row) => row.website)?.website;

    const shop =
      author?.shop_url ||
      valid.find((row) => row.book_or_publisher_url)?.book_or_publisher_url;

    const checks = [
      ["Identité", Boolean(String(author?.pseudo || "").trim())],
      ["Photo", Boolean(photo)],
      ["Type", ["author","artist_author","hybrid"].includes(author?.profile_type)],
      ["Biographie", Boolean(String(author?.bio || "").trim())],
      ["Historique", valid.length > 0]
    ];

    const optionalChecks = [
      ["Localisation", Boolean(String(author?.location || "").trim())],
      ["Vitrine", Boolean(String(website || "").trim())],
      ["Boutique", Boolean(String(shop || "").trim())]
    ];

    const authors = state.community?.authors || [];

    const duplicate = authors.some((other) => (
      String(other.id) !== String(author.id) &&
      !other.merged_into &&
      (
        (slug && String(other.slug || "") === slug) ||
        (
          name &&
          String(other.pseudo || "").trim().toLowerCase() === name
        )
      )
    ));

    const completed = checks.filter(([, ok]) => ok).length;

    const optionalCompleted =
      optionalChecks.filter(([, ok]) => ok).length;

    return {
      checks,
      optionalChecks,
      completed,
      total: checks.length,
      percent:
        Math.round(
          completed / checks.length * 100
        ),
      optionalCompleted,
      optionalTotal: optionalChecks.length,
      duplicate,
      ready:
        completed === checks.length &&
        !duplicate &&
        !author?.merged_into
    };
  }

  async function toggleV11AuthorPublished() {
    if (v11CommunityActionRunning) return;

    const state = context.getState();
    const author = getSelectedV11Author();
    const client = context.getClient();

    if (state.authenticated !== true || !author || !client) {
      window.alert("Session ou fiche auteur indisponible.");
      return;
    }

    if (author.merged_into) {
      window.alert("Cette fiche est déjà fusionnée.");
      return;
    }

    const publish = author.published !== true;

    if (
      publish &&
      window.DEDICALIVRES_CONFIG
        ?.authorPublicPublishingEnabled !== true
    ) {
      window.alert(
        "ESPACE AUTEUR EN PRÉPARATION\n\n" +
        "La publication publique est volontairement désactivée. " +
        "Utilise « Aperçu interne » pour contrôler la fiche."
      );
      return;
    }

    if (publish) {
      const canPublish =
        author.publication_ready === true &&
        author.validated === true &&
        !author.merged_into &&
        author.published !== true;

      if (!canPublish) {
        window.alert(
          "Cette fiche ne remplit pas les conditions de publication."
        );
        return;
      }
    }

    const authorName =
      String(author.pseudo || "cette fiche auteur").trim();

    if (!window.confirm(
      publish
        ? "PUBLICATION PUBLIQUE\n\n" +
          authorName +
          "\n\nConfirmer la publication de cette fiche auteur ?"
        : "DÉPUBLICATION\n\n" +
          authorName +
          "\n\nConfirmer la dépublication de cette fiche auteur ?"
    )) return;

    v11CommunityActionRunning = true;
    authorPublishButton.disabled = true;
    authorPublishButton.textContent =
      publish ? "Publication…" : "Dépublication…";

    try {
      let payload;

      if (publish) {
        const auth = await client.auth.getUser();
        const adminId = auth.data?.user?.id;

        if (auth.error || !adminId) {
          throw new Error("Administrateur non identifié.");
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

      const result = await client
        .from("authors")
        .update(payload)
        .eq("id", author.id);

      if (result.error) throw result.error;

      await context.refresh();

      const refreshed = getSelectedV11Author();
      if (refreshed) renderV11AuthorDetail(refreshed);

      v11CommunityMessage(
        publish
          ? "Fiche auteur publiée."
          : "Fiche auteur dépubliée."
      );
    } catch (error) {
      console.error("V11 publication auteur", error);
      window.alert(
        error?.message ||
        "Modification de publication impossible."
      );
    } finally {
      v11CommunityActionRunning = false;
    }
  }

  async function toggleV11AuthorReady() {
    if (v11CommunityActionRunning) return;

    const state = context.getState();
    const author = getSelectedV11Author();
    const client = context.getClient();

    if (state.authenticated !== true || !author || !client) {
      window.alert("Session ou fiche auteur indisponible.");
      return;
    }

    if (author.merged_into) {
      window.alert("Cette fiche est déjà fusionnée.");
      return;
    }

    const setReady = author.publication_ready !== true;
    const checklist = v11AuthorReadyChecklist(author);

    if (setReady && !checklist.ready) {
      const missing = checklist.checks
        .filter(([, ok]) => !ok)
        .map(([label]) => label);

      window.alert(
        "Fiche incomplète.\n\n" +
        (missing.length ? "Manque : " + missing.join(", ") + "\n" : "") +
        (checklist.duplicate ? "Doublon potentiel détecté." : "")
      );
      return;
    }

    if (!window.confirm(
      setReady
        ? "Marquer cette fiche comme prête à publier ?\n\nAucune publication publique ne sera déclenchée."
        : "Retirer le statut « prêt à publier » ?"
    )) return;

    v11CommunityActionRunning = true;
    authorReadyButton.disabled = true;

    try {
      let payload;

      if (setReady) {
        const auth = await client.auth.getUser();
        const adminId = auth.data?.user?.id;

        if (auth.error || !adminId) {
          throw new Error("Administrateur non identifié.");
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

      const result = await client
        .from("authors")
        .update(payload)
        .eq("id", author.id);

      if (result.error) throw result.error;

      await context.refresh();

      const refreshed = getSelectedV11Author();
      if (refreshed) renderV11AuthorDetail(refreshed);

      v11CommunityMessage(
        setReady
          ? "Fiche prête à publier — aucune publication automatique."
          : "Statut prêt à publier retiré."
      );
    } catch (error) {
      console.error("V11 statut auteur", error);
      window.alert(error?.message || "Mise à jour impossible.");
    } finally {
      v11CommunityActionRunning = false;
    }
  }

  function renderV11AuthorDetail(item) {
    if (
      !authorDetail ||
      !authorDetailContent ||
      !item
    ) {
      return;
    }

    selectedV11AuthorId = item.id;

    const activePanel =
      document.querySelector(
        ".v11-community-panel.is-active"
      );

    if (
      activePanel &&
      authorDetail.parentElement !==
        activePanel
    ) {
      activePanel.prepend(authorDetail);
    }

    authorDetail.hidden = false;
    authorDetailContent.replaceChildren();

    if (authorDetailTitle) {
      authorDetailTitle.textContent =
        item.pseudo ||
        "Auteur consolidé";
    }

    addV11AuthorDetailRow(
      "Type",
      profileLabel(item.profile_type)
    );

    addV11AuthorDetailRow(
      "Pseudo",
      item.pseudo
    );

    addV11AuthorDetailRow(
      "Slug",
      item.slug
    );

    addV11AuthorDetailRow(
      "Localisation",
      item.location
    );

    addV11AuthorDetailRow(
      "Site web",
      item.website
    );

    addV11AuthorDetailRow(
      "Boutique",
      item.shop_url
    );

    addV11AuthorDetailRow(
      "Avatar",
      item.avatar_url
        ? "Disponible"
        : "Absent"
    );

    addV11AuthorDetailRow(
      "Biographie",
      item.bio
    );

    addV11AuthorDetailRow(
      "Fiche validée",
      item.validated === true
        ? "Oui"
        : "Non"
    );

    addV11AuthorDetailRow(
      "Prêt à publier",
      item.publication_ready === true
        ? "Oui"
        : "Non"
    );

    addV11AuthorDetailRow(
      "Publié",
      item.published === true
        ? "Oui"
        : "Non"
    );

    addV11AuthorDetailRow(
      "Préparation publication",
      item.publication_ready_at
    );

    addV11AuthorDetailRow(
      "Publication",
      item.published_at
    );

    addV11AuthorDetailRow(
      "Fusionné vers",
      item.merged_into
    );

    addV11AuthorDetailRow(
      "Fusionné le",
      item.merged_at
    );

    addV11AuthorDetailRow(
      "Créé le",
      item.created_at
    );

    if (authorPreviewLink) {
      const previewSlug =
        String(item.slug || "").trim();

      if (previewSlug) {
        authorPreviewLink.href =
          "author.html?slug=" +
          encodeURIComponent(previewSlug) +
          "&preview=admin";

        authorPreviewLink.hidden = false;
      } else {
        authorPreviewLink.hidden = true;
        authorPreviewLink.removeAttribute("href");
      }
    }

    if (authorReadyButton) {
      const checklist = v11AuthorReadyChecklist(item);

      authorReadyButton.textContent =
        item.publication_ready === true
          ? "Retirer prêt à publier"
          : "Prêt à publier";

      authorReadyButton.disabled =
        item.publication_ready !== true &&
        !checklist.ready;

      authorReadyButton.title =
        "Préparation " +
        checklist.completed + "/" +
        checklist.total + " · " +
        checklist.percent + "%";

      addV11AuthorDetailRow(
        "Préparation obligatoire",
        checklist.completed + "/" +
        checklist.total + " · " +
        checklist.percent + "%"
      );

      addV11AuthorDetailRow(
        "Enrichissements facultatifs",
        checklist.optionalCompleted + "/" +
        checklist.optionalTotal
      );

      addV11AuthorDetailRow(
        "Doublon potentiel",
        checklist.duplicate ? "À vérifier" : "Non détecté"
      );
    }

    if (authorPublishButton) {
      const publicPublishingEnabled =
        window.DEDICALIVRES_CONFIG
          ?.authorPublicPublishingEnabled === true;

      const canPublish =
        publicPublishingEnabled &&
        item.publication_ready === true &&
        item.validated === true &&
        !item.merged_into &&
        item.published !== true;

      authorPublishButton.textContent =
        item.published === true
          ? "Dépublier"
          : "Publier";

      authorPublishButton.disabled =
        item.published === true
          ? false
          : !canPublish;

      authorPublishButton.title =
        item.published === true
          ? "Dépublier cette fiche auteur"
          : !publicPublishingEnabled
            ? "Publication publique désactivée — aperçu interne disponible"
            : canPublish
              ? "Publier cette fiche auteur"
              : "Publication indisponible : fiche non prête ou non validée";
    }

    if (authorMergeButton) {
      authorMergeButton.disabled = true;
    }

    authorDetail.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function openV11AuthorEditor(item) {
    if (!authorEditor || !item) {
      return;
    }

    const activePanel =
      document.querySelector(
        ".v11-community-panel.is-active"
      );

    if (
      activePanel &&
      authorEditor.parentElement !==
        activePanel
    ) {
      activePanel.prepend(authorEditor);
    }

    if (authorEditorTitle) {
      authorEditorTitle.textContent =
        "Modifier · " +
        (
          item.pseudo ||
          "Auteur"
        );
    }

    if (authorEditPseudo) {
      authorEditPseudo.value =
        item.pseudo || "";
    }

    if (authorEditSlug) {
      authorEditSlug.value =
        item.slug || "";
    }

    if (authorEditType) {
      authorEditType.value =
        item.profile_type ||
        "author";
    }

    if (authorEditLocation) {
      authorEditLocation.value =
        item.location || "";
    }

    if (authorEditWebsite) {
      authorEditWebsite.value =
        item.website || "";
    }

    if (authorEditShop) {
      authorEditShop.value =
        item.shop_url || "";
    }

    resetV11AuthorPortraitSelection();

    if (authorEditAvatar) {
      authorEditAvatar.value =
        item.avatar_url || "";
    }

    previewV11AuthorPortrait(
      null,
      item.avatar_url || ""
    );

    if (authorEditAvatarStatus) {
      authorEditAvatarStatus.textContent =
        item.avatar_url
          ? "Portrait actuel chargé."
          : "Aucun portrait enregistré.";
    }

    if (authorEditBio) {
      authorEditBio.value =
        item.bio || "";
    }

    authorEditor.hidden = false;

    authorEditor.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function closeV11PresenceEditor() {
    if (presenceEditor) {
      presenceEditor.hidden = true;
    }
  }

  function openV11PresenceEditor(item) {
    if (!presenceEditor || !item) {
      return;
    }

    if (
      selectedV11CommunityKind !==
      "presence"
    ) {
      return;
    }

    const activePanel =
      document.querySelector(
        ".v11-community-panel.is-active"
      );

    if (
      activePanel &&
      presenceEditor.parentElement !==
        activePanel
    ) {
      activePanel.prepend(
        presenceEditor
      );
    }

    if (presenceEditorTitle) {
      presenceEditorTitle.textContent =
        "Modifier · " +
        presenceDisplayName(item);
    }

    if (presenceEditPseudo) {
      presenceEditPseudo.value =
        item.pseudo || "";
    }

    if (presenceEditType) {
      presenceEditType.value =
        item.participant_type ||
        "author";
    }

    if (presenceEditOrganization) {
      presenceEditOrganization.value =
        item.organization_name || "";
    }

    if (presenceEditPublisher) {
      presenceEditPublisher.value =
        item.publisher_name || "";
    }

    if (presenceEditProfileUrl) {
      presenceEditProfileUrl.value =
        item.author_profile_url ||
        item.website ||
        "";
    }

    if (presenceEditProfileUrlType) {
      presenceEditProfileUrlType.value =
        item.author_profile_url_type ||
        "";
    }

    if (presenceEditBookUrl) {
      presenceEditBookUrl.value =
        item.book_or_publisher_url ||
        "";
    }

    if (presenceEditBookUrlType) {
      presenceEditBookUrlType.value =
        item.book_or_publisher_url_type ||
        "";
    }

    if (presenceEditContact) {
      presenceEditContact.value =
        item.contact_name || "";
    }

    if (presenceEditEmail) {
      presenceEditEmail.value =
        item.contact_email || "";
    }

    if (presenceEditNote) {
      presenceEditNote.value =
        item.admin_note || "";
    }

    if (presenceEditVerified) {
      presenceEditVerified.checked =
        item.presence_verified === true;
    }

    presenceEditor.hidden = false;

    presenceEditor.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function setV11CommunityButtons(item) {
    if (!item) return;

    const busy =
      v11CommunityActionRunning;

    if (communityValidateButton) {
      communityValidateButton.disabled =
        busy ||
        (
          item.validated === true &&
          item.rejected !== true
        );
    }

    if (communityPendingButton) {
      communityPendingButton.disabled =
        busy ||
        (
          item.validated !== true &&
          item.rejected !== true
        );
    }

    if (communityRejectButton) {
      communityRejectButton.disabled =
        busy ||
        item.rejected === true;
    }

    if (communityEditButton) {
      communityEditButton.disabled =
        busy ||
        selectedV11CommunityKind !==
          "presence";
    }

    if (communityDeleteButton) {
      communityDeleteButton.disabled = true;
    }
  }

  function setV11CommunityBusy(busy) {
    v11CommunityActionRunning =
      Boolean(busy);

    const item =
      getSelectedV11CommunityItem();

    if (item) {
      setV11CommunityButtons(item);
    }
  }

  function v11CommunityMessage(message) {
    if (
      typeof window.showToast ===
      "function"
    ) {
      window.showToast(message);
      return;
    }

    console.log(message);
  }

  async function refreshV11CommunityAfterAction() {
    await context.refresh();

    const item =
      getSelectedV11CommunityItem();

    if (!item) {
      if (communityDetail) {
        communityDetail.hidden = true;
      }

      selectedV11CommunityKind = null;
      selectedV11CommunityId = null;
      return;
    }

    renderCommunityDetail(
      selectedV11CommunityKind,
      item
    );
  }

  async function runV11CommunityAction(
    action
  ) {
    if (v11CommunityActionRunning) {
      return;
    }

    const state =
      context.getState();

    if (state.authenticated !== true) {
      window.alert(
        "Session admin absente."
      );
      return;
    }

    const item =
      getSelectedV11CommunityItem();

    const client =
      context.getClient();

    if (
      !item ||
      !client ||
      !selectedV11CommunityKind
    ) {
      window.alert(
        "Élément Communauté indisponible."
      );
      return;
    }

    let payload;

    let testimonialModerationMeta = null;

    if (
      selectedV11CommunityKind ===
      "testimonial"
    ) {
      const auth =
        await client.auth.getUser();

      const adminId =
        auth.data?.user?.id || null;

      if (auth.error || !adminId) {
        window.alert(
          "Administrateur non identifié. Aucune modération enregistrée."
        );
        return;
      }

      testimonialModerationMeta = {
        moderated_at:
          new Date().toISOString(),
        moderated_by:
          adminId
      };
    }

    if (action === "validate") {
      payload = {
        validated: true,
        rejected: false,
        ...(testimonialModerationMeta || {})
      };
    } else if (action === "pending") {
      payload = {
        validated: false,
        rejected: false,
        ...(testimonialModerationMeta || {})
      };
    } else if (action === "reject") {
      payload = {
        validated: false,
        rejected: true,
        ...(testimonialModerationMeta || {})
      };
    } else {
      return;
    }

    const label =
      selectedV11CommunityKind ===
      "presence"
        ? "cette présence"
        : "ce témoignage";

    const actionLabel =
      action === "validate"
        ? "Valider"
        : action === "pending"
          ? "Remettre en attente"
          : "Refuser";

    const confirmed =
      window.confirm(
        actionLabel +
        " " +
        label +
        " ?"
      );

    if (!confirmed) {
      return;
    }

    setV11CommunityBusy(true);

    try {
      if (
        selectedV11CommunityKind ===
        "testimonial"
      ) {
        const response =
          await client
            .from("testimonials")
            .update(payload)
            .eq("id", item.id);

        if (response.error) {
          throw response.error;
        }
      }

      if (
        selectedV11CommunityKind ===
        "presence"
      ) {
        const presencePayload = {
          validated:
            payload.validated,
          rejected:
            payload.rejected,
          updated_at:
            new Date().toISOString()
        };

        let response =
          await client
            .from(
              "event_authors_presence"
            )
            .update(presencePayload)
            .eq("id", item.id);

        if (
          response.error &&
          (
            String(
              response.error.code || ""
            ) === "42703" ||
            String(
              response.error.code || ""
            ) === "PGRST204" ||
            String(
              response.error.message || ""
            )
              .toLowerCase()
              .includes("column")
          )
        ) {
          response =
            await client
              .from(
                "event_authors_presence"
              )
              .update({
                validated:
                  payload.validated,
                rejected:
                  payload.rejected
              })
              .eq("id", item.id);
        }

        if (response.error) {
          throw response.error;
        }
      }

      if (
        selectedV11CommunityKind ===
        "testimonial"
      ) {
        addV11TestimonialTrace(
          item,
          action
        );
      }

      v11CommunityMessage(
        action === "validate"
          ? "Élément validé."
          : action === "pending"
            ? "Élément remis en attente."
            : "Élément refusé."
      );

      await refreshV11CommunityAfterAction();

    } catch (error) {
      console.error(
        "Erreur modération Communauté V11",
        error
      );

      window.alert(
        "Action impossible.\n\n" +
        (
          error?.message ||
          "Erreur Supabase"
        )
      );

    } finally {
      setV11CommunityBusy(false);
    }
  }

  async function runV11QuickTestimonialAction(
    testimonialId,
    action,
    trigger
  ) {
    if (
      !testimonialId ||
      ![
        "validate",
        "pending",
        "reject"
      ].includes(action)
    ) {
      return;
    }

    const state =
      context.getState();

    const item =
      (
        state.community
          ?.testimonials || []
      ).find(
        (row) =>
          String(row.id) ===
          String(testimonialId)
      );

    if (!item) {
      window.alert(
        "Témoignage introuvable."
      );
      return;
    }

    selectedV11CommunityKind =
      "testimonial";

    selectedV11CommunityId =
      item.id;

    if (trigger) {
      trigger.disabled = true;
      trigger.setAttribute(
        "aria-busy",
        "true"
      );
    }

    try {
      await runV11CommunityAction(
        action
      );
    } finally {
      if (
        trigger &&
        trigger.isConnected
      ) {
        trigger.disabled = false;
        trigger.removeAttribute(
          "aria-busy"
        );
      }
    }
  }

  function communityValue(
    value,
    fallback = "Non renseigné"
  ) {
    if (Array.isArray(value)) {
      return value.length
        ? value.join(", ")
        : fallback;
    }

    const text =
      String(value ?? "").trim();

    return text || fallback;
  }

  function addCommunityDetailRow(
    label,
    value
  ) {
    if (!communityDetailContent) {
      return;
    }

    const row =
      document.createElement("div");

    row.className =
      "v11-community-detail-row";

    const key =
      document.createElement("span");

    key.textContent = label;

    const val =
      document.createElement("strong");

    val.textContent =
      communityValue(value);

    row.appendChild(key);
    row.appendChild(val);

    communityDetailContent.appendChild(
      row
    );
  }

  function addTestimonialPhotoPreview(item) {
    if (
      !communityDetailContent ||
      !item?.image_url
    ) {
      return;
    }

    const figure =
      document.createElement("figure");

    figure.className =
      "v11-testimonial-detail-photo";

    const image =
      document.createElement("img");

    image.src = item.image_url;
    image.alt =
      "Photo du témoignage de " +
      (item.pseudo || "un lecteur");
    image.loading = "lazy";

    const actions =
      document.createElement("figcaption");

    const link =
      document.createElement("a");

    link.href = item.image_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className =
      "v11-testimonial-photo-link";
    link.textContent =
      "Ouvrir la photo ↗";

    actions.appendChild(link);

    figure.appendChild(image);
    figure.appendChild(actions);

    communityDetailContent.appendChild(
      figure
    );
  }

  function renderCommunityDetail(
    kind,
    item
  ) {
    if (
      !communityDetail ||
      !communityDetailContent ||
      !item
    ) {
      return;
    }

    selectedV11CommunityKind = kind;
    selectedV11CommunityId = item.id;

    const activeCommunityPanel =
      document.querySelector(
        ".v11-community-panel.is-active"
      );

    if (
      activeCommunityPanel &&
      communityDetail.parentElement !==
        activeCommunityPanel
    ) {
      activeCommunityPanel.prepend(
        communityDetail
      );
    }

    communityDetail.hidden = false;
    communityDetailContent.replaceChildren();

    setV11CommunityButtons(item);

    if (kind === "presence") {
      if (communityDetailLabel) {
        communityDetailLabel.textContent =
          "PRÉSENCE";
      }

      if (communityDetailTitle) {
        communityDetailTitle.textContent =
          presenceDisplayName(item);
      }

      addCommunityDetailRow(
        "Profil",
        profileLabel(
          item.participant_type
        )
      );

      addCommunityDetailRow(
        "Pseudo",
        item.pseudo
      );

      addCommunityDetailRow(
        "Organisation",
        item.organization_name
      );

      addCommunityDetailRow(
        "Maison d’édition",
        item.publisher_name
      );

      addCommunityDetailRow(
        "Événement",
        item.event_id
      );

      addCommunityDetailRow(
        "Profil public",
        item.author_profile_url ||
        item.website
      );

      addCommunityDetailRow(
        "Type lien profil",
        item.author_profile_url_type
      );

      addCommunityDetailRow(
        "Livre / éditeur",
        item.book_or_publisher_url
      );

      addCommunityDetailRow(
        "Type lien livre",
        item.book_or_publisher_url_type
      );

      addCommunityDetailRow(
        "Contact",
        item.contact_name
      );

      addCommunityDetailRow(
        "Email privé",
        item.contact_email
      );

      addCommunityDetailRow(
        "Note admin",
        item.admin_note
      );

      addCommunityDetailRow(
        "Présence vérifiée",
        item.presence_verified === true
          ? "Oui"
          : "Non"
      );

      addCommunityDetailRow(
        "Statut",
        item.rejected === true
          ? "Rejetée"
          : item.validated === true
            ? "Validée"
            : "À traiter"
      );

      addCommunityDetailRow(
        "Source",
        item.source
      );

      addCommunityDetailRow(
        "Créée le",
        item.created_at
      );
    }

    if (kind === "testimonial") {
      if (communityDetailLabel) {
        communityDetailLabel.textContent =
          "TÉMOIGNAGE";
      }

      if (communityDetailTitle) {
        communityDetailTitle.textContent =
          item.pseudo || "Anonyme";
      }

      addTestimonialPhotoPreview(item);

      addCommunityDetailRow(
        "Pseudo",
        item.pseudo
      );

      addCommunityDetailRow(
        "Événement",
        item.event_title
      );

      addCommunityDetailRow(
        "Message",
        item.message
      );

      addCommunityDetailRow(
        "Photo",
        item.image_url
          ? "Disponible — aperçu ci-dessus"
          : "Absente"
      );

      addCommunityDetailRow(
        "Statut actuel",
        item.rejected === true
          ? "Refusé"
          : item.validated === true
            ? "Validé"
            : "À traiter"
      );

      addCommunityDetailRow(
        "Soumis le",
        item.created_at
      );

      addCommunityDetailRow(
        "Dernière modération",
        formatV11ModerationDate(
          item.moderated_at
        )
      );

      addCommunityDetailRow(
        "Modéré par",
        item.moderated_by ||
        "Non renseigné"
      );

      addCommunityDetailRow(
        "Traçabilité",
        item.moderated_at
          ? "Persistée dans Supabase"
          : "Aucune modération persistée"
      );
    }

    communityDetail.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  if (communityDetailClose) {
    communityDetailClose.addEventListener(
      "click",
      function () {
        communityDetail.hidden = true;
        closeV11PresenceEditor();
        selectedV11CommunityKind = null;
        selectedV11CommunityId = null;
      }
    );
  }

  if (communityValidateButton) {
    communityValidateButton.addEventListener(
      "click",
      function () {
        runV11CommunityAction(
          "validate"
        );
      }
    );
  }

  if (communityPendingButton) {
    communityPendingButton.addEventListener(
      "click",
      function () {
        runV11CommunityAction(
          "pending"
        );
      }
    );
  }

  if (communityRejectButton) {
    communityRejectButton.addEventListener(
      "click",
      function () {
        runV11CommunityAction(
          "reject"
        );
      }
    );
  }

  if (communityEditButton) {
    communityEditButton.addEventListener(
      "click",
      function () {
        const item =
          getSelectedV11CommunityItem();

        if (item) {
          openV11PresenceEditor(item);
        }
      }
    );
  }

  if (presenceEditCancel) {
    presenceEditCancel.addEventListener(
      "click",
      closeV11PresenceEditor
    );
  }

  if (presenceEditClose) {
    presenceEditClose.addEventListener(
      "click",
      closeV11PresenceEditor
    );
  }

  if (presenceEditorForm) {
    presenceEditorForm.addEventListener(
      "submit",
      function (event) {
        event.preventDefault();
        saveV11PresenceEdition();
      }
    );
  }


  document.addEventListener(
    "click",
    function (clickEvent) {
      const presenceButton =
        clickEvent.target.closest(
          "[data-community-presence]"
        );

      if (presenceButton) {
        const state =
          context.getState();

        const item =
          (
            state.community
              ?.presences || []
          ).find(
            function (row) {
              return (
                String(row.id) ===
                String(
                  presenceButton
                    .dataset
                    .communityPresence
                )
              );
            }
          );

        if (item) {
          renderCommunityDetail(
            "presence",
            item
          );
        }

        return;
      }

      const authorButton =
        clickEvent.target.closest(
          "[data-community-author]"
        );

      if (authorButton) {
        const state =
          context.getState();

        const item =
          (
            state.community
              ?.authors || []
          ).find(
            function (row) {
              return (
                String(row.id) ===
                String(
                  authorButton
                    .dataset
                    .communityAuthor
                )
              );
            }
          );

        if (item) {
          renderV11AuthorDetail(item);
        }

        return;
      }

      const testimonialQuickButton =
        clickEvent.target.closest(
          "[data-testimonial-quick-action]"
        );

      if (testimonialQuickButton) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();

        runV11QuickTestimonialAction(
          testimonialQuickButton
            .dataset
            .testimonialQuickId,
          testimonialQuickButton
            .dataset
            .testimonialQuickAction,
          testimonialQuickButton
        );

        return;
      }

      const testimonialButton =
        clickEvent.target.closest(
          "[data-community-testimonial]"
        );

      if (testimonialButton) {
        const state =
          context.getState();

        const item =
          (
            state.community
              ?.testimonials || []
          ).find(
            function (row) {
              return (
                String(row.id) ===
                String(
                  testimonialButton
                    .dataset
                    .communityTestimonial
                )
              );
            }
          );

        if (item) {
          renderCommunityDetail(
            "testimonial",
            item
          );
        }
      }
    }
  );

  // V11.48 slash search shortcut
  document.addEventListener(
    "keydown",
    function (event) {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const target =
        event.target;

      const tagName =
        String(
          target?.tagName || ""
        ).toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      const activeView =
        getV11ActiveCommunityView();

      if (
        activeView !== "presence" &&
        activeView !== "testimonials"
      ) {
        return;
      }

      if (presenceSearch) {
        event.preventDefault();
        presenceSearch.focus();
        presenceSearch.select();
      }
    }
  );

  // V11.47 Escape community panels
  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Escape") {
        return;
      }

      if (
        communityDetail &&
        !communityDetail.hidden
      ) {
        communityDetail.hidden = true;
        selectedV11CommunityKind = null;
        selectedV11CommunityId = null;
      }

      if (
        typeof closeV11AuthorDetail ===
        "function"
      ) {
        closeV11AuthorDetail();
      }

      if (
        typeof closeV11PresenceEditor ===
        "function"
      ) {
        closeV11PresenceEditor();
      }
    }
  );

function openCommunityView(name) {
    document
      .querySelectorAll(".v11-community-panel")
      .forEach((panel) => {
        panel.classList.remove("is-active");
      });

    communityTabs.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.communityView === name
      );
    });

    const panel =
      document.getElementById(
        "v11-community-" + name
      );

    if (panel) {
      panel.classList.add("is-active");
    }

    if (communityDetail) {
      communityDetail.hidden = true;
    }

    selectedV11CommunityKind = null;
    selectedV11CommunityId = null;

    closeV11AuthorDetail();

    const toolbar =
      document.querySelector(
        '[data-community-toolbar="presence"]'
      );

    if (toolbar) {
      toolbar.hidden = name !== "presence";
    }
  }

  function renderSupabaseStatus(state) {
    const label =
      document.querySelector(
        '[data-admin-bind="supabase-status"]'
      );

    const chip =
      document.querySelector(
        '[data-admin-status-chip="supabase"]'
      );

    if (!label || !chip) return;

    if (state.status === "ready") {
      label.textContent =
        "Connexion active";

      chip.textContent =
        "Opérationnel";

      chip.className =
        "v11-chip ok";

      return;
    }

    if (
      state.status === "loading" ||
      state.status === "booting"
    ) {
      label.textContent = "Chargement";
      chip.textContent = "Connexion";
      chip.className =
        "v11-chip neutral";

      return;
    }

    if (
      state.status ===
      "unauthenticated"
    ) {
      label.textContent =
        "Session requise";

      chip.textContent =
        "Verrouillé";

      chip.className =
        "v11-chip warning";

      return;
    }

    label.textContent =
      "Indisponible";

    chip.textContent =
      "Erreur";

    chip.className =
      "v11-chip warning";
  }

  function renderState(state) {
    const loading =
      state.status === "loading" ||
      state.status === "booting";

    document.body.classList.toggle(
      "v11-is-loading",
      loading
    );

    const showAuth =
      state.authenticated === false;

    if (authGate) {
      authGate.hidden = !showAuth;

      authGate.style.display =
        showAuth ? "grid" : "none";

      authGate.setAttribute(
        "aria-hidden",
        showAuth ? "false" : "true"
      );
    }

    if (state.communityMetrics) {
      const communityMetrics = state.communityMetrics;

      if (communityMetrics.presenceTotal !== null) {
        setBoundText(
          "presence-total",
          String(communityMetrics.presenceTotal)
        );
      }

      if (communityMetrics.presencePending !== null) {
        setBoundText(
          "presence-pending",
          String(communityMetrics.presencePending)
        );
      }

      if (communityMetrics.presenceValidated !== null) {
        setBoundText(
          "presence-validated",
          String(communityMetrics.presenceValidated)
        );
      }

      if (communityMetrics.presenceRejected !== null) {
        setBoundText(
          "presence-rejected",
          String(communityMetrics.presenceRejected)
        );
      }

      if (communityMetrics.authorsTotal !== null) {
        setBoundText(
          "authors-total",
          String(communityMetrics.authorsTotal)
        );
      }

      if (communityMetrics.testimonialsTotal !== null) {
        setBoundText(
          "testimonials-total",
          String(communityMetrics.testimonialsTotal)
        );
      }
    }

    if (state.metrics.qualityMissingImage !== null) {
      setBoundText(
        "quality-missing-image",
        String(state.metrics.qualityMissingImage)
      );
    }

    if (state.metrics.qualityMissingCoords !== null) {
      setBoundText(
        "quality-missing-coords",
        String(state.metrics.qualityMissingCoords)
      );
    }

    if (state.metrics.qualityMissingWebsite !== null) {
      setBoundText(
        "quality-missing-website",
        String(state.metrics.qualityMissingWebsite)
      );
    }

    if (state.metrics.qualitySoon !== null) {
      setBoundText(
        "quality-soon",
        String(state.metrics.qualitySoon)
      );
    }

    if (state.metrics.qualityFeaturedPast !== null) {
      setBoundText(
        "quality-featured-past",
        String(state.metrics.qualityFeaturedPast)
      );
    }

    if (state.metrics.eventsTotal !== null) {
      setBoundText(
        "events-total",
        String(state.metrics.eventsTotal)
      );
    }

    if (state.metrics.eventsPending !== null) {
      setBoundText(
        "events-pending",
        String(state.metrics.eventsPending)
      );
    }

    if (state.metrics.eventsValidated !== null) {
      setBoundText(
        "events-validated",
        String(state.metrics.eventsValidated)
      );
    }

    if (state.metrics.eventsRejected !== null) {
      setBoundText(
        "events-rejected",
        String(state.metrics.eventsRejected)
      );
    }

    if (
      state.metrics.eventsActive !== null
    ) {
      setBoundText(
        "events-active",
        String(
          state.metrics.eventsActive
        )
      );
    }

    setBoundText(
      "visits-today",
      state.metrics.visitsToday === null
        ? "—"
        : String(state.metrics.visitsToday)
    );

    setBoundText(
      "visits-7d",
      state.metrics.visits7d === null
        ? "—"
        : String(state.metrics.visits7d)
    );

    setBoundText(
      "visits-30d",
      state.metrics.visits30d === null
        ? "—"
        : String(state.metrics.visits30d)
    );

    setBoundText(
      "visits-total",
      state.metrics.visitsTotal === null
        ? "—"
        : String(state.metrics.visitsTotal)
    );

    setBoundText(
      "visits-status",
      state.metrics.visitsStatus ||
      "Source à connecter"
    );

    renderSupabaseStatus(state);

    if (
      state.status === "ready" &&
      state.metrics.eventsPending === 0 &&
      eventStatusFilter &&
      eventStatusFilter.value === "pending"
    ) {
      eventStatusFilter.value = "all";
    }

    renderEvents(
      state.events || [],
      state.status
    );

    renderPriority(
      state.events || []
    );

    renderRanking(
      topPages,
      state.trafficDetails
        ? state.trafficDetails.topPages
        : []
    );

    renderRanking(
      topReferrers,
      state.trafficDetails
        ? state.trafficDetails.topReferrers
        : []
    );

    if (state.community) {
      if (
        state.communityMetrics &&
        state.communityMetrics.presencePending === 0 &&
        presenceStatus &&
        presenceStatus.value === "pending"
      ) {
        presenceStatus.value = "all";
      }

      renderPresences(
        state.community.presences || []
      );

      renderAuthors(
        state.community.authors || []
      );

      renderTestimonials(
        state.community.testimonials || []
      );
    }
  }






  buttons.forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        openView(
          button.dataset.view
        );
      }
    );
  });

  [
    eventSearch,
    eventStatusFilter,
    eventTypeFilter,
    eventQualityFilter,
    eventRegistrationFilter
  ].forEach((control) => {
    if (!control) return;

    const name =
      control.tagName === "INPUT"
        ? "input"
        : "change";

    control.addEventListener(
      name,
      () => {
        const state =
          context.getState();

        renderEvents(
          state.events || [],
          state.status
        );
      }
    );
  });

  // V11.44 reactive community filters
  [
    presenceSearch,
    presenceStatus,
    presenceType,
    testimonialPhotoFilter
  ].forEach((control) => {
    if (!control) return;

    const eventName =
      control.tagName === "INPUT"
        ? "input"
        : "change";

    control.addEventListener(
      eventName,
      () => {
        const state =
          context.getState();

        const activeTab =
          document.querySelector(
            "[data-community-view].is-active"
          );

        const view =
          activeTab?.dataset.communityView ||
          "presence";

        if (view === "testimonials") {
          renderTestimonials(
            state.community?.testimonials || []
          );
        }

        if (view === "presence") {
          renderPresences(
            state.community?.presences || []
          );
        }
      }
    );
  });

  if (loginForm) {
    loginForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        loginFeedback.textContent = "";

        const email =
          document
            .getElementById(
              "v11-email"
            )
            .value.trim();

        const password =
          document.getElementById(
            "v11-password"
          ).value;

        const submit =
          loginForm.querySelector(
            'button[type="submit"]'
          );

        submit.disabled = true;
        submit.textContent =
          "Connexion...";

        try {
          await context.signIn(
            email,
            password
          );

          loginForm.reset();
          toast(
            "Connexion réussie"
          );
        } catch (error) {
          console.error(error);

          loginFeedback.textContent =
            "Connexion impossible.";
        } finally {
          submit.disabled = false;
          submit.textContent =
            "Connexion";
        }
      }
    );
  }

  if (refreshButton) {
    refreshButton.addEventListener(
      "click",
      async () => {
        refreshButton.disabled = true;

        try {
          const state =
            await context.refresh();

          toast(
            state.status === "ready"
              ? "Données actualisées"
              : "Erreur de chargement",
            state.status === "ready"
              ? "ok"
              : "error"
          );
        } finally {
          refreshButton.disabled = false;
        }
      }
    );
  }

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      async () => {
        await context.signOut();
        toast("Déconnecté");
      }
    );
  }

  window.addEventListener(
    "dedicalivres:v11-debug",
    (event) => {
      if (!eventsDebug) return;

      const detail =
        event.detail || {};

      eventsDebug.hidden = false;

      eventsDebug.textContent =
        "Diagnostic · " +
        String(
          detail.step || "inconnu"
        ) +
        " · " +
        String(
          detail.elapsed || 0
        ) +
        " ms" +
        (
          detail.count !== undefined
            ? " · " +
              String(detail.count) +
              " événement(s)"
            : ""
        ) +
        (
          detail.errorCode
            ? " · code " +
              String(
                detail.errorCode
              )
            : ""
        );
    }
  );
  context.subscribe(renderState);

  context
    .restoreSession()
    .catch((error) => {
      console.error(
        "V11 boot",
        error
      );
    });
})();
