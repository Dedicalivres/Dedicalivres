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
const authorPublicationSource = fs.readFileSync(path.join(root, "author-publication.js"), "utf8");
const authorPublicationContext = { window: {} };
vm.createContext(authorPublicationContext);
vm.runInContext(authorPublicationSource, authorPublicationContext, {
  filename: "author-publication.js"
});
const authorPublication =
  authorPublicationContext.window.DEDICALIVRES_AUTHOR_PUBLICATION;
assert.match(authorHtmlSource, /name="robots" content="noindex,nofollow,noarchive,nosnippet"/);
assert.match(authorHtmlSource, /id="author-events-upcoming"/);
assert.match(authorHtmlSource, /id="author-events-past"/);
assert.match(authorHtmlSource, /author-backoffice\.js/);
assert.doesNotMatch(authorHtmlSource, /tracking-v4\.js/);
assert.ok(authorPageSource.indexOf("if (!isAdminPreview)") < authorPageSource.indexOf('.from("authors")'));
assert.ok(authorPageSource.indexOf("client.auth.getSession()") < authorPageSource.indexOf('.from("authors")'));
assert.match(authorPageSource, /Cette vue reste réservée à l’administration et non indexée/);
assert.match(authorPageSource, /Historique des présences indiquées sur Dédicalivres/);

async function runAuthorPreviewGate(
  search,
  session,
  authorPublicPublishingEnabled = false
) {
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
    from: (table) => {
      fromCalls += 1;

      if (table !== "authors") {
        throw new Error(
          "Le mode public non publié ne doit interroger que la table authors."
        );
      }

      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({
          data: null,
          error: null
        })
      };
    }
  };
  const previewContext = {
    URLSearchParams,
    console,
    document: {
      title: "",
      getElementById: (id) => nodes[id] || null,
      querySelector: (selector) =>
        selector === 'meta[name="description"]'
          ? { setAttribute() {} }
          : null
    },
    window: {
      location: { search },
      DEDICALIVRES_CONFIG: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "public-test",
        authorPublicPublishingEnabled
      },
      DEDICALIVRES_AUTHOR_BACKOFFICE: authorBackoffice,
      DEDICALIVRES_AUTHOR_PUBLICATION: authorPublication,
      supabase: { createClient: () => client }
    }
  };
  vm.createContext(previewContext);
  vm.runInContext(authorPageSource, previewContext, { filename: "author.js" });
  await new Promise((resolve) => setImmediate(resolve));
  return { fromCalls, nodes };
}

const lockedPublicAuthorGate =
  await runAuthorPreviewGate(
    "?slug=lina-test",
    null,
    false
  );

assert.equal(
  lockedPublicAuthorGate.fromCalls,
  0,
  "20I.2 : le mode public désactivé ne doit interroger aucune table Supabase"
);

assert.match(
  lockedPublicAuthorGate.nodes[
    "author-profile"
  ].innerHTML,
  /Fiche auteur indisponible/,
  "20I.2 : l’Espace Auteur désactivé reste indisponible publiquement"
);

const enabledPublicAuthorGate =
  await runAuthorPreviewGate(
    "?slug=lina-test",
    null,
    true
  );

assert.equal(
  enabledPublicAuthorGate.fromCalls,
  1,
  "20I.2 : une fois activé, le mode public vérifie exactement une fois la fiche authors"
);

assert.match(
  enabledPublicAuthorGate.nodes[
    "author-profile"
  ].innerHTML,
  /Fiche auteur indisponible/,
  "20I.2 : une fiche absente ou non publiée reste indisponible même après activation du service"
);

const unauthenticatedPreviewGate =
  await runAuthorPreviewGate(
    "?slug=lina-test&preview=admin",
    null,
    false
  );

assert.equal(
  unauthenticatedPreviewGate.fromCalls,
  0
);

assert.match(
  unauthenticatedPreviewGate.nodes[
    "author-profile"
  ].innerHTML,
  /Connexion admin requise/
);

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
assert.match(adminWatchSource, /id="event-watch-review-count"/);
assert.match(adminWatchSource, /data-event-watch-filter="review"/);
assert.match(adminWatchSource, /http:\/\/127\.0\.0\.1:5065\/api\/event-watch/);
assert.doesNotMatch(adminWatchSource, /\/api\/event-watch\/review/);
assert.match(adminWatchSource, /dedicalivres_admin_event_watch_workflow_v1/);
assert.match(adminWatchSource, /targetAddressSpace: "loopback"/);
assert.match(adminWatchSource, /Event Watch indisponible/);
assert.match(adminWatchSource, />Ouvrir l’événement</);
const eventWatchReviewSource = adminWatchSource.slice(
  adminWatchSource.indexOf("function setEventWatchWorkflowState"),
  adminWatchSource.indexOf("function resetEventWatchWorkflow")
);
assert.doesNotMatch(eventWatchReviewSource, /supabase|\.from\(|fetchEventWatch|callWatchWorker/i);

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
  authorPublicationSource,
  /"location",\s*\n\s*"shop_url",\s*"profile_type"/,
  "20E.3 : la sélection publique charge les champs enrichis"
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
  /findProbableAuthorDuplicates\((authors|activeAuthors)\)/,
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
  /Comparez les fiches, choisissez la principale puis contrôlez le plan/,
  "20F.2A : comparaison encadrée avant toute fusion"
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
  /Aucun changement n’est effectué tant que vous ne confirmez pas la fusion/,
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


// 20F.3A — simulation fusion contrôlée
assert.match(
  adminPresenceSource,
  /function renderAuthorDuplicateMergePlan/,
  "20F.3A : fonction de simulation de fusion présente"
);

assert.match(
  adminPresenceSource,
  /function getAuthorLinkedPresences/,
  "20F.3A : présences techniquement liées identifiées"
);

assert.match(
  adminPresenceSource,
  /function getAuthorNameOnlyPresences/,
  "20F.3A : correspondances uniquement par nom isolées"
);

assert.match(
  adminPresenceSource,
  /author_id = \$\{escapeHtml\(primaryId/,
  "20F.3A : author_id cible affiché"
);

assert.match(
  adminPresenceSource,
  /author_slug = \$\{escapeHtml\(primarySlug/,
  "20F.3A : author_slug cible affiché"
);

assert.match(
  adminPresenceSource,
  /author_identity_key = \$\{escapeHtml\(primarySlug/,
  "20F.3A : author_identity_key cible affiché"
);

assert.match(
  adminPresenceSource,
  /ne sont pas incluses\s+dans la fusion automatique/,
  "20F.3A : correspondances par nom exclues de la fusion automatique"
);

assert.match(
  adminPresenceSource,
  /La fusion réaffectera les présences techniquement liées/,
  "20F.3A : réaffectation annoncée avant confirmation"
);

assert.match(
  adminPresenceSource,
  /Aucune suppression physique ne sera faite/,
  "20F.3A : aucune suppression physique"
);


// 20F.3B — lecture fiches fusionnées
assert.match(
  adminPresenceSource,
  /merged_into, merged_at/,
  "20F.3B : colonnes de fusion demandées"
);

assert.match(
  adminPresenceSource,
  /const enrichedColumns/,
  "20F.3B : fallback schéma enrichi présent"
);

assert.match(
  adminPresenceSource,
  /const legacyColumns/,
  "20F.3B : fallback legacy présent"
);

assert.match(
  adminPresenceSource,
  /const activeAuthors = authors\.filter/,
  "20F.3B : filtrage des fiches actives présent"
);

assert.match(
  adminPresenceSource,
  /!author\?\.merged_into/,
  "20F.3B : fiches fusionnées exclues de la détection"
);

assert.match(
  adminPresenceSource,
  /findProbableAuthorDuplicates\(activeAuthors\)/,
  "20F.3B : détection limitée aux fiches actives"
);

assert.doesNotMatch(
  adminPresenceSource,
  /\.delete\([^)]*merged_into/,
  "20F.3B : aucune suppression liée au statut fusion"
);


// 20F.3D — fusion contrôlée réelle
assert.match(
  adminPresenceSource,
  /data-author-duplicate-action="merge"/,
  "20F.3D : action de fusion explicite présente"
);

assert.match(
  adminPresenceSource,
  /async function executeAuthorDuplicateMerge/,
  "20F.3D : fonction de fusion contrôlée présente"
);

assert.match(
  adminPresenceSource,
  /CONFIRMER LA FUSION/,
  "20F.3D : confirmation forte avant fusion"
);

assert.match(
  adminPresenceSource,
  /Fiche conservée/,
  "20F.3D : fiche principale clairement identifiée"
);

assert.match(
  adminPresenceSource,
  /Fiche archivée/,
  "20F.3D : fiche secondaire clairement identifiée"
);

assert.match(
  adminPresenceSource,
  /\.rpc\(\s*"merge_author_profiles"/,
  "20F.3D : RPC transactionnelle utilisée"
);

assert.match(
  adminPresenceSource,
  /p_primary_id:\s*primaryId/,
  "20F.3D : identifiant principal transmis"
);

assert.match(
  adminPresenceSource,
  /p_secondary_id:\s*secondaryId/,
  "20F.3D : identifiant secondaire transmis"
);

assert.match(
  adminPresenceSource,
  /presence_event_conflict/,
  "20F.3D : conflit de présence géré"
);

assert.match(
  adminPresenceSource,
  /already_merged/,
  "20F.3D : fiche déjà fusionnée gérée"
);

assert.match(
  adminPresenceSource,
  /admin_required/,
  "20F.3D : refus de droits administrateur géré"
);

assert.doesNotMatch(
  adminPresenceSource,
  /\.delete\(/,
  "20F.3D : aucune suppression physique introduite"
);


// 20G.1 — historique des fusions en lecture seule
assert.match(
  adminPresenceSource,
  /HISTORIQUE DES FUSIONS/,
  "20G.1 : panneau historique présent"
);

assert.match(
  adminPresenceSource,
  /async function loadAuthorMergeHistory/,
  "20G.1 : chargement historique présent"
);

assert.match(
  adminPresenceSource,
  /\.from\("author_merge_audit"\)/,
  "20G.1 : journal d’audit utilisé"
);

assert.match(
  adminPresenceSource,
  /function renderAuthorMergeHistory/,
  "20G.1 : rendu historique présent"
);

assert.match(
  adminPresenceSource,
  /Présences déplacées/,
  "20G.1 : compteur de présences affiché"
);

assert.match(
  adminPresenceSource,
  /Annulée/,
  "20G.1 : statut annulé géré"
);

assert.match(
  adminPresenceSource,
  /Active/,
  "20G.1 : statut actif géré"
);

assert.match(
  adminPresenceSource,
  /\.rpc\(\s*"revert_author_merge"/,
  "20G.2 : RPC de retour arrière contrôlé présente"
);


// 20G.2 — retour arrière admin contrôlé
assert.match(
  adminPresenceSource,
  /data-author-merge-action="revert"/,
  "20G.2 : action de retour arrière présente"
);

assert.match(
  adminPresenceSource,
  /Annuler cette fusion/,
  "20G.2 : bouton d’annulation explicite présent"
);

assert.match(
  adminPresenceSource,
  /async function executeAuthorMergeRevert/,
  "20G.2 : fonction de rollback contrôlé présente"
);

assert.match(
  adminPresenceSource,
  /CONFIRMER LE RETOUR ARRIÈRE/,
  "20G.2 : confirmation forte avant rollback"
);

assert.match(
  adminPresenceSource,
  /p_audit_id:\s*auditId/,
  "20G.2 : identifiant du journal transmis à la RPC"
);

assert.match(
  adminPresenceSource,
  /merge_already_reverted/,
  "20G.2 : fusion déjà annulée gérée"
);

assert.match(
  adminPresenceSource,
  /merge_state_changed/,
  "20G.2 : changement d’état géré"
);

assert.match(
  adminPresenceSource,
  /presence_restore_count_mismatch/,
  "20G.2 : divergence des présences gérée"
);

assert.match(
  adminPresenceSource,
  /admin_required/,
  "20G.2 : droits administrateur contrôlés"
);

assert.doesNotMatch(
  adminPresenceSource,
  /\.delete\(/,
  "20G.2 : aucune suppression physique"
);


// 20H.1 — préparation publication auteur
assert.match(
  adminPresenceSource,
  /function buildAuthorPublicationChecklist/,
  "20H.1 : moteur de checklist présent"
);

assert.match(
  adminPresenceSource,
  /function renderAuthorPublicationChecklist/,
  "20H.1 : rendu de checklist présent"
);

assert.match(
  adminPresenceSource,
  /Préparation publication/,
  "20H.1 : bloc de préparation publication affiché"
);

for (const label of [
  "Identité",
  "Photo",
  "Type",
  "Biographie",
  "Localisation",
  "Vitrine",
  "Boutique",
  "Historique"
]) {
  assert.match(
    adminPresenceSource,
    new RegExp(`label:\\s*"${label}"`),
    `20H.1 : critère ${label} présent`
  );
}

assert.match(
  adminPresenceSource,
  /completed === total && !blocked/,
  "20H.1 : état prêt exige checklist complète et absence de blocage"
);

assert.match(
  adminPresenceSource,
  /draft\.duplicate === true/,
  "20H.1 : doublon considéré comme bloquant"
);

assert.match(
  adminPresenceSource,
  /Publication bloquée/,
  "20H.1 : blocage publication expliqué"
);

assert.match(
  adminPresenceSource,
  /Fiche éditorialement complète/,
  "20H.1 : état éditorial complet affiché"
);


// 20H.2B — validation manuelle prête à publier
assert.match(
  adminPresenceSource,
  /publication_ready,\s*publication_ready_at,\s*publication_ready_by/,
  "20H.2B : champs de préparation éditoriale chargés"
);

assert.match(
  adminPresenceSource,
  /Marquer prête à publier/,
  "20H.2B : action de validation éditoriale présente"
);

assert.match(
  adminPresenceSource,
  /Retirer le statut prêt/,
  "20H.2B : retrait du statut prêt présent"
);

assert.match(
  adminPresenceSource,
  /async function executeAuthorPublicationReadiness/,
  "20H.2B : fonction de gestion du statut éditorial présente"
);

assert.match(
  adminPresenceSource,
  /if\s*\(!checklist\.ready\)/,
  "20H.2B : validation refusée si checklist incomplète"
);

assert.match(
  adminPresenceSource,
  /supabaseClient\.auth\.getUser\(\)/,
  "20H.2B : administrateur connecté identifié"
);

assert.match(
  adminPresenceSource,
  /publication_ready:\s*true/,
  "20H.2B : activation du statut prête à publier"
);

assert.match(
  adminPresenceSource,
  /publication_ready_at:\s*new Date\(\)\.toISOString\(\)/,
  "20H.2B : date de validation enregistrée"
);

assert.match(
  adminPresenceSource,
  /publication_ready_by:\s*adminId/,
  "20H.2B : administrateur validateur enregistré"
);

assert.match(
  adminPresenceSource,
  /publication_ready:\s*false[\s\S]*publication_ready_at:\s*null[\s\S]*publication_ready_by:\s*null/,
  "20H.2B : retrait du statut nettoie date et administrateur"
);

assert.match(
  adminPresenceSource,
  /Cette action ne publie pas la fiche sur le site/,
  "20H.2B : absence de publication automatique explicitée"
);

assert.doesNotMatch(
  adminPresenceSource,
  /publish_author/,
  "20H.2B : aucune fonction de publication automatique"
);


// 20I.1B — publication publique contrôlée
assert.match(
  adminPresenceSource,
  /published,\s*published_at,\s*published_by/,
  "20I.1B : champs de publication chargés"
);

assert.match(
  adminPresenceSource,
  /async function executeAuthorControlledPublication/,
  "20I.1B : fonction de publication contrôlée présente"
);

assert.match(
  adminPresenceSource,
  /author\.publication_ready === true/,
  "20I.1B : publication exige le statut prêt"
);

assert.match(
  adminPresenceSource,
  /author\.validated === true/,
  "20I.1B : publication exige une fiche validée"
);

assert.match(
  adminPresenceSource,
  /!author\.merged_into/,
  "20I.1B : publication interdite pour une fiche fusionnée"
);

assert.match(
  adminPresenceSource,
  /author\.published !== true/,
  "20I.1B : une fiche déjà publiée n’est pas republiée"
);

assert.match(
  adminPresenceSource,
  />\s*Publier\s*</,
  "20I.1B : bouton Publier présent"
);

assert.match(
  adminPresenceSource,
  />\s*Dépublier\s*</,
  "20I.1B : bouton Dépublier présent"
);

assert.match(
  adminPresenceSource,
  /PUBLICATION PUBLIQUE/,
  "20I.1B : confirmation forte avant publication"
);

assert.match(
  adminPresenceSource,
  /supabaseClient\.auth\.getUser\(\)/,
  "20I.1B : administrateur connecté identifié"
);

assert.match(
  adminPresenceSource,
  /published:\s*true[\s\S]*published_at:\s*new Date\(\)\.toISOString\(\)[\s\S]*published_by:\s*adminId/,
  "20I.1B : publication enregistre état, date et administrateur"
);

assert.match(
  adminPresenceSource,
  /published:\s*false[\s\S]*published_at:\s*null[\s\S]*published_by:\s*null/,
  "20I.1B : dépublication nettoie les métadonnées"
);

assert.match(
  adminPresenceSource,
  /page publique reste encore verrouillée/,
  "20I.1B : interface rappelle que l’exposition publique reste désactivée"
);


// 20I.2 — page auteur publique contrôlée
const authorPublicHtmlSource = fs.readFileSync(
  new URL("../author.html", import.meta.url),
  "utf8"
);

const authorPublicJsSource = fs.readFileSync(
  new URL("../author.js", import.meta.url),
  "utf8"
);

assert.match(
  authorPublicHtmlSource,
  /id="author-robots"[^>]+content="noindex,nofollow,noarchive,nosnippet"/,
  "20I.2 : author.html reste noindex par défaut"
);

assert.match(
  authorPublicationSource,
  /author\.published === true/,
  "20I.2 : mode public exige published=true"
);

assert.match(
  authorPublicationSource,
  /author\.validated === true/,
  "20I.2 : mode public exige validated=true"
);

assert.match(
  authorPublicationSource,
  /!author\.merged_into/,
  "20I.2 : mode public refuse une fiche fusionnée"
);

assert.match(
  authorPublicJsSource,
  /function renderPublicNotFound/,
  "20I.2 : fiche non publiée rendue indisponible"
);

assert.match(
  authorPublicJsSource,
  /function unlockPublicIndexing/,
  "20I.2 : activation d’indexation publique isolée"
);

assert.match(
  authorPublicJsSource,
  /robotsMeta\.setAttribute\("content", "index,follow"\)/,
  "20I.2 : indexation activée uniquement explicitement"
);

assert.match(
  authorPublicJsSource,
  /if\s*\(isAdminPreview\)[\s\S]*buildAuthorFromPresence/,
  "20I.2 : fallback depuis les présences conservé pour l’aperçu admin"
);

const publicBranchStart = authorPublicJsSource.indexOf(
  "configureNavigation(false);"
);

const publicBranchEnd = authorPublicJsSource.indexOf(
  "async function loadAuthor"
);

assert.ok(
  publicBranchStart !== -1 && publicBranchEnd > publicBranchStart,
  "20I.2 : branche publique détectée"
);

const publicBranch = authorPublicJsSource.slice(
  publicBranchStart,
  publicBranchEnd
);

assert.doesNotMatch(
  publicBranch,
  /buildAuthorFromPresence/,
  "20I.2 : aucun fallback présence dans la branche publique"
);

assert.match(
  publicBranch,
  /unlockPublicIndexing\(draft\)/,
  "20I.2 : indexation activée après rendu réussi de la fiche publique"
);


// 20J.1 — découverte des fiches auteurs publiées
const authorsPresenceDiscoverySource = fs.readFileSync(
  new URL("../authors-presence.js", import.meta.url),
  "utf8"
);

assert.match(
  authorsPresenceDiscoverySource,
  /"author_id"/,
  "20J.1 : author_id chargé avec les présences"
);

assert.match(
  authorsPresenceDiscoverySource,
  /"author_slug"/,
  "20J.1 : author_slug chargé avec les présences"
);

assert.match(
  authorsPresenceDiscoverySource,
  /async function enrichPublishedAuthorProfiles/,
  "20J.1 : enrichissement des profils publics présent"
);

assert.match(
  authorsPresenceDiscoverySource,
  /\.from\("authors"\)/,
  "20J.1 : vérification via la table authors"
);

assert.match(
  authorsPresenceDiscoverySource,
  /author\.published === true/,
  "20J.1 : lien réservé aux auteurs publiés"
);

assert.match(
  authorsPresenceDiscoverySource,
  /author\.validated === true/,
  "20J.1 : lien réservé aux auteurs validés"
);

assert.match(
  authorsPresenceDiscoverySource,
  /!author\.merged_into/,
  "20J.1 : aucune fiche fusionnée exposée"
);

assert.match(
  authorsPresenceDiscoverySource,
  /participant\.public_author_slug = isPublic/,
  "20J.1 : slug public attribué uniquement après vérification"
);

assert.match(
  authorsPresenceDiscoverySource,
  /Voir la fiche Dédicalivres/,
  "20J.1 : CTA vers la fiche Dédicalivres présent"
);

assert.match(
  authorsPresenceDiscoverySource,
  /author\.html\?slug=\$\{encodeURIComponent\(participant\.public_author_slug\)\}/,
  "20J.1 : URL construite uniquement depuis le slug public vérifié"
);

assert.doesNotMatch(
  authorsPresenceDiscoverySource,
  /author\.html\?slug=\$\{encodeURIComponent\(participant\.author_slug\)\}/,
  "20J.1 : aucun lien public construit directement depuis author_slug"
);


// 20J.2 — préparation SEO fiche auteur publique
const authorSeoHtmlSource = fs.readFileSync(
  new URL("../author.html", import.meta.url),
  "utf8"
);

const authorSeoJsSource = fs.readFileSync(
  new URL("../author.js", import.meta.url),
  "utf8"
);

assert.match(
  authorSeoHtmlSource,
  /id="author-canonical"[^>]+rel="canonical"/,
  "20J.2 : canonical statique de sécurité présent"
);

assert.match(
  authorSeoHtmlSource,
  /property="og:type" content="profile"/,
  "20J.2 : Open Graph profile présent"
);

assert.match(
  authorSeoHtmlSource,
  /name="twitter:card" content="summary_large_image"/,
  "20J.2 : Twitter Card présente"
);

assert.match(
  authorSeoJsSource,
  /function configurePublicMetadata/,
  "20J.2 : métadonnées publiques dynamiques présentes"
);

assert.match(
  authorSeoJsSource,
  /function injectAuthorSchema/,
  "20J.2 : JSON-LD auteur présent"
);

assert.match(
  authorSeoJsSource,
  /"@type": "Person"/,
  "20J.2 : schéma Schema.org Person utilisé"
);

assert.match(
  authorSeoJsSource,
  /script\.id = "author-jsonld"/,
  "20J.2 : JSON-LD injecté avec un identifiant dédié"
);

assert.match(
  authorSeoJsSource,
  /configurePublicMetadata\(draft\)[\s\S]*injectAuthorSchema\(draft\)[\s\S]*unlockPublicIndexing\(draft\)/,
  "20J.2 : SEO appliqué uniquement dans le parcours public validé"
);

const headersSeoSource = fs.readFileSync(
  new URL("../_headers", import.meta.url),
  "utf8"
);

assert.match(
  headersSeoSource,
  /\/author\.html[\s\S]*X-Robots-Tag: noindex, nofollow, noarchive, nosnippet/,
  "20J.2 : verrou serveur author.html conservé pendant la préparation"
);

const robotsSeoSource = fs.readFileSync(
  new URL("../robots.txt", import.meta.url),
  "utf8"
);

assert.match(
  robotsSeoSource,
  /Disallow: \/author\.html/,
  "20J.2 : author.html reste bloqué dans robots.txt pendant la préparation"
);

console.log("V1 enrichie auteur + back-office : contrôles fonctionnels et de sécurité validés.");


// 20J.1 — Espace Auteur staging
{
  const authorConfigSource =
    fs.readFileSync(
      path.join(root, "config.js"),
      "utf8"
    );

  const authorAdminSource =
    fs.readFileSync(
      path.join(root, "admin-shell.js"),
      "utf8"
    );

  const authorAdminHtml =
    fs.readFileSync(
      path.join(root, "admin-v11.html"),
      "utf8"
    );

  assert.match(
    authorConfigSource,
    /authorPublicPublishingEnabled:\s*true/,
    "20J.1 : publication auteur publique activée après protection serveur V2"
  );

  assert.match(
    authorPageSource,
    /authorPublicPublishingEnabled !== true/,
    "20J.1 : author.js respecte le verrou public"
  );

  assert.match(
    authorAdminSource,
    /PUBLICATION PUBLIQUE[\s\S]*Confirmer la publication/,
    "20J.1 : Admin exige une confirmation explicite avant publication"
  );

  assert.match(
    authorAdminHtml,
    /id="v11-author-preview"/,
    "20J.1 : aperçu interne disponible"
  );

  assert.match(
    authorAdminSource,
    /const optionalChecks/,
    "20J.1 : enrichissements facultatifs séparés des critères obligatoires"
  );
}


// 20K.1 — consolidation automatique auteurs
{
  const v11AdminSource =
    fs.readFileSync(
      path.join(root, "admin-shell.js"),
      "utf8"
    );

  const v11AdminHtml =
    fs.readFileSync(
      path.join(root, "admin-v11.html"),
      "utf8"
    );

  const v11ContextSource =
    fs.readFileSync(
      path.join(root, "admin-context.js"),
      "utf8"
    );

  assert.match(
    v11AdminHtml,
    /id="v11-author-consolidation"/,
    "20K.1 : bloc de consolidation présent"
  );

  assert.match(
    v11AdminHtml,
    /Appliquer la consolidation/,
    "20K.1 : application explicite après analyse"
  );

  assert.match(
    v11AdminSource,
    /function buildV11AuthorConsolidationPlan/,
    "20K.1 : moteur de planification présent"
  );

  assert.match(
    v11AdminSource,
    /presence_verified === true/,
    "20K.1 : présence vérifiée reconnue comme preuve forte"
  );

  assert.match(
    v11AdminSource,
    /rows\.length >= 2/,
    "20K.1 : plusieurs présences reconnues comme preuve forte"
  );

  assert.match(
    v11AdminSource,
    /hasEditorialEvidence/,
    "20K.1 : photo + vitrine restent identifiées comme preuve éditoriale"
  );

  assert.match(
    v11AdminSource,
    /hasVerifiedPresence \|\|[\s\S]*hasMultiplePresences/,
    "20K.1 : création automatique réservée aux identités suffisamment corroborées"
  );

  assert.match(
    v11AdminSource,
    /photo \+ vitrine à contrôler/,
    "20K.1 : une présence unique avec photo + vitrine reste à contrôler"
  );

  assert.match(
    v11AdminSource,
    /validated: false/,
    "20K.1 : nouvelle fiche créée non validée"
  );

  assert.match(
    v11AdminSource,
    /published: false/,
    "20K.1 : aucune publication automatique"
  );

  assert.match(
    v11AdminSource,
    /plusieurs fiches possibles/,
    "20K.1 : ambiguïtés isolées"
  );

  assert.match(
    v11AdminSource,
    /types de profil contradictoires/,
    "20K.1 : profils contradictoires isolés"
  );

  assert.match(
    v11AdminSource,
    /\.in\("id", ids\)/,
    "20K.1 : seules les présences planifiées sont reliées"
  );

  assert.match(
    v11ContextSource,
    /\.limit\(500\)/,
    "20K.1 : le cockpit charge suffisamment de fiches auteurs"
  );
}


// 20K.2 — aperçu détaillé consolidation
{
  const source =
    fs.readFileSync(
      path.join(root, "admin-shell.js"),
      "utf8"
    );

  const html =
    fs.readFileSync(
      path.join(root, "admin-v11.html"),
      "utf8"
    );

  assert.match(
    html,
    /id="v11-author-consolidation-plan"/,
    "20K.2 : aperçu détaillé du plan présent"
  );

  assert.match(
    source,
    /Plan proposé/,
    "20K.2 : titre du plan visible"
  );

  assert.ok(
    source.includes(
      "action.authorPayload"
    ),
    "20K.2 : les créations affichent leur identité"
  );

  assert.ok(
    source.includes(
      "Array.isArray(action.rows)"
    ),
    "20K.2 : nombre de présences visible"
  );

  assert.ok(
    source.includes(
      "Relier + enrichir"
    ),
    "20K.2 : type d'action explicite"
  );
}


// 20L.1 — assistant enrichissement auteur
{
  const source =
    fs.readFileSync(
      path.join(root, "admin-shell.js"),
      "utf8"
    );

  const html =
    fs.readFileSync(
      path.join(root, "admin-v11.html"),
      "utf8"
    );

  assert.match(
    html,
    /id="v11-author-enrichment"/,
    "20L.1 : assistant enrichissement présent"
  );

  assert.match(
    source,
    /function buildV11AuthorEnrichmentGuide/,
    "20L.1 : moteur de synthèse présent"
  );

  assert.ok(
    source.includes(
      "row.author_profile_url"
    ),
    "20L.1 : liens profil issus des présences"
  );

  assert.ok(
    source.includes(
      "row.book_or_publisher_url"
    ),
    "20L.1 : liens livre issus des présences"
  );

  assert.ok(
    source.includes(
      "author?.location"
    ),
    "20L.1 : localisation lue uniquement depuis la fiche auteur"
  );

  assert.doesNotMatch(
    source.slice(
      source.indexOf(
        "function buildV11AuthorEnrichmentGuide"
      ),
      source.indexOf(
        "function appendV11AuthorSourceLink"
      )
    ),
    /events\\?\\.(city|region)|events\\.(city|region)/,
    "20L.1 : aucun lieu d’événement utilisé comme localisation auteur"
  );

  assert.ok(
    source.includes(
      "openV11AuthorEditor(author)"
    ),
    "20L.1 : l’assistant ouvre l’éditeur existant"
  );

  assert.match(
    html,
    /Aucune information n’est inventée ou enregistrée automatiquement/,
    "20L.1 : absence d’automatisation éditoriale explicitée"
  );
}


// 20M.1 — readiness éditorial auteur
{
  const source =
    fs.readFileSync(
      path.join(root, "admin-shell.js"),
      "utf8"
    );

  const html =
    fs.readFileSync(
      path.join(root, "admin-v11.html"),
      "utf8"
    );

  assert.ok(
    html.includes(
      'id="v11-author-editorial-filter"'
    ),
    "20M.1 : filtre éditorial présent"
  );

  assert.ok(
    source.includes(
      "function getV11AuthorEditorialReadiness"
    ),
    "20M.1 : calcul de complétude présent"
  );

  assert.ok(
    source.includes(
      "field.required === true"
    ),
    "20M.1 : score fondé uniquement sur les critères obligatoires"
  );

  assert.ok(
    source.includes(
      "readiness.score + \"%\""
    ),
    "20M.1 : score affiché"
  );

  assert.ok(
    source.includes(
      "Prochaine priorité : "
    ),
    "20M.1 : prochaine priorité éditoriale affichée"
  );

  assert.ok(
    source.includes(
      "matchesV11AuthorEditorialFilter"
    ),
    "20M.1 : filtre appliqué aux fiches"
  );

  assert.ok(
    source.includes(
      'state = "published"'
    ),
    "20M.1 : état publié distingué"
  );

  assert.ok(
    source.includes(
      'score >= 80'
    ),
    "20M.1 : seuil presque prêt présent"
  );
}


// 20N.1 — file éditoriale auteur
{
  const source =
    fs.readFileSync(
      path.join(root, "admin-shell.js"),
      "utf8"
    );

  const html =
    fs.readFileSync(
      path.join(root, "admin-v11.html"),
      "utf8"
    );

  assert.ok(
    html.includes(
      'id="v11-author-editorial-sort"'
    ),
    "20N.1 : tri éditorial présent"
  );

  assert.ok(
    html.includes(
      'id="v11-author-editorial-count"'
    ),
    "20N.1 : compteur de file présent"
  );

  assert.ok(
    source.includes(
      "function sortV11AuthorsEditorially"
    ),
    "20N.1 : tri de file présent"
  );

  assert.ok(
    source.includes(
      "bReady.score -"
    ),
    "20N.1 : score décroissant utilisé pour la priorité"
  );

  assert.ok(
    source.includes(
      "function openV11AuthorPriorityEditor"
    ),
    "20N.1 : action rapide vers éditeur présente"
  );

  assert.ok(
    source.includes(
      '"v11-author-edit-bio"'
    ),
    "20N.1 : priorité biographie ciblable"
  );

  const presenceStart =
    source.indexOf(
      "function renderPresences"
    );

  const presenceEnd =
    source.indexOf(
      "function getV11AuthorEditorialReadiness",
      presenceStart
    );

  const presenceSource =
    source.slice(
      presenceStart,
      presenceEnd
    );

  assert.ok(
    !presenceSource.includes(
      "body.appendChild(readinessLine)"
    ),
    "20N.1 : aucune readiness auteur injectée dans les présences"
  );

  const authorStart =
    source.indexOf(
      "function renderAuthors"
    );

  const authorEnd =
    source.indexOf(
      "\n  function ",
      authorStart + 10
    );

  const authorSource =
    source.slice(
      authorStart,
      authorEnd
    );

  assert.ok(
    authorSource.includes(
      "body.appendChild(readinessLine)"
    ),
    "20N.1 : readiness affichée dans les cartes auteurs"
  );
}


// 21A.1 — accueil opérationnel V11.58
{
  const source =
    fs.readFileSync(
      "admin-shell.js",
      "utf8"
    );

  const html =
    fs.readFileSync(
      "admin-v11.html",
      "utf8"
    );

  assert.ok(
    html.includes(
      'id="v11-current-date"'
    ),
    "21A.1 : date dynamique présente"
  );

  assert.ok(
    html.includes(
      'id="v11-home-priority-title"'
    ),
    "21A.1 : titre priorité dynamique présent"
  );

  assert.ok(
    html.includes(
      'data-admin-bind="presence-pending"'
    ),
    "21A.1 : KPI présence réel"
  );

  assert.ok(
    html.includes(
      'data-admin-bind="authors-editorial-pending"'
    ),
    "21A.1 : KPI auteur réel"
  );

  assert.ok(
    !html.includes(
      "Claire Martin"
    ),
    "21A.1 : fausse présence supprimée"
  );

  assert.ok(
    !html.includes(
      "Éditions du Rivage"
    ),
    "21A.1 : fausse maison d’édition supprimée"
  );

  assert.ok(
    source.includes(
      "function getV11HomePriorities"
    ),
    "21A.1 : moteur priorités présent"
  );

  assert.ok(
    source.includes(
      "function openV11HomePriority"
    ),
    "21A.1 : navigation priorités présente"
  );

  assert.ok(
    source.includes(
      '"registration-missing-link"'
    ),
    "21A.1 : anomalie inscription exploitée"
  );

  assert.ok(
    source.includes(
      '"authors-almost"'
    ),
    "21A.1 : auteurs presque prêts exploités"
  );

  assert.ok(
    source.includes(
      "renderPriority(\n      state\n    )"
    ),
    "21A.1 : accueil alimenté par état complet"
  );
}


// V11.59 — author preview fidelity
{
  const authorJs = fs.readFileSync("author.js", "utf8");

  assert.ok(
    authorJs.includes(
      "l’aperçu interne doit refléter la future page publique"
    ),
    "V11.59 : l’aperçu Admin doit expliciter sa fidélité à la future page publique."
  );

  assert.ok(
    authorJs.includes(
      "renderAuthorTravelMap(["
    ),
    "V11.59 : la carte du parcours doit être disponible dans l’aperçu."
  );

  const travelCalls =
    authorJs.match(/renderAuthorTravelMap\(\[/g) || [];

  assert.ok(
    travelCalls.length >= 2,
    "V11.59 : la carte doit être appelée en aperçu Admin et en mode public."
  );

  assert.ok(
    authorJs.includes(
      "un lieu d’événement n’est pas une localisation auteur"
    ),
    "V11.59 : la localisation auteur ne doit pas être déduite d’un événement."
  );

  assert.ok(
    !authorJs.includes(
      "location: row?.events?.region || row?.events?.city || null"
    ),
    "V11.59 : l’ancien fallback géographique doit avoir disparu."
  );

  assert.ok(
    authorJs.includes("location: null,"),
    "V11.59 : le fallback auteur doit conserver une localisation vide."
  );

  assert.ok(
    authorJs.includes(
      "config.authorPublicPublishingEnabled !== true"
    ),
    "V11.59 : le verrou de publication publique doit rester actif."
  );
}

// V11.59 — compteurs parcours regroupés
{
  const authorJs = fs.readFileSync("author.js", "utf8");

  assert.ok(
    authorJs.includes('class="author-travel-stat"'),
    "V11.59 : chaque compteur du parcours doit être regroupé avec son libellé."
  );
}


// V11.60 — author public release gate
{
  const adminHtml =
    fs.readFileSync(
      "admin-v11.html",
      "utf8"
    );

  const adminShell =
    fs.readFileSync(
      "admin-shell.js",
      "utf8"
    );

  const config =
    fs.readFileSync(
      "config.js",
      "utf8"
    );

  const authorJs =
    fs.readFileSync(
      "author.js",
      "utf8"
    );

  assert.ok(
    adminHtml.includes(
      'id="v11-author-release-gate"'
    ),
    "V11.60 : le sas d’ouverture Auteur doit être présent."
  );

  assert.ok(
    adminHtml.includes(
      'id="v11-author-release-eligible"'
    ),
    "V11.60 : le nombre de fiches éligibles doit être visible."
  );

  assert.ok(
    adminShell.includes(
      "function renderV11AuthorReleaseGate(items)"
    ),
    "V11.60 : le calcul du sas Auteur doit exister."
  );

  assert.ok(
    adminShell.includes(
      "readiness.score === 100"
    ),
    "V11.60 : une fiche éligible doit être éditorialement complète."
  );

  assert.ok(
    adminShell.includes(
      "author.validated === true"
    ),
    "V11.60 : une fiche éligible doit être validée."
  );

  assert.ok(
    adminShell.includes(
      "author.publication_ready === true"
    ),
    "V11.60 : une fiche éligible doit être prête en base."
  );

  assert.ok(
    adminShell.includes(
      "author.published !== true"
    ),
    "V11.60 : le sas doit distinguer les fiches déjà publiées."
  );

  assert.ok(
    config.includes(
      "authorPublicPublishingEnabled: true"
    ),
    "V11.60 : l’ouverture publique contrôlée V2 doit être activée."
  );

  assert.ok(
    authorJs.includes(
      "config.authorPublicPublishingEnabled !== true"
    ),
    "V11.60 : author.js doit continuer à bloquer l’accès public."
  );
}


// V11.61 — author magazine hero
{
  const authorHtml =
    fs.readFileSync(
      "author.html",
      "utf8"
    );

  const styleCss =
    fs.readFileSync(
      "style.css",
      "utf8"
    );

  assert.ok(
    authorHtml.includes(
      "style.css?v=author-magazine-2"
    ),
    "V11.61 : la fiche auteur doit charger la nouvelle version CSS."
  );

  assert.ok(
    styleCss.includes(
      "V11.61 — DESKTOP PORTRAIT ÉDITORIAL FINAL"
    ),
    "V11.61 : les styles magazine doivent être présents."
  );

  assert.ok(
    styleCss.includes(
      ".author-page .author-visual::after"
    ),
    "V11.61 : la transition photo/papier doit exister."
  );

  assert.ok(
    styleCss.includes(
      ".author-page .author-profile-content"
    ),
    "V11.61 : le panneau éditorial doit être stylé."
  );

  assert.ok(
    styleCss.includes(
      "@media (min-width: 760px)"
    ),
    "V11.61 : le rendu desktop doit rester limité aux écrans adaptés."
  );

  assert.ok(
    styleCss.includes(
      "@media (max-width: 900px)"
    ),
    "V11.61 : un repli tablette/mobile doit exister."
  );
}

// V11.62 — author public launch dry-run
{
  const adminHtml =
    fs.readFileSync(
      "admin-v11.html",
      "utf8"
    );

  const adminShell =
    fs.readFileSync(
      "admin-shell.js",
      "utf8"
    );

  const authorJs =
    fs.readFileSync(
      "author.js",
      "utf8"
    );

  const config =
    fs.readFileSync(
      "config.js",
      "utf8"
    );

  assert.ok(
    adminHtml.includes(
      'id="v11-author-release-dryrun"'
    ),
    "V11.62 : la simulation d’ouverture Auteur doit être visible."
  );

  assert.ok(
    adminHtml.includes(
      'id="v11-author-release-dryrun-list"'
    ),
    "V11.62 : la liste des fiches exposées doit exister."
  );

  assert.ok(
    adminShell.includes(
      "const wouldBePublic"
    ),
    "V11.62 : le calcul des fiches réellement exposées doit exister."
  );

  assert.ok(
    adminShell.includes(
      "author.published === true"
    ) &&
    adminShell.includes(
      "author.validated === true"
    ) &&
    adminShell.includes(
      "author.publication_ready === true"
    ),
    "V11.62 : le dry-run doit reprendre les trois garde-fous publics."
  );

  assert.ok(
    authorPublicationSource.includes(
      '.eq("publication_ready", true)'
    ),
    "V11.62 : le contrôleur de publication doit exiger publication_ready."
  );

  assert.ok(
    config.includes(
      "authorPublicPublishingEnabled: true"
    ),
    "V11.62 : le verrou global doit refléter l’ouverture contrôlée V2."
  );

  assert.ok(
    !adminHtml.includes(
      "Activer l’ouverture publique"
    ),
    "V11.62 : aucun bouton d’ouverture publique ne doit être ajouté."
  );
}

// V11.63 — Auto-Matte V11 presentation
{
  const adminHtml =
    fs.readFileSync(
      "admin-v11.html",
      "utf8"
    );

  const adminCss =
    fs.readFileSync(
      "admin-v11.css",
      "utf8"
    );

  const adminWatch =
    fs.readFileSync(
      "admin-watch.js",
      "utf8"
    );

  const config =
    fs.readFileSync(
      "config.js",
      "utf8"
    );

  assert.ok(
    adminHtml.includes(
      'id="tab-watch"'
    ),
    "V11.63 : le slot Auto-Matte doit rester présent."
  );

  assert.ok(
    adminHtml.includes(
      'src="admin-watch.js?v=v11-watch-frozen"'
    ),
    "V11.63 : le moteur de veille gelé doit rester chargé."
  );

  assert.ok(
    adminCss.includes(
      "V11.63 — AUTO-MATTE DANS LE DESIGN V11"
    ),
    "V11.63 : l’habillage Auto-Matte V11 doit exister."
  );

  assert.ok(
    adminCss.includes(
      "#tab-watch .watch-shell"
    ),
    "V11.63 : les styles doivent rester strictement scopés au module Veille."
  );

  assert.ok(
    adminWatch.includes(
      'const DEFAULT_WATCH_ENDPOINT = "https://dedicalivres-veille.dedicalivres.workers.dev/analyze"'
    ),
    "V11.63 : le Worker historique doit rester inchangé."
  );

  assert.ok(
    adminWatch.includes(
      'const DEFAULT_EVENT_WATCH_ENDPOINT = "http://127.0.0.1:5065/api/event-watch"'
    ),
    "V11.63 : Event Watch local doit rester inchangé."
  );

  assert.ok(
    config.includes(
      'localStorage.getItem("automatte_endpoint")'
    ),
    "V11.63 : le routage local Auto-Matte doit rester disponible."
  );
}

// V11.64 — Auto-Matte truthful status
{
  const adminHtml =
    fs.readFileSync(
      "admin-v11.html",
      "utf8"
    );

  assert.ok(
    !adminHtml.includes(
      "Dernière veille · 08:42"
    ),
    "V11.64 : l’heure fictive Auto-Matte doit disparaître."
  );

  assert.ok(
    !adminHtml.includes(
      "49 nouveaux candidats · 12 à vérifier"
    ),
    "V11.64 : les faux volumes Auto-Matte doivent disparaître."
  );

  assert.ok(
    adminHtml.includes(
      "État à vérifier dans Outils · Auto-Matte"
    ),
    "V11.64 : l’accueil doit annoncer un état non vérifié."
  );

  assert.ok(
    adminHtml.includes(
      "Aucune donnée de veille simulée"
    ),
    "V11.64 : la télémétrie ne doit plus simuler de veille."
  );

  assert.ok(
    adminHtml.includes(
      "Worker testé depuis le module de veille"
    ),
    "V11.64 : la carte Outils doit expliquer la source du contrôle."
  );
}


// V11.65 — Exports V11 integration
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  const adminCss =
    fs.readFileSync("admin-v11.css", "utf8");

  const exportsJs =
    fs.readFileSync("admin-v11-exports.js", "utf8");

  assert.ok(
    adminHtml.includes('id="tab-exports"'),
    "V11.65 : le slot Exports doit rester présent."
  );

  assert.ok(
    adminHtml.includes(
      'src="admin-v11-exports.js?v=v11-exports-39-3"'
    ),
    "V11.65 : le module Exports V11 doit rester chargé."
  );

  assert.ok(
    adminHtml.includes(
      "Lecture V11 validée"
    ),
    "V11.65 : la carte Exports doit refléter la validation."
  );

  assert.ok(
    adminCss.includes(
      ".v11-tool-placeholder[hidden]"
    ),
    "V11.65 : le placeholder caché doit réellement disparaître."
  );

  assert.ok(
    adminCss.includes(
      ".v11-legacy-slot[hidden]"
    ),
    "V11.65 : les slots inactifs doivent rester masqués."
  );

  assert.ok(
    exportsJs.includes(
      '"https://dedicalivres-daily-export.dedicalivres.workers.dev/exports"'
    ),
    "V11.65 : le endpoint Exports doit rester inchangé."
  );

  assert.ok(
    exportsJs.includes(
      'workerBase + "/admin-regenerate"'
    ),
    "V11.65 : la régénération authentifiée doit rester intacte."
  );
}


// V11.66 — Social V11 integration
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  const adminCss =
    fs.readFileSync("admin-v11.css", "utf8");

  const socialJs =
    fs.readFileSync("admin-social-generator.js", "utf8");

  assert.ok(
    adminHtml.includes('id="tab-social"'),
    "V11.66 : le slot Social doit rester présent."
  );

  assert.ok(
    adminHtml.includes(
      "admin-social-generator.js?v=v11-social-66-1"
    ),
    "V11.66 : le cache-buster Social doit être actualisé."
  );

  assert.ok(
    socialJs.includes(
      '.querySelectorAll(\'input[name="visual-format"]\')'
    ),
    "V11.66 : les changements de formats doivent actualiser le statut."
  );

  assert.ok(
    socialJs.includes(
      "updateVisualStatus();"
    ),
    "V11.66 : le statut visuel doit être recalculé."
  );

  assert.ok(
    adminCss.includes(
      "V11.66 — SOCIAL DANS LE DESIGN V11"
    ),
    "V11.66 : les styles Social V11 doivent exister."
  );

  assert.ok(
    adminCss.includes(
      "#tab-social .social-visual-preview-canvas canvas"
    ),
    "V11.66 : le canvas preview doit être contraint dans V11."
  );

  assert.ok(
    socialJs.includes(
      'const VERSION = "7.9.2-local-event-pack-unified-visuals"'
    ),
    "V11.66 : la version du moteur graphique doit rester inchangée."
  );

  assert.ok(
    socialJs.includes(
      "renderVisualByFormat(visualEvent, format)"
    ),
    "V11.66 : le moteur de rendu PNG doit rester présent."
  );
}


// V11.67 — Maintenance truthful status
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  const adminShell =
    fs.readFileSync("admin-shell.js", "utf8");

  const adminCss =
    fs.readFileSync("admin-v11.css", "utf8");

  assert.ok(
    adminHtml.includes(
      'id="v11-maintenance-panel"'
    ),
    "V11.67 : le panneau Maintenance doit exister."
  );

  assert.ok(
    adminHtml.includes(
      "Non instrumentées dans Admin V11"
    ),
    "V11.67 : les sauvegardes ne doivent pas être déclarées OK sans preuve."
  );

  assert.ok(
    adminHtml.includes(
      "Aucun test réseau supplémentaire"
    ),
    "V11.67 : la portée lecture seule doit être explicite."
  );

  assert.ok(
    adminShell.includes(
      "function renderMaintenanceStatus()"
    ),
    "V11.67 : le diagnostic runtime doit exister."
  );

  assert.ok(
    adminShell.includes(
      "window.DEDICALIVRES_ADMIN_AUTHENTICATED === true"
    ),
    "V11.67 : l’état d’authentification doit provenir du runtime."
  );

  assert.ok(
    adminShell.includes(
      "window.V11_WATCH_WRITE_GUARD"
    ),
    "V11.67 : la garde Auto-Matte doit être contrôlée."
  );

  assert.ok(
    adminShell.includes(
      'script[src*="admin-v11-exports.js"]'
    ),
    "V11.67 : le module Exports doit être vérifié par présence réelle."
  );

  assert.ok(
    adminShell.includes(
      "DEDICALIVRES_SOCIAL_GENERATOR_VERSION"
    ),
    "V11.67 : la version Social doit être lue depuis le runtime."
  );

  assert.ok(
    adminCss.includes(
      "V11.67 — MAINTENANCE / ETATS REELS"
    ),
    "V11.67 : les styles Maintenance doivent être présents."
  );

  assert.ok(
    !adminHtml.includes(
      "Sauvegardes opérationnelles"
    ),
    "V11.67 : aucun faux statut sauvegarde ne doit apparaître."
  );
}


// V11.68 — Partner widget integration
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  const adminShell =
    fs.readFileSync("admin-shell.js", "utf8");

  const partnerWidget =
    fs.readFileSync(
      "admin-v11-partner-widget.js",
      "utf8"
    );

  const publicWidget =
    fs.readFileSync(
      "widget.js",
      "utf8"
    );

  const adminCss =
    fs.readFileSync("admin-v11.css", "utf8");

  assert.ok(
    adminHtml.includes(
      'id="v11-partner-widget-panel"'
    ),
    "V11.68 : le slot Widget partenaires doit exister."
  );

  assert.ok(
    adminShell.includes(
      'partners: "v11-partner-widget-panel"'
    ),
    "V11.68 : le shell doit router le Widget partenaires."
  );

  assert.ok(
    adminShell.includes(
      "DEDICALIVRES_V11_PARTNER_WIDGET.open()"
    ),
    "V11.68 : le configurateur doit être initialisé à l’ouverture."
  );

  assert.ok(
    partnerWidget.includes(
      'const ENGINE_SRC = "widget.js?v=widget-4"'
    ),
    "V11.68 : l’adaptateur doit charger le moteur public existant."
  );

  assert.ok(
    partnerWidget.includes(
      "window.DedicalivresWidget.render"
    ),
    "V11.68 : le preview doit utiliser l’API publique réelle."
  );

  assert.ok(
    partnerWidget.includes(
      "https://dedicalivres.fr/widget.js"
    ),
    "V11.68 : le snippet partenaire doit pointer vers le widget public."
  );

  assert.ok(
    partnerWidget.includes(
      "https://dedicalivres.fr/agenda.html"
    ),
    "V11.68 : le lien direct doit utiliser agenda.html."
  );

  assert.ok(
    !partnerWidget.includes(
      ".insert("
    ) &&
    !partnerWidget.includes(
      ".update("
    ) &&
    !partnerWidget.includes(
      ".upsert("
    ) &&
    !partnerWidget.includes(
      ".delete("
    ),
    "V11.68 : l’adaptateur Widget ne doit pas écrire dans Supabase."
  );

  assert.ok(
    publicWidget.includes(
      "window.DedicalivresWidget = { render: render, refresh: init }"
    ),
    "V11.68 : l’API publique Widget doit rester disponible."
  );

  assert.ok(
    adminCss.includes(
      "V11.68 — WIDGET PARTENAIRES"
    ),
    "V11.68 : les styles V11 Widget doivent exister."
  );
}


// V11.69 — Global truthful polish
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  const adminShell =
    fs.readFileSync("admin-shell.js", "utf8");

  assert.ok(
    !adminHtml.includes(
      "284 visites aujourd’hui"
    ),
    "V11.69 : aucune visite statique ne doit rester sur l’accueil."
  );

  assert.ok(
    !adminHtml.includes(
      "Courbe factice de fréquentation"
    ),
    "V11.69 : la courbe factice doit être retirée."
  );

  assert.ok(
    !adminHtml.includes(
      "+14,2 %"
    ) &&
    !adminHtml.includes(
      "Pic · 341 visites"
    ),
    "V11.69 : les tendances factices doivent être retirées."
  );

  assert.ok(
    !adminHtml.includes(
      "<strong>62 %</strong>"
    ) &&
    !adminHtml.includes(
      "<strong>18 %</strong>"
    ) &&
    !adminHtml.includes(
      "<strong>12 %</strong>"
    ) &&
    !adminHtml.includes(
      "<strong>8 %</strong>"
    ),
    "V11.69 : les répartitions acquisition statiques doivent disparaître."
  );

  assert.ok(
    !adminHtml.includes(
      "<strong>82 %</strong>"
    ) &&
    !adminHtml.includes(
      "<strong>48 %</strong>"
    ) &&
    !adminHtml.includes(
      "<strong>34 %</strong>"
    ),
    "V11.69 : les pourcentages territoriaux fictifs doivent disparaître."
  );

  assert.ok(
    adminHtml.includes(
      'data-admin-bind="quality-missing-image"'
    ) &&
    adminHtml.includes(
      'data-admin-bind="quality-missing-coords"'
    ) &&
    adminHtml.includes(
      'data-admin-bind="quality-missing-website"'
    ),
    "V11.69 : Pilotage doit réutiliser les compteurs qualité réels."
  );

  assert.ok(
    adminHtml.includes(
      "Non testé depuis ce panneau"
    ),
    "V11.69 : le site public ne doit plus être déclaré opérationnel sans test."
  );

  assert.ok(
    !adminHtml.includes(
      "comparaison avec V10"
    ),
    "V11.69 : le placeholder V10 doit être retiré."
  );

  assert.ok(
    !adminShell.includes(
      "comportement V10"
    ),
    "V11.69 : les descriptions héritées V10 doivent être retirées."
  );

  assert.ok(
    adminHtml.includes(
      'admin-shell.js?v=v11-74-author-merge'
    ),
    "V11.74 : le shell doit avoir le cache-buster de la fusion auteur contrôlée."
  );
}


// V11.69 — Final labels
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  assert.ok(
    !adminHtml.includes(
      "Visiteurs estimés"
    ),
    "V11.69 : visits-7d ne doit pas être présenté comme visiteurs uniques."
  );

  assert.ok(
    adminHtml.includes(
      "Visites · 7 jours"
    ) &&
    adminHtml.includes(
      "pages vues enregistrées"
    ),
    "V11.69 : le KPI 7 jours doit décrire la métrique réellement disponible."
  );
}


// V11.70 — Final stabilization
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  assert.ok(
    !adminHtml.includes(
      "Système opérationnel"
    ),
    "V11.70 : le footer ne doit pas déclarer tout le système opérationnel sans diagnostic."
  );

  assert.ok(
    adminHtml.includes(
      "État détaillé dans Maintenance"
    ),
    "V11.70 : le footer doit orienter vers le diagnostic réel."
  );

  assert.ok(
    adminHtml.includes(
      "<title>Dédicalivres — Admin V11</title>"
    ),
    "V11.70 : le titre ne doit plus présenter V11 comme une Preview."
  );

  assert.ok(
    adminHtml.includes(
      "admin-v11.css?v=v11-70-stable-2"
    ),
    "V11.70 : le cache-buster CSS final doit être présent."
  );
}


// V11.70 — Neutral system dot
{
  const adminHtml =
    fs.readFileSync("admin-v11.html", "utf8");

  const adminCss =
    fs.readFileSync("admin-v11.css", "utf8");

  assert.ok(
    adminCss.includes(
      ".v11-system-dot.is-neutral"
    ),
    "V11.70 : le statut neutre doit avoir un style dédié."
  );

  assert.ok(
    adminCss.includes(
      "box-shadow: none"
    ),
    "V11.70 : le statut neutre ne doit pas avoir de halo vert."
  );

  assert.ok(
    adminHtml.includes(
      'title="Admin V11 — État détaillé dans Maintenance"'
    ),
    "V11.70 : la sidebar compacte doit expliquer son statut."
  );

  assert.ok(
    adminHtml.includes(
      "admin-v11.css?v=v11-70-stable-2"
    ),
    "V11.70 : le cache CSS doit être renouvelé."
  );
}
