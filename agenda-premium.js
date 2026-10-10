/* =========================================================
   DÉDICALIVRES — AGENDA & CARTE PREMIUM (script léger)
   Halo lumineux qui suit la souris sur l'écrin violet.
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

  });
})();
