(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG || {};
  const supabaseClient =
    window.DEDICALIVRES_SUPABASE_CLIENT ||
    (
      config.supabaseUrl &&
      config.supabaseAnonKey &&
      window.supabase
        ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
        : null
    );

  if (supabaseClient) {
    window.DEDICALIVRES_SUPABASE_CLIENT = supabaseClient;
  }

  // Interrupteur optionnel : ajouter enableMascotGuide: false dans config.js
  // ou window.DEDICALIVRES_CONFIG.enableMascotGuide = false avant ce script.
  if (config.enableMascotGuide === false) return;

  const PROFILES = {
    reader: {
      label: "Je suis lecteur",
      subtitle: "Trouver une rencontre près de moi",
      title: "Parfait, je vous guide vers les événements.",
      message:
        "Je peux vous aider à repérer les salons, dédicaces et rencontres littéraires près de chez vous.",
      actions: [
        {
          label: "Me localiser",
          hint: "Utilise le bouton existant du site",
          className: "primary",
          run: () => clickOrScroll("#locate-me", "#agenda")
        },
        {
          label: "Voir les événements",
          hint: "Aller directement à l’agenda",
          run: () => scrollToTarget("#agenda")
        },
        {
          label: "Voir la carte",
          hint: "Repérer les événements sur la carte",
          run: () => scrollToTarget("#agenda-map")
        }
      ]
    },
    author: {
      label: "Je suis auteur",
      subtitle: "Rendre visible mes dédicaces",
      title: "Bienvenue, auteur.",
      message:
        "Dédicalivres peut vous aider à rendre vos séances de dédicace et rencontres plus visibles auprès des lecteurs.",
      actions: [
        {
          label: "Je participe à un événement déjà inscrit",
          hint: "Rechercher l’événement et indiquer ma présence",
          className: "primary",
          keepOpen: true,
          mode: "panel",
          run: () => renderExistingEventSearch()
        },
        {
          label: "Proposer mon événement",
          hint: "Aller à l’espace de soumission",
          run: () => scrollToTarget("#soumettre")
        },
        {
          label: "Voir les dédicaces",
          hint: "Consulter la page dédiée",
          run: () => goTo("dedicaces.html")
        },
        {
          label: "Lire les témoignages",
          hint: "Découvrir les retours lecteurs/auteurs",
          run: () => goTo("temoignages.html")
        }
      ]
    },
    organizer: {
      label: "J’organise un événement",
      subtitle: "Salon, festival, librairie, rencontre",
      title: "Très bien, mettons votre événement en avant.",
      message:
        "Vous pouvez proposer gratuitement un salon, un festival, une rencontre littéraire ou une séance de dédicace.",
      actions: [
        {
          label: "Soumettre un événement",
          hint: "Aller à l’espace de soumission",
          className: "primary",
          run: () => scrollToTarget("#soumettre")
        },
        {
          label: "Voir salons & festivals",
          hint: "Consulter la page dédiée",
          run: () => goTo("salons-du-livre.html")
        },
        {
          label: "Explorer l’agenda",
          hint: "Voir les événements déjà publiés",
          run: () => scrollToTarget("#agenda")
        }
      ]
    },
    contact: {
      label: "Contact / partenariat",
      subtitle: "Question, correction ou proposition",
      title: "Contactez Dédicalivres.",
      message:
        "Une question, une correction à signaler ou une proposition de partenariat ? Vous pouvez contacter Dédicalivres simplement.",
      actions: [
        {
          label: "Envoyer un email",
          hint: "dedicalivres@gmail.com",
          className: "primary",
          run: () => goTo("mailto:dedicalivres@gmail.com?subject=Contact%20D%C3%A9dicalivres")
        },
        {
          label: "Suivre sur Instagram",
          hint: "@dedicalivres",
          run: () => goTo("https://www.instagram.com/dedicalivres/")
        }
      ]
    }
  };

  const state = {
    isOpen: false,
    selectedProfile: null
  };

  const widget = document.createElement("aside");
  widget.className = "mascot-guide-widget";
  widget.setAttribute("aria-label", "Guide Dédicalivres");

  widget.innerHTML = `
    <button class="mascot-guide-button" type="button" aria-expanded="false" aria-controls="mascot-guide-panel">
      <img class="mascot-guide-avatar" src="mascotte-guide.png" alt="" loading="lazy" decoding="async">
      <span class="mascot-guide-button-label">Guide Dédicalivres</span>
    </button>

    <section class="mascot-guide-panel" id="mascot-guide-panel" role="dialog" aria-modal="false" aria-labelledby="mascot-guide-title">
      <div class="mascot-guide-head">
        <img class="mascot-guide-portrait" src="mascotte-guide.png" alt="" loading="lazy" decoding="async">
        <div>
          <p class="mascot-guide-kicker">Guide optionnel</p>
          <h2 class="mascot-guide-title" id="mascot-guide-title">Bienvenue sur Dédicalivres</h2>
        </div>
        <button class="mascot-guide-close" type="button" aria-label="Fermer le guide">×</button>
      </div>

      <div class="mascot-guide-body" id="mascot-guide-body"></div>
    </section>
  `;

  function mountGuide() {
    if (document.body.contains(widget)) return;

    document.body.appendChild(widget);
    bindGuideEvents();
    renderHome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountGuide, { once: true });
  } else {
    mountGuide();
  }

  function bindGuideEvents() {
    widget.querySelector(".mascot-guide-button")?.addEventListener("click", toggleGuide);
    widget.querySelector(".mascot-guide-close")?.addEventListener("click", closeGuide);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.isOpen) closeGuide();
    });
  }

  function toggleGuide() {
    state.isOpen ? closeGuide() : openGuide();
  }

  function openGuide() {
    state.isOpen = true;
    widget.classList.add("is-open");
    widget.querySelector(".mascot-guide-button")?.setAttribute("aria-expanded", "true");
  }

  function closeGuide() {
    state.isOpen = false;
    widget.classList.remove("is-open");
    widget.querySelector(".mascot-guide-button")?.setAttribute("aria-expanded", "false");
  }

  function renderHome() {
    state.selectedProfile = null;

    const body = widget.querySelector("#mascot-guide-body");
    const title = widget.querySelector("#mascot-guide-title");

    if (!body || !title) return;

    title.textContent = "Je vous guide selon votre profil";

    body.innerHTML = `
      <p class="mascot-guide-message">
        Choisissez votre profil, puis je vous emmène vers la bonne partie du site.
      </p>

      <div class="mascot-guide-choices">
        ${Object.entries(PROFILES).map(([key, profile]) => `
          <button class="mascot-guide-choice" type="button" data-profile="${key}">
            <span>
              ${profile.label}
              <small>${profile.subtitle}</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        `).join("")}
      </div>

      <p class="mascot-guide-mini-note">
        Le guide est optionnel : il n’empêche pas d’utiliser le site normalement.
      </p>
    `;

    body.querySelectorAll("[data-profile]").forEach((button) => {
      button.addEventListener("click", () => renderProfile(button.dataset.profile));
    });
  }

  function renderProfile(profileKey) {
    const profile = PROFILES[profileKey];
    const body = widget.querySelector("#mascot-guide-body");
    const title = widget.querySelector("#mascot-guide-title");

    if (!profile || !body || !title) return;

    state.selectedProfile = profileKey;
    title.textContent = profile.title;

    body.innerHTML = `
      <p class="mascot-guide-message">${profile.message}</p>

      <div class="mascot-guide-actions">
        ${profile.actions.map((action, index) => `
          <button class="mascot-guide-action ${action.className || ""}" type="button" data-action-index="${index}">
            <span>
              ${action.label}
              <small>${action.hint}</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        `).join("")}
      </div>

      <button class="mascot-guide-back" type="button">Changer de profil</button>
    `;

        body.querySelectorAll("[data-action-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = profile.actions[Number(button.dataset.actionIndex)];

        if (!action || typeof action.run !== "function") return;

        // V10.1.1 : certaines actions ouvrent une sous-étape du guide.
        // Elles doivent garder le panneau ouvert pour ne pas perdre l’utilisateur.
        if (action.keepOpen === true || action.mode === "panel") {
          openGuide();
          action.run();
          return;
        }

        closeGuide();
        setTimeout(action.run, 90);
      });
    });

body.querySelector(".mascot-guide-back")?.addEventListener("click", renderHome);
  }


  function renderExistingEventSearch() {
    const body = widget.querySelector("#mascot-guide-body");
    const title = widget.querySelector("#mascot-guide-title");

    if (!body || !title) return;

    title.textContent = "Retrouver un événement inscrit";

    body.innerHTML = `
      <p class="mascot-guide-message">
        Recherchez le salon, festival ou rendez-vous déjà publié auquel vous participez,
        puis ouvrez sa fiche pour indiquer votre présence.
      </p>

      <div class="mascot-guide-search">
        <label for="mascot-event-search">Nom, ville ou région</label>
        <input
          id="mascot-event-search"
          type="search"
          placeholder="Ex. salon du livre, Nantes, Bretagne…"
          autocomplete="off"
        />
      </div>

      <div id="mascot-event-results" class="mascot-guide-results" aria-live="polite">
        <article class="mascot-guide-result is-empty">
          Tapez au moins 3 caractères pour rechercher un événement.
        </article>
      </div>

      <button class="mascot-guide-back" type="button">Retour auteur</button>
    `;

    const input = body.querySelector("#mascot-event-search");
    const results = body.querySelector("#mascot-event-results");
    let timer = null;

    input?.addEventListener("input", () => {
      clearTimeout(timer);
      const query = input.value.trim();

      if (query.length < 3) {
        results.innerHTML = `
          <article class="mascot-guide-result is-empty">
            Tapez au moins 3 caractères pour rechercher un événement.
          </article>
        `;
        return;
      }

      results.innerHTML = `
        <article class="mascot-guide-result is-empty">
          Recherche en cours…
        </article>
      `;

      timer = setTimeout(() => searchExistingEvents(query, results), 320);
    });

    body.querySelector(".mascot-guide-back")?.addEventListener("click", () => renderProfile("author"));
  }

  async function searchExistingEvents(query, resultsContainer) {
    if (!resultsContainer) return;

    if (!supabaseClient) {
      resultsContainer.innerHTML = `
        <article class="mascot-guide-result is-empty">
          Recherche indisponible pour le moment.
        </article>
      `;
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const term = `%${query.replace(/[%_]/g, "")}%`;

    try {
      const { data, error } = await supabaseClient
        .from("events")
        .select("id,title,city,region,type,start_date,end_date,validated,rejected")
        .eq("validated", true)
        .eq("rejected", false)
        .or(`title.ilike.${term},city.ilike.${term},region.ilike.${term},type.ilike.${term}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("start_date", { ascending: true })
        .limit(8);

      if (error) throw error;

      const events = Array.isArray(data) ? data : [];

      if (!events.length) {
        resultsContainer.innerHTML = `
          <article class="mascot-guide-result is-empty">
            Aucun événement validé trouvé. Vous pouvez proposer l’événement s’il n’est pas encore référencé.
          </article>

          <button class="mascot-guide-action primary" type="button" data-guide-submit-event>
            <span>
              Proposer cet événement
              <small>Aller à l’espace de soumission</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        `;

        resultsContainer.querySelector("[data-guide-submit-event]")?.addEventListener("click", () => {
          closeGuide();
          setTimeout(() => scrollToTarget("#soumettre"), 90);
        });

        return;
      }

      resultsContainer.innerHTML = events.map(renderExistingEventResult).join("");

      resultsContainer.querySelectorAll("[data-guide-event-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset.guideEventId;
          if (!id) return;

          window.location.href = `event.html?id=${encodeURIComponent(id)}#authors-presence-section`;
        });
      });
    } catch (error) {
      console.warn("Recherche événement guide indisponible :", error);

      resultsContainer.innerHTML = `
        <article class="mascot-guide-result is-empty">
          Impossible de rechercher les événements pour le moment.
        </article>
      `;
    }
  }

  function renderExistingEventResult(event) {
    const location = [event.city, event.region].filter(Boolean).join(", ");
    const date = formatGuideDateRange(event.start_date, event.end_date);

    return `
      <button
        class="mascot-guide-result"
        type="button"
        data-guide-event-id="${escapeAttribute(event.id)}"
      >
        <strong>${escapeHtml(event.title || "Événement littéraire")}</strong>
        <small>
          ${escapeHtml([date, location, event.type].filter(Boolean).join(" · "))}
        </small>
        <span>Choisir cet événement →</span>
      </button>
    `;
  }

  function formatGuideDateRange(startDate, endDate) {
    const start = formatGuideDate(startDate);
    const end = endDate && endDate !== startDate ? formatGuideDate(endDate) : "";

    return end ? `${start} → ${end}` : start;
  }

  function formatGuideDate(value) {
    if (!value) return "";

    try {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
    } catch {
      return value;
    }
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


  function scrollToTarget(selector) {
    const target = document.querySelector(selector);
    if (!target) return;

    target.scrollIntoView({
      behavior: "smooth",
      block: selector === "#submission-form" ? "center" : "start"
    });

    if (selector === "#submission-form") {
      setTimeout(() => {
        const firstField = target.querySelector("input, select, textarea");
        if (firstField) firstField.focus({ preventScroll: true });
      }, 420);
    }
  }

  function clickOrScroll(buttonSelector, fallbackSelector) {
    const button = document.querySelector(buttonSelector);

    if (button) {
      button.click();
      return;
    }

    scrollToTarget(fallbackSelector);
  }

  function goTo(url) {
    window.location.href = url;
  }
})();
