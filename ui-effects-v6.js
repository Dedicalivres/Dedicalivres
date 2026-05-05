/*
  DÉDICALIVRES — UI Effects V6
  Effets boutons, ripple, reveal progressif.
*/

(function () {
  "use strict";

  const MOTION_OK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("dedicalivres:cards-rendered", initDynamicEffects);

  function init() {
    initDynamicEffects();
    bindGlobalRipple();
  }

  function initDynamicEffects() {
    if (MOTION_OK) {
      revealCards();
      bindMagneticButtons();
    }
  }

  function bindGlobalRipple() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest(".btn-primary, .btn-secondary, .card-link, .favorite-btn, #submission-form button");
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const ripple = document.createElement("span");

      ripple.className = "ripple-v6";
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;

      button.appendChild(ripple);

      setTimeout(() => ripple.remove(), 700);
    });
  }

  function bindMagneticButtons() {
    if (window.innerWidth < 900) return;

    document.querySelectorAll(".btn-primary, .btn-secondary, .card-link").forEach((button) => {
      if (button.dataset.magneticBound === "true") return;
      button.dataset.magneticBound = "true";

      button.addEventListener("mousemove", (event) => {
        const rect = button.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;

        button.style.transform = `translate(${x * 0.10}px, ${y * 0.10}px)`;
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "";
      });
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
    }, { threshold: 0.12 });

    cards.forEach((card) => observer.observe(card));
  }
})();
