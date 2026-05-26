#!/usr/bin/env node
/*
  Dédicalivres — Test automatisé Pack 1B
  Vérifie le Worker d'export quotidien sans modifier le site public.

  Usage rapide :
    WORKER_EXPORT_URL="https://...workers.dev/export-now" node test-export.js

  Optionnel pour vérifier les fichiers publics R2 :
    R2_EXPORT_BASE_URL="https://.../exports" node test-export.js
*/

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FORBIDDEN_KEYS = [
  'email', 'mail', 'telephone', 'phone', 'tel', 'mobile',
  'admin', 'user_id', 'created_by', 'updated_by', 'ip',
  'tracking', 'newsletter', 'service_role', 'secret', 'token',
  'password', 'passwd', 'apikey', 'api_key', 'anonkey'
];

function readDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function ok(label, details = '') { return { status: 'OK', label, details }; }
function warn(label, details = '') { return { status: 'WARN', label, details }; }
function fail(label, details = '') { return { status: 'FAIL', label, details }; }
function info(label, details = '') { return { status: 'INFO', label, details }; }

function icon(status) {
  return { OK: '✅', WARN: '⚠️', FAIL: '❌', INFO: 'ℹ️' }[status] || '•';
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': '*/*' } });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function extractFilesFromResponse(json) {
  const candidates = [];
  if (Array.isArray(json.files)) candidates.push(...json.files);
  if (Array.isArray(json.generated_files)) candidates.push(...json.generated_files);
  if (json.outputs && typeof json.outputs === 'object') candidates.push(...Object.values(json.outputs));
  return candidates.filter(Boolean).map(String);
}

function getExportUrls(responseJson) {
  const base = normalizeBaseUrl(process.env.R2_EXPORT_BASE_URL || process.env.EXPORT_BASE_URL || '');
  const files = extractFilesFromResponse(responseJson);
  const urls = { json: '', csv: '', md: '' };

  for (const file of files) {
    const asUrl = /^https?:\/\//i.test(file) ? file : (base ? `${base}/${file.replace(/^exports\//, '').replace(/^\/+/, '')}` : '');
    if (!asUrl) continue;
    if (/events-latest\.json$/i.test(file) || /events-latest\.json/i.test(asUrl)) urls.json = asUrl;
    if (/events-latest\.csv$/i.test(file) || /events-latest\.csv/i.test(asUrl)) urls.csv = asUrl;
    if (/publications-latest\.md$/i.test(file) || /publications-latest\.md/i.test(asUrl)) urls.md = asUrl;
  }

  if (base) {
    urls.json ||= `${base}/events-latest.json`;
    urls.csv ||= `${base}/events-latest.csv`;
    urls.md ||= `${base}/publications-latest.md`;
  }
  return urls;
}

function parseEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.events)) return payload.events;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function getDateValue(event) {
  const fields = ['date', 'event_date', 'start_date', 'starts_at', 'datetime', 'event_datetime'];
  for (const field of fields) {
    if (event[field]) return String(event[field]);
  }
  return '';
}

function getTitle(event) {
  return event.title || event.name || event.event_title || event.nom || '';
}

function getCity(event) {
  return event.city || event.ville || event.location_city || '';
}

function isSortedByDate(events) {
  let previous = null;
  for (const event of events) {
    const raw = getDateValue(event);
    const current = raw ? new Date(raw).getTime() : NaN;
    if (Number.isNaN(current)) continue;
    if (previous !== null && current < previous) return false;
    previous = current;
  }
  return true;
}

function flattenKeys(obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return [];
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    keys.push(full);
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flattenKeys(v, full));
  }
  return keys;
}

function findForbiddenKeys(events) {
  const forbidden = (process.env.FORBIDDEN_EXPORT_KEYS || DEFAULT_FORBIDDEN_KEYS.join(','))
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const found = new Set();
  for (const event of events) {
    for (const key of flattenKeys(event)) {
      const lower = key.toLowerCase();
      if (forbidden.some(term => lower === term || lower.endsWith(`.${term}`) || lower.includes(term))) {
        found.add(key);
      }
    }
  }
  return [...found].sort();
}

function detectEmailsInText(text) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches)].slice(0, 10);
}

function countMissing(events, getter) {
  return events.filter(e => !String(getter(e) || '').trim()).length;
}

function makeReport(results, context) {
  const now = new Date().toISOString();
  const lines = [];
  lines.push('# Rapport de test — Export Dédicalivres');
  lines.push('');
  lines.push(`Généré le : ${now}`);
  lines.push('');
  lines.push('## Contexte');
  lines.push('');
  lines.push(`- Worker testé : ${context.workerUrl || 'non renseigné'}`);
  lines.push(`- Base exports R2 : ${context.r2BaseUrl || 'non renseignée'}`);
  lines.push('');
  lines.push('## Résultats');
  lines.push('');
  for (const r of results) {
    lines.push(`- ${icon(r.status)} **${r.status}** — ${r.label}${r.details ? ` : ${r.details}` : ''}`);
  }
  lines.push('');
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  lines.push('## Synthèse');
  lines.push('');
  if (failCount) lines.push(`❌ Test non validé : ${failCount} erreur(s), ${warnCount} alerte(s).`);
  else if (warnCount) lines.push(`⚠️ Test utilisable mais à vérifier : ${warnCount} alerte(s).`);
  else lines.push('✅ Test validé : aucune erreur détectée.');
  lines.push('');
  lines.push('## Prochaine action conseillée');
  lines.push('');
  if (failCount) lines.push('Corriger les erreurs ci-dessus puis relancer `node test-export.js`.');
  else if (warnCount) lines.push('Vérifier les alertes, surtout les événements sans image ou sans champ important.');
  else lines.push('Tu peux activer ou conserver le cron quotidien Cloudflare.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  readDotEnv();
  const results = [];
  const workerUrl = normalizeBaseUrl(process.env.WORKER_EXPORT_URL || process.env.EXPORT_NOW_URL || '');
  const r2BaseUrl = normalizeBaseUrl(process.env.R2_EXPORT_BASE_URL || process.env.EXPORT_BASE_URL || '');

  if (!workerUrl) {
    results.push(fail('Variable WORKER_EXPORT_URL absente', 'renseigner .env ou lancer avec WORKER_EXPORT_URL="https://.../export-now"'));
    const report = makeReport(results, { workerUrl, r2BaseUrl });
    fs.writeFileSync('export-test-report.md', report);
    console.log(report);
    process.exit(1);
  }

  let responseJson = null;
  try {
    const { res, text } = await fetchText(workerUrl);
    results.push(res.ok ? ok('Worker accessible', `HTTP ${res.status}`) : fail('Worker non accessible', `HTTP ${res.status} — ${text.slice(0, 300)}`));
    try {
      responseJson = JSON.parse(text);
      results.push(ok('Réponse JSON lisible'));
      if (responseJson.ok === true) results.push(ok('Export manuel accepté', 'ok=true'));
      else results.push(warn('Réponse sans ok=true', `réponse : ${text.slice(0, 300)}`));
      const responseCount = responseJson.count ?? responseJson.event_count;
      if (typeof responseCount === 'number') results.push(ok('Nombre d’événements retourné', `${responseCount}`));
      else results.push(warn('Nombre d’événements absent', 'champ count/event_count non trouvé'));
    } catch (e) {
      results.push(fail('Réponse non JSON', text.slice(0, 300)));
    }
  } catch (e) {
    results.push(fail('Erreur d’appel Worker', e.message));
  }

  let events = [];
  if (responseJson) {
    const urls = getExportUrls(responseJson);
    const files = extractFilesFromResponse(responseJson);
    if (files.length) results.push(ok('Fichiers annoncés par le Worker', files.join(', ')));
    else results.push(warn('Aucun fichier annoncé par le Worker', 'le test R2 utilisera R2_EXPORT_BASE_URL si disponible'));

    if (urls.json) {
      try {
        const { res, text } = await fetchText(urls.json);
        if (res.ok) {
          results.push(ok('Fichier JSON export accessible', urls.json));
          const payload = JSON.parse(text);
          events = parseEvents(payload);
          results.push(events.length ? ok('Événements lisibles dans le JSON', `${events.length} événement(s)`) : warn('Aucun événement lisible dans le JSON'));
          results.push(isSortedByDate(events) ? ok('Tri par date validé') : fail('Tri par date incorrect', 'au moins une date est avant la précédente'));

          const missingTitles = countMissing(events, getTitle);
          const missingDates = countMissing(events, getDateValue);
          const missingCities = countMissing(events, getCity);
          const missingImages = countMissing(events, e => e.image_url || e.image || e.cover_url);
          const missingUrls = countMissing(events, e => e.event_url || e.url || e.link);

          if (missingTitles) results.push(fail('Événements sans titre', `${missingTitles}`)); else results.push(ok('Titres présents'));
          if (missingDates) results.push(fail('Événements sans date', `${missingDates}`)); else results.push(ok('Dates présentes'));
          if (missingCities) results.push(warn('Événements sans ville', `${missingCities}`)); else results.push(ok('Villes présentes'));
          if (missingImages) results.push(warn('Événements sans image', `${missingImages}`)); else results.push(ok('Images présentes'));
          if (missingUrls) results.push(warn('Événements sans lien fiche', `${missingUrls}`)); else results.push(ok('Liens fiches présents'));

          const forbidden = findForbiddenKeys(events);
          if (forbidden.length) results.push(fail('Champs sensibles potentiellement exportés', forbidden.join(', ')));
          else results.push(ok('Aucun champ sensible détecté par nom'));

          const emails = detectEmailsInText(text);
          if (emails.length) results.push(fail('Emails détectés dans le JSON', emails.join(', ')));
          else results.push(ok('Aucun email détecté dans le JSON'));
        } else {
          results.push(warn('Fichier JSON export non accessible', `HTTP ${res.status} — ${urls.json}`));
        }
      } catch (e) {
        results.push(warn('Impossible de tester le JSON exporté', e.message));
      }
    } else {
      results.push(warn('URL JSON non déterminée', 'renseigner R2_EXPORT_BASE_URL pour tester events-latest.json'));
    }

    for (const [type, label] of [['csv', 'CSV'], ['md', 'Markdown publications']]) {
      const urls = getExportUrls(responseJson);
      if (!urls[type]) {
        results.push(warn(`URL ${label} non déterminée`, 'renseigner R2_EXPORT_BASE_URL'));
        continue;
      }
      try {
        const { res, text } = await fetchText(urls[type]);
        if (res.ok && text.trim().length > 0) results.push(ok(`Fichier ${label} accessible`, urls[type]));
        else results.push(warn(`Fichier ${label} vide ou inaccessible`, `HTTP ${res.status} — ${urls[type]}`));
      } catch (e) {
        results.push(warn(`Impossible de tester le fichier ${label}`, e.message));
      }
    }
  }

  const report = makeReport(results, { workerUrl, r2BaseUrl });
  fs.writeFileSync('export-test-report.md', report);
  console.log(report);

  if (results.some(r => r.status === 'FAIL')) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
