"use strict";

(function initCanaryEvidence() {
  const bridge = window.DEDICALIVRES_ADMIN_V11_BRIDGE;
  const form = document.getElementById("v11-canary-proof-form");
  const status = document.getElementById("v11-canary-proof-status");
  const jobStatus = document.getElementById("v11-canary-job-status");
  const context = document.getElementById("v11-canary-proof-context");
  const latest = document.getElementById("v11-canary-proof-latest");
  const feedback = document.getElementById("v11-canary-proof-feedback");
  const save = document.getElementById("v11-canary-proof-save");
  if (!bridge || !form || !status || !jobStatus || !context || !latest || !feedback || !save) return;

  const fields = ["title", "city", "start_date", "end_date", "website", "description", "region", "country_code", "lat", "lng"];
  const labels = {
    title: "Titre", city: "Ville", start_date: "Début", end_date: "Fin",
    website: "Site web", description: "Description / lieu", region: "Région",
    country_code: "Pays", lat: "Latitude", lng: "Longitude"
  };
  const states = {
    none: "Aucune preuve de source enregistrée.",
    valid: "Preuve éditoriale valide (moins de 30 jours, données inchangées).",
    expired: "Preuve expirée : nouvelle vérification humaine nécessaire.",
    invalidated: "Preuve invalidée : données de l’événement modifiées. Nouvelle vérification nécessaire."
  };
  let selected = null;
  let busy = false;
  let ready = false;
  let sequence = 0;

  function value(value) { return value == null || value === "" ? "Non renseigné" : String(value); }
  function client() { return bridge.isAuthenticated() ? bridge.getClient() : null; }
  function showContext(event) {
    context.replaceChildren();
    for (const field of fields) {
      const row = document.createElement("div");
      const name = document.createElement("span");
      const text = document.createElement("strong");
      name.textContent = labels[field];
      text.textContent = value(event[field]);
      row.append(name, text);
      context.appendChild(row);
    }
  }
  function showProof(row) {
    status.textContent = states[row.proof_status] || "État de preuve inconnu : enregistrement suspendu.";
    jobStatus.textContent = row.technical_candidate
      ? "Job de validation techniquement admissible sur les critères événement/job. Réservation non garantie (armement, quota et concurrence séparés)."
      : row.pending_validation_job
        ? "Job PENDING présent, mais non admissible au CANARY sur les critères événement/job."
        : "Aucun job PENDING de validation techniquement admissible. Une preuve valide ne crée pas de job.";
    latest.replaceChildren();
    if (row.checked_at) {
      latest.appendChild(document.createTextNode(
        `Dernière vérification : ${new Date(row.checked_at).toLocaleString("fr-FR")} · ${row.proof_count} preuve(s) conservée(s). `
      ));
      if (row.source_url && /^https:\/\//i.test(row.source_url)) {
        const link = document.createElement("a");
        link.href = row.source_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Voir la source vérifiée";
        latest.appendChild(link);
      }
      latest.appendChild(document.createTextNode(
        ` · Source : ${value(row.source_identity)} · Référence : ${value(row.event_reference)}`
      ));
    }
    ready = Boolean(states[row.proof_status]);
    save.disabled = busy || !ready;
  }
  async function refresh(event, token) {
    const api = client();
    if (!api) throw new Error("Session administrateur indisponible");
    const response = await api.rpc("get_publication_canary_evidence", { p_event_id: event.id });
    if (response.error) throw response.error;
    if (token !== sequence) return;
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) throw new Error("État de preuve indisponible");
    showProof(row);
  }
  window.addEventListener("dedicalivres:admin-event-detail", async ({ detail }) => {
    selected = detail?.event || null;
    const token = ++sequence;
    ready = false;
    form.reset();
    feedback.textContent = "";
    status.textContent = "Chargement de la preuve…";
    jobStatus.textContent = "";
    latest.textContent = "";
    save.disabled = true;
    if (!selected) return;
    showContext(selected);
    try { await refresh(selected, token); }
    catch {
      if (token === sequence) {
        status.textContent = "Preuve indisponible : enregistrement suspendu.";
        feedback.textContent = "Lecture sécurisée impossible. Vérifier la migration et la session administrateur.";
      }
    }
  });

  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    if (busy || !selected || save.disabled) return;
    const event = selected;
    const token = sequence;
    const data = new FormData(form);
    if (data.get("human_confirmed") !== "on") return;
    busy = true;
    save.disabled = true;
    feedback.textContent = "Vérification des données…";
    let writeAttempted = false;
    let written = false;
    try {
      const api = client();
      if (!api) throw new Error("Session administrateur indisponible");
      const current = await api.from("events").select("id," + fields.join(","))
        .eq("id", event.id).single();
      if (current.error || !current.data) throw new Error("Fiche événement indisponible");
      if (fields.some((field) => current.data[field] !== event[field])) {
        throw new Error("Fiche modifiée depuis son affichage. Rechargez-la et revérifiez la source.");
      }
      if (token !== sequence) throw new Error("La fiche sélectionnée a changé.");
      if (!window.confirm("Confirmer votre vérification humaine de la source et enregistrer une nouvelle preuve pour cet événement ?")) {
        feedback.textContent = "Enregistrement annulé.";
        return;
      }
      writeAttempted = true;
      const response = await api.rpc("record_publication_canary_evidence", {
        p_event_id: event.id,
        p_source_url: String(data.get("source_url") || "").trim(),
        p_source_identity: String(data.get("source_identity") || "").trim(),
        p_event_reference: String(data.get("event_reference") || "").trim(),
        p_title: event.title,
        p_city: event.city,
        p_start_date: event.start_date,
        p_end_date: event.end_date,
        p_human_confirmed: true
      });
      if (response.error) throw response.error;
      written = true;
      if (token !== sequence) return;
      form.reset();
      feedback.textContent = "Preuve enregistrée. État actualisé depuis Supabase.";
      await refresh(event, token);
    } catch (error) {
      if (token === sequence) {
        const code = String(error?.message || "");
        if (written || writeAttempted) ready = false;
        if (code.includes("Fiche modifiée") || code.includes("CANARY_SOURCE_EVIDENCE_STALE")) ready = false;
        feedback.textContent = code.includes("Fiche modifiée") ? code
          : code.includes("CANARY_SOURCE_EVIDENCE_STALE") ? "Fiche modifiée : rechargez-la et revérifiez la source."
          : code.includes("CANARY_SOURCE_EVIDENCE_INVALID") ? "Source refusée : fournir une URL précise et les références requises."
          : written ? "Preuve enregistrée, mais état indisponible. Rechargez la fiche avant toute nouvelle saisie."
          : writeAttempted ? "Résultat de l’enregistrement incertain. Rechargez la fiche avant toute nouvelle tentative."
          : "Enregistrement impossible. Aucune publication déclenchée ; vérifier la session et les droits.";
      }
    } finally {
      busy = false;
      if (token === sequence) save.disabled = !ready;
    }
  });
})();
