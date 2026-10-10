(function exposeEventTextQuality(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DEDICALIVRES_EVENT_TEXT_QUALITY = api;
})(typeof globalThis === "object" ? globalThis : this, function createEventTextQuality() {
  "use strict";

  const TEXT_FIELDS = ["title", "description", "city", "region"];
  const FIELD_LABELS = {
    title: "titre",
    description: "description",
    city: "ville",
    region: "région"
  };
  const CERTAIN_MOJIBAKE = /(?:Ã(?:©|¨|ª|«|®|¯|´|µ|¶|·|¸|¹|º|»|¼|½|¾)|Â(?:©|®|°|±|²|³|´|µ|·)|â(?:€™|€œ|€|€“|€”|€¦|€¢)|ðŸ|ÃƒÂ)/u;
  const HTML_ENTITY = /&(?:amp|quot|apos|nbsp|lt|gt|#(?:\d{2,6}|x[0-9a-f]{2,6}));/iu;
  const HTML_TAG = /<\/?(?:a|b|br|div|em|i|li|ol|p|span|strong|ul)(?:\s[^<>]*)?>/iu;
  const TRUNCATED = /(?:\.{3}|…|\[…\])\s*$/u;

  function excerpt(value, index, width = 70) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const start = Math.max(0, Number(index || 0) - Math.floor(width / 2));
    return text.slice(start, start + width);
  }

  function analyzeField(field, value) {
    const text = String(value || "");
    if (!text) return [];
    const issues = [];
    const add = (classification, code, label, match, suggestion) => {
      issues.push({
        field,
        fieldLabel: FIELD_LABELS[field] || field,
        classification,
        code,
        label,
        excerpt: excerpt(text, match?.index),
        suggestion
      });
    };

    const replacement = /\uFFFD/u.exec(text);
    if (replacement) add("certain", "replacement-character", "Caractère de remplacement U+FFFD", replacement, "Retrouver la source UTF-8 originale.");

    const mojibake = CERTAIN_MOJIBAKE.exec(text);
    if (mojibake) add("certain", "mojibake", "Encodage UTF-8 probablement relu en Latin-1", mojibake, "Comparer avec la source officielle avant correction manuelle.");

    const entity = HTML_ENTITY.exec(text);
    if (entity) add("probable", "html-entity", "Entité HTML affichée littéralement", entity, "Vérifier le décodage à l’import.");

    const tag = HTML_TAG.exec(text);
    if (tag) add("probable", "html-markup", "Balisage HTML présent dans le texte", tag, "Contrôler la source et conserver uniquement le texte utile.");

    const truncated = TRUNCATED.exec(text);
    if (truncated) add("review", "possible-truncation", "Fin de texte possiblement tronquée", truncated, "Comparer avec la source avant toute modification.");

    return issues;
  }

  function analyzeEvent(event) {
    return TEXT_FIELDS.flatMap((field) => analyzeField(field, event?.[field]));
  }

  function summarize(event) {
    const issues = analyzeEvent(event);
    const fields = [...new Set(issues.map((issue) => issue.fieldLabel))];
    return {
      issues,
      fields,
      hasIssues: issues.length > 0,
      label: fields.length ? `Texte à contrôler — ${fields.join(", ")}` : "Texte sans anomalie détectée"
    };
  }

  return { TEXT_FIELDS, analyzeField, analyzeEvent, summarize };
});
