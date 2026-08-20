#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const configSource = fs.readFileSync(path.join(root, "config.js"), "utf8");
const context = { window: { localStorage: { getItem: () => null } } };
vm.createContext(context);
vm.runInContext(configSource, context, { filename: "config.js" });

const registration = context.window.DEDICALIVRES_REGISTRATION;
assert.ok(registration, "Les helpers d’inscription doivent être exposés.");

const baseEvent = {
  type: "Salon",
  registration_enabled: true,
  registration_open_date: "2026-05-01",
  registration_deadline: "2026-05-31"
};

assert.equal(registration.getStatus({ ...baseEvent }, new Date(2026, 3, 30)).key, "soon");
assert.equal(registration.getStatus({ ...baseEvent }, new Date(2026, 4, 1)).key, "open");
assert.equal(registration.getStatus({ ...baseEvent }, new Date(2026, 4, 23)).key, "open");
assert.equal(registration.getStatus({ ...baseEvent }, new Date(2026, 4, 24)).key, "last-days");
assert.equal(registration.getStatus({ ...baseEvent }, new Date(2026, 4, 31)).key, "last-days");
assert.equal(registration.getStatus({ ...baseEvent }, new Date(2026, 5, 1)).key, "closed");
assert.equal(registration.getStatus({ ...baseEvent, registration_force_status: "complet" }, new Date(2026, 4, 2)).key, "full");
assert.equal(registration.getStatus({ ...baseEvent, registration_force_status: "cloture" }, new Date(2026, 4, 2)).key, "closed");
assert.equal(registration.getStatus({ ...baseEvent, registration_force_status: "annule" }, new Date(2026, 4, 2)).key, "cancelled");
assert.equal(registration.getStatus({ ...baseEvent, type: "Dédicace" }, new Date(2026, 4, 2)), null);
assert.equal(registration.getStatus({ ...baseEvent, registration_enabled: false }, new Date(2026, 4, 2)), null);
assert.deepEqual(
  Array.from(registration.normalizeAudience(["author", "artist_author", "publisher", "publisher", "invalid"])),
  ["author", "artist_author", "publisher"]
);

const presenceSource = fs.readFileSync(path.join(root, "authors-presence.js"), "utf8");
assert.match(presenceSource, /Ils ont indiqué leur présence sur Dédicalivres/);
assert.match(presenceSource, /participant_type: participantType/);
assert.match(presenceSource, /publication_mode: isPublisher \? "unknown" : publicationMode/);
assert.doesNotMatch(presenceSource, /publicationMode\s*===?\s*["']publisher["'].*participant_type/s);
assert.match(presenceSource, /participant_type === "publisher" \? "Organization" : "Person"/);
assert.match(presenceSource, /if \(response\.error && isMissingColumnError\(response\.error\)\) \{\s*\/\/ Fallback ancien schéma\./);
assert.match(presenceSource, /if \(legacyError\) throw legacyError;/);

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert.match(appSource, /if \(authorPresenceError && isMissingColumnError\(authorPresenceError\)\)/);

const authorSearchSource = fs.readFileSync(path.join(root, "author-search-index.js"), "utf8");
assert.match(authorSearchSource, /if \(response\.error && isMissingColumnError\(response\.error\)\)/);

const adminPresenceSource = fs.readFileSync(path.join(root, "admin-author-requests-robust.js"), "utf8");
assert.match(adminPresenceSource, /if \(response\.error && isMissingColumnError\(response\.error\)\)/);
assert.match(adminPresenceSource, /id="author-requests-search"/);
assert.match(adminPresenceSource, /id="author-requests-profile-filter"/);
assert.match(adminPresenceSource, /data-author-filter="duplicates">Doublons probables/);
assert.match(adminPresenceSource, /Soumise le/);
assert.match(adminPresenceSource, /groupPresences\(rows\)/);
assert.doesNotMatch(adminPresenceSource, /data-action="delete"/);

const duplicateSource = fs.readFileSync(path.join(root, "duplicate-detection.js"), "utf8");
const duplicateContext = { URL };
vm.createContext(duplicateContext);
vm.runInContext(duplicateSource, duplicateContext, { filename: "duplicate-detection.js" });
const duplicateDetector = duplicateContext.DEDICALIVRES_DUPLICATES;
assert.ok(duplicateDetector, "Le détecteur de doublons doit être exposé.");

const presenceFixtures = [
  { id: "presence-author", event_id: "event-1", participant_type: "author", pseudo: "Élodie Martin", validated: false, rejected: false },
  { id: "presence-artist", event_id: "event-1", participant_type: "artist_author", pseudo: "Elodie Martin", validated: true, rejected: false },
  { id: "presence-hybrid", event_id: "event-2", participant_type: "hybrid", pseudo: "Camille Durand", validated: false, rejected: false },
  { id: "presence-publisher", event_id: "event-1", participant_type: "publisher", organization_name: "Éditions Boréales", validated: false, rejected: true }
];
assert.deepEqual(
  presenceFixtures.map((row) => row.participant_type),
  ["author", "artist_author", "hybrid", "publisher"]
);
assert.deepEqual(
  presenceFixtures.map((row) => row.validated ? "validated" : row.rejected ? "rejected" : "pending"),
  ["pending", "validated", "pending", "rejected"]
);

const presenceDuplicateGroups = duplicateDetector.groupPresences(presenceFixtures);
assert.equal(presenceDuplicateGroups.length, 1);
assert.deepEqual(
  Array.from(presenceDuplicateGroups[0].rows, (row) => row.id).sort(),
  ["presence-artist", "presence-author"]
);
assert.ok(Array.from(presenceDuplicateGroups[0].reasons).includes("même événement"));
assert.equal(duplicateDetector.analyzePresencePair(presenceFixtures[0], presenceFixtures[1]).level, "probable");
assert.equal(duplicateDetector.analyzePresencePair(presenceFixtures[0], presenceFixtures[2]), null);

const eventSource = fs.readFileSync(path.join(root, "event.js"), "utf8");
assert.match(eventSource, /REGISTRATION_PROGRESS_STEPS/);
assert.match(eventSource, /aria-current="step"/);
assert.match(eventSource, /Ouverture prévue le/);
assert.match(eventSource, /Jusqu’au/);
assert.match(eventSource, /if \(!hasContent\) return "";/);

const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8");
assert.match(styleSource, /\.registration-progress-current-3::after \{ width: 75%; \}/);

const migrationDir = path.join(root, "supabase", "migrations");
const migrationFile = fs.readdirSync(migrationDir).find((name) => name.endsWith("_v1_enrichie_auteur.sql"));
assert.ok(migrationFile, "La migration locale versionnée doit exister.");
const migration = fs.readFileSync(path.join(migrationDir, migrationFile), "utf8");
assert.match(migration, /registration_audience text\[\]/);
assert.match(migration, /participant_type text not null default 'author'/);
assert.doesNotMatch(migration, /publication_mode\s*=\s*'publisher'/i);
assert.doesNotMatch(migration, /drop\s+(table|column)|truncate\s|delete\s+from/i);
assert.match(migration, /revoke all on table public\.event_authors_presence from anon/);
assert.match(migration, /contact_name text/);
assert.doesNotMatch(
  migration.match(/grant select \([\s\S]*?\) on public\.event_authors_presence to anon;/i)?.[0] || "",
  /contact_(name|email)/i
);

const secondaryFiles = [
  "author-search-index.js",
  "admin-social-generator.js",
  "dedicalivres-daily-export.js",
  "worker/dedicalivres-daily-export.js"
];
secondaryFiles.forEach((file) => {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  assert.match(source, /participant_type/);
  assert.match(source, /publisher/);
});

console.log("V1 enrichie auteur : 50 assertions fonctionnelles et de sécurité validées.");
