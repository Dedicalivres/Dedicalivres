(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG || {};

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
          label: "Explorer par région",
          hint: "Trouver une zone géographique",
          run: () => scrollToTarget("#regions")
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
          label: "Proposer mon événement",
          hint: "Aller au formulaire de soumission",
          className: "primary",
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
          hint: "Aller au formulaire",
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

  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(widget);
    bindGuideEvents();
    renderHome();
  });

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
        if (action && typeof action.run === "function") {
          closeGuide();
          setTimeout(action.run, 90);
        }
      });
    });

    body.querySelector(".mascot-guide-back")?.addEventListener("click", renderHome);
  }

  function scrollToTarget(selector) {
    const target = document.querySelector(selector);
    if (!target) return;

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
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
