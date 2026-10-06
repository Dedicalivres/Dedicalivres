import fs from "node:fs";

const snapshot = JSON.parse(
  fs.readFileSync(
    "docs/territoires/catalogue-public.json",
    "utf8"
  )
);

const canonicalMap = JSON.parse(
  fs.readFileSync(
    "docs/territoires/event-canonical-map.json",
    "utf8"
  )
);

const events = Array.isArray(snapshot.events)
  ? snapshot.events
  : [];

const today = new Intl.DateTimeFormat(
  "sv-SE",
  { timeZone: "Europe/Paris" }
).format(new Date());

const clean = value => String(value || "").trim();

const escapeHtml = value =>
  clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const countries = {
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  LU: "Luxembourg",
  MC: "Monaco"
};

function dateFr(value) {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return "Date à confirmer";

  const [, y, m, d] = match;

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris"
    }
  ).format(
    new Date(
      Date.UTC(
        Number(y),
        Number(m) - 1,
        Number(d)
      )
    )
  );
}

function dateRange(event) {
  const start = dateFr(event.start_date);
  const end = clean(event.end_date);

  return end && end !== clean(event.start_date)
    ? `${start} – ${dateFr(end)}`
    : start;
}

function place(event) {
  return [
    event.city,
    event.region,
    countries[clean(event.country_code)]
      || event.country_code
  ]
    .map(clean)
    .filter(Boolean)
    .filter(
      (value, index, array) =>
        array.indexOf(value) === index
    )
    .join(" · ");
}

function canonicalHref(event) {
  const path = canonicalMap[String(event.id)];

  if (!path) {
    throw new Error(
      `Canonical absent pour ${event.id}`
    );
  }

  let cleanPath = String(path);

  while (cleanPath.startsWith("/")) {
    cleanPath = cleanPath.slice(1);
  }

  return "/" + cleanPath;
}

function upcoming(event) {
  const end = clean(
    event.end_date || event.start_date
  );

  return (
    event.validated === true &&
    event.rejected === false &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    end >= today
  );
}

function selectEvents(types) {
  return events
    .filter(upcoming)
    .filter(
      event =>
        !types || types.includes(event.type)
    )
    .sort((a, b) => {
      const da = clean(
        a.start_date || "9999-12-31"
      );

      const db = clean(
        b.start_date || "9999-12-31"
      );

      if (da !== db) {
        return da.localeCompare(db);
      }

      return clean(a.title).localeCompare(
        clean(b.title),
        "fr"
      );
    })
    .slice(0, 12);
}

function typeClass(type) {
  return {
    Salon: "type-salon",
    Festival: "type-festival",
    "Dédicace": "type-dedicace",
    Autre: "type-autre"
  }[type] || "type-autre";
}

function card(event) {
  const cls = typeClass(event.type);

  return `<article class="event-card ${cls}" data-event-id="${escapeHtml(event.id)}" data-static-event-preview="true">
  <div class="card-image"></div>
  <div class="card-body">
    <div class="card-tags">
      <span class="badge badge-type ${cls}">${escapeHtml(event.type || "Événement")}</span>
    </div>
    <h3 class="card-title">${escapeHtml(event.title || "Sans titre")}</h3>
    <div class="card-meta">
      <span>📅 ${escapeHtml(dateRange(event))}</span>
      <span>📍 ${escapeHtml(place(event) || "Lieu non précisé")}</span>
    </div>
    <div class="card-footer">
      <a class="card-link" href="${escapeHtml(canonicalHref(event))}">Voir le détail</a>
    </div>
  </div>
</article>`;
}

const targets = [
  {
    key: "home",
    file: "index.html",
    countId: "results-count",
    gridId: "events-grid",
    tag: "section",
    types: null
  },
  {
    key: "salons",
    file: "salons-du-livre.html",
    countId: "seo-count",
    gridId: "seo-events",
    tag: "div",
    types: ["Salon", "Festival"]
  },
  {
    key: "dedicaces",
    file: "dedicaces.html",
    countId: "seo-count",
    gridId: "seo-events",
    tag: "div",
    types: ["Dédicace"]
  }
];

for (const target of targets) {
  const rows = selectEvents(target.types);

  if (!rows.length) {
    throw new Error(
      `Aucun événement à venir pour ${target.file}`
    );
  }

  let html = fs.readFileSync(
    target.file,
    "utf8"
  );

  const countPattern = new RegExp(
    `<p\\s+id="${target.countId}"[^>]*>[\\s\\S]*?<\\/p>`
  );

  if (!countPattern.test(html)) {
    throw new Error(
      `Compteur introuvable : ${target.file}`
    );
  }

  html = html.replace(
    countPattern,
    `<p id="${target.countId}" data-static-event-preview-count="true">Aperçu des prochains événements</p>`
  );

  const start =
    `<!-- STATIC-EVENT-PREVIEW:${target.key}:START -->`;

  const end =
    `<!-- STATIC-EVENT-PREVIEW:${target.key}:END -->`;

  const opening =
    `<${target.tag} id="${target.gridId}" class="events-grid" aria-live="polite">`;

  const block =
`${start}
${opening}
${rows.map(card).join("\n")}
</${target.tag}>
${end}`;

  const markers = new RegExp(
    `<!-- STATIC-EVENT-PREVIEW:${target.key}:START -->[\\s\\S]*?<!-- STATIC-EVENT-PREVIEW:${target.key}:END -->`
  );

  if (markers.test(html)) {
    html = html.replace(
      markers,
      block
    );
  } else {
    const empty = new RegExp(
      `<${target.tag}\\b[^>]*\\bid="${target.gridId}"[^>]*>\\s*<\\/${target.tag}>`
    );

    if (!empty.test(html)) {
      throw new Error(
        `Grille initiale introuvable : ${target.file}`
      );
    }

    html = html.replace(
      empty,
      block
    );
  }

  fs.writeFileSync(
    target.file,
    html
  );

  console.log(
    `PASS ${target.file} : ${rows.length} liens statiques`
  );
}
