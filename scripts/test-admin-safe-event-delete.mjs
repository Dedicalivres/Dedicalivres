import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const moduleSource = fs.readFileSync("admin-event-deletion.js", "utf8");
const shellSource = fs.readFileSync("admin-shell.js", "utf8");
const html = fs.readFileSync("admin-v11.html", "utf8");
const css = fs.readFileSync("admin-v11.css", "utf8");
const sandbox = { window: {} };

vm.runInNewContext(moduleSource, sandbox);

const deletion = sandbox.window.DEDICALIVRES_EVENT_DELETION;
assert.ok(deletion, "Le module de suppression doit être exposé");

function createClient({ counts = {}, countErrors = {}, deleteError = null, returnedId = null } = {}) {
  const calls = [];

  return {
    calls,
    from(table) {
      return {
        select(_columns, options) {
          assert.equal(options?.head, true, "Les impacts utilisent uniquement des comptages head");
          return {
            async eq(column, eventId) {
              calls.push({ kind: "count", table, column, eventId: String(eventId) });
              const key = `${table}.${column}`;
              return {
                count: counts[key] ?? 0,
                error: countErrors[key] || null
              };
            }
          };
        },
        delete() {
          calls.push({ kind: "delete", table });
          return {
            eq(column, eventId) {
              calls.push({ kind: "delete-eq", table, column, eventId: String(eventId) });
              return {
                async select(columns) {
                  calls.push({ kind: "delete-select", table, columns });
                  return {
                    data: deleteError ? null : [{ id: returnedId ?? String(eventId) }],
                    error: deleteError
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

// 1. Un événement simple sans dépendance critique reste supprimable.
const simpleClient = createClient();
const simpleImpact = await deletion.inspectEventDeletionImpact(
  simpleClient,
  "evt-101",
  { id: "evt-101", title: "Événement simple" }
);
assert.equal(simpleImpact.eventId, "evt-101");
assert.equal(simpleImpact.protected, false);
assert.deepEqual([...simpleImpact.blockers], []);
assert.equal(simpleClient.calls.filter((call) => call.kind === "count").length, 6);

// 2. Annuler au premier écran réinitialise le flux et ne lance aucun DELETE.
assert.ok(html.includes('id="v11-event-delete-cancel-one"'));
assert.ok(shellSource.includes('eventDeleteCancelOne, eventDeleteCancelTwo'));
assert.ok(shellSource.includes("resetV11EventDeletionFlow"));
assert.equal(simpleClient.calls.some((call) => call.kind === "delete"), false);

// 3 et 4. La confirmation est exacte, sensible à la casse et sans trim implicite.
assert.equal(deletion.isExactConfirmation("supprimer"), false);
assert.equal(deletion.isExactConfirmation(" SUPPRIMER"), false);
assert.equal(deletion.isExactConfirmation("SUPPRIMER"), true);
assert.match(html, /id="v11-event-delete-final"[\s\S]*?disabled/);

// 5 et 6. Présence auteur et lecture critique indisponible bloquent.
const presenceImpact = await deletion.inspectEventDeletionImpact(
  createClient({ counts: { "event_authors_presence.event_id": 2 } }),
  "evt-102"
);
assert.equal(presenceImpact.protected, true);
assert.ok(presenceImpact.blockers.some((message) => message.includes("2 présences auteurs")));

const unavailableImpact = await deletion.inspectEventDeletionImpact(
  createClient({
    countErrors: {
      "event_visits.event_id": { message: "permission denied" }
    }
  }),
  "evt-103"
);
assert.equal(unavailableImpact.protected, true);
assert.ok(unavailableImpact.blockers.some((message) => message.includes("visites historisées")));

// Les relations dont le FK SET NULL est documenté avertissent sans bloquer.
const cascadeImpact = await deletion.inspectEventDeletionImpact(
  createClient({
    counts: {
      "admin_watch_candidates.duplicate_event_id": 1,
      "admin_watch_candidates.submitted_event_id": 1,
      "admin_event_watch_alerts.event_id": 3,
      "live_sessions.event_id": 1
    }
  }),
  "evt-104",
  { validated: true, featured: true, registration_enabled: true }
);
assert.equal(cascadeImpact.protected, false);
assert.ok(cascadeImpact.warnings.some((message) => message.includes("ON DELETE SET NULL")));
assert.ok(cascadeImpact.warnings.some((message) => message.includes("publiée/validée")));

// 7. Une erreur Supabase remonte et ne peut pas être prise pour un succès.
await assert.rejects(
  deletion.deleteEventByExactId(
    createClient({ deleteError: new Error("FK violation") }),
    "evt-105"
  ),
  /FK violation/
);

// 8. Le garde anti-double clic n’exécute qu’une seule tâche concurrente.
const gate = deletion.createSingleFlightGate();
let executions = 0;
let release;
const pending = new Promise((resolve) => { release = resolve; });
const first = gate.run(async () => {
  executions += 1;
  await pending;
  return "done";
});
const second = await gate.run(async () => {
  executions += 1;
});
assert.equal(executions, 1);
assert.equal(second.skipped, true);
release();
assert.equal(await first, "done");

// 9. Le succès retire localement la fiche puis recharge les compteurs serveur.
assert.ok(shellSource.includes("const remainingEvents = (state.events || []).filter"));
assert.ok(shellSource.includes("renderEvents(remainingEvents, state.status)"));
assert.ok(shellSource.includes('v11ActionMessage("Événement supprimé.")'));
assert.ok(shellSource.includes("await context.refresh()"));

// 10. La zone est distincte de l’image et le module ne touche jamais au Storage.
assert.equal((html.match(/id="v11-event-delete-start"/g) || []).length, 1);
assert.ok(html.indexOf('id="v11-event-delete-start"') > html.indexOf('id="v11-edit-save"'));
assert.ok(!moduleSource.includes("storage.from"));
assert.ok(!moduleSource.includes("image_url"));
assert.ok(css.includes(".v11-event-danger-zone"));

// 11. Le DELETE est verrouillé sur l’ID exact et refuse un retour différent.
const exactClient = createClient({ returnedId: "evt-106" });
await deletion.deleteEventByExactId(exactClient, "evt-106");
const exactCall = exactClient.calls.find((call) => call.kind === "delete-eq");
assert.deepEqual(exactCall, {
  kind: "delete-eq",
  table: "events",
  column: "id",
  eventId: "evt-106"
});
assert.equal(exactClient.calls.filter((call) => call.kind === "delete").length, 1);

await assert.rejects(
  deletion.deleteEventByExactId(
    createClient({ returnedId: "evt-other" }),
    "evt-107"
  ),
  /Suppression non confirmée/
);

// Journalisation locale : structure existante réutilisée, sans secret.
const storageRows = new Map();
const storage = {
  getItem(key) { return storageRows.get(key) || null; },
  setItem(key, value) { storageRows.set(key, String(value)); }
};
assert.equal(
  deletion.recordDeletionAudit(
    storage,
    { id: "evt-108", title: "Titre test" },
    deletion.buildDeletionReason("duplicate", "conserver evt-109"),
    "admin-test",
    "2026-09-01T10:00:00.000Z"
  ),
  true
);
const audit = JSON.parse(storageRows.get(deletion.ACTION_LOG_KEY));
assert.equal(audit[0].event_id, "evt-108");
assert.equal(audit[0].admin_id, "admin-test");
assert.match(audit[0].deletion_reason, /Doublon/);

// Non-régression structurelle : la suppression n’est plus dans la fiche/liste.
assert.ok(html.includes('id="v11-event-editor-form"'));
assert.ok(html.includes('id="v11-edit-image"'));
assert.ok(html.includes('id="v11-edit-save"'));
assert.ok(!html.includes('id="v11-event-delete"'));
assert.ok(shellSource.includes('runV11EventAction("validate")'));
assert.ok(shellSource.includes('runV11EventAction("reject")'));
assert.ok(shellSource.includes('runV11EventAction("featured")'));
assert.ok(!shellSource.includes('runV11EventAction("delete")'));

console.log("ADMIN_SAFE_EVENT_DELETE_OK");
