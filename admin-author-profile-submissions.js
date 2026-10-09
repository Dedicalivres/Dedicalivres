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
  let createMatchesBySubmissionId = new Map();
  const decisionsInFlight = new Set();

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
    const slugs = [...new Set(submissions
      .filter((row) => row.request_type === "create")
      .map((row) => row.payload?.slug)
      .filter(Boolean))];
    authorsById = new Map();
    createMatchesBySubmissionId = new Map();
    const authors = [];

    for (const [field, values] of [["id", ids], ["slug", slugs]]) {
      if (!values.length) continue;
      const response = await client
        .from("authors")
        .select("id,pseudo,slug,website,bio,avatar_url,location,shop_url,profile_type,updated_at")
        .in(field, values);

      if (response.error) {
        setFeedback("Impossible de charger les fiches actuelles.", true);
        return;
      }
      authors.push(...(response.data || []));
    }

    authors.forEach((author) => authorsById.set(String(author.id), author));
    submissions.forEach((submission) => {
      const match = core.findStrongExistingAuthorMatch(submission, [...authorsById.values()]);
      if (match) createMatchesBySubmissionId.set(String(submission.id), match);
    });
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
      const strongMatch = createMatchesBySubmissionId.get(String(submission.id)) || null;
      const author = submission.target_author_id
        ? authorsById.get(String(submission.target_author_id)) || null
        : strongMatch;
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
          ${strongMatch ? `<p class="priority-empty">Une fiche auteur existante semble correspondre à cette soumission : ${escapeHtml(strongMatch.pseudo)} (${escapeHtml(strongMatch.slug)}).</p>` : ""}
          ${conflict ? `<p class="priority-empty">La fiche a changé depuis la proposition : nouvelle comparaison requise avant approbation.</p>` : ""}
          <div class="author-request-grid">
            ${comparison.map(renderComparison).join("")}
          </div>
          <div class="author-request-actions">
            ${strongMatch ? `<button type="button" class="cyber-btn-primary" data-profile-submission-action="attach">RATTACHER À CETTE FICHE</button>` : ""}
            <button type="button" class="cyber-btn-primary" data-profile-submission-action="approve" ${conflict || strongMatch ? "disabled" : ""}>APPROUVER</button>
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
    if (!submission || decisionsInFlight.has(String(id))) return;

    if (action === "attach") {
      const match = createMatchesBySubmissionId.get(String(id));
      if (!match) return;
      if (!window.confirm(`Rattacher explicitement cette proposition à ${match.pseudo} (${match.slug}) ?`)) return;
      await attachSubmission(button, submission, match);
      return;
    }

    if (action === "approve") {
      if (!window.confirm("Appliquer explicitement cette proposition à la fiche auteur ?")) return;
      await runDecision(button, "approve_author_profile_submission", { p_submission_id: id });
      return;
    }

    const answer = window.prompt("Motif du rejet (obligatoire, 500 caractères maximum) :");
    if (answer === null) return;
    const reason = answer.trim();
    if (!reason || reason.length > 500) {
      setFeedback("Le motif du rejet doit contenir entre 1 et 500 caractères.", true);
      return;
    }
    await runDecision(button, "reject_author_profile_submission", {
      p_submission_id: id,
      p_reason: reason
    });
  }

  async function attachSubmission(button, submission, author) {
    const submissionId = String(submission.id || "");
    if (!submissionId || decisionsInFlight.has(submissionId)) return;
    decisionsInFlight.add(submissionId);
    const card = button.closest("[data-author-profile-submission]");
    const actionButtons = [...(card?.querySelectorAll("[data-profile-submission-action]") || [])];
    actionButtons.forEach((actionButton) => { actionButton.disabled = true; });
    setFeedback("Rattachement…", false);
    try {
      const payload = { ...(submission.payload || {}) };
      delete payload.slug;
      const response = await client
        .from("author_profile_submissions")
        .update({
          request_type: "modify",
          target_author_id: author.id,
          base_author_updated_at: author.updated_at,
          payload
        })
        .eq("id", submissionId)
        .eq("status", "pending")
        .eq("request_type", "create")
        .is("target_author_id", null)
        .select("id,request_type,target_author_id")
        .maybeSingle();
      if (response.error) throw response.error;
      if (!response.data || String(response.data.target_author_id) !== String(author.id)) {
        throw new Error("La soumission n’a pas été rattachée.");
      }
      setFeedback("Soumission rattachée. Vérifie la comparaison avant approbation.", false);
      await refresh();
    } catch (error) {
      setFeedback(error?.message || "Rattachement impossible.", true);
    } finally {
      decisionsInFlight.delete(submissionId);
      actionButtons.forEach((actionButton) => { actionButton.disabled = false; });
    }
  }

  async function runDecision(button, functionName, args) {
    const submissionId = String(args?.p_submission_id || "");
    if (!submissionId || decisionsInFlight.has(submissionId)) return;
    decisionsInFlight.add(submissionId);
    const card = button.closest("[data-author-profile-submission]");
    const actionButtons = [...(card?.querySelectorAll("[data-profile-submission-action]") || [])];
    actionButtons.forEach((actionButton) => { actionButton.disabled = true; });
    setFeedback("Traitement…", false);
    try {
      const response = await client.rpc(functionName, args);
      if (response.error) {
        setFeedback(response.error.message || "Décision impossible.", true);
        return;
      }
      setFeedback(
        functionName === "approve_author_profile_submission"
          ? "Fiche approuvée et publiée dans le catalogue public. La page statique sera créée lors de la prochaine génération auteurs."
          : "Proposition rejetée sans publication.",
        false
      );
      await refresh();
    } catch (error) {
      setFeedback(error?.message || "Décision impossible.", true);
    } finally {
      decisionsInFlight.delete(submissionId);
      actionButtons.forEach((actionButton) => { actionButton.disabled = false; });
    }
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
