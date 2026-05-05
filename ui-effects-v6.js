/*
  DÉDICALIVRES — UI Effects V6 Premium
  Carte intelligente + animations légères
*/

(function () {
  "use strict";

  const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("dedicalivres:cards-rendered", initDynamicEffects);

  function init() {
    injectMapToolbar();
    bindRipple();
    bindSmartCards();
    initDynamicEffects();
  }

  function initDynamicEffects() {
    if (!motionOk) return;
    revealCards();
  }

  function injectMapToolbar() {
    const mapPanel = document.querySelector(".map-panel");

    if (!mapPanel || document.querySelector(".map-premium-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "map-premium-toolbar";

    toolbar.innerHTML = `
      <button type="button" id="map-fullscreen-toggle">Plein écran</button>
      <button type="button" id="map-close-mobile">Carte</button>
    `;

    mapPanel.appendChild(toolbar);

    document.getElementById("map-fullscreen-toggle")?.addEventListener("click", () => {
      mapPanel.classList.toggle("map-fullscreen");

      const button = document.getElementById("map-fullscreen-toggle");
      const isFull = mapPanel.classList.contains("map-fullscreen");

      if (button) button.textContent = isFull ? "Réduire" : "Plein écran";

      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 200);
    });

    document.getElementById("map-close-mobile")?.addEventListener("click", () => {
      mapPanel.classList.toggle("is-open");

      const toggle = document.getElementById("mobile-map-toggle");
      const isOpen = mapPanel.classList.contains("is-open");

      if (toggle) toggle.textContent = isOpen ? "Masquer la carte" : "Afficher la carte";

      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 200);
    });
  }

  function bindRipple() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest(
        ".btn-primary, .btn-secondary, .card-link, .favorite-btn, #submission-form button"
      );

      if (!button) return;

      const rect = button.getBoundingClientRect();
      const ripple = document.createElement("span");

      ripple.className = "ripple-v6";
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;

      button.appendChild(ripple);

      setTimeout(() => ripple.remove(), 650);
    });
  }

  function bindSmartCards() {
    document.addEventListener("mouseover", (event) => {
      const card = event.target.closest(".event-card[data-event-id]");
      if (!card) return;

      document.querySelectorAll(".event-card.is-map-focused").forEach((item) => {
        item.classList.remove("is-map-focused");
      });

      card.classList.add("is-map-focused");

      if (window.highlightMarker) {
        window.highlightMarker(card.dataset.eventId);
      }
    });

    document.addEventListener("mouseout", (event) => {
      const card = event.target.closest(".event-card[data-event-id]");
      if (!card) return;

      card.classList.remove("is-map-focused");
    });
  }

  function revealCards() {
    const cards = document.querySelectorAll(".event-card:not(.reveal-v6)");

    if (!cards.length) return;

    if (!("IntersectionObserver" in window)) {
      cards.forEach((card) => card.classList.add("reveal-v6"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("reveal-v6");
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12
    });

    cards.forEach((card) => observer.observe(card));
  }
})();
