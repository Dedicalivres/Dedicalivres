(function () {
  "use strict";

  const DEFAULT_BASE =
    "https://dedicalivres-daily-export.dedicalivres.workers.dev/exports";

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

  function getBaseUrl() {
    const config = window.DEDICALIVRES_CONFIG || {};
    return String(
      config.exportsBaseUrl || DEFAULT_BASE
    ).replace(/\/+$/, "");
  }

  function fileUrl(name) {
    return getBaseUrl() + "/" + String(name).replace(/^\/+/, "");
  }

  function init() {
    if (initialized) return;

    const root = document.getElementById("tab-exports");
    if (!root) return;

    initialized = true;

    root.innerHTML = `
      <section class="v11-export-shell">
        <div class="v11-export-head">
          <div>
            <span class="v11-section-label">DONNÉES</span>
            <h3>Exports Dédicalivres</h3>
            <p>
              Consultation des fichiers générés et régénération authentifiée à la demande.
            </p>
          </div>

          <div class="v11-export-head-actions">
            <button
              id="v11-exports-refresh"
              type="button"
              class="v11-action-button"
            >
              Vérifier les exports
            </button>

            <button
              id="v11-exports-regenerate"
              type="button"
              class="v11-action-button"
            >
              Régénérer latest
            </button>
          </div>
        </div>

        <div class="v11-export-kpis">
          <article>
            <span>Total à venir</span>
            <strong id="v11-export-total">—</strong>
          </article>
          <article>
            <span>Dédicaces</span>
            <strong id="v11-export-dedicaces">—</strong>
          </article>
          <article>
            <span>Salons / Festivals</span>
            <strong id="v11-export-salons">—</strong>
          </article>
          <article>
            <span>Autres</span>
            <strong id="v11-export-autres">—</strong>
          </article>
        </div>

        <div class="v11-export-meta">
          <span>
            Dernière génération :
            <strong id="v11-export-generated">—</strong>
          </span>
          <span id="v11-export-status">En attente de vérification</span>
        </div>

        <div class="v11-export-files">
          <a data-export-file="events-latest.json">JSON global</a>
          <a data-export-file="events-latest.csv">CSV global</a>
          <a data-export-file="publications-latest.md">Publications</a>
          <a data-export-file="dedicaces-latest.md">Dédicaces</a>
          <a data-export-file="salons-latest.md">Salons / Festivals</a>
          <a data-export-file="autres-evenements-latest.md">Autres</a>
          <a data-export-file="planning-publication-latest.md">Planning</a>
          <a data-export-file="weekend-par-region-latest.md">Week-end par région</a>
        </div>

        <div class="v11-export-files">
          <a data-export-file="instagram/tous-evenements-latest.html">Instagram · Tous</a>
          <a data-export-file="instagram/dedicaces-latest.html">Instagram · Dédicaces</a>
          <a data-export-file="instagram/salons-latest.html">Instagram · Salons</a>
          <a data-export-file="instagram/weekend-regions-latest.html">Instagram · Week-end</a>
        </div>

        <div class="v11-export-lock">
          <strong>Régénération latest disponible</strong>
          <span>
            La régénération utilise la session administrateur et nécessite
            une confirmation explicite avant chaque exécution.
          </span>
        </div>
      </section>
    `;

    root
      .querySelectorAll("[data-export-file]")
      .forEach((link) => {
        link.href = fileUrl(link.dataset.exportFile);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      });

    document
      .getElementById("v11-exports-refresh")
      ?.addEventListener("click", () => load(true));

    document
      .getElementById("v11-exports-regenerate")
      ?.addEventListener("click", regenerate);
  }

  async function regenerate() {
    const status =
      document.getElementById("v11-export-status");

    const regenerateButton =
      document.getElementById("v11-exports-regenerate");

    const refreshButton =
      document.getElementById("v11-exports-refresh");

    if (
      !window.confirm(
        "Régénérer les exports latest de production ?"
      )
    ) {
      return;
    }

    if (status) {
      status.textContent = "Régénération des exports…";
    }

    if (regenerateButton) regenerateButton.disabled = true;
    if (refreshButton) refreshButton.disabled = true;

    try {
      const client =
        window.DEDICALIVRES_ADMIN_CONTEXT?.getClient?.() ||
        window.DEDICALIVRES_SUPABASE_CLIENT;

      if (!client) {
        throw new Error("Client Supabase introuvable.");
      }

      const { data, error } =
        await client.auth.getSession();

      if (error) throw error;

      const accessToken =
        data?.session?.access_token;

      if (!accessToken) {
        throw new Error("Session admin introuvable.");
      }

      const workerBase =
        getBaseUrl().replace(/\/exports$/i, "");

      const response = await fetch(
        workerBase + "/admin-regenerate",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            source: "dedicalivres-admin-v11"
          }),
          cache: "no-store"
        }
      );

      const result =
        await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error ||
          ("HTTP " + response.status)
        );
      }

      if (status) {
        status.textContent =
          "Exports régénérés";
      }

      await load(true);
    } catch (error) {
      console.warn(
        "Régénération exports V11 impossible",
        error
      );

      if (status) {
        status.textContent =
          "Régénération impossible · " +
          (error?.message || "Erreur");
      }
    } finally {
      if (regenerateButton) regenerateButton.disabled = false;
      if (refreshButton) refreshButton.disabled = false;
    }
  }


  async function getJson(name) {
    const response = await fetch(
      fileUrl(name) + "?t=" + Date.now(),
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(
        name + " · HTTP " + response.status
      );
    }

    return response.json();
  }

  function eventsOf(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.events)) return payload.events;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  function countOf(payload) {
    const count = Number(payload?.count);
    return Number.isFinite(count)
      ? count
      : eventsOf(payload).length;
  }

  async function load() {
    const button =
      document.getElementById("v11-exports-refresh");

    const status =
      document.getElementById("v11-export-status");

    if (button) button.disabled = true;
    if (status) status.textContent = "Chargement…";

    try {
      const [global, dedicaces, salons, autres] =
        await Promise.all([
          getJson("events-latest.json"),
          getJson("dedicaces-latest.json"),
          getJson("salons-latest.json"),
          getJson("autres-evenements-latest.json")
        ]);

      set("v11-export-total", countOf(global));
      set("v11-export-dedicaces", countOf(dedicaces));
      set("v11-export-salons", countOf(salons));
      set("v11-export-autres", countOf(autres));

      const generated =
        global?.generated_at ||
        global?.generatedAt ||
        null;

      set(
        "v11-export-generated",
        generated
          ? new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "medium",
              timeStyle: "short"
            }).format(new Date(generated))
          : "Non renseignée"
      );

      if (status) {
        status.textContent = "Exports disponibles";
      }
    } catch (error) {
      console.warn("Exports V11 indisponibles", error);

      if (status) {
        status.textContent =
          "Exports indisponibles · " +
          (error?.message || "Erreur");
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  function set(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value ?? "—");
  }
})();
