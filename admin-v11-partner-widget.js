"use strict";

(function createV11PartnerWidget() {
  const ENGINE_SRC = "widget.js?v=widget-4";

  let initialized = false;
  let enginePromise = null;

  function getPanel() {
    return document.getElementById(
      "v11-partner-widget-panel"
    );
  }

  function escapeAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function ensureEngine() {
    if (
      window.DedicalivresWidget &&
      typeof window.DedicalivresWidget.render === "function"
    ) {
      return Promise.resolve(
        window.DedicalivresWidget
      );
    }

    if (enginePromise) {
      return enginePromise;
    }

    enginePromise = new Promise(
      (resolve, reject) => {
        const existing =
          document.querySelector(
            'script[data-v11-partner-widget-engine]'
          );

        const done = () => {
          if (
            window.DedicalivresWidget &&
            typeof window.DedicalivresWidget.render === "function"
          ) {
            resolve(
              window.DedicalivresWidget
            );
          } else {
            reject(
              new Error(
                "Le moteur Widget est chargé mais son API publique est absente."
              )
            );
          }
        };

        if (existing) {
          if (
            window.DedicalivresWidget
          ) {
            done();
            return;
          }

          existing.addEventListener(
            "load",
            done,
            { once: true }
          );

          existing.addEventListener(
            "error",
            () => reject(
              new Error(
                "Impossible de charger widget.js."
              )
            ),
            { once: true }
          );

          return;
        }

        const script =
          document.createElement("script");

        script.src = ENGINE_SRC;
        script.defer = true;
        script.dataset.v11PartnerWidgetEngine =
          "true";

        script.addEventListener(
          "load",
          done,
          { once: true }
        );

        script.addEventListener(
          "error",
          () => reject(
            new Error(
              "Impossible de charger widget.js."
            )
          ),
          { once: true }
        );

        document.head.appendChild(script);
      }
    );

    return enginePromise;
  }


  function buildInterface() {
    const panel = getPanel();

    if (!panel || initialized) return;

    panel.innerHTML = `
      <section class="v11-partner-widget-shell">

        <div class="v11-partner-widget-head">
          <div>
            <p class="v11-section-label">
              WIDGET PARTENAIRES
            </p>

            <h3>
              Composer un agenda embarqué
            </h3>

            <p>
              Configure le widget public Dédicalivres,
              prévisualise le résultat réel puis copie
              le code ou le lien à transmettre au partenaire.
            </p>
          </div>

          <span class="v11-chip info">
            Moteur public
          </span>
        </div>

        <div class="v11-partner-widget-grid">

          <section class="v11-partner-config">

            <div class="v11-partner-field">
              <label for="v11-wg-pays">
                Pays
              </label>

              <select id="v11-wg-pays">
                <option value="">
                  Tous les pays
                </option>
                <option value="FR">France</option>
                <option value="BE">Belgique</option>
                <option value="LU">Luxembourg</option>
                <option value="CH">Suisse</option>
                <option value="MC">Monaco</option>
              </select>
            </div>

            <div class="v11-partner-field">
              <label for="v11-wg-type">
                Type d'événement
              </label>

              <select id="v11-wg-type">
                <option value="">
                  Tous les types
                </option>
                <option value="Salon">Salon</option>
                <option value="Festival">Festival</option>
                <option value="Dédicace">Dédicace</option>
                <option value="Autre">Autre</option>
              </select>
            </div>

            <div class="v11-partner-field">
              <label for="v11-wg-limit">
                Nombre d'événements
              </label>

              <select id="v11-wg-limit">
                <option value="3">3</option>
                <option value="5" selected>5</option>
                <option value="8">8</option>
                <option value="12">12</option>
              </select>
            </div>

            <div class="v11-partner-field">
              <label for="v11-wg-theme">
                Thème
              </label>

              <select id="v11-wg-theme">
                <option value="clair" selected>
                  Clair
                </option>
                <option value="soir">
                  Soir
                </option>
              </select>
            </div>

            <label class="v11-partner-check">
              <input
                id="v11-wg-autour"
                type="checkbox"
              />
              <span>
                Bouton « Autour de moi »
              </span>
            </label>

            <label class="v11-partner-check">
              <input
                id="v11-wg-recherche"
                type="checkbox"
              />
              <span>
                Champ « Chercher une ville »
              </span>
            </label>

            <div
              id="v11-wg-rayon-field"
              class="v11-partner-field"
              hidden
            >
              <label for="v11-wg-rayon">
                Rayon maximum
              </label>

              <select id="v11-wg-rayon">
                <option value="0" selected>
                  Sans limite
                </option>
                <option value="30">30 km</option>
                <option value="50">50 km</option>
                <option value="100">100 km</option>
                <option value="200">200 km</option>
              </select>
            </div>

            <div class="v11-partner-output">
              <div class="v11-partner-output-head">
                <strong>
                  Code d'intégration
                </strong>

                <button
                  id="v11-wg-copy"
                  type="button"
                >
                  Copier
                </button>
              </div>

              <textarea
                id="v11-wg-snippet"
                readonly
                aria-label="Code d'intégration du widget"
              ></textarea>
            </div>

            <div class="v11-partner-output">
              <div class="v11-partner-output-head">
                <strong>
                  Lien direct
                </strong>

                <button
                  id="v11-wg-link-copy"
                  type="button"
                >
                  Copier le lien
                </button>
              </div>

              <input
                id="v11-wg-link"
                type="text"
                readonly
                aria-label="Lien direct vers l'agenda"
              />
            </div>

          </section>

          <section class="v11-partner-preview">

            <div class="v11-partner-preview-head">
              <div>
                <strong>
                  Aperçu réel
                </strong>
                <span>
                  Données publiques vérifiées
                </span>
              </div>

              <span
                id="v11-wg-status"
                class="v11-chip neutral"
              >
                Chargement
              </span>
            </div>

            <div class="v11-partner-preview-zone">
              <div id="v11-wg-preview"></div>
            </div>

            <p>
              Cet aperçu utilise directement le même
              <code>widget.js</code> que celui fourni aux partenaires.
              Le moteur public n'est pas dupliqué dans l'administration.
            </p>

          </section>

        </div>
      </section>
    `;

    initialized = true;
    bindInterface();
  }


  function getControls() {
    return {
      pays:
        document.getElementById("v11-wg-pays"),
      type:
        document.getElementById("v11-wg-type"),
      limit:
        document.getElementById("v11-wg-limit"),
      theme:
        document.getElementById("v11-wg-theme"),
      autour:
        document.getElementById("v11-wg-autour"),
      recherche:
        document.getElementById("v11-wg-recherche"),
      rayon:
        document.getElementById("v11-wg-rayon"),
      rayonField:
        document.getElementById(
          "v11-wg-rayon-field"
        ),
      preview:
        document.getElementById(
          "v11-wg-preview"
        ),
      snippet:
        document.getElementById(
          "v11-wg-snippet"
        ),
      link:
        document.getElementById(
          "v11-wg-link"
        ),
      status:
        document.getElementById(
          "v11-wg-status"
        )
    };
  }


  function currentConfig() {
    const c = getControls();

    return {
      pays: c.pays?.value || "",
      type: c.type?.value || "",
      limit: c.limit?.value || "5",
      theme: c.theme?.value || "clair",
      autour: Boolean(c.autour?.checked),
      recherche:
        Boolean(c.recherche?.checked),
      rayon:
        parseInt(c.rayon?.value || "0", 10) || 0
    };
  }


  function buildSnippet(cfg) {
    let attrs = "";

    if (cfg.pays) {
      attrs +=
        ` data-pays="${escapeAttribute(cfg.pays)}"`;
    }

    if (cfg.type) {
      attrs +=
        ` data-type="${escapeAttribute(cfg.type)}"`;
    }

    attrs +=
      ` data-limit="${escapeAttribute(cfg.limit)}"`;

    if (cfg.theme !== "clair") {
      attrs +=
        ` data-theme="${escapeAttribute(cfg.theme)}"`;
    }

    if (cfg.autour) {
      attrs += ' data-autour="1"';
    }

    if (cfg.autour && cfg.rayon) {
      attrs +=
        ` data-rayon="${cfg.rayon}"`;
    }

    if (cfg.recherche) {
      attrs += ' data-recherche="1"';
    }

    return (
      `<div data-dedicalivres${attrs}></div>\n` +
      `<script src="https://dedicalivres.fr/widget.js" defer><\/script>`
    );
  }


  function buildDirectLink(cfg) {
    const params =
      new URLSearchParams();

    if (cfg.pays) {
      params.set("pays", cfg.pays);
    }

    if (cfg.type) {
      params.set("type", cfg.type);
    }

    if (cfg.limit !== "5") {
      params.set("limit", cfg.limit);
    }

    if (cfg.theme !== "clair") {
      params.set("theme", cfg.theme);
    }

    if (cfg.autour) {
      params.set("autour", "1");
    }

    if (cfg.autour && cfg.rayon) {
      params.set(
        "rayon",
        String(cfg.rayon)
      );
    }

    if (cfg.recherche) {
      params.set("recherche", "1");
    }

    const query =
      params.toString();

    return (
      "https://dedicalivres.fr/agenda.html" +
      (query ? `?${query}` : "")
    );
  }


  async function renderPreview() {
    const c = getControls();

    if (!c.preview) return;

    const cfg = currentConfig();

    if (c.rayonField) {
      c.rayonField.hidden =
        !cfg.autour;
    }

    if (c.snippet) {
      c.snippet.value =
        buildSnippet(cfg);
    }

    if (c.link) {
      c.link.value =
        buildDirectLink(cfg);
    }

    if (c.status) {
      c.status.className =
        "v11-chip neutral";
      c.status.textContent =
        "Chargement";
    }

    [
      "pays",
      "type",
      "limit",
      "theme",
      "autour",
      "rayon",
      "recherche"
    ].forEach((key) => {
      delete c.preview.dataset[key];
    });

    if (cfg.pays) {
      c.preview.dataset.pays =
        cfg.pays;
    }

    if (cfg.type) {
      c.preview.dataset.type =
        cfg.type;
    }

    c.preview.dataset.limit =
      cfg.limit;

    c.preview.dataset.theme =
      cfg.theme;

    if (cfg.autour) {
      c.preview.dataset.autour =
        "1";
    }

    if (cfg.autour && cfg.rayon) {
      c.preview.dataset.rayon =
        String(cfg.rayon);
    }

    if (cfg.recherche) {
      c.preview.dataset.recherche =
        "1";
    }

    try {
      const widget =
        await ensureEngine();

      widget.render(c.preview);

      if (c.status) {
        c.status.className =
          "v11-chip ok";
        c.status.textContent =
          "Moteur chargé";
      }
    } catch (error) {
      console.error(
        "Widget partenaires V11 :",
        error
      );

      if (c.status) {
        c.status.className =
          "v11-chip warning";
        c.status.textContent =
          "Indisponible";
      }

      c.preview.textContent =
        "Impossible de charger l’aperçu du widget.";
    }
  }


  async function copyField(
    field,
    button,
    defaultLabel
  ) {
    if (!field || !button) return;

    let copied = false;

    try {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(
          field.value
        );
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      field.select();

      try {
        copied =
          document.execCommand("copy");
      } catch (_) {}
    }

    button.textContent =
      copied
        ? "Copié ✓"
        : "Sélectionné";

    window.setTimeout(
      () => {
        button.textContent =
          defaultLabel;
      },
      1600
    );
  }


  function bindInterface() {
    const c = getControls();

    [
      c.pays,
      c.type,
      c.limit,
      c.theme,
      c.autour,
      c.recherche,
      c.rayon
    ].forEach((control) => {
      control?.addEventListener(
        "change",
        renderPreview
      );
    });

    document
      .getElementById("v11-wg-copy")
      ?.addEventListener(
        "click",
        () => copyField(
          c.snippet,
          document.getElementById(
            "v11-wg-copy"
          ),
          "Copier"
        )
      );

    document
      .getElementById("v11-wg-link-copy")
      ?.addEventListener(
        "click",
        () => copyField(
          c.link,
          document.getElementById(
            "v11-wg-link-copy"
          ),
          "Copier le lien"
        )
      );
  }


  async function open() {
    buildInterface();
    await renderPreview();
  }


  window.DEDICALIVRES_V11_PARTNER_WIDGET = {
    open
  };
})();
