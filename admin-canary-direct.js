"use strict";

(function initDirectCanaryEvidence() {
  const bridge = window.DEDICALIVRES_ADMIN_V11_BRIDGE;
  const byId = (id) => document.getElementById(`v11-canary-${id}`);
  const mode = byId("proof-mode");
  const official = byId("proof-form");
  const panel = byId("direct");
  if (!bridge || !mode || !official || !panel) return;

  const ui = {
    availability: byId("direct-availability"), provenance: byId("provenance"),
    latest: byId("direct-latest"), role: byId("direct-role"), method: byId("direct-method"),
    source: byId("direct-source"), record: byId("direct-record"),
    create: byId("direct-create"), reference: byId("direct-reference"),
    read: byId("direct-read"), dossier: byId("direct-dossier"),
    confirm: byId("direct-confirm"), verify: byId("direct-verify"),
    recordProof: byId("direct-record-proof"), reason: byId("direct-reason"),
    revoke: byId("direct-revoke"), feedback: byId("direct-feedback")
  };
  if (Object.values(ui).some((element) => !element)) return;

  const snapshotFields = ["title", "city", "region", "country_code", "description",
    "website", "start_date", "end_date", "lat", "lng"];
  const origins = {
    DIRECT_AUTHOR: "Auteur", DIRECT_ORGANIZER: "Organisateur",
    DIRECT_OTHER: "Autre rôle direct", AUTO_MATTE: "Auto-Matte",
    ADMIN_MANUAL: "Administration", LEGACY_UNKNOWN: "Non établi"
  };
  const channels = {
    DIRECT_FORM: "Formulaire direct", AUTO_MATTE: "Auto-Matte",
    ADMIN: "Administration", UNKNOWN: "Origine non établie"
  };
  const methods = {
    OFFICIAL_CHANNEL_REPLY: "Réponse sur canal officiel",
    OFFICIAL_PHONE: "Appel au numéro officiel",
    VERIFIED_PROFESSIONAL_PROFILE: "Profil professionnel vérifié",
    PREVIOUS_CONTACT_RECONFIRMED: "Contact antérieur reconfirmé"
  };
  const attestationStates = {
    UNKNOWN: "Non établie", OBSERVED: "Origine observée",
    DECLARED: "Rôle déclaré", ATTESTED: "Attestation enregistrée",
    REVOKED: "Révoquée"
  };
  const dossierStates = {
    PENDING_REVIEW: "En attente de validation humaine",
    VERIFIED: "Vérifié", REVOKED: "Révoqué"
  };
  const proofStates = {
    none: "aucune", valid: "valide", expired: "expirée", invalidated: "invalidée"
  };
  let event = null;
  let provenance = null;
  let latest = null;
  let dossier = null;
  let enabled = false;
  let busy = false;
  let uncertain = false;
  let sequence = 0;

  function client() { return bridge.isAuthenticated() ? bridge.getClient() : null; }
  function one(data) { return Array.isArray(data) ? data[0] || null : data || null; }
  function text(value, fallback = "Non établi") { return value == null || value === "" ? fallback : String(value); }
  function row(parent, label, content) {
    const wrapper = document.createElement("div");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    name.textContent = label;
    value.textContent = content;
    wrapper.append(name, value);
    parent.appendChild(wrapper);
  }
  function missingRpc(error) {
    return error?.code === "PGRST202" || error?.code === "42883" ||
      /could not find the function|does not exist/i.test(String(error?.message || ""));
  }
  function controls() {
    const active = enabled && Boolean(event) && !busy && !uncertain;
    mode.options[1].disabled = !enabled;
    ui.create.disabled = !active;
    ui.read.disabled = !enabled || !event || busy || !ui.reference.value.trim();
    ui.verify.disabled = !active || dossier?.dossier_state !== "PENDING_REVIEW" || !ui.confirm.checked;
    ui.recordProof.disabled = !active || dossier?.dossier_state !== "VERIFIED";
    ui.revoke.disabled = !active || !latest?.proof_id || latest.dossier_state !== "VERIFIED";
  }
  function selectMode() {
    if (mode.value === "direct" && !enabled) mode.value = "official";
    const direct = mode.value === "direct";
    official.hidden = direct;
    panel.hidden = !direct;
  }
  function showProvenance() {
    ui.provenance.replaceChildren();
    row(ui.provenance, "Origine observée", channels[provenance?.observed_channel] || "Origine non établie");
    row(ui.provenance, "Rôle déclaré", origins[provenance?.declared_origin] || "Non déclaré");
    row(ui.provenance, "Dernier rôle attesté (historique)", origins[provenance?.attested_origin] || "Non attesté");
    row(ui.provenance, "Vérification", attestationStates[provenance?.attestation_state] || "Non établie");
    row(ui.provenance, "Type de dernière preuve", provenance?.proof_type === "PUBLIC_OFFICIAL"
      ? "Annonce officielle" : provenance?.proof_type === "DIRECT_VERIFIED"
        ? "Soumission directe" : "Aucune preuve établie");
  }
  function showDossier() {
    ui.dossier.replaceChildren();
    if (!dossier) return;
    row(ui.dossier, "État du dossier", dossierStates[dossier.dossier_state] || "État inconnu");
    row(ui.dossier, "Rôle attesté", origins[dossier.attested_origin] || "Non établi");
    row(ui.dossier, "Méthode", methods[dossier.identity_method] || "Non établie");
    row(ui.dossier, "Référence indépendante", text(dossier.independent_source_reference));
    row(ui.dossier, "Compte rendu", text(dossier.verification_record));
  }
  async function rpc(name, args) {
    const api = client();
    if (!api) throw new Error("ADMIN_SESSION_UNAVAILABLE");
    const response = await api.rpc(name, args);
    if (response.error) throw response.error;
    return response.data;
  }
  async function readDossier(reference, token) {
    const found = one(await rpc("get_direct_publication_canary_dossier", { p_evidence_reference: reference }));
    if (token !== sequence) return;
    if (ui.reference.value.trim() && ui.reference.value.trim() !== reference) return;
    if (!found || found.event_id !== event.id || found.submission_event_id !== event.id) {
      throw new Error("CANARY_DIRECT_DOSSIER_NOT_FOUND");
    }
    dossier = found;
    ui.reference.value = reference;
    if (!ui.role.value) ui.role.value = found.attested_origin;
    if (!ui.method.value) ui.method.value = found.identity_method;
    ui.confirm.checked = false;
    showDossier();
    controls();
  }
  async function refresh(token) {
    const selected = event;
    const observed = one(await rpc("get_event_provenance", { p_event_id: selected.id }));
    const reference = one(await rpc("get_latest_direct_publication_canary_reference", { p_event_id: selected.id }));
    const proof = one(await rpc("get_publication_canary_evidence", { p_event_id: selected.id }));
    if (token !== sequence) return;
    provenance = observed;
    latest = reference;
    showProvenance();
    ui.latest.textContent = latest
      ? `Dernière preuve directe : ${proofStates[proof?.proof_status] || "état inconnu"} ; dossier ${dossierStates[latest.dossier_state] || "état inconnu"}. Identifiant ${latest.proof_id}.`
      : observed?.proof_type === "PUBLIC_OFFICIAL"
        ? "Dernière preuve : annonce officielle. Aucune ancienne preuve directe n’est réactivée."
        : "Aucune preuve directe actuellement en tête.";
    enabled = observed?.observed_channel === "DIRECT_FORM";
    ui.availability.textContent = enabled
      ? "Soumission directe identifiable. La vérification du dossier reste une décision humaine."
      : "Parcours direct indisponible : origine directe non établie. Le formulaire officiel reste disponible.";
    if (!enabled) { mode.value = "official"; selectMode(); }
    controls();
    if (latest?.dossier_reference && !ui.reference.value) {
      await readDossier(latest.dossier_reference, token);
    }
  }
  function reset(selected) {
    event = selected ? { ...selected } : null;
    sequence += 1;
    provenance = latest = dossier = null;
    enabled = uncertain = false;
    ui.role.value = ui.method.value = ui.source.value = ui.record.value = "";
    ui.reference.value = ui.reason.value = "";
    ui.confirm.checked = false;
    ui.feedback.textContent = "";
    ui.provenance.replaceChildren();
    showProvenance();
    ui.dossier.replaceChildren();
    ui.latest.textContent = "";
    ui.availability.textContent = "Vérification du parcours direct…";
    mode.value = "official";
    selectMode();
    controls();
  }
  function explain(error, started) {
    if (missingRpc(error)) {
      enabled = false;
      mode.value = "official";
      selectMode();
      ui.availability.textContent = "RPC sécurisées absentes : parcours direct désactivé. Le formulaire officiel reste disponible.";
      return "Parcours direct indisponible tant que les migrations ne sont pas installées.";
    }
    const code = String(error?.message || "");
    if (code.includes("CANARY_SOURCE_EVIDENCE_STALE") || code.includes("FICHE_CHANGED"))
      return "Fiche modifiée : rechargez-la et revérifiez la source.";
    if (code.includes("CANARY_DIRECT_PROOF_NOT_LATEST"))
      return "Une preuve plus récente existe : rechargez la fiche avant toute révocation.";
    if (code.includes("CANARY_DIRECT_DOSSIER_NOT_FOUND"))
      return "Dossier introuvable pour cet événement. Vérifiez la référence ; sans elle, recréez un dossier après contrôle humain.";
    if (started) return "Résultat réseau incertain ou refus serveur : rechargez la fiche avant une nouvelle écriture. Aucune publication déclenchée.";
    return "Lecture impossible : vérifiez la session et réessayez sans écrire. Aucune publication déclenchée.";
  }
  async function action(work, readOnly = false) {
    if (!enabled || !event || busy || (uncertain && !readOnly)) return;
    const token = sequence;
    const selected = event;
    busy = true;
    controls();
    let started = false;
    const markWrite = () => { started = true; };
    try {
      await work(selected, token, markWrite);
    } catch (error) {
      if (token === sequence) {
        if (started) uncertain = true;
        ui.feedback.textContent = explain(error, started);
      }
    } finally {
      busy = false;
      controls();
    }
  }
  async function currentSnapshot(selected, token) {
    const api = client();
    if (!api) throw new Error("ADMIN_SESSION_UNAVAILABLE");
    const response = await api.from("events").select("id," + snapshotFields.join(","))
      .eq("id", selected.id).single();
    if (response.error || !response.data) throw new Error("FICHE_UNAVAILABLE");
    if (token !== sequence) throw new Error("SELECTION_CHANGED");
    if (snapshotFields.some((field) => response.data[field] !== selected[field]))
      throw new Error("FICHE_CHANGED");
  }

  mode.addEventListener("change", selectMode);
  ui.confirm.addEventListener("change", controls);
  ui.reference.addEventListener("input", () => {
    dossier = null;
    showDossier();
    controls();
  });
  window.addEventListener("dedicalivres:admin-event-detail", async ({ detail }) => {
    reset(detail?.event || null);
    const token = sequence;
    if (!event) return;
    try { await refresh(token); }
    catch (error) {
      if (token === sequence) ui.feedback.textContent = explain(error, false);
    }
  });

  ui.create.addEventListener("click", () => action(async (selected, token, markWrite) => {
    if (!ui.role.value || !ui.method.value || ui.source.value.trim().length < 10 ||
      ui.record.value.trim().length < 30) {
      ui.feedback.textContent = "Rôle attesté, méthode, source indépendante et compte rendu sont requis.";
      return;
    }
    await currentSnapshot(selected, token);
    markWrite();
    const reference = await rpc("record_direct_publication_canary_dossier", {
      p_event_id: selected.id, p_submission_event_id: selected.id,
      p_attested_origin: ui.role.value, p_identity_method: ui.method.value,
      p_independent_source_reference: ui.source.value.trim(),
      p_verification_record: ui.record.value.trim()
    });
    if (token !== sequence) return;
    if (typeof reference !== "string" || !reference.startsWith("evidence:"))
      throw new Error("CANARY_DIRECT_DOSSIER_NOT_FOUND");
    ui.reference.value = reference;
    await readDossier(reference, token);
    ui.feedback.textContent = "Dossier créé puis relu. Conservez sa référence privée pour une reprise après rechargement ; aucune preuve enregistrée.";
  }));
  ui.read.addEventListener("click", () => action(async (_selected, token) => {
    const reference = ui.reference.value.trim();
    await readDossier(reference, token);
    if (token !== sequence || ui.reference.value.trim() !== reference || !dossier) return;
    uncertain = false;
    ui.feedback.textContent = "Dossier relu depuis Supabase. Vérifiez son contenu avant de le valider.";
  }, true));
  ui.verify.addEventListener("click", () => action(async (selected, token, markWrite) => {
    if (!dossier || dossier.dossier_state !== "PENDING_REVIEW" || !ui.confirm.checked) return;
    await currentSnapshot(selected, token);
    if (!window.confirm("Confirmer la vérification humaine de ce dossier privé pour cet événement ?")) {
      ui.feedback.textContent = "Validation annulée.";
      return;
    }
    const reference = ui.reference.value.trim();
    markWrite();
    await rpc("verify_direct_publication_canary_dossier", {
      p_event_id: selected.id, p_evidence_reference: reference, p_human_confirmed: true
    });
    if (token !== sequence) return;
    await readDossier(reference, token);
    ui.feedback.textContent = "Dossier validé puis relu. Aucune preuve ni publication créée.";
  }));
  ui.recordProof.addEventListener("click", () => action(async (selected, token, markWrite) => {
    if (!dossier || dossier.dossier_state !== "VERIFIED") return;
    const reference = ui.reference.value.trim();
    await currentSnapshot(selected, token);
    await readDossier(reference, token);
    if (token !== sequence || dossier?.dossier_state !== "VERIFIED") throw new Error("CANARY_DIRECT_DOSSIER_NOT_FOUND");
    if (dossier.attested_origin !== ui.role.value || dossier.identity_method !== ui.method.value) {
      ui.feedback.textContent = "Rôle ou méthode différents du dossier relu : corrigez la sélection.";
      return;
    }
    if (!window.confirm("Confirmer l’attestation humaine et enregistrer la preuve directe ? Cela ne publie pas l’événement.")) {
      ui.feedback.textContent = "Enregistrement annulé.";
      return;
    }
    markWrite();
    await rpc("record_direct_publication_canary_evidence_checked", {
      p_event_id: selected.id, p_submission_event_id: selected.id,
      p_declared_origin: provenance?.declared_origin || null,
      p_attested_origin: dossier.attested_origin, p_identity_method: dossier.identity_method,
      p_justification_reference: reference,
      ...Object.fromEntries(snapshotFields.map((field) => [`p_expected_${field}`, selected[field] ?? null])),
      p_human_confirmed: true
    });
    if (token !== sequence) return;
    window.dispatchEvent(new CustomEvent("dedicalivres:admin-event-detail", { detail: { event: selected } }));
  }));
  ui.revoke.addEventListener("click", () => action(async (selected, token, markWrite) => {
    const reason = ui.reason.value.trim();
    if (!latest?.proof_id || latest.dossier_state !== "VERIFIED" || reason.length < 10 || reason.length > 500) {
      ui.feedback.textContent = "Motif de révocation requis (10 à 500 caractères).";
      return;
    }
    const proofId = latest.proof_id;
    if (!window.confirm("Révoquer la dernière preuve directe ? Aucune preuve ancienne ne redeviendra admissible.")) {
      ui.feedback.textContent = "Révocation annulée.";
      return;
    }
    if (token !== sequence) return;
    markWrite();
    await rpc("revoke_direct_publication_canary_evidence", {
      p_event_id: selected.id, p_proof_id: proofId, p_reason: reason
    });
    if (token !== sequence) return;
    window.dispatchEvent(new CustomEvent("dedicalivres:admin-event-detail", { detail: { event: selected } }));
  }));
})();
