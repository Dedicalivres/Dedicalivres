(function (global) {
  "use strict";

  const VERSION = "1.1.0";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const LEVELS = {
    certain: { label: "Doublon certain", rank: 3 },
    probable: { label: "Doublon probable", rank: 2 },
    possible: { label: "À vérifier", rank: 1 },
    edition: { label: "Édition antérieure", rank: 0 }
  };
  const TITLE_STOP_WORDS = new Set([
    "salon", "salons", "festival", "festivals", "livre", "livres",
    "litteraire", "litteraires", "edition", "editions", "rencontre",
    "rencontres", "du", "de", "des", "la", "le", "les", "un", "une",
    "et", "au", "aux", "en", "eme", "er"
  ]);

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeTitle(value) {
    return normalizeText(value)
      .replace(/\b(19|20)\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeCity(value) {
    return normalizeText(value)
      .replace(/\bst\b/g, "saint")
      .replace(/\bste\b/g, "sainte")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalizeText(value).replace(/\s/g, "");
  }

  function titleTokens(value) {
    return normalizeTitle(value)
      .split(" ")
      .filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token));
  }

  function setSimilarity(left, right) {
    const a = new Set(left);
    const b = new Set(right);
    const union = new Set([...a, ...b]);
    if (!union.size) return 0;

    let common = 0;
    a.forEach((item) => {
      if (b.has(item)) common += 1;
    });

    return common / union.size;
  }

  function stringSimilarity(left, right) {
    const a = compact(left);
    const b = compact(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (Math.min(a.length, b.length) >= 8 && (a.includes(b) || b.includes(a))) {
      return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    }

    const bigrams = (value) => {
      const items = [];
      for (let index = 0; index < value.length - 1; index += 1) {
        items.push(value.slice(index, index + 2));
      }
      return items;
    };
    const aBigrams = bigrams(a);
    const bBigrams = bigrams(b);
    const remaining = [...bBigrams];
    let matches = 0;

    aBigrams.forEach((item) => {
      const matchIndex = remaining.indexOf(item);
      if (matchIndex === -1) return;
      matches += 1;
      remaining.splice(matchIndex, 1);
    });

    return (2 * matches) / Math.max(1, aBigrams.length + bBigrams.length);
  }

  function titleScore(left, right) {
    const a = normalizeTitle(left);
    const b = normalizeTitle(right);
    if (!a || !b) return { points: 0, similarity: 0, exact: false };
    if (a === b) return { points: 42, similarity: 1, exact: true };

    const aCompact = compact(a);
    const bCompact = compact(b);
    if (Math.min(aCompact.length, bCompact.length) >= 8 && (aCompact.includes(bCompact) || bCompact.includes(aCompact))) {
      return { points: 38, similarity: Math.min(aCompact.length, bCompact.length) / Math.max(aCompact.length, bCompact.length), exact: false };
    }

    const tokenSimilarity = setSimilarity(titleTokens(a), titleTokens(b));
    const textSimilarity = stringSimilarity(a, b);
    const similarity = Math.max(tokenSimilarity, textSimilarity);

    if (similarity >= 0.82) return { points: 36, similarity, exact: false };
    if (similarity >= 0.68) return { points: 30, similarity, exact: false };
    if (similarity >= 0.55) return { points: 22, similarity, exact: false };
    return { points: 0, similarity, exact: false };
  }

  function cityScore(left, right) {
    const a = normalizeCity(left);
    const b = normalizeCity(right);
    if (!a || !b) return { points: 0, similarity: 0, exact: false };
    if (a === b) return { points: 23, similarity: 1, exact: true };

    const similarity = Math.max(
      stringSimilarity(a, b),
      setSimilarity(a.split(" "), b.split(" "))
    );

    if (similarity >= 0.82) return { points: 19, similarity, exact: false };
    if (similarity >= 0.65) return { points: 12, similarity, exact: false };
    return { points: 0, similarity, exact: false };
  }

  function parseDay(value) {
    const iso = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const time = new Date(`${iso}T00:00:00Z`).getTime();
    return Number.isNaN(time) ? null : Math.floor(time / DAY_MS);
  }

  function getDateRange(event) {
    const start = parseDay(event?.start_date);
    const end = parseDay(event?.end_date || event?.start_date);
    if (start === null || end === null) return null;
    return start <= end ? { start, end } : { start: end, end: start };
  }

  function dateScore(left, right) {
    const a = getDateRange(left);
    const b = getDateRange(right);
    if (!a || !b) return { points: 0, gap: null, overlap: false, exact: false };

    const exact = a.start === b.start && a.end === b.end;
    const overlap = a.start <= b.end && b.start <= a.end;
    const gap = overlap
      ? 0
      : Math.min(Math.abs(a.start - b.end), Math.abs(b.start - a.end));

    if (exact) return { points: 30, gap, overlap, exact };
    if (overlap) return { points: 26, gap, overlap, exact };
    if (gap <= 1) return { points: 22, gap, overlap, exact };
    if (gap <= 3) return { points: 16, gap, overlap, exact };
    if (gap <= 7) return { points: 10, gap, overlap, exact };
    if (gap <= 14) return { points: 5, gap, overlap, exact };
    return { points: 0, gap, overlap, exact };
  }

  function normalizeWebsite(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
      const url = new URL(raw);
      url.hash = "";
      url.search = "";
      return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
      return normalizeText(raw);
    }
  }

  function websiteHost(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  function websiteScore(left, right) {
    const a = normalizeWebsite(left);
    const b = normalizeWebsite(right);
    if (!a || !b) return { points: 0, exact: false, sameHost: false };
    if (a === b) return { points: 15, exact: true, sameHost: true };

    const aHost = websiteHost(left);
    const bHost = websiteHost(right);
    const excludedHosts = new Set(["facebook.com", "instagram.com", "helloasso.com"]);
    const sameHost = aHost && aHost === bHost && !excludedHosts.has(aHost);
    return { points: sameHost ? 6 : 0, exact: false, sameHost };
  }

  function analyzePair(candidate, existing) {
    if (!candidate || !existing || String(candidate.id || "") === String(existing.id || "")) return null;

    const candidateCountry = String(candidate.country_code || "FR").toUpperCase();
    const existingCountry = String(existing.country_code || "FR").toUpperCase();
    if (candidateCountry !== existingCountry) return null;

    const title = titleScore(candidate.title, existing.title);
    const city = cityScore(candidate.city, existing.city);
    const date = dateScore(candidate, existing);
    const website = websiteScore(candidate.website, existing.website);
    const normalizedCandidateType = normalizeText(candidate.type);
    const normalizedExistingType = normalizeText(existing.type);
    const sameType = normalizedCandidateType && normalizedCandidateType === normalizedExistingType;
    const typePoints = sameType ? 3 : 0;
    const isDedicace = sameType && normalizedCandidateType === "dedicace";
    const hasSpecificTitle = titleTokens(candidate.title).length > 0 || titleTokens(existing.title).length > 0;
    const identityPoints = title.points + city.points + website.points;
    const hasIdentityAnchor = city.points >= 12 || website.points > 0;

    // Un titre générique et une date proche ne suffisent jamais : sans ville
    // proche ni site commun, deux salons ou deux dédicaces sont indépendants.
    if (!hasIdentityAnchor) return null;

    if (!date.points) {
      if (title.points >= 36 && city.points >= 19) {
        return {
          level: "edition",
          score: Math.min(100, identityPoints),
          reasons: ["même identité", "autre période"],
          event: existing
        };
      }
      return null;
    }

    const score = Math.min(100, title.points + city.points + date.points + website.points + typePoints);
    const reasons = [];
    if (title.exact) reasons.push("même titre");
    else if (title.points) reasons.push("titre très proche");
    if (city.exact) reasons.push("même ville");
    else if (city.points) reasons.push("ville proche");
    if (date.exact) reasons.push("mêmes dates");
    else if (date.overlap) reasons.push("dates qui se chevauchent");
    else if (date.points) reasons.push(`dates à ${date.gap} jour${date.gap > 1 ? "s" : ""}`);
    if (website.exact) reasons.push("même site officiel");
    else if (website.sameHost) reasons.push("même domaine web");

    let level = "";
    if (title.exact && city.exact && date.points >= 22 && hasSpecificTitle) level = "certain";
    else if (
      (date.exact && title.similarity >= 0.82 && (city.points >= 12 || website.exact)) ||
      (website.exact && date.overlap && title.points >= 22) ||
      (!isDedicace && date.exact && city.exact && title.points >= 22)
    ) level = "probable";
    else if (score >= 58) level = "possible";

    return level ? { level, score, reasons, event: existing } : null;
  }

  function addDays(isoDate, amount) {
    const day = parseDay(isoDate);
    if (day === null) return "";
    return new Date((day + amount) * DAY_MS).toISOString().slice(0, 10);
  }

  async function findMatches(client, candidate, options = {}) {
    if (!client || !candidate?.start_date) return [];

    const range = getDateRange(candidate);
    if (!range) return [];

    const from = addDays(candidate.start_date, -60);
    const to = addDays(candidate.end_date || candidate.start_date, 60);

    let query = client
      .from("events")
      .select("id,title,type,city,region,country_code,start_date,end_date,website,validated,rejected,created_at")
      .eq("country_code", String(candidate.country_code || "FR").toUpperCase())
      .eq("rejected", false)
      .gte("start_date", from)
      .lte("start_date", to)
      .limit(Number(options.limit || 250));

    if (options.onlyValidated) query = query.eq("validated", true);

    const { data, error } = await query;
    if (error) throw error;

    return (Array.isArray(data) ? data : [])
      .filter((event) => String(event.id || "") !== String(options.excludeId || candidate.id || ""))
      .map((event) => analyzePair(candidate, event))
      .filter((match) => match && match.level !== "edition")
      .sort((a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank || b.score - a.score);
  }

  function groupEvents(events) {
    const source = (Array.isArray(events) ? events : [])
      .filter((event) => event && event.rejected !== true && getDateRange(event))
      .map((event, index) => ({ event, index, range: getDateRange(event) }))
      .sort((a, b) => a.range.start - b.range.start);
    const parent = source.map((_, index) => index);
    const possiblePairs = [];
    const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
    const unite = (left, right) => {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent[b] = a;
    };

    for (let left = 0; left < source.length; left += 1) {
      for (let right = left + 1; right < source.length; right += 1) {
        if (source[right].range.start - source[left].range.end > 60) break;
        const match = analyzePair(source[left].event, source[right].event);
        if (!match || match.level === "edition") continue;
        if (match.level === "possible") {
          possiblePairs.push({ rows: [source[left].event, source[right].event], level: match.level, score: match.score });
        } else {
          unite(left, right);
        }
      }
    }

    const groups = new Map();
    source.forEach((item, index) => {
      const root = find(index);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(item.event);
    });

    const strongGroups = Array.from(groups.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([, rows]) => {
        let strongest = null;
        for (let left = 0; left < rows.length; left += 1) {
          for (let right = left + 1; right < rows.length; right += 1) {
            const match = analyzePair(rows[left], rows[right]);
            if (!match || match.level === "edition") continue;
            if (
              !strongest ||
              LEVELS[match.level].rank > LEVELS[strongest.level].rank ||
              (LEVELS[match.level].rank === LEVELS[strongest.level].rank && match.score > strongest.score)
            ) strongest = match;
          }
        }
        return { rows, level: strongest?.level || "probable", score: strongest?.score || 72 };
      });

    const uniquePossiblePairs = possiblePairs.filter((pair) => {
      const [left, right] = pair.rows;
      if (strongGroups.some((group) => group.rows.includes(left) && group.rows.includes(right))) return false;
      return true;
    });

    return [...strongGroups, ...uniquePossiblePairs]
      .sort((a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank || b.score - a.score);
  }

  function fingerprint(event) {
    return [
      normalizeTitle(event?.title),
      normalizeCity(event?.city),
      String(event?.country_code || "FR").toUpperCase(),
      String(event?.start_date || "").slice(0, 10),
      String(event?.end_date || "").slice(0, 10),
      normalizeWebsite(event?.website)
    ].join("|");
  }

  global.DEDICALIVRES_DUPLICATES = {
    VERSION,
    LEVELS,
    normalizeText,
    normalizeTitle,
    normalizeCity,
    analyzePair,
    findMatches,
    groupEvents,
    fingerprint
  };
})(typeof window !== "undefined" ? window : globalThis);
