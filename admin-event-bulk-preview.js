"use strict";

(function createAdminEventBulkPreview(global) {
  const MAX_SELECTION = 20;
  const SNAPSHOT_FIELDS = [
    "id", "title", "type", "city", "region", "country_code",
    "start_date", "end_date", "validated", "rejected", "verified",
    "featured", "description", "website", "image_url", "lat", "lng",
    "registration_enabled", "registration_open_date",
    "registration_deadline", "registration_url",
    "registration_audience", "registration_force_status",
    "registration_note"
  ];

  function eventSignature(event) {
    if (!event) return "missing";
    return JSON.stringify(SNAPSHOT_FIELDS.map((field) => event[field] ?? null));
  }

  function createSelectionController(limit = MAX_SELECTION) {
    const selected = new Set();
    let previewSignatures = null;
    let previewStale = false;

    function invalidatePreview() {
      previewSignatures = null;
      previewStale = false;
    }

    function toggle(id, checked) {
      const key = String(id || "");
      if (!key) return { changed: false, limitReached: false };
      if (!checked) {
        const changed = selected.delete(key);
        if (changed) invalidatePreview();
        return { changed, limitReached: false };
      }
      if (selected.has(key)) return { changed: false, limitReached: false };
      if (selected.size >= limit) return { changed: false, limitReached: true };
      selected.add(key);
      invalidatePreview();
      return { changed: true, limitReached: false };
    }

    function selectMany(ids) {
      let added = 0;
      let omitted = 0;
      (Array.isArray(ids) ? ids : []).forEach((id) => {
        const result = toggle(id, true);
        if (result.changed) added += 1;
        if (result.limitReached) omitted += 1;
      });
      return { added, omitted, limitReached: omitted > 0 };
    }

    function clear() {
      const changed = selected.size > 0;
      selected.clear();
      invalidatePreview();
      return changed;
    }

    function capturePreview(events) {
      const byId = new Map((events || []).map((event) => [String(event.id), event]));
      previewSignatures = new Map(
        [...selected].map((id) => [id, eventSignature(byId.get(id))])
      );
      previewStale = false;
    }

    function reconcile(events) {
      if (!previewSignatures) return false;
      const byId = new Map((events || []).map((event) => [String(event.id), event]));
      previewStale = [...previewSignatures].some(
        ([id, signature]) => eventSignature(byId.get(id)) !== signature
      );
      return previewStale;
    }

    return {
      limit,
      toggle,
      selectMany,
      clear,
      capturePreview,
      reconcile,
      has: (id) => selected.has(String(id)),
      ids: () => [...selected],
      size: () => selected.size,
      hasPreview: () => previewSignatures !== null,
      isPreviewStale: () => previewStale
    };
  }

  function duplicateMatches(event, events, detector) {
    if (!detector?.analyzePair) return null;
    return (events || [])
      .filter((other) => String(other?.id) !== String(event?.id) && other?.rejected !== true)
      .map((other) => detector.analyzePair(event, other))
      .filter((match) => match && match.level !== "edition")
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  }

  function inspectEvent(event, action, events, controls) {
    if (!event) {
      return {
        status: "blocked",
        reasons: ["Événement absent des données actuellement chargées."],
        expected: "Aucune action possible"
      };
    }

    const reasons = [];
    const blockers = [];
    const textQuality = controls.textQuality?.summarize(event) || { hasIssues: false, fields: [] };
    const duplicates = duplicateMatches(event, events, controls.duplicates);
    let completeness = "Complète";
    let completenessIssue = "";

    try {
      controls.validatePublication(event);
      controls.validateRegistration(event);
    } catch (error) {
      completeness = "Incomplète";
      completenessIssue = error?.message || "Informations indispensables manquantes.";
    }

    if (action === "validate") {
      if (completenessIssue) blockers.push(completenessIssue);
      if (event.validated === true && event.rejected !== true) {
        blockers.push("Événement déjà validé.");
      }
      if (duplicates === null) {
        blockers.push("Contrôle des doublons indisponible.");
      } else if (duplicates.length) {
        reasons.push(`${duplicates.length} doublon(s) potentiel(s) détecté(s).`);
      }
      if (textQuality.hasIssues) {
        reasons.push(`Qualité textuelle à contrôler : ${textQuality.fields.join(", ")}.`);
      }
      if (event.verified !== true) {
        reasons.push("Vérification humaine non confirmée.");
      }
    } else if (event.rejected === true) {
      blockers.push("Événement déjà rejeté.");
    }

    return {
      id: String(event.id),
      title: event.title || "Sans titre",
      currentStatus: event.rejected === true ? "Rejeté" : event.validated === true ? "Validé" : "À vérifier",
      completeness,
      duplicates: duplicates === null ? "Indisponible" : duplicates.length ? `${duplicates.length} potentiel(s)` : "Aucun",
      textQuality: textQuality.hasIssues ? `À contrôler — ${textQuality.fields.join(", ")}` : "Aucune anomalie détectée",
      humanVerification: event.verified === true ? "Vérifiée" : "Non vérifiée",
      expected: action === "validate" ? "Passage à validé prévu" : "Passage à rejeté prévu — motif requis lors d’un futur lot d’exécution",
      status: blockers.length ? "blocked" : reasons.length ? "review" : "ready",
      reasons: [...blockers, ...reasons]
    };
  }

  global.DEDICALIVRES_EVENT_BULK_PREVIEW = {
    MAX_SELECTION,
    eventSignature,
    createSelectionController,
    inspectEvent
  };
})(typeof window !== "undefined" ? window : globalThis);
