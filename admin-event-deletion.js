"use strict";

(function createSafeEventDeletion(global) {
  const CONFIRMATION_TEXT = "SUPPRIMER";
  const ACTION_LOG_KEY = "dedicalivres_admin_action_log_v1";

  const RELATIONS = Object.freeze([
    Object.freeze({
      key: "authorPresences",
      table: "event_authors_presence",
      column: "event_id",
      label: "présences auteurs",
      effect: "block"
    }),
    Object.freeze({
      key: "eventVisits",
      table: "event_visits",
      column: "event_id",
      label: "visites historisées",
      effect: "block"
    }),
    Object.freeze({
      key: "watchDuplicateLinks",
      table: "admin_watch_candidates",
      column: "duplicate_event_id",
      label: "liens doublon Veille",
      effect: "set_null"
    }),
    Object.freeze({
      key: "watchSubmissionLinks",
      table: "admin_watch_candidates",
      column: "submitted_event_id",
      label: "liens de soumission Veille",
      effect: "set_null"
    }),
    Object.freeze({
      key: "eventWatchAlerts",
      table: "admin_event_watch_alerts",
      column: "event_id",
      label: "alertes Event Watch",
      effect: "set_null"
    }),
    Object.freeze({
      key: "liveSessions",
      table: "live_sessions",
      column: "event_id",
      label: "sessions de dédicace live",
      effect: "set_null"
    })
  ]);

  function normalizeEventId(eventId) {
    const value = String(eventId == null ? "" : eventId).trim();

    if (!value) {
      throw new Error("Identifiant événement manquant.");
    }

    return value;
  }

  function relationMessage(relation, count) {
    return `${count} ${relation.label}`;
  }

  async function readRelationCount(client, relation, eventId) {
    const response = await client
      .from(relation.table)
      .select("id", { count: "exact", head: true })
      .eq(relation.column, eventId);

    if (response.error) {
      return {
        ...relation,
        availability: "unavailable",
        count: null,
        error: String(
          response.error.message ||
          response.error.code ||
          "Lecture indisponible"
        )
      };
    }

    return {
      ...relation,
      availability: "available",
      count: Number.isFinite(Number(response.count))
        ? Number(response.count)
        : 0,
      error: null
    };
  }

  async function inspectEventDeletionImpact(client, eventId, event = {}) {
    if (!client || typeof client.from !== "function") {
      throw new Error("Client Supabase indisponible.");
    }

    const normalizedId = normalizeEventId(eventId);
    const rows = await Promise.all(
      RELATIONS.map((relation) =>
        readRelationCount(client, relation, normalizedId)
      )
    );
    const relations = {};
    const warnings = [];
    const blockers = [];

    rows.forEach((relation) => {
      relations[relation.key] = relation;

      if (relation.availability !== "available") {
        const message =
          `Précontrôle indisponible : ${relation.label}.`;

        if (relation.effect === "block") {
          blockers.push(message);
        } else {
          warnings.push(
            `${message} La contrainte ON DELETE SET NULL reste le garde-fou serveur.`
          );
        }
        return;
      }

      if (relation.count < 1) {
        return;
      }

      if (relation.effect === "block") {
        blockers.push(
          `${relationMessage(relation, relation.count)} : suppression bloquée.`
        );
      } else {
        warnings.push(
          `${relationMessage(relation, relation.count)} seront détachés par ON DELETE SET NULL.`
        );
      }
    });

    relations.registrations = {
      key: "registrations",
      label: "informations d’inscription",
      availability: "inline",
      count: event.registration_enabled === true ? 1 : 0,
      effect: "delete_with_event",
      error: null
    };
    relations.favorites = {
      key: "favorites",
      label: "favoris navigateur",
      availability: "local_only",
      count: null,
      effect: "not_server_managed",
      error: null
    };
    relations.testimonials = {
      key: "testimonials",
      label: "témoignages",
      availability: "not_linked",
      count: null,
      effect: "none",
      error: null
    };

    if (event.validated === true && event.rejected !== true) {
      warnings.push("Cette fiche est publiée/validée.");
    }

    if (event.featured === true) {
      warnings.push("Cette fiche est actuellement mise en avant.");
    }

    if (event.registration_enabled === true) {
      warnings.push(
        "Les informations d’inscription sont stockées sur la fiche et seront supprimées avec elle."
      );
    }

    warnings.push(
      "Les favoris sont conservés localement dans les navigateurs : aucun lien serveur n’a été identifié."
    );

    return {
      eventId: normalizedId,
      relations,
      protected: blockers.length > 0,
      warnings,
      blockers
    };
  }

  function isExactConfirmation(value) {
    return String(value || "") === CONFIRMATION_TEXT;
  }

  function buildDeletionReason(reason, detail) {
    const labels = {
      duplicate: "Doublon",
      cancelled: "Événement annulé",
      input_error: "Erreur de saisie",
      out_of_scope: "Hors périmètre",
      other: "Autre"
    };
    const key = String(reason || "").trim();
    const note = String(detail || "").trim();
    const label = labels[key] || "Non renseignée";

    return note ? `${label} — ${note}` : label;
  }

  async function deleteEventByExactId(client, eventId) {
    if (!client || typeof client.from !== "function") {
      throw new Error("Client Supabase indisponible.");
    }

    const normalizedId = normalizeEventId(eventId);
    const response = await client
      .from("events")
      .delete()
      .eq("id", normalizedId)
      .select("id");

    if (response.error) {
      throw response.error;
    }

    const rows = Array.isArray(response.data) ? response.data : [];

    if (
      rows.length !== 1 ||
      String(rows[0]?.id) !== normalizedId
    ) {
      throw new Error(
        "Suppression non confirmée par Supabase : aucune autre action n’a été considérée comme réussie."
      );
    }

    return rows[0];
  }

  function createSingleFlightGate() {
    let running = false;

    return {
      isRunning() {
        return running;
      },
      async run(task) {
        if (running) {
          return {
            skipped: true,
            reason: "already-running"
          };
        }

        running = true;

        try {
          return await task();
        } finally {
          running = false;
        }
      }
    };
  }

  function recordDeletionAudit(storage, event, reason, adminId, deletedAt) {
    if (!storage || typeof storage.getItem !== "function") {
      return false;
    }

    let current = [];

    try {
      const parsed = JSON.parse(storage.getItem(ACTION_LOG_KEY) || "[]");
      current = Array.isArray(parsed) ? parsed : [];
    } catch {
      current = [];
    }

    const eventId = normalizeEventId(event?.id);
    const createdAt = deletedAt || new Date().toISOString();
    const entry = {
      label: "Événement supprimé",
      detail: `${event?.title || "Sans titre"} · #${eventId} · ${reason}`,
      created_at: createdAt,
      event_id: eventId,
      event_title: String(event?.title || ""),
      deletion_reason: String(reason || ""),
      admin_id: adminId ? String(adminId) : null
    };

    storage.setItem(
      ACTION_LOG_KEY,
      JSON.stringify([entry, ...current].slice(0, 20))
    );

    return true;
  }

  global.DEDICALIVRES_EVENT_DELETION = Object.freeze({
    ACTION_LOG_KEY,
    CONFIRMATION_TEXT,
    RELATIONS,
    buildDeletionReason,
    createSingleFlightGate,
    deleteEventByExactId,
    inspectEventDeletionImpact,
    isExactConfirmation,
    recordDeletionAudit
  });
})(window);
