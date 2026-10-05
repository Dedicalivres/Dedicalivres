(function initAuthorProfileSubmissionsAdmin() {
  "use strict";

  const config = window.DEDICALIVRES_CONFIG;
  const core = window.DEDICALIVRES_AUTHOR_CONTRIBUTION;
  if (!config || !window.supabase || !core) return;

  const client =
    (typeof window.getDedicalivresSupabaseClient === "function" && window.getDedicalivresSupabaseClient()) ||
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  let initialized = false;
  let submissions = [];
  let authorsById = new Map();

  window.addEventListener("dedicalivres:admin-authenticated", init);
  window.addEventListener("dedicalivres:admin-dashboard-refreshed", refresh);
  if (window.DEDICALIVRES_ADMIN_AUTHENTICATED) init();

  async function init() {
    ensurePanel();
    if (!initialized) {
      document.getElementById("author-profile-submissions-panel")?.addEventListener("click", handleClick);
      initialized = true;
    }
    await refresh();
  }

  function ensurePanel() {
    if (document.getElementById("author-profile-submissions-panel")) return;
    const host = document.getElementById("v11-community-authors") || document.getElementById("tab-moderation");
    if (!host) return;
    const panel = document.createElement("section");
    panel.id = "author-profile-submissions-panel";
    panel.className = "admin-panel author-requests-admin-panel";
    panel.innerHTML = `
      <div class="section-head">
        <h3>PROPOSITIONS DE FICHES AUTEURS</h3>
        <span id="author-profile-submissions-count">Chargement…</span>
      </div>
      <p id="author-profile-submissions-feedback" aria-live="polite"></p>
      <div id="author-profile-submissions-list" class="author-requests-list"></div>
    `;
    host.prepend(panel);
  }

  async function refresh() {
    const list = document.getElementById("author-profile-submissions-list");
    if (!list) return;

    const response = await client
      .from("author_profile_submissions")
      .select("id,target_author_id,request_type,payload,proposed_avatar_url,base_author_updated_at,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);

    if (response.error) {
      list.innerHTML = `<p class="priority-empty">File des propositions indisponible.</p>`;
      setFeedback(response.error.message || "Chargement impossible", true);
      return;
    }

    submissions = Array.isArray(response.data) ? response.data : [];
    await loadTargetAuthors();
    render();
  }

  async function loadTargetAuthors() {
    const ids = [...new Set(submissions.map((row) => row.target_author_id).filter(Boolean))];
    authorsById = new Map();
    if (!ids.length) return;

    const response = await client
      .from("authors")
      .select("id,pseudo,slug,website,bio,avatar_url,location,shop_url,profile_type,updated_at")
      .in("id", ids);

    if (response.error) {
      setFeedback("Impossible de charger les fiches actuelles.", true);
      return;
    }
    (response.data || []).forEach((author) => authorsById.set(String(author.id), author));
  }

  function render() {
    const count = document.getElementById("author-profile-submissions-count");
    const list = document.getElementById("author-profile-submissions-list");
    if (count) count.textContent = `${submissions.length} en attente`;
    if (!list) return;

    if (!submissions.length) {
      list.innerHTML = `<p class="priority-empty">Aucune proposition de fiche auteur en attente.</p>`;
      return;
    }

    list.innerHTML = submissions.map((submission) => {
      const author = submission.target_author_id
        ? authorsById.get(String(submission.target_author_id)) || null
        : null;
      const comparison = core.compareSubmission(submission, author);
      const conflict = submission.request_type === "modify" && (
        !author || String(author.updated_at || "") !== String(submission.base_author_updated_at || "")
      );

      return `
        <article class="author-request-card" data-author-profile-submission="${escapeAttribute(submission.id)}">
          <div class="author-request-head">
            <div>
              <strong>${submission.request_type === "create" ? "Création de fiche" : `Modification de ${escapeHtml(author?.pseudo || "fiche introuvable")}`}</strong>
              <small>Soumise le ${escapeHtml(formatDate(submission.created_at))}</small>
            </div>
            <span class="author-request-status is-pending">en attente</span>
          </div>
          ${conflict ? `<p class="priority-empty">La fiche a changé depuis la proposition : nouvelle comparaison requise avant approbation.</p>` : ""}
          <div class="author-request-grid">
            ${comparison.map(renderComparison).join("")}
          </div>
          <div class="author-request-actions">
            <button type="button" class="cyber-btn-primary" data-profile-submission-action="approve" ${conflict ? "disabled" : ""}>APPROUVER</button>
            <button type="button" class="cyber-btn-danger" data-profile-submission-action="reject">REJETER</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderComparison(row) {
    const label = {
      pseudo: "Nom public",
      slug: "Identifiant",
      bio: "Biographie",
      location: "Localisation",
      website: "Site principal",
      shop_url: "Boutique / livre",
      profile_type: "Type de profil",
      avatar_url: "Photo"
    }[row.field] || row.field;

    return `
      <div class="author-profile-comparison">
        <strong>${escapeHtml(label)}</strong>
        <p><span>Actuel</span> ${renderValue(row.current, row.field === "avatar_url")}</p>
        <p><span>Proposé</span> ${renderValue(row.proposed, row.field === "avatar_url")}</p>
      </div>
    `;
  }

  function renderValue(value, image) {
    if (image && value) {
      return `<a href="${escapeAttribute(value)}" target="_blank" rel="noopener noreferrer"><img src="${escapeAttribute(value)}" alt="Portrait à comparer" style="max-width:96px;max-height:96px;object-fit:cover" /></a>`;
    }
    return value
      ? `<code>${escapeHtml(value)}</code>`
      : `<em>Non renseigné</em>`;
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-profile-submission-action]");
    if (!button) return;
    const card = button.closest("[data-author-profile-submission]");
    const id = card?.dataset?.authorProfileSubmission;
    if (!id) return;

    const action = button.dataset.profileSubmissionAction;
    const submission = submissions.find((row) => row.id === id);
    if (!submission) return;

    if (action === "approve") {
      if (!window.confirm("Appliquer explicitement cette proposition à la fiche auteur ?")) return;
      await runDecision(button, "approve_author_profile_submission", { p_submission_id: id });
      return;
    }

    if (!window.confirm("Rejeter cette proposition sans modifier la fiche auteur ?")) return;
    await runDecision(button, "reject_author_profile_submission", {
      p_submission_id: id,
      p_reason: null
    });
  }

  async function runDecision(button, functionName, args) {
    button.disabled = true;
    setFeedback("Traitement…", false);
    const response = await client.rpc(functionName, args);
    if (response.error) {
      button.disabled = false;
      setFeedback(response.error.message || "Décision impossible.", true);
      return;
    }
    setFeedback("Décision enregistrée. Le workflow éditorial existant reste requis.", false);
    await refresh();
  }

  function setFeedback(message, error) {
    const element = document.getElementById("author-profile-submissions-feedback");
    if (!element) return;
    element.textContent = message || "";
    element.className = error ? "form-feedback error" : "form-feedback";
  }

  function formatDate(value) {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date)
      : "date inconnue";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
