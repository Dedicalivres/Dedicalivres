(function (root) {
  'use strict';
  const KEY = 'dedicalivres_local_preferences_v1';
  function createStore(storage) {
    function read() {
      try {
        const value = JSON.parse(storage.getItem(KEY));
        if (value?.version === 1 && Array.isArray(value.rules) && value.rules.length <= 20 && value.rules.every(r => r && ['country', 'region', 'type'].every(k => typeof r[k] === 'string') && Array.isArray(r.seen) && r.seen.every(id => typeof id === 'string'))) return value;
      } catch (_) {}
      return { version: 1, rules: [] };
    }
    function write(value) {
      try { storage.setItem(KEY, JSON.stringify(value)); return true; }
      catch (_) { return false; }
    }
    const match = (event, rule) => (!rule.country || event.country_code === rule.country) &&
      (!rule.region || event.region === rule.region) && (!rule.type || event.type === rule.type);
    const ids = (events, rule) => events.filter(e => match(e, rule)).map(e => String(e.id));
    return {
      read,
      add(rule, events) {
        const state = read();
        const clean = { country: String(rule.country || '').slice(0, 100), region: String(rule.region || '').slice(0, 100), type: String(rule.type || '').slice(0, 100) };
        if (state.rules.some(r => r.country === clean.country && r.region === clean.region && r.type === clean.type)) return true;
        if (state.rules.length >= 20) return false;
        state.rules.push({ ...clean, seen: ids(events, clean) });
        return write(state);
      },
      remove(index) { const state = read(); state.rules.splice(index, 1); return write(state); },
      unseen(events) {
        const rules = read().rules;
        return events.filter(e => rules.some(r => match(e, r) && !(Array.isArray(r.seen) ? r.seen : []).includes(String(e.id))));
      },
      acknowledge(events) {
        const state = read();
        state.rules.forEach(r => { r.seen = [...new Set([...(Array.isArray(r.seen) ? r.seen : []), ...ids(events, r)])]; });
        return write(state);
      }
    };
  }
  root.DEDICALIVRES_LOCAL = { createStore };
  if (!root.document) return;
  let storage;
  try { storage = root.localStorage; } catch (_) { storage = { getItem() {}, setItem() { throw Error('indisponible'); } }; }
  const store = createStore(storage);
  let catalog = null;
  const panel = document.getElementById('local-discoveries');
  function status(text) { document.getElementById('local-feedback').textContent = text; }
  function render() {
    if (!panel) return;
    const list = document.getElementById('local-rules');
    list.replaceChildren();
    store.read().rules.forEach((rule, index) => {
      const li = document.createElement('li');
      const text = [rule.country ? (root.DEDICALIVRES_GEO?.getCountryName(rule.country) || rule.country) : '', rule.region, rule.type].filter(Boolean).join(' · ') || 'Tous les événements';
      li.textContent = text + ' ';
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Retirer'; remove.setAttribute('aria-label', 'Retirer le suivi : ' + text);
      remove.onclick = () => { if (!store.remove(index)) status('Suppression impossible : stockage indisponible.'); render(); };
      li.append(remove); list.append(li);
    });
    const results = document.getElementById('local-results');
    results.replaceChildren();
    if (!catalog) return;
    const fresh = store.unseen(catalog);
    document.getElementById('local-count').textContent = fresh.length ? `${fresh.length} ${fresh.length === 1 ? 'nouveauté à découvrir' : 'nouveautés à découvrir'}` : 'Vous êtes à jour';
    if (!store.read().rules.length) document.getElementById('local-count').textContent = 'Aucun critère suivi pour le moment';
    document.getElementById('local-seen').hidden = !fresh.length;
    fresh.forEach(event => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = 'event.html?id=' + encodeURIComponent(event.id);
      link.textContent = event.title || 'Événement'; li.append(link); results.append(li);
      const info = document.createElement('span');
      const date = /^\d{4}-\d{2}-\d{2}$/.test(event.start_date || '') ? new Date(event.start_date + 'T12:00:00') : null;
      info.textContent = [event.city, event.region, date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('fr-FR') : event.start_date].filter(Boolean).join(' · ');
      li.append(info);
    });
    document.getElementById('local-seen').disabled = !fresh.length;
  }
  if (panel) {
    document.getElementById('local-save-search').onclick = () => {
      if (!catalog) { status('Attendez le chargement réussi de l’agenda.'); return; }
      const rule = { country: document.getElementById('country-filter')?.value, region: document.getElementById('region-filter')?.value, type: document.getElementById('type-filter')?.value };
      status(store.add(rule, catalog) ? 'Critères enregistrés ici. Les prochains événements correspondants apparaîtront à votre retour.' : 'Enregistrement impossible : stockage indisponible ou limite de 20 suivis atteinte.'); render();
    };
    document.getElementById('local-seen').onclick = () => { if (catalog) { status(store.acknowledge(catalog) ? 'Nouveautés marquées comme vues.' : 'Enregistrement impossible.'); render(); } };
    document.getElementById('local-clear').onclick = () => {
      if (!root.confirm('Effacer les favoris, critères et informations auteur mémorisés dans ce navigateur ?')) return;
      try {
        [KEY, 'dedicalivres_favorites', 'dedicalivres_author_draft_v1_author-presence-form', 'dedicalivres_author_draft_v1_submission-form'].forEach(key => storage.removeItem(key));
        root.dispatchEvent(new StorageEvent('storage', { key: 'dedicalivres_favorites' }));
        status('Favoris, critères et informations auteur mémorisés effacés.'); render();
      } catch (_) { status('Effacement incomplet : le stockage est indisponible.'); }
    };
    root.addEventListener('dedicalivres:catalog-loaded', e => { catalog = e.detail; render(); });
    root.addEventListener('dedicalivres:catalog-error', () => {
      catalog = null;
      document.getElementById('local-count').textContent = 'Nouveautés indisponibles pour le moment';
      document.getElementById('local-seen').disabled = true;
      status('Le chargement de l’agenda a échoué. Vos critères sont conservés : réessayez en rechargeant la page.');
    });
    root.addEventListener('storage', e => { if (e.key === KEY || e.key === null) render(); });
    render();
  }
})(globalThis);
