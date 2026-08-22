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
assert.match(appSource, /function centerMapOnGlobalView\(\)/);
assert.match(appSource, /renderFilteredEvents\(\);\s*centerMapOnGlobalView\(\);/);
assert.match(appSource, /function initSubmissionDateFields\(options = \{\}\)/);
assert.match(appSource, /La date de début ne peut pas être antérieure à aujourd’hui/);
assert.match(appSource, /La date de fin doit être identique ou postérieure à la date de début/);
assert.match(appSource, /EVENT_IMAGE_TYPES = new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/);
assert.match(appSource, /La taille maximale autorisée est de 5 Mo/);
const submissionHtmlSource = fs.readFileSync(path.join(root, "soumettre.html"), "utf8");
assert.match(submissionHtmlSource, /accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(submissionHtmlSource, /JPG, PNG ou WEBP — 5 Mo maximum/);

const authorSearchSource = fs.readFileSync(path.join(root, "author-search-index.js"), "utf8");
assert.match(authorSearchSource, /if \(response\.error && isMissingColumnError\(response\.error\)\)/);

const authorBackofficeSource = fs.readFileSync(path.join(root, "author-backoffice.js"), "utf8");
const authorBackofficeContext = {};
vm.createContext(authorBackofficeContext);
vm.runInContext(authorBackofficeSource, authorBackofficeContext, { filename: "author-backoffice.js" });
const authorBackoffice = authorBackofficeContext.DEDICALIVRES_AUTHOR_BACKOFFICE;
assert.ok(authorBackoffice, "Le moteur back-office auteur doit être exposé.");

const incompleteAuthor = authorBackoffice.evaluateAuthor({ author: { pseudo: "Lina Test" } });
assert.equal(incompleteAuthor.ready, false);
assert.ok(Array.from(incompleteAuthor.missing).includes("photo"));
assert.ok(Array.from(incompleteAuthor.missing).includes("validation"));

const validatedPresenceWithoutPhoto = {
  id: "presence-ready-1",
  event_id: "event-future",
  pseudo: "Lina Test",
  author_slug: "lina-test",
  participant_type: "author",
  validated: true,
  rejected: false,
  events: { id: "event-future", title: "Salon futur", start_date: "2027-04-10", validated: true, rejected: false }
};
const authorWithoutPhoto = authorBackoffice.evaluateAuthor({
  author: { pseudo: "Lina Test", slug: "lina-test", validated: true, website: "https://example.test" },
  presences: [validatedPresenceWithoutPhoto]
});
assert.equal(authorWithoutPhoto.ready, false);
assert.ok(Array.from(authorWithoutPhoto.missing).includes("photo"));

const authorPhotoWithoutPresence = authorBackoffice.evaluateAuthor({
  author: { pseudo: "Lina Test", avatar_url: "https://images.test/lina.webp", validated: true }
});
assert.equal(authorPhotoWithoutPresence.ready, false);
assert.ok(Array.from(authorPhotoWithoutPresence.missing).includes("presence"));

const completeDraft = authorBackoffice.buildAuthorDraft({
  author: {
    id: "author-1",
    pseudo: "Lina Test",
    slug: "lina-test",
    avatar_url: "https://images.test/lina.webp",
    bio: "Autrice de romans.",
    website: "https://example.test",
    validated: true
  },
  presences: [
    { ...validatedPresenceWithoutPhoto, author_id: "author-1", book_or_publisher_url: "https://shop.test/lina" },
    {
      id: "presence-ready-2",
      event_id: "event-past",
      pseudo: "Lina Test",
      author_id: "author-1",
      participant_type: "author",
      validated: true,
      rejected: false,
      events: { id: "event-past", title: "Salon passé", start_date: "2025-03-10", validated: true, rejected: false }
    }
  ],
  now: new Date(2026, 7, 20)
});
assert.equal(completeDraft.ready, true);
assert.equal(completeDraft.status, "ready");
assert.equal(completeDraft.publishableLater, true);
assert.equal(completeDraft.upcomingEvents.length, 1);
assert.equal(completeDraft.pastEvents.length, 1);

const duplicateDraft = authorBackoffice.evaluateAuthor({
  author: { pseudo: "Lina Test", avatar_url: "https://images.test/lina.webp", validated: true, website: "https://example.test" },
  presences: [validatedPresenceWithoutPhoto],
  duplicate: true
});
assert.equal(duplicateDraft.ready, false);
assert.ok(Array.from(duplicateDraft.missing).includes("duplicate"));
assert.deepEqual(
  ["author", "artist_author", "hybrid", "publisher"].map((type) => authorBackoffice.evaluateAuthor({ author: { participant_type: type } }).profileLabel),
  ["Auteur", "Artiste-auteur", "Hybride", "Maison d’édition"]
);
assert.equal(authorBackoffice.evaluateAuthor({ author: { pseudo: "Éditions Test", participant_type: "publisher" } }).ready, false);

const authorHtmlSource = fs.readFileSync(path.join(root, "author.html"), "utf8");
const authorPageSource = fs.readFileSync(path.join(root, "author.js"), "utf8");
assert.match(authorHtmlSource, /name="robots" content="noindex,nofollow,noarchive,nosnippet"/);
assert.match(authorHtmlSource, /id="author-events-upcoming"/);
assert.match(authorHtmlSource, /id="author-events-past"/);
assert.match(authorHtmlSource, /author-backoffice\.js/);
assert.doesNotMatch(authorHtmlSource, /tracking-v4\.js/);
assert.ok(authorPageSource.indexOf("if (!isAdminPreview)") < authorPageSource.indexOf('.from("authors")'));
assert.ok(authorPageSource.indexOf("client.auth.getSession()") < authorPageSource.indexOf('.from("authors")'));
assert.match(authorPageSource, /Cette fiche est préparée en back-office et n’est pas publiée/);
assert.match(authorPageSource, /Historique des présences indiquées sur Dédicalivres/);

async function runAuthorPreviewGate(search, session) {
  let fromCalls = 0;
  const nodes = {
    "author-profile": { innerHTML: "" },
    "author-events-upcoming": { innerHTML: "" },
    "author-events-past": { innerHTML: "" },
    "author-upcoming-section": { hidden: false },
    "author-past-section": { hidden: false }
  };
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }) },
    from: () => {
      fromCalls += 1;
      throw new Error("Aucune requête de données ne doit partir hors aperçu admin authentifié.");
    }
  };
  const previewContext = {
    URLSearchParams,
    console,
    document: {
      title: "",
      getElementById: (id) => nodes[id] || null
    },
    window: {
      location: { search },
      DEDICALIVRES_CONFIG: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "public-test" },
      DEDICALIVRES_AUTHOR_BACKOFFICE: authorBackoffice,
      supabase: { createClient: () => client }
    }
  };
  vm.createContext(previewContext);
  vm.runInContext(authorPageSource, previewContext, { filename: "author.js" });
  await new Promise((resolve) => setImmediate(resolve));
  return { fromCalls, nodes };
}

const publicAuthorGate = await runAuthorPreviewGate("?slug=lina-test", null);
assert.equal(publicAuthorGate.fromCalls, 0);
assert.match(publicAuthorGate.nodes["author-profile"].innerHTML, /Fiche auteur non publiée/);
const unauthenticatedPreviewGate = await runAuthorPreviewGate("?slug=lina-test&preview=admin", null);
assert.equal(unauthenticatedPreviewGate.fromCalls, 0);
assert.match(unauthenticatedPreviewGate.nodes["author-profile"].innerHTML, /Connexion admin requise/);

const headersSourceForAuthor = fs.readFileSync(path.join(root, "_headers"), "utf8");
assert.match(headersSourceForAuthor, /\/author\.html[\s\S]*X-Robots-Tag: noindex, nofollow, noarchive, nosnippet/);
assert.match(headersSourceForAuthor, /\/author\.html[\s\S]*Cache-Control: no-store/);
assert.match(headersSourceForAuthor, /\/author\n[\s\S]*X-Robots-Tag: noindex, nofollow, noarchive, nosnippet/);
const robotsSource = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
assert.match(robotsSource, /Disallow: \/author\.html/);
assert.match(robotsSource, /Disallow: \/author-backoffice\.js/);

const adminPresenceSource = fs.readFileSync(path.join(root, "admin-author-requests-robust.js"), "utf8");
assert.match(adminPresenceSource, /if \(response\.error && isMissingColumnError\(response\.error\)\)/);
assert.match(adminPresenceSource, /id="author-requests-search"/);
assert.match(adminPresenceSource, /id="author-requests-profile-filter"/);
assert.match(adminPresenceSource, /data-author-filter="duplicates">Doublons probables/);
assert.match(adminPresenceSource, /Soumise le/);
assert.match(adminPresenceSource, /groupPresences\(rows\)/);
assert.doesNotMatch(adminPresenceSource, /data-action="delete"/);
assert.match(adminPresenceSource, /AUTEUR_PRÊT/);
assert.match(adminPresenceSource, /Publiable plus tard/);
assert.match(adminPresenceSource, /Aperçu interne/);
assert.match(adminPresenceSource, /findAuthorForPresence\(authors, row\)/);

const adminSource = fs.readFileSync(path.join(root, "admin.js"), "utf8");
assert.match(adminSource, /"author-backoffice\.js",\s*"admin-author-requests-robust\.js"/);

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

const adminWatchSource = fs.readFileSync(path.join(root, "admin-watch.js"), "utf8");
assert.match(adminWatchSource, /Événements à vérifier/);
assert.match(adminWatchSource, /Annulations[\s\S]*Reports[\s\S]*Dates \/ lieux[\s\S]*Inscriptions[\s\S]*Programmation[\s\S]*Nouvelles affiches/);
assert.match(adminWatchSource, /id="event-watch-review-state"/);
assert.match(adminWatchSource, /http:\/\/127\.0\.0\.1:5065\/api\/event-watch/);
assert.match(adminWatchSource, /\/api\/event-watch\/review/);
assert.match(adminWatchSource, /confirm: "EVENT_WATCH_REVIEW"/);
assert.match(adminWatchSource, /targetAddressSpace: "loopback"/);
assert.match(adminWatchSource, /Event Watch indisponible/);
assert.match(adminWatchSource, />Voir la fiche</);
const eventWatchReviewSource = adminWatchSource.slice(
  adminWatchSource.indexOf("async function reviewEventWatchAlert"),
  adminWatchSource.indexOf("async function fetchEventWatch")
);
assert.doesNotMatch(eventWatchReviewSource, /supabase|\.from\(/i);

const headersSource = fs.readFileSync(path.join(root, "_headers"), "utf8");
assert.match(headersSource, /connect-src[^\n]*http:\/\/127\.0\.0\.1:5065/);
assert.match(headersSource, /connect-src[^\n]*http:\/\/localhost:5065/);

const eventSource = fs.readFileSync(path.join(root, "event.js"), "utf8");
assert.match(eventSource, /REGISTRATION_PROGRESS_STEPS/);
assert.match(eventSource, /aria-current="step"/);
assert.match(eventSource, /Ouverture prévue le/);
assert.match(eventSource, /Jusqu’au/);
assert.match(eventSource, /if \(!hasContent\) return "";/);
assert.match(eventSource, />S’inscrire<\/a>/);
assert.match(eventSource, /href="#authors-presence-section"/);
assert.match(eventSource, /id="detail-share-btn"/);
assert.match(eventSource, /window\.DEDICALIVRES_SHARE_API \|\| navigator/);
assert.match(eventSource, /shareApi\.share\(shareData\)/);
assert.match(eventSource, /shareApi\.clipboard\.writeText\(url\)/);
assert.match(eventSource, /document\.execCommand\("copy"\)/);
assert.match(eventSource, /setShareFeedback\(feedback, "Lien copié"\)/);
assert.match(eventSource, /aria-live="polite"/);

const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8");
assert.match(styleSource, /\.registration-progress-current-3::after \{ width: 75%; \}/);
assert.match(styleSource, /\.detail-primary-actions[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*\.detail-primary-actions[\s\S]*grid-template-columns: 1fr/);
assert.match(styleSource, /#submission-form \.legal-consent input\[type="checkbox"\][\s\S]*min-height: 20px/);
assert.match(styleSource, /#submission-form \.multiple-events-option input\[type="checkbox"\][\s\S]*min-height: 21px/);

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


// 20E.3 — champs enrichis auteur
{
  const enriched = authorBackoffice.buildAuthorDraft({
    author: {
      pseudo: "Lina Enrichie",
      slug: "lina-enrichie",
      avatar_url: "https://images.test/lina.webp",
      bio: "Biographie complète.",
      website: "https://example.test/lina",
      shop_url: "https://shop.example.test/lina",
      location: "Bretagne",
      profile_type: "artist_author",
      validated: true
    },
    presences: [
      {
        id: "presence-enriched",
        pseudo: "Lina Enrichie",
        participant_type: "author",
        validated: true,
        rejected: false,
        events: {
          id: "event-enriched",
          title: "Salon enrichi",
          city: "Lorient",
          region: "Bretagne",
          start_date: "2027-05-10",
          validated: true,
          rejected: false
        }
      }
    ],
    duplicate: false
  });

  assert.equal(enriched.location, "Bretagne");
  assert.equal(enriched.secondaryLink, "https://shop.example.test/lina");
  assert.equal(enriched.profileType, "artist_author");
  assert.equal(enriched.profileLabel, "Artiste-auteur");
  assert.equal(enriched.ready, true);
}

assert.match(
  adminPresenceSource,
  /id="author-editor-location"/,
  "20E.3 : localisation éditable dans le cockpit admin"
);

assert.match(
  adminPresenceSource,
  /id="author-editor-shop"/,
  "20E.3 : boutique éditable dans le cockpit admin"
);

assert.match(
  adminPresenceSource,
  /id="author-editor-profile-type"/,
  "20E.3 : type de profil éditable dans le cockpit admin"
);

assert.match(
  adminPresenceSource,
  /shop_url:\s*shopUrl\s*\|\|\s*null/,
  "20E.3 : shop_url enregistré dans authors"
);

assert.match(
  adminPresenceSource,
  /profile_type:\s*profileType\s*\|\|\s*null/,
  "20E.3 : profile_type enregistré dans authors"
);

assert.match(
  authorPageSource,
  /location,\s*shop_url,\s*profile_type/,
  "20E.3 : aperçu auteur charge les champs enrichis"
);

assert.match(
  authorBackofficeSource,
  /author\.profile_type/,
  "20E.3 : moteur auteur privilégie profile_type"
);


// 20F.1 — doublons auteurs
{
  const duplicates = authorBackoffice.findProbableAuthorDuplicates([
    {
      id: "author-a",
      pseudo: "Élodie Martin",
      slug: "elodie-martin",
      website: "https://example.test/elodie",
      shop_url: "https://shop.example.test/elodie",
      location: "Bretagne"
    },
    {
      id: "author-b",
      pseudo: "Elodie Martin",
      slug: "elodie-martin-2",
      website: "https://example.test/elodie",
      shop_url: "https://shop.example.test/elodie",
      location: "Bretagne"
    },
    {
      id: "author-c",
      pseudo: "Camille Durand",
      slug: "camille-durand",
      website: "https://example.test/camille",
      location: "Normandie"
    }
  ]);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].left.id, "author-a");
  assert.equal(duplicates[0].right.id, "author-b");
  assert.equal(duplicates[0].score, 100);

  assert.ok(
    Array.from(duplicates[0].reasons).includes("identité")
  );

  assert.ok(
    Array.from(duplicates[0].reasons).includes("site")
  );
}

{
  const unrelated = authorBackoffice.scoreAuthorDuplicate(
    {
      id: "author-x",
      pseudo: "Lina Martin"
    },
    {
      id: "author-y",
      pseudo: "Morgan Le Gall"
    }
  );

  assert.equal(unrelated.score, 0);
  assert.deepEqual(Array.from(unrelated.reasons), []);
}

{
  const accentDuplicate = authorBackoffice.scoreAuthorDuplicate(
    {
      id: "author-accent-a",
      pseudo: "Élodie Martin"
    },
    {
      id: "author-accent-b",
      pseudo: "Elodie Martin"
    }
  );

  assert.equal(accentDuplicate.score, 70);
}

assert.match(
  adminPresenceSource,
  /findProbableAuthorDuplicates\(authors\)/,
  "20F.1 : cockpit analyse les fiches authors"
);

assert.match(
  adminPresenceSource,
  /data-author-duplicate-summary/,
  "20F.1 : résumé des doublons auteurs présent"
);

assert.match(
  adminPresenceSource,
  /Détection uniquement — aucune fusion automatique/,
  "20F.1 : aucune fusion automatique"
);


// 20F.2A — comparaison doublons
assert.match(
  adminPresenceSource,
  /openAuthorDuplicateCompare\(authorPreparationAction\)/,
  "20F.2A : le clic doublon ouvre la comparaison"
);

assert.match(
  adminPresenceSource,
  /function openAuthorDuplicateCompare/,
  "20F.2A : fonction de comparaison présente"
);

assert.match(
  adminPresenceSource,
  /Score de rapprochement/,
  "20F.2A : score affiché"
);

assert.match(
  adminPresenceSource,
  /duplicate\.reasons\.join/,
  "20F.2A : raisons du rapprochement affichées"
);

assert.match(
  adminPresenceSource,
  /Fiche A/,
  "20F.2A : fiche A affichée"
);

assert.match(
  adminPresenceSource,
  /Fiche B/,
  "20F.2A : fiche B affichée"
);

assert.match(
  adminPresenceSource,
  /Lecture seule — aucune fusion ni modification n’est effectuée/,
  "20F.2A : comparaison explicitement en lecture seule"
);

assert.doesNotMatch(
  adminPresenceSource,
  /data-author-duplicate-action="merge"/,
  "20F.2A : aucune action de fusion disponible"
);


// 20F.2B — sélection fiche principale
assert.match(
  adminPresenceSource,
  /function selectAuthorDuplicatePrimary/,
  "20F.2B : fonction de sélection présente"
);

assert.match(
  adminPresenceSource,
  /data-author-duplicate-action="select-primary"/,
  "20F.2B : action de sélection présente"
);

assert.match(
  adminPresenceSource,
  /data-author-duplicate-side=/,
  "20F.2B : côté de fiche identifié"
);

assert.match(
  adminPresenceSource,
  /Fiche principale sélectionnée/,
  "20F.2B : état visuel de sélection affiché"
);

assert.match(
  adminPresenceSource,
  /Simulation uniquement — aucun changement n’est enregistré/,
  "20F.2B : sélection explicitement non persistée"
);

assert.match(
  adminPresenceSource,
  /author-duplicate-profile\.is-primary/,
  "20F.2B : style de fiche principale présent"
);

assert.match(
  adminPresenceSource,
  /author-duplicate-select\.is-selected/,
  "20F.2B : style du bouton sélectionné présent"
);

assert.doesNotMatch(
  adminPresenceSource,
  /data-author-duplicate-action="merge"/,
  "20F.2B : aucune fusion disponible"
);

console.log("V1 enrichie auteur + back-office : contrôles fonctionnels et de sécurité validés.");
