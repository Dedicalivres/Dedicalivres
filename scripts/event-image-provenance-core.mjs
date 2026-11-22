// Audit en lecture seule. Aucune suppression ni validation d'usage n'est déduite d'une URL.
const STOCK_HOSTS = new Set([
  'images.unsplash.com', 'source.unsplash.com', 'images.pexels.com',
  'cdn.pixabay.com', 'pixabay.com'
]);

function parseHttpImage(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch { return null; }
}

export function imageIdentity(value) {
  const url = parseHttpImage(value);
  if (!url) return '';
  // Image statique : les paramètres de cadrage/largeur ne changent pas la photo.
  // URL dynamique (ex. thumb.php?image=...) : la requête fait partie de l'identité.
  const fileExt = /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname) || STOCK_HOSTS.has(url.hostname.toLowerCase());
  return `${url.hostname.toLowerCase()}${url.pathname}${fileExt ? '' : url.search}`;
}

function sameHostAsSource(imageUrl, sourceUrl) {
  const image = parseHttpImage(imageUrl);
  const source = parseHttpImage(sourceUrl);
  if (!image || !source) return false;
  const strip = host => host.toLowerCase().replace(/^www\./, '');
  return strip(image.hostname) === strip(source.hostname);
}

export function auditEventImages(rows, { fromDate = '' } = {}) {
  const events = rows.filter(event =>
    event.validated === true && event.rejected !== true &&
    (!fromDate || String(event.start_date || '') >= fromDate)
  );
  const reuse = new Map();
  for (const event of events) {
    const key = imageIdentity(event.image_url);
    if (key) reuse.set(key, [...(reuse.get(key) || []), String(event.id)]);
  }

  const findings = [];
  const counts = { MISSING_IMAGE: 0, STOCK_IMAGE: 0, SHARED_IMAGE_REVIEW: 0, BATCH_PROVENANCE_REVIEW: 0, INVALID_IMAGE_URL: 0 };
  for (const event of events) {
    const issues = [];
    const image = String(event.image_url || '').trim();
    const parsed = parseHttpImage(image);
    const key = imageIdentity(image);
    if (!image) issues.push('MISSING_IMAGE');
    else if (!parsed) issues.push('INVALID_IMAGE_URL');
    else {
      if (STOCK_HOSTS.has(parsed.hostname.toLowerCase())) issues.push('STOCK_IMAGE');
      if ((reuse.get(key) || []).length > 1) issues.push('SHARED_IMAGE_REVIEW');
      const source = String(event.source_label || '');
      const suspiciousBatch = /visuel booking_with_emilie|Agenda Calmann-Lévy 2026 et sources locales|visuel générique/i.test(source);
      if (suspiciousBatch && !sameHostAsSource(image, event.website)) issues.push('BATCH_PROVENANCE_REVIEW');
    }
    for (const issue of issues) counts[issue]++;
    if (issues.length) findings.push({
      id: event.id, title: event.title, city: event.city, date: event.start_date,
      image_url: image || null, website: event.website || null,
      source_label: event.source_label || null, issues,
      reuse_count: key ? (reuse.get(key) || []).length : 0
    });
  }
  return { examined: events.length, flagged_events: findings.length, counts, findings };
}
