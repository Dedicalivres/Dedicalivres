/* =========================================================
   DÉDICALIVRES — AGENDA & CARTE PREMIUM (script léger)
   Deux rôles seulement :
   1. Halo lumineux qui suit la souris sur l'écrin violet
   2. Entrée en scène de l'écrin au scroll
   Ne touche ni à app.js, ni à Leaflet, ni à la mascotte.
========================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  document.addEventListener("DOMContentLoaded", function () {
    var showcase = document.querySelector(".agenda-discovery-showcase");
    if (!showcase) return;

    /* --- 1. Halo souris --- */
    if (!reduceMotion && finePointer) {
      var spot = document.createElement("div");
      spot.className = "lud-spotlight";
      spot.setAttribute("aria-hidden", "true");
      showcase.prepend(spot);

      var raf = null;
      showcase.addEventListener("mousemove", function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          var r = showcase.getBoundingClientRect();
          showcase.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
          showcase.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
        });
      });
    }

    /* --- 2. Révélation au scroll --- */
    if (!reduceMotion && "IntersectionObserver" in window) {
      showcase.classList.add("lud-reveal");
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("lud-visible");
            io.unobserve(en.target);
            /* Leaflet recalcule sa taille après l'animation d'entrée */
            setTimeout(function () {
              window.dispatchEvent(new Event("resize"));
            }, 950);
          }
        });
      }, { threshold: 0.12 });
      io.observe(showcase);
    }
  });
})();
