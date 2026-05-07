(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (
    !config ||
    !config.supabaseUrl ||
    !config.supabaseAnonKey ||
    !window.supabase
  ) {
    console.error("Configuration Supabase manquante.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  const detailContainer =
    document.getElementById("event-detail");

  const TYPE_META = {
    Salon: {
      label: "Salon",
      className: "type-salon"
    },

    Festival: {
      label: "Festival",
      className: "type-festival"
    },

    Dédicace: {
      label: "Dédicace",
      className: "type-dedicace"
    },

    Autre: {
      label: "Autre",
      className: "type-autre"
    }
  };

  init();

  async function init() {

    const params =
      new URLSearchParams(window.location.search);

    const id = params.get("id");

    if (!id) {

      renderError(
        "Événement introuvable."
      );

      return;
    }

    const event =
      await loadEvent(id);

    if (!event) {

      renderError(
        "Impossible de charger cet événement."
      );

      return;
    }

    renderEvent(event);
    updateSeo(event);

    if (
      Number.isFinite(Number(event.lat)) &&
      Number.isFinite(Number(event.lng))
    ) {

      initMap(event);
    }
  }

  async function loadEvent(id) {

    try {

      const { data, error } =
        await supabaseClient
          .from("events")
          .select("*")
          .eq("id", id)
          .single();

      if (error) throw error;

      return data;

    } catch (error) {

      console.error(error);

      return null;
    }
  }

  function renderEvent(event) {

    if (!detailContainer) return;

    const typeMeta =
      TYPE_META[event.type] ||
      TYPE_META.Autre;

    const image =
      resolveImageUrl(event.image_url);

    detailContainer.innerHTML = `
      ${
        image
          ? `
            <img
              class="detail-image"
              src="${escapeAttribute(image)}"
              alt="${escapeAttribute(event.title || "Événement littéraire")}"
            />
          `
          : `
            <div class="detail-image detail-image-placeholder"></div>
          `
      }

      <div class="detail-body">

        <div class="card-tags">

          ${
            event.type
              ? `
                <span class="badge badge-type ${typeMeta.className}">
                  ${escapeHtml(event.type)}
                </span>
              `
              : ""
          }

          ${
            event.price
              ? `
                <span class="badge badge-price">
                  ${escapeHtml(event.price)}
                </span>
              `
              : ""
          }

          ${
            event.verified
              ? `
                <span class="badge badge-verified">
                  Vérifié
                </span>
              `
              : ""
          }

          ${
            event.featured
              ? `
                <span class="badge badge-featured">
                  Sélection Dédicalivres
                </span>
              `
              : ""
          }

        </div>

        <h1 class="detail-title">
          ${escapeHtml(event.title || "Sans titre")}
        </h1>

        <div class="detail-meta">

          ${
            event.start_date
              ? `
                <p>
                  <strong>📅 Dates :</strong>
                  ${formatDateRange(
                    event.start_date,
                    event.end_date
                  )}
                </p>
              `
              : ""
          }

          <p>
            <strong>📍 Lieu :</strong>
            ${escapeHtml(
              [
                event.city,
                event.region
              ]
                .filter(Boolean)
                .join(", ")
            ) || "Non précisé"}
          </p>

          ${
            event.website
              ? `
                <p>
                  <strong>🌐 Site :</strong>
                  <a
                    href="${escapeAttribute(event.website)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Voir le site officiel
                  </a>
                </p>
              `
              : ""
          }

        </div>

        ${
          event.description
            ? `
              <div class="detail-description">
                ${formatParagraphs(event.description)}
              </div>
            `
            : ""
        }

        <div class="editorial-hook">

          <strong>
            Les rencontres littéraires laissent souvent une trace durable.
          </strong>

          <p>
            Un livre signé,
            une discussion,
            une découverte inattendue :
            certains événements deviennent des souvenirs que l’on garde longtemps.
          </p>

        </div>

        <div class="detail-actions">

          ${
            event.website
              ? `
                <a
                  class="btn-primary detail-button"
                  href="${escapeAttribute(event.website)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Site officiel
                </a>
              `
              : ""
          }

          <button
            id="share-event"
            class="btn-secondary detail-button"
            type="button"
          >
            Partager
          </button>

          <button
            id="favorite-event"
            class="btn-secondary detail-button favorite-btn"
            type="button"
          >
            Ajouter aux favoris
          </button>

        </div>

        ${
          Number.isFinite(Number(event.lat)) &&
          Number.isFinite(Number(event.lng))
            ? `
              <div id="detail-map"></div>
            `
            : ""
        }

      </div>
    `;

    bindShare(event);
    bindFavorite(event);
  }

  function bindShare(event) {

    const button =
      document.getElementById("share-event");

    if (!button) return;

    button.addEventListener(
      "click",
      async () => {

        const shareData = {
          title:
            event.title ||
            "Événement littéraire",

          text:
            "Découvre cet événement littéraire sur Dédicalivres.",

          url: window.location.href
        };

        try {

          if (navigator.share) {

            await navigator.share(shareData);

          } else {

            await navigator.clipboard.writeText(
              window.location.href
            );

            button.textContent =
              "Lien copié ✔";

            setTimeout(() => {

              button.textContent =
                "Partager";

            }, 2200);
          }

        } catch (error) {

          console.warn(error);
        }
      }
    );
  }

  function bindFavorite(event) {

    const button =
      document.getElementById(
        "favorite-event"
      );

    if (!button) return;

    const key =
      `dedicalivres:favorites`;

    const favorites =
      JSON.parse(
        localStorage.getItem(key) || "[]"
      );

    const alreadySaved =
      favorites.includes(event.id);

    updateFavoriteButton(
      button,
      alreadySaved
    );

    button.addEventListener(
      "click",
      () => {

        const current =
          JSON.parse(
            localStorage.getItem(key) || "[]"
          );

        const exists =
          current.includes(event.id);

        let updated;

        if (exists) {

          updated = current.filter(
            (id) => id !== event.id
          );

        } else {

          updated = [
            ...current,
            event.id
          ];
        }

        localStorage.setItem(
          key,
          JSON.stringify(updated)
        );

        updateFavoriteButton(
          button,
          !exists
        );
      }
    );
  }

  function updateFavoriteButton(
    button,
    isSaved
  ) {

    if (isSaved) {

      button.textContent =
        "Favori enregistré ✔";

      button.classList.add(
        "is-active"
      );

    } else {

      button.textContent =
        "Ajouter aux favoris";

      button.classList.remove(
        "is-active"
      );
    }
  }

  function initMap(event) {

    const mapElement =
      document.getElementById(
        "detail-map"
      );

    if (
      !mapElement ||
      !window.L
    ) {
      return;
    }

    const lat =
      Number(event.lat);

    const lng =
      Number(event.lng);

    const map =
      L.map("detail-map")
        .setView([lat, lng], 10);

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          "&copy; OpenStreetMap contributors"
      }
    ).addTo(map);

    L.marker([lat, lng])
      .addTo(map)
      .bindPopup(
        escapeHtml(
          event.title || "Événement"
        )
      )
      .openPopup();
  }

  function updateSeo(event) {

    if (event.title) {

      document.title =
        `${event.title} — Dédicalivres`;
    }

    const description =
      buildDescription(event);

    updateMeta(
      'meta[name="description"]',
      "content",
      description
    );

    updateMeta(
      'meta[property="og:title"]',
      "content",
      `${event.title} — Dédicalivres`
    );

    updateMeta(
      'meta[property="og:description"]',
      "content",
      description
    );

    if (event.image_url) {

      updateMeta(
        'meta[property="og:image"]',
        "content",
        resolveImageUrl(
          event.image_url
        )
      );
    }
  }

  function buildDescription(event) {

    const parts = [];

    if (event.type) {
      parts.push(event.type);
    }

    if (event.city) {
      parts.push(event.city);
    }

    if (event.start_date) {
      parts.push(
        formatDate(event.start_date)
      );
    }

    return (
      parts.join(" • ") ||
      "Événement littéraire référencé sur Dédicalivres."
    );
  }

  function updateMeta(
    selector,
    attribute,
    value
  ) {

    const element =
      document.querySelector(selector);

    if (!element) return;

    element.setAttribute(
      attribute,
      value
    );
  }

  function renderError(message) {

    if (!detailContainer) return;

    detailContainer.innerHTML = `
      <div class="empty-state">
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function resolveImageUrl(path) {

    if (!path) return "";

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return `${
      config.assetsBaseUrl || ""
    }${path}`;
  }

  function formatDateRange(
    startDate,
    endDate
  ) {

    const start =
      formatDate(startDate);

    const end =
      endDate &&
      endDate !== startDate
        ? formatDate(endDate)
        : "";

    return end
      ? `${start} → ${end}`
      : start;
  }

  function formatDate(value) {

    if (!value) return "";

    try {

      return new Intl.DateTimeFormat(
        "fr-FR",
        {
          day: "numeric",
          month: "long",
          year: "numeric"
        }
      ).format(new Date(value));

    } catch {

      return value;
    }
  }

  function formatParagraphs(text) {

    return escapeHtml(text)
      .split(/\n{2,}/)
      .map(
        (paragraph) =>
          `<p>${paragraph.replace(/\n/g, "<br>")}</p>`
      )
      .join("");
  }

  function escapeHtml(value) {

    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {

    return escapeHtml(value)
      .replace(/`/g, "&#096;");
  }

})();
