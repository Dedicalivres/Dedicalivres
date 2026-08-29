import fs from "node:fs";
import vm from "node:vm";

const source = fs
  .readFileSync("dedicalivres-veille-worker.js", "utf8")
  .replace(/export default\s*{[\s\S]*?\n};\n\nasync function analyzeRemoteUrl/, "const worker = {};\n\nasync function analyzeRemoteUrl");

const sandbox = {
  console,
  URL,
  AbortController,
  Response,
  Request,
  Headers,
  fetch: async () => {
    throw new Error("fetch interdit dans ce test");
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL — ${message}`);
  }
}

const genericHtml = `
<html>
<head>
  <title>Actualités - Editions Amalthee</title>
  <meta property="og:title" content="Actualités - Editions Amalthee">
  <meta property="og:description" content="Lorem ipsum dolor sit amet">
</head>
<body>
  <h1>Actualités</h1>
  <p>Interviews et dédicaces de nos auteurs.</p>
  <p>31 juillet 2026</p>
  <p>À Paris</p>
</body>
</html>
`;

const realEventHtml = `
<html>
<head>
  <title>Rencontre dédicace avec Jeanne Martin</title>
  <meta property="og:title" content="Rencontre dédicace avec Jeanne Martin">
  <meta property="og:description" content="Rencontre avec Jeanne Martin autour de son nouveau roman.">
</head>
<body>
  <h1>Rencontre dédicace avec Jeanne Martin</h1>
  <p>Le 12 septembre 2026 à Rennes</p>
  <p>Librairie du Centre</p>
</body>
</html>
`;

const generic = sandbox.extractCandidateFromHtml(genericHtml, {
  sourceUrl: "https://example.org/actualites/",
  filters: {}
});

const real = sandbox.extractCandidateFromHtml(realEventHtml, {
  sourceUrl: "https://example.org/evenements/rencontre-jeanne-martin",
  filters: {}
});

console.log("GENERIC", {
  status: generic.status,
  confidence: generic.confidence,
  title: generic.title,
  type: generic.type,
  startDate: generic.startDate,
  city: generic.city
});

console.log("REAL", {
  status: real.status,
  confidence: real.confidence,
  title: real.title,
  type: real.type,
  startDate: real.startDate,
  city: real.city
});

assert(
  generic.status === "Non événement",
  "une page générique doit être rejetée comme Non événement"
);

assert(
  generic.confidence <= 18,
  "une page générique rejetée doit avoir une confiance faible"
);

assert(
  !generic.description,
  "une description Lorem ipsum doit être rejetée"
);

assert(
  real.startDate === "2026-09-12",
  "la vraie date doit être détectée"
);

assert(
  real.type === "Dédicace" || real.type === "Rencontre",
  "le vrai type doit être détecté"
);

assert(
  real.city === "Rennes",
  "la ville Rennes doit être détectée sans conserver la préposition"
);

assert(
  real.status !== "Non événement",
  "une vraie page événement ne doit pas être rejetée"
);

console.log("TEST_REGRESSION_OK");


// ============================================================
// MATRICE DE NON-REGRESSION
// ============================================================

const genericAgendaHtml = `
<html>
<head>
  <title>Agenda - Librairie Exemple</title>
  <meta property="og:description"
        content="Retrouvez nos rencontres, signatures et dédicaces toute l'année.">
</head>
<body>
  <h1>Agenda</h1>
  <p>Prochaine mise à jour le 18 octobre 2026.</p>
  <p>Nos auteurs participent régulièrement à des rencontres.</p>
</body>
</html>
`;

const salonHtml = `
<html>
<head>
  <title>Salon du livre de Nantes 2026</title>
  <meta property="og:description"
        content="Le Salon du livre de Nantes revient les 17 et 18 octobre 2026.">
</head>
<body>
  <h1>Salon du livre de Nantes</h1>
  <p>Du 17 au 18 octobre 2026.</p>
  <p>Centre des congrès - Nantes - France</p>
</body>
</html>
`;

const festivalHtml = `
<html>
<head>
  <title>Festival littéraire Les Mots en fête</title>
  <meta property="og:description"
        content="Festival littéraire les 3 et 4 octobre 2026 à Rennes.">
</head>
<body>
  <h1>Festival littéraire Les Mots en fête</h1>
  <p>Du 3 au 4 octobre 2026 à Rennes.</p>
</body>
</html>
`;

const structuredEventHtml = `
<html>
<head>
  <title>Actualités de la médiathèque</title>
</head>
<body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Rencontre avec Marie Dupont",
  "startDate": "2026-11-14",
  "location": {
    "@type": "Place",
    "name": "Médiathèque centrale",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Lorient",
      "addressCountry": "France"
    }
  },
  "description": "Rencontre littéraire avec Marie Dupont."
}
</script>
</body>
</html>
`;

const genericAgenda = sandbox.extractCandidateFromHtml(genericAgendaHtml, {
  sourceUrl: "https://example.org/agenda/",
  filters: {}
});

const salon = sandbox.extractCandidateFromHtml(salonHtml, {
  sourceUrl: "https://example.org/salon-du-livre-nantes",
  filters: {}
});

const festival = sandbox.extractCandidateFromHtml(festivalHtml, {
  sourceUrl: "https://example.org/festival-litteraire",
  filters: {}
});

const structured = sandbox.extractCandidateFromHtml(structuredEventHtml, {
  sourceUrl: "https://example.org/actualites/",
  filters: {}
});

console.log("MATRIX", {
  genericAgenda: {
    status: genericAgenda.status,
    confidence: genericAgenda.confidence
  },
  salon: {
    status: salon.status,
    type: salon.type,
    startDate: salon.startDate
  },
  festival: {
    status: festival.status,
    type: festival.type,
    startDate: festival.startDate
  },
  structured: {
    status: structured.status,
    title: structured.title,
    startDate: structured.startDate,
    city: structured.city
  }
});

assert(
  genericAgenda.status === "Non événement",
  "une page Agenda générique doit être rejetée"
);

assert(
  salon.status !== "Non événement" &&
  salon.type === "Salon" &&
  salon.startDate === "2026-10-17",
  "un vrai salon HTML doit être conservé"
);

assert(
  festival.status !== "Non événement" &&
  festival.type === "Festival" &&
  festival.startDate === "2026-10-03",
  "un vrai festival HTML doit être conservé"
);

assert(
  structured.status !== "Non événement" &&
  structured.title === "Rencontre avec Marie Dupont" &&
  structured.startDate === "2026-11-14" &&
  structured.city === "Lorient",
  "un Event JSON-LD doit rester prioritaire"
);

console.log("TEST_MATRIX_OK");

const postalLocationHtml = `
<html>
<head>
  <title>Salon du Livre de test</title>
  <meta property="og:description"
        content="Salon du livre les 28 et 29 août 2026.">
</head>
<body>
  <h1>Salon du Livre de test</h1>
  <p>Complexe polyvalent</p>
  <p><strong>17580 Le Bois-Plage-en-Ré</strong></p>
  <p>Du 28 au 29 août 2026</p>
</body>
</html>
`;

const postalLocation = sandbox.extractCandidateFromHtml(postalLocationHtml, {
  sourceUrl: "https://example.org/event-salon-test",
  filters: {}
});

assert(
  postalLocation.city === "Le Bois-Plage-en-Ré",
  "le code postal doit être prioritaire sur le nom du lieu"
);

console.log("TEST_CITY_POSTAL_OK");

// ============================================================
// DATE ÉVÉNEMENT VS DATE ÉDITORIALE
// ============================================================

const lirolacHtml = `
<html>
<head>
  <title>Mairie de Talloires - Montmin - LirÔlac les 26 &amp; 27 septembre</title>
  <meta property='og:title' content='LirÔlac les 26 &amp; 27 septembre'>
  <meta property='og:description' content='La liste des auteurs 2026'>
</head>
<body>
  <h2>LirÔlac les 26 &amp; 27 septembre</h2>
  <span class='news_date'>24 Août 2026</span>
  <p><strong>Rendez-vous samedi 26 et dimanche 27 septembre dans la baie de Talloires.</strong></p>
  <p>Festival du livre à 74290 Talloires-Montmin.</p>
</body>
</html>
`;

const publicationBeforeEventHtml = `
<html>
<head>
  <title>Rencontre littéraire avec Alice Martin le 18 octobre 2026</title>
  <meta property="article:published_time" content="2026-09-05T09:00:00+02:00">
  <meta property="og:title" content="Rencontre littéraire avec Alice Martin le 18 octobre 2026">
</head>
<body>
  <time class="entry-date published" datetime="2026-09-05">Publié le 5 septembre 2026</time>
  <h1>Rencontre littéraire avec Alice Martin</h1>
  <p>La rencontre aura lieu le 18 octobre 2026 à Lyon.</p>
</body>
</html>
`;

const publicationOnlyHtml = `
<html>
<head>
  <title>Actualités de la médiathèque</title>
  <meta property="article:published_time" content="2026-08-24T09:00:00+02:00">
</head>
<body>
  <h1>Actualités</h1>
  <span class="news_date">24 août 2026</span>
  <p>Retrouvez les dernières informations de la médiathèque.</p>
</body>
</html>
`;

const navigationNoiseHtml = `
<html>
<head>
  <title>Actualités de la médiathèque</title>
  <meta property="og:title" content="Actualités de la médiathèque">
  <meta property="og:description" content="Informations pratiques et nouveautés">
</head>
<body>
  <nav>Agenda · Festival du livre · Rencontres · Dédicaces</nav>
  <main>
    <h1>Actualités de la médiathèque</h1>
    <p>Article publié le 20 novembre 2026.</p>
    <p>Consultez les nouveaux horaires et services disponibles.</p>
  </main>
  <footer>Retrouvez aussi notre festival du livre annuel.</footer>
</body>
</html>
`;

const lirolac = sandbox.extractCandidateFromHtml(lirolacHtml, {
  sourceUrl: "https://example.org/actualites/lirolac-les-26-et-27-septembre",
  filters: {}
});
const publicationBeforeEvent = sandbox.extractCandidateFromHtml(publicationBeforeEventHtml, {
  sourceUrl: "https://example.org/actualites/rencontre-alice-martin",
  filters: {}
});
const publicationOnly = sandbox.extractCandidateFromHtml(publicationOnlyHtml, {
  sourceUrl: "https://example.org/actualites/",
  filters: {}
});
const navigationNoise = sandbox.extractCandidateFromHtml(navigationNoiseHtml, {
  sourceUrl: "https://example.org/actualites/services-mediatheque",
  filters: {}
});

assert(
  lirolac.startDate === "2026-09-26" && lirolac.endDate === "2026-09-27",
  "la plage 26 & 27 septembre doit gagner sur la date éditoriale du 24 août"
);

assert(
  lirolac.status !== "Non événement",
  "le signal Festival du livre du corps LirÔlac doit être visible par l’event-likeness"
);

assert(
  publicationBeforeEvent.startDate === "2026-10-18",
  "une date événementielle explicite doit gagner sur une date de publication antérieure"
);

assert(
  publicationOnly.status === "Non événement" &&
  publicationOnly.startDate === "" &&
  publicationOnly.confidence <= 18,
  "une page générique avec une seule date de publication ne doit pas devenir un événement"
);

assert(
  navigationNoise.status === "Non événement",
  "un mot événementiel présent seulement dans la navigation ou le footer ne doit pas valider une page générique"
);

console.log("TEST_EVENT_DATE_PRECEDENCE_OK");
