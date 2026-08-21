import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const configSource = fs.readFileSync("config.js", "utf8");
const eventSource = fs.readFileSync("event.js", "utf8");
const submitSource = fs.readFileSync("soumettre.html", "utf8");

const context = {
  window: {
    localStorage: {
      getItem() {
        return null;
      }
    }
  }
};

vm.createContext(context);
vm.runInContext(configSource, context);

const registration = context.window.DEDICALIVRES_REGISTRATION;

assert.ok(
  registration,
  "DEDICALIVRES_REGISTRATION doit être exposé par config.js"
);

function event(overrides = {}) {
  return {
    type: "Salon",
    registration_enabled: true,
    registration_open_date: null,
    registration_deadline: null,
    registration_force_status: null,
    ...overrides
  };
}

const now = new Date(2026, 7, 21);

assert.equal(
  registration.getStatus(
    event({
      registration_open_date: "2026-09-01",
      registration_deadline: "2026-09-30"
    }),
    now
  )?.key,
  "soon",
  "Une ouverture future doit produire le statut soon"
);

assert.equal(
  registration.getStatus(
    event({
      registration_open_date: "2026-08-01",
      registration_deadline: "2026-09-30"
    }),
    now
  )?.key,
  "open",
  "Une inscription active doit produire le statut open"
);

assert.equal(
  registration.getStatus(
    event({
      registration_open_date: "2026-08-01",
      registration_deadline: "2026-08-25"
    }),
    now
  )?.key,
  "last-days",
  "Une échéance à moins de 7 jours doit produire last-days"
);

assert.equal(
  registration.getStatus(
    event({
      registration_open_date: "2026-07-01",
      registration_deadline: "2026-08-20"
    }),
    now
  )?.key,
  "closed",
  "Une date limite passée doit produire closed"
);

assert.equal(
  registration.getStatus(
    event({
      registration_force_status: "complet"
    }),
    now
  )?.key,
  "full",
  "Le statut forcé complet doit produire full"
);

assert.equal(
  registration.getStatus(
    event({
      registration_force_status: "annule"
    }),
    now
  )?.key,
  "cancelled",
  "Le statut forcé annule doit produire cancelled"
);

assert.equal(
  registration.getStatus(
    event({
      registration_force_status: "cloture"
    }),
    now
  )?.key,
  "closed",
  "Le statut forcé cloture doit produire closed"
);

assert.equal(
  registration.getStatus(
    event({
      type: "Dédicace"
    }),
    now
  ),
  null,
  "Une dédicace ne doit pas utiliser le module inscriptions"
);

assert.equal(
  registration.getStatus(
    event({
      registration_enabled: false
    }),
    now
  ),
  null,
  "Un événement sans inscriptions activées ne doit avoir aucun statut"
);

assert.deepEqual(
  Array.from(
    registration.normalizeAudience([
      "author",
      "artist_author",
      "hybrid",
      "publisher",
      "author",
      "invalide"
    ])
  ),
  ["author", "artist_author", "hybrid", "publisher"],
  "Les profils doivent être filtrés et dédupliqués"
);

for (const token of [
  "soon",
  "open",
  "last-days",
  "closed"
]) {
  assert.ok(
    eventSource.includes(`key: "${token}"`),
    `event.js doit conserver l'étape ${token}`
  );
}

assert.ok(
  eventSource.includes("REGISTRATION_PROGRESS_STEPS"),
  "event.js doit conserver la timeline d'inscription"
);

assert.ok(
  eventSource.includes("detail-registration-cta"),
  "event.js doit conserver le CTA d'inscription"
);

for (const audience of [
  'value="author"',
  'value="artist_author"',
  'value="hybrid"',
  'value="publisher"'
]) {
  assert.ok(
    submitSource.includes(audience),
    `soumettre.html doit conserver le profil ${audience}`
  );
}

assert.ok(
  submitSource.includes('id="registration-enabled-submit"'),
  "Le formulaire doit permettre l'activation des inscriptions"
);

console.log(
  "Timeline inscriptions : statuts, profils, éligibilité et structure validés."
);
