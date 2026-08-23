(function () {
  "use strict";

  let initialized = false;

  ready(() => waitForAuth(init));
  window.addEventListener(
    "dedicalivres:admin-authenticated",
    () => waitForAuth(init)
  );

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  function waitForAuth(callback) {
    if (window.DEDICALIVRES_ADMIN_AUTHENTICATED === true) {
      callback();
    }
  }

  function init() {
    if (initialized) return;

    const root =
      document.getElementById("v11-maintenance-panel");

    if (!root) return;

    initialized = true;

    root.innerHTML = `
      <section class="v11-maintenance-shell">
        <div class="v11-maintenance-head">
          <div>
            <span class="v11-section-label">SYSTÈME</span>
            <h3>État technique</h3>
            <p>
              Diagnostic local de l’Admin V11.
              Aucun changement de configuration n’est effectué ici.
            </p>
          </div>

          <button
            id="v11-maintenance-refresh"
            class="v11-action-button"
            type="button"
          >
            Actualiser
          </button>
        </div>

        <div class="v11-maintenance-grid">
          <article class="v11-maintenance-card">
            <span>Authentification admin</span>
            <strong id="v11-maint-auth">—</strong>
            <small id="v11-maint-auth-note">Vérification…</small>
          </article>

          <article class="v11-maintenance-card">
            <span>Client Supabase</span>
            <strong id="v11-maint-supabase">—</strong>
            <small id="v11-maint-supabase-note">Vérification…</small>
          </article>

          <article class="v11-maintenance-card">
            <span>Auto-Matte / Veille</span>
            <strong id="v11-maint-watch">—</strong>
            <small id="v11-maint-watch-note">Vérification…</small>
          </article>

          <article class="v11-maintenance-card">
            <span>Exports</span>
            <strong id="v11-maint-exports">—</strong>
            <small id="v11-maint-exports-note">Vérification…</small>
          </article>

          <article class="v11-maintenance-card">
            <span>Social</span>
            <strong id="v11-maint-social">—</strong>
            <small id="v11-maint-social-note">Vérification…</small>
          </article>

          <article class="v11-maintenance-card">
            <span>Garde écriture Veille</span>
            <strong id="v11-maint-watch-guard">—</strong>
            <small id="v11-maint-watch-guard-note">Vérification…</small>
          </article>
        </div>

        <section class="v11-maintenance-section">
          <div class="v11-maintenance-section-head">
            <div>
              <span class="v11-section-label">MODULES</span>
              <h4>Chargement V11</h4>
            </div>
          </div>

          <div id="v11-maint-modules" class="v11-maintenance-list"></div>
        </section>

        <section class="v11-maintenance-section">
          <div class="v11-maintenance-section-head">
            <div>
              <span class="v11-section-label">MOUNTS</span>
              <h4>Espaces disponibles</h4>
            </div>
          </div>

          <div id="v11-maint-mounts" class="v11-maintenance-list"></div>
        </section>

        <section class="v11-maintenance-section">
          <div class="v11-maintenance-section-head">
            <div>
              <span class="v11-section-label">CONTEXTE</span>
              <h4>État courant</h4>
            </div>
          </div>

          <div id="v11-maint-context" class="v11-maintenance-list"></div>
        </section>

        <div class="v11-maintenance-lock">
          <strong>Maintenance destructive non activée</strong>
          <span>
            Purge, migration, backup manuel, RLS et opérations de réparation
            restent volontairement hors de ce panneau.
          </span>
        </div>
      </section>
    `;

    document
      .getElementById("v11-maintenance-refresh")
      ?.addEventListener("click", render);

    render();
  }

  function render() {
    const context =
      window.DEDICALIVRES_ADMIN_CONTEXT;

    const state =
      context?.getState?.() || {};

    const client =
      context?.getClient?.() ||
      window.DEDICALIVRES_SUPABASE_CLIENT ||
      null;

    setStatus(
      "v11-maint-auth",
      "v11-maint-auth-note",
      state.authenticated === true,
      state.authenticated === true
        ? "Session admin active"
        : "Session absente"
    );

    setStatus(
      "v11-maint-supabase",
      "v11-maint-supabase-note",
      Boolean(client),
      client
        ? "Client partagé disponible"
        : "Client introuvable"
    );

    const watchMounted =
      Boolean(document.getElementById("tab-watch"));

    const watchLoaded =
      Boolean(
        document.querySelector(
          "#tab-watch .watch-shell"
        )
      );

    setStatus(
      "v11-maint-watch",
      "v11-maint-watch-note",
      watchMounted && watchLoaded,
      watchLoaded
        ? "Module monté et interface initialisée"
        : watchMounted
          ? "Mount présent, interface non initialisée"
          : "Mount absent"
    );

    const exportsLoaded =
      Boolean(
        document.querySelector(
          "#tab-exports .v11-export-shell"
        )
      );

    setStatus(
      "v11-maint-exports",
      "v11-maint-exports-note",
      exportsLoaded,
      exportsLoaded
        ? "Module V11 chargé"
        : "Module non initialisé"
    );

    const socialLoaded =
      Boolean(
        document.querySelector(
          "#tab-social .social-generator-shell"
        )
      );

    setStatus(
      "v11-maint-social",
      "v11-maint-social-note",
      socialLoaded,
      socialLoaded
        ? "Générateur social initialisé"
        : "Module non initialisé"
    );

    const guard =
      window.V11_WATCH_WRITE_GUARD === true;

    setStatus(
      "v11-maint-watch-guard",
      "v11-maint-watch-guard-note",
      guard,
      guard
        ? "Création events depuis la veille bloquée"
        : "Garde non détectée"
    );

    renderModules();
    renderMounts();
    renderContext(state);
  }

  function renderModules() {
    const target =
      document.getElementById("v11-maint-modules");

    if (!target) return;

    const rows = [
      ["Admin Context", Boolean(window.DEDICALIVRES_ADMIN_CONTEXT)],
      ["Bridge V11", Boolean(window.DEDICALIVRES_ADMIN_AUTHENTICATED !== undefined)],
      ["Auto-Matte", Boolean(document.querySelector("#tab-watch .watch-shell"))],
      ["Exports V11", Boolean(document.querySelector("#tab-exports .v11-export-shell"))],
      ["Social Generator", Boolean(window.DEDICALIVRES_SOCIAL_GENERATOR_VERSION)],
    ];

    target.innerHTML = rows
      .map(([label, ok]) => row(label, ok ? "Chargé" : "Absent", ok))
      .join("");
  }

  function renderMounts() {
    const target =
      document.getElementById("v11-maint-mounts");

    if (!target) return;

    const ids = [
      "tab-watch",
      "tab-exports",
      "tab-social",
      "tab-events",
      "tab-overview",
      "tab-moderation"
    ];

    target.innerHTML = ids
      .map((id) => {
        const present =
          Boolean(document.getElementById(id));

        return row(
          id,
          present ? "Présent" : "Absent",
          present
        );
      })
      .join("");
  }

  function renderContext(state) {
    const target =
      document.getElementById("v11-maint-context");

    if (!target) return;

    const eventCount =
      state.events?.items?.length ??
      state.events?.length ??
      0;

    const presenceCount =
      state.community?.presences?.length ?? 0;

    const authorCount =
      state.community?.authors?.length ?? 0;

    const testimonialCount =
      state.community?.testimonials?.length ?? 0;

    target.innerHTML = [
      row("Événements chargés", String(eventCount), eventCount > 0),
      row("Présences chargées", String(presenceCount), true),
      row("Auteurs chargés", String(authorCount), true),
      row("Témoignages chargés", String(testimonialCount), true),
      row(
        "Auth",
        state.authenticated === true ? "Active" : "Inactive",
        state.authenticated === true
      )
    ].join("");
  }

  function setStatus(id, noteId, ok, note) {
    const target = document.getElementById(id);
    const noteTarget = document.getElementById(noteId);

    if (target) {
      target.textContent = ok ? "OK" : "À vérifier";
      target.classList.toggle("is-ok", ok);
      target.classList.toggle("is-warning", !ok);
    }

    if (noteTarget) {
      noteTarget.textContent = note;
    }
  }

  function row(label, value, ok) {
    return `
      <div class="v11-maintenance-row">
        <span>${escapeHtml(label)}</span>
        <strong class="${ok ? "is-ok" : "is-warning"}">
          ${escapeHtml(value)}
        </strong>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
