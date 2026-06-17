/**
 * Dédicalivres — Veille Worker
 *
 * Rôle :
 * - analyser une URL ou une liste d'URL depuis l'espace admin ;
 * - préparer des fiches candidates à copier dans l'admin ;
 * - ne rien écrire dans Supabase ;
 * - ne rien publier ;
 * - ne jamais exposer de clé service_role côté front.
 *
 * Secrets / variables Cloudflare :
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - ALLOWED_ADMIN_ORIGINS=https://dedicalivres.fr,https://www.dedicalivres.fr
 */

const WORKER_VERSION = "2026-06-17-admin-watch-1";
const MAX_URLS_PER_REQUEST = 20;
const MAX_BODY_BYTES = 48 * 1024;
const FETCH_TIMEOUT_MS = 12000;

const MONTHS = new Map([
  ["janvier", "01"],
  ["fevrier", "02"],
  ["février", "02"],
  ["mars", "03"],
  ["avril", "04"],
  ["mai", "05"],
  ["juin", "06"],
  ["juillet", "07"],
  ["aout", "08"],
  ["août", "08"],
  ["septembre", "09"],
  ["octobre", "10"],
  ["novembre", "11"],
  ["decembre", "12"],
  ["décembre", "12"]
]);

const TERRITORIES = [
  "Auvergne-Rhône-Alpes",
  "Bourgogne-Franche-Comté",
  "Bretagne",
  "Centre-Val de Loire",
  "Corse",
  "Grand Est",
  "Hauts-de-France",
  "Île-de-France",
  "Normandie",
  "Nouvelle-Aquitaine",
  "Occitanie",
  "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur",
  "Wallonie",
  "Flandre",
  "Bruxelles-Capitale",
  "Luxembourg",
  "Capellen",
  "Esch-sur-Alzette",
  "Genève",
  "Vaud",
  "Neuchâtel",
  "Fribourg",
  "Valais",
  "Jura"
];

const COUNTRY_ALIASES = [
  ["France", /\bfrance\b|\bparis\b|\bile[- ]de[- ]france\b|\bbretagne\b|\bnormandie\b/i],
  ["Belgique", /\bbelgique\b|\bwallonie\b|\bbruxelles\b|\bbrussels\b|\bflandre\b/i],
  ["Luxembourg", /\bluxembourg\b|\besch[- ]sur[- ]alzette\b|\bdifferdange\b/i],
  ["Suisse", /\bsuisse\b|\bgenève\b|\bgeneve\b|\blausanne\b|\bneuchatel\b|\bfribourg\b|\bvalais\b|\bjura\b/i],
  ["Monaco", /\bmonaco\b|\bmonte[- ]carlo\b/i]
];

export default {
  async fetch(request, env) {
    const cors = buildCorsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        name: "Dédicalivres Veille Worker",
        version: WORKER_VERSION,
        endpoints: {
          analyze: "POST /analyze"
        }
      }, 200, cors);
    }

    if (url.pathname !== "/analyze") {
      return jsonResponse({ ok: false, error: "Endpoint introuvable." }, 404, cors);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Méthode non autorisée." }, 405, {
        ...cors,
        Allow: "POST, OPTIONS"
      });
    }

    try {
      await assertAdminRequest(request, env);
      const payload = await readJsonBody(request);
      const urls = normalizeUrlList(payload.urls || payload.url || "");

      if (!urls.length) {
        throw httpError(400, "Aucune URL fournie.");
      }

      const results = [];
      for (const sourceUrl of urls.slice(0, MAX_URLS_PER_REQUEST)) {
        results.push(await analyzeRemoteUrl(sourceUrl, payload.filters || {}));
      }

      return jsonResponse({
        ok: true,
        version: WORKER_VERSION,
        count: results.length,
        truncated: urls.length > MAX_URLS_PER_REQUEST,
        results
      }, 200, cors);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error.message || "Analyse impossible."
      }, Number(error.status) || 500, cors);
    }
  }
};

async function analyzeRemoteUrl(sourceUrl, filters) {
  const normalizedUrl = normalizeUrl(sourceUrl);
  const response = await fetchHtml(normalizedUrl);

  if (!response.html) {
    return buildErrorCandidate(response.finalUrl || normalizedUrl, "Page vide ou non HTML.");
  }

  return extractCandidateFromHtml(response.html, {
    sourceUrl: response.finalUrl || normalizedUrl,
    filters,
    httpStatus: response.status
  });
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "DedicalivresVeille/0.1 (+https://dedicalivres.fr)"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const html = contentType.includes("text") || contentType.includes("html") || contentType.includes("xml")
      ? await response.text()
      : "";

    return {
      status: response.status,
      finalUrl: response.url,
      html: html.slice(0, 1_200_000)
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractCandidateFromHtml(html, options = {}) {
  const sourceUrl = options.sourceUrl || "";
  const meta = extractMeta(html);
  const titleTag = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const events = extractJsonLdEvents(html);
  const event = events[0] || null;
  const visibleText = htmlToText(html);
  const dateRange = detectDateRange([
    stringifyEvent(event),
    meta["og:title"],
    meta["og:description"],
    titleTag,
    visibleText.slice(0, 6000)
  ].filter(Boolean).join("\n"));
  const combinedText = [
    stringifyEvent(event),
    meta["og:title"],
    meta["og:description"],
    titleTag,
    visibleText.slice(0, 6000)
  ].filter(Boolean).join("\n");

  const title = cleanText(pick(event?.name, meta["og:title"], meta["twitter:title"], titleTag));
  const description = cleanText(pick(event?.description, meta["og:description"], meta.description, firstParagraph(visibleText)));
  const location = extractLocation(event, combinedText);
  const imageUrl = absolutizeUrl(extractImage(event, meta, html), sourceUrl);
  const officialUrl = absolutizeUrl(pick(event?.url, meta["og:url"], sourceUrl), sourceUrl);

  const candidate = {
    title,
    type: detectType([event?.["@type"], title, description, sourceUrl, combinedText].join(" ")),
    startDate: normalizeDateValue(pick(event?.startDate, dateRange.startDate)),
    endDate: normalizeDateValue(pick(event?.endDate, dateRange.endDate)),
    time: detectTime(combinedText),
    venue: location.venue,
    city: location.city,
    territory: location.territory,
    country: location.country,
    address: location.address,
    officialUrl,
    imageUrl,
    description: limitText(description, 520),
    organizer: cleanText(extractOrganizer(event, combinedText)),
    authors: detectAuthors(combinedText),
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    extractionMethod: event ? "json-ld-event" : "html-meta",
    evidence: buildEvidence(combinedText),
    httpStatus: options.httpStatus || null
  };

  candidate.missingFields = getMissingFields(candidate);
  candidate.filterWarnings = getFilterWarnings(candidate, options.filters || {});
  candidate.confidence = calculateConfidence(candidate, Boolean(event));
  candidate.status = getStatus(candidate);
  candidate.adminText = buildAdminText(candidate);

  return candidate;
}

function extractJsonLdEvents(html) {
  const scripts = [...String(html).matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const found = [];

  for (const script of scripts) {
    const raw = decodeHtml(script[1]).trim();
    if (!raw) continue;

    try {
      collectEvents(JSON.parse(raw), found);
    } catch {
      try {
        collectEvents(JSON.parse(raw.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")), found);
      } catch {
        // Données structurées invalides : on continue avec le HTML.
      }
    }
  }

  return found;
}

function collectEvents(value, found) {
  if (!value) return;
  if (Array.isArray(value)) return value.forEach((item) => collectEvents(item, found));
  if (typeof value !== "object") return;

  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => String(item || "").toLowerCase().includes("event"))) found.push(value);
  if (Array.isArray(value["@graph"])) value["@graph"].forEach((item) => collectEvents(item, found));
}

function extractMeta(html) {
  const meta = {};
  const tags = [...String(html).matchAll(/<meta\b[^>]*>/gi)];

  for (const tagMatch of tags) {
    const tag = tagMatch[0];
    const name = getAttr(tag, "property") || getAttr(tag, "name");
    const content = getAttr(tag, "content");
    if (name && content) meta[name.toLowerCase()] = decodeHtml(content);
  }

  return meta;
}

function extractLocation(event, text) {
  const location = Array.isArray(event?.location) ? event.location[0] : event?.location;
  const address = typeof location?.address === "object" ? location.address : {};
  const addressText = typeof location?.address === "string" ? location.address : [
    address.streetAddress,
    address.postalCode,
    address.addressLocality,
    address.addressRegion,
    address.addressCountry
  ].filter(Boolean).join(", ");

  return {
    venue: cleanText(location?.name),
    city: cleanText(pick(address.addressLocality, detectCity(text))),
    territory: cleanText(pick(address.addressRegion, detectTerritory(text))),
    country: cleanText(pick(normalizeCountry(address.addressCountry), detectCountry(text))),
    address: cleanText(addressText)
  };
}

function normalizeCountry(value) {
  const raw = typeof value === "object" ? value?.name : value;
  const normalized = String(raw || "").toLowerCase();
  if (normalized === "fr" || normalized.includes("france")) return "France";
  if (normalized === "be" || normalized.includes("belg")) return "Belgique";
  if (normalized === "lu" || normalized.includes("luxembourg")) return "Luxembourg";
  if (normalized === "ch" || normalized.includes("suisse") || normalized.includes("switzerland")) return "Suisse";
  if (normalized === "mc" || normalized.includes("monaco")) return "Monaco";
  return raw || "";
}

function detectCountry(text) {
  for (const [country, pattern] of COUNTRY_ALIASES) {
    if (pattern.test(text)) return country;
  }
  return "";
}

function detectTerritory(text) {
  const normalizedText = normalizeForSearch(text);
  return TERRITORIES.find((territory) => normalizedText.includes(normalizeForSearch(territory))) || "";
}

function detectCity(text) {
  const patterns = [
    /\b(?:à|a|ville de|commune de|lieu\s*:)\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ' -]{2,42})/u,
    /\b([0-9]{4,5})\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ' -]{2,42})/u,
    /\b([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ' -]{2,42})\s+[-–]\s+(?:France|Belgique|Suisse|Luxembourg|Monaco)\b/u
  ];

  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    const value = match?.[2] || match?.[1];
    if (value) return value.replace(/\s+(le|la|les|du|de)$/i, "").trim();
  }

  return "";
}

function detectDateRange(text) {
  const value = String(text || "");
  const isoRange = value.match(/\b(20[0-9]{2}-[01][0-9]-[0-3][0-9])(?:\s*(?:au|to|->|→|-|–)\s*(20[0-9]{2}-[01][0-9]-[0-3][0-9]))?/i);
  if (isoRange) return { startDate: isoRange[1], endDate: isoRange[2] || "" };

  const frenchRange = value.match(/\b(?:du\s*)?([0-3]?[0-9])(?:\s*(?:au|et|-|–)\s*([0-3]?[0-9]))?\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(20[0-9]{2})/i);
  if (frenchRange) {
    return {
      startDate: makeIsoDate(frenchRange[4], frenchRange[3], frenchRange[1]),
      endDate: frenchRange[2] ? makeIsoDate(frenchRange[4], frenchRange[3], frenchRange[2]) : ""
    };
  }

  return { startDate: "", endDate: "" };
}

function makeIsoDate(year, monthName, day) {
  const month = MONTHS.get(String(monthName).toLowerCase()) || "";
  return month ? `${year}-${month}-${String(day).padStart(2, "0")}` : "";
}

function normalizeDateValue(value) {
  const raw = String(value || "").trim();
  const iso = raw.match(/\b(20[0-9]{2}-[01][0-9]-[0-3][0-9])\b/);
  return iso ? iso[1] : raw;
}

function detectTime(text) {
  const match = String(text || "").match(/\b([0-2]?[0-9])\s*(?:h|:)\s*([0-5][0-9])?\b/i);
  return match ? `${match[1].padStart(2, "0")}h${match[2] || "00"}` : "";
}

function detectType(text) {
  const value = normalizeForSearch(text);
  if (value.includes("festival")) return "Festival";
  if (value.includes("salon du livre") || value.includes("salon")) return "Salon";
  if (value.includes("dedicace") || value.includes("signature")) return "Dédicace";
  if (value.includes("rencontre") || value.includes("auteur")) return "Rencontre";
  return "Autre";
}

function extractImage(event, meta, html) {
  const image = event?.image;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    const first = image[0];
    if (typeof first === "string") return first;
    if (first?.url) return first.url;
  }
  if (image?.url) return image.url;

  return pick(
    meta["og:image:secure_url"],
    meta["og:image"],
    meta["twitter:image"],
    firstMatch(html, /<img[^>]+src=["']([^"']+)["'][^>]*>/i)
  );
}

function extractOrganizer(event, text) {
  if (typeof event?.organizer === "string") return event.organizer;
  if (event?.organizer?.name) return event.organizer.name;

  const match = String(text || "").match(/\b(?:organisé par|organisateur\s*:)\s*([^\n.]{3,90})/i);
  return match?.[1] || "";
}

function detectAuthors(text) {
  const matches = [...String(text || "").matchAll(/\b(?:avec|rencontre avec|dédicace avec|dedicace avec)\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ' -]{3,80})/gu)];
  return [...new Set(matches.map((match) => cleanText(match[1])).filter(Boolean))].slice(0, 5);
}

function getMissingFields(candidate) {
  const fields = [];
  if (!candidate.title) fields.push("titre");
  if (!candidate.startDate) fields.push("date");
  if (!candidate.city) fields.push("ville");
  if (!candidate.country) fields.push("pays");
  if (!candidate.officialUrl) fields.push("site officiel");
  if (!candidate.imageUrl) fields.push("image");
  if (!candidate.description) fields.push("description");
  return fields;
}

function getFilterWarnings(candidate, filters) {
  const warnings = [];
  const country = String(filters.country || "");
  const type = String(filters.type || "");

  if (country && country !== "Tous" && candidate.country && candidate.country !== country) warnings.push(`pays hors filtre ${country}`);
  if (type === "Salons / festivals" && !["Salon", "Festival"].includes(candidate.type)) warnings.push("type hors filtre salons/festivals");
  if (type === "Dédicaces" && candidate.type !== "Dédicace") warnings.push("type hors filtre dédicaces");
  if (type === "Rencontres" && candidate.type !== "Rencontre") warnings.push("type hors filtre rencontres");

  return warnings;
}

function calculateConfidence(candidate, hasStructuredEvent) {
  let score = hasStructuredEvent ? 25 : 8;
  if (candidate.title) score += 15;
  if (candidate.startDate) score += 20;
  if (candidate.endDate) score += 5;
  if (candidate.city) score += 12;
  if (candidate.country) score += 8;
  if (candidate.venue || candidate.address) score += 8;
  if (candidate.officialUrl) score += 6;
  if (candidate.imageUrl) score += 4;
  if (candidate.description) score += 4;
  if (candidate.type === "Autre") score -= 8;
  if (candidate.missingFields.length >= 4) score -= 12;
  return Math.max(0, Math.min(100, score));
}

function getStatus(candidate) {
  if (!candidate.title && !candidate.startDate) return "Non événement";
  if (candidate.missingFields.includes("date") || candidate.missingFields.includes("ville")) return "Incomplet";
  if (candidate.confidence >= 82) return "Complet";
  if (candidate.confidence >= 58) return "À vérifier";
  return "Incomplet";
}

function buildAdminText(candidate) {
  return [
    ["Titre", candidate.title],
    ["Type", candidate.type],
    ["Pays", candidate.country],
    ["Région / territoire", candidate.territory],
    ["Ville", candidate.city],
    ["Lieu", candidate.venue],
    ["Adresse", candidate.address],
    ["Date début", candidate.startDate],
    ["Date fin", candidate.endDate],
    ["Horaire", candidate.time],
    ["Site officiel", candidate.officialUrl],
    ["Image", candidate.imageUrl],
    ["Description", candidate.description],
    ["Auteur(s)", candidate.authors?.join(", ")],
    ["Organisateur", candidate.organizer],
    ["Source", candidate.sourceUrl],
    ["À vérifier", candidate.missingFields.length ? candidate.missingFields.join(", ") : "Relire avant saisie"]
  ].map(([label, value]) => `${label} : ${value || ""}`).join("\n");
}

function buildErrorCandidate(sourceUrl, message) {
  const candidate = {
    title: "",
    type: "Autre",
    startDate: "",
    endDate: "",
    time: "",
    venue: "",
    city: "",
    territory: "",
    country: "",
    address: "",
    officialUrl: sourceUrl,
    imageUrl: "",
    description: "",
    organizer: "",
    authors: [],
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    extractionMethod: "error",
    evidence: message,
    httpStatus: null,
    missingFields: ["titre", "date", "ville", "pays"],
    filterWarnings: [],
    confidence: 0,
    status: "Non événement"
  };
  candidate.adminText = `Source : ${sourceUrl}\nÀ vérifier : ${message}`;
  return candidate;
}

async function assertAdminRequest(request, env) {
  assertEnv(env);

  const authorization = request.headers.get("authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const accessToken = tokenMatch?.[1]?.trim() || "";

  if (!accessToken) throw httpError(401, "Session administrateur absente.");

  const authResponse = await fetch(`${trimTrailingSlash(env.SUPABASE_URL)}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!authResponse.ok) throw httpError(401, "Session administrateur invalide ou expirée.");
  const user = await authResponse.json();
  if (!user?.id) throw httpError(401, "Utilisateur Supabase introuvable.");

  const adminUrl = new URL("/rest/v1/admin_users", trimTrailingSlash(env.SUPABASE_URL));
  adminUrl.searchParams.set("select", "user_id");
  adminUrl.searchParams.set("user_id", `eq.${user.id}`);
  adminUrl.searchParams.set("limit", "1");

  const adminsResponse = await fetch(adminUrl.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });

  if (!adminsResponse.ok) throw httpError(403, "Vérification admin impossible.");
  const admins = await adminsResponse.json();
  if (!Array.isArray(admins) || !admins.length) throw httpError(403, "Droits administrateur requis.");

  return user;
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) throw httpError(413, "Demande trop volumineuse.");

  try {
    return await request.json();
  } catch {
    throw httpError(400, "JSON invalide.");
  }
}

function normalizeUrlList(value) {
  const raw = Array.isArray(value) ? value.join("\n") : String(value || "");
  return [...new Set(raw.split(/\s+/).map((item) => item.trim()).filter(Boolean))];
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw httpError(400, "URL vide.");

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw httpError(400, `URL invalide : ${raw}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw httpError(400, "Seules les URL HTTP et HTTPS sont acceptées.");
  }

  return parsed.toString();
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const configuredOrigins = String(env.ALLOWED_ADMIN_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const allowedOrigins = new Set([
    "https://dedicalivres.fr",
    "https://www.dedicalivres.fr",
    ...configuredOrigins
  ]);

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const allowedOrigin = allowedOrigins.has(origin) || isLocal ? origin : "https://dedicalivres.fr";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function jsonResponse(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function assertEnv(env) {
  const missing = [];
  if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) throw httpError(500, `Configuration Worker incomplète : ${missing.join(", ")}`);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getAttr(tag, attr) {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? match[1] : "";
}

function htmlToText(html) {
  return decodeHtml(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|section|article|h1|h2|h3|h4)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function firstParagraph(text) {
  return String(text || "").split("\n").find((line) => line.trim().length > 80) || "";
}

function stringifyEvent(event) {
  if (!event) return "";
  return [
    event.name,
    event.description,
    event.startDate,
    event.endDate,
    event.location?.name,
    event.location?.address?.addressLocality,
    event.location?.address?.addressRegion,
    event.location?.address?.addressCountry
  ].filter(Boolean).join(" ");
}

function buildEvidence(text) {
  return limitText(cleanText(String(text || "").split("\n").find((line) => line.length > 80) || text), 260);
}

function firstMatch(value, pattern) {
  const match = String(value || "").match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

function absolutizeUrl(value, baseUrl) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return raw;
  }
}

function pick(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function cleanText(value) {
  return decodeHtml(String(value || ""))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function limitText(value, max) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
