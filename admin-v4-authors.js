/*
  DÉDICALIVRES — Admin V4 Auteurs
  Gestion des auteurs présents + liens vers fiches auteurs.
*/

(function () {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !window.supabase) return;

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(initAuthorsAdmin, 1400);
  });

  function initAuthorsAdmin() {
    const adminPanel =
      document.getElementById("admin-panel") ||
      document.getElementById("admin-view");

    if (!adminPanel || document.getElementById("authors-admin-v4")) return;

    const section = document.createElement("section");
    section.id = "authors-admin-v4";
    section.className = "top-pages-panel";

    section.innerHTML = `
      <div class="panel-title-row">
        <div>
          <h2>Auteurs présents</h2>
          <p>Supervision des auteurs déclarés présents sur les événements.</p>
        </div>
        <button id="refresh-authors-v4" class="secondary" type="button">Rafraîchir</button>
      </div>

      <input id="authors-admin-search-v4" type="search" placeholder="Rechercher un auteur, événement, ville…" />

      <div id="authors-admin-count-v4" class="dashboard-label" style="margin:14px 0;">Chargement…</div>

      <div id="authors-admin-list-v4" class="top-pages-list">
        <p class="empty">Chargement…</p>
      </div>
    `;

    adminPanel.appendChild(section);

    document
      .getElementById("refresh-authors-v4")
      ?.addEventListener("click", loadAuthorsAdmin);

    document
      .getElementById("authors-admin-search-v4")
      ?.addEventListener("input", renderAuthorsAdmin);

    loadAuthorsAdmin();
  }

  let authorRows = [];

  async function loadAuthorsAdmin() {
    const list = document.getElementById("authors-admin-list-v4");
    const count = document.getElementById("authors-admin-count-v4");

    if (list) list.innerHTML = `<p class="empty">Chargement…</p>`;
    if (count) count.textContent = "Chargement…";

    const { data, error } = await client
      .from("event_authors_presence")
      .select(`
        id,
        pseudo,
        website,
        author_slug,
        validated,
        created_at,
        event_id,
        events (
          id,
          title,
          city,
          region,
          start_date
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur admin auteurs :", error);
      if (list) list.innerHTML = `<p class="empty">Impossible de charger les auteurs.</p>`;
      return;
    }

    authorRows = Array.isArray(data) ? data : [];
    renderAuthorsAdmin();
  }

  function renderAuthorsAdmin() {
    const list = document.getElementById("authors-admin-list-v4");
    const count = document.getElementById("authors-admin-count-v4");
    const search = document.getElementById("authors-admin-search-v4");

    if (!list || !count) return;

    const query = normalize(search?.value || "");

    const filtered = authorRows.filter((row) => {
      const event = row.events || {};

      const haystack = normalize([
        row.pseudo,
        row.website,
        row.author_slug,
        event.title,
        event.city,
        event.region
      ].filter(Boolean).join(" "));

      return !query || haystack.includes(query);
    });

    count.textContent = `${filtered.length} déclaration${filtered.length > 1 ? "s" : ""} auteur`;

    if (!filtered.length) {
      list.innerHTML = `<p class="empty">Aucun auteur trouvé.</p>`;
      return;
    }

    list.innerHTML = filtered
      .map((row) => {
        const event = row.events || {};
        const authorLink = row.author_slug
          ? `author.html?slug=${encodeURIComponent(row.author_slug)}`
          : "";

        return `
          <article class="top-page-item authors-admin-item-v4">
            <span>
              <strong>${escapeHtml(row.pseudo || "Auteur")}</strong>
              <small>
                ${escapeHtml(event.title || "Événement inconnu")}
                ${event.city ? ` — ${escapeHtml(event.city)}` : ""}
              </small>
              <small>
                ${row.validated ? "Validé" : "Non validé"}
                ${row.website ? ` · ${escapeHtml(row.website)}` : ""}
              </small>
            </span>

            <div class="authors-admin-actions-v4">
              ${
                authorLink
                  ? `<a class="secondary mini-link" href="${authorLink}" target="_blank">Fiche auteur</a>`
                  : ""
              }

              <a class="secondary mini-link" href="event.html?id=${encodeURIComponent(row.event_id)}" target="_blank">Événement</a>

              <button class="danger mini-button" type="button" data-delete-author-presence="${escapeAttribute(row.id)}">
                Supprimer
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("[data-delete-author-presence]").forEach((button) => {
      button.addEventListener("click", () => {
        deleteAuthorPresence(button.dataset.deleteAuthorPresence);
      });
    });
  }

  async function deleteAuthorPresence(id) {
    if (!id) return;

    const ok = confirm("Supprimer cette déclaration d’auteur ?");
    if (!ok) return;

    const { error } = await client
      .from("event_authors_presence")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur suppression auteur :", error);
      alert("Suppression impossible. Vérifie que tu es connecté en admin.");
      return;
    }

    authorRows = authorRows.filter((row) => String(row.id) !== String(id));
    renderAuthorsAdmin();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .toLowerCase()
      .trim();
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
})();
