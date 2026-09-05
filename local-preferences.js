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
    const rules = store.read().rules;
    const count = document.getElementById('local-rule-count');
    if (count) count.textContent = `${rules.length} suivi${rules.length > 1 ? 's' : ''} enregistré${rules.length > 1 ? 's' : ''} sur 20`;
    rules.forEach((rule, index) => {
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
  function selection() {
    return { country: document.getElementById('local-country').value,
      region: document.getElementById('local-region').value,
      type: document.getElementById('local-type').value };
  }
  function updatePicker() {
    const country = document.getElementById('local-country');
    const region = document.getElementById('local-region');
    const type = document.getElementById('local-type');
    if (!country || !catalog) return;
    function options(select, values, emptyLabel, label = x => x) {
      const previous = select.value;
      select.replaceChildren();
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = emptyLabel; select.append(empty);
      [...new Set(values.filter(v => typeof v === 'string' && v))].sort((a,b) => label(a).localeCompare(label(b), 'fr')).forEach(value => {
        const option = document.createElement('option'); option.value = value; option.textContent = label(value); select.append(option);
      });
      select.value = [...select.options].some(o => o.value === previous) ? previous : '';
    }
    options(country, catalog.map(e => e.country_code), 'Tous les pays', value => root.DEDICALIVRES_GEO?.getCountryName(value) || value);
    options(region, catalog.filter(e => !country.value || e.country_code === country.value).map(e => e.region), 'Toutes les régions');
    options(type, catalog.map(e => e.type), 'Tous les types');
    document.getElementById('local-selection').textContent = [country.selectedOptions[0].textContent, region.selectedOptions[0].textContent, type.selectedOptions[0].textContent].join(' · ');
  }
  if (panel) {
    ['local-country', 'local-region', 'local-type'].forEach(id => document.getElementById(id)?.addEventListener('change', updatePicker));
    document.getElementById('local-copy-filters')?.addEventListener('click', () => {
      if (!catalog) { status('Attendez le chargement réussi de l’agenda.'); return; }
      document.getElementById('local-country').value = document.getElementById('country-filter')?.value || '';
      updatePicker();
      document.getElementById('local-region').value = document.getElementById('region-filter')?.value || '';
      document.getElementById('local-type').value = document.getElementById('type-filter')?.value || '';
      updatePicker();
    });
    document.getElementById('local-save-search').onclick = () => {
      if (!catalog) { status('Attendez le chargement réussi de l’agenda.'); return; }
      const rule = selection();
      if (store.read().rules.some(r => r.country === rule.country && r.region === rule.region && r.type === rule.type)) {
        status('Ce suivi est déjà enregistré. Choisissez d’autres critères pour en ajouter un.'); return;
      }
      status(store.add(rule, catalog) ? 'Suivi ajouté. Vos autres suivis sont conservés. Les nouveautés apparaîtront lors de vos prochaines visites.' : 'Enregistrement impossible : stockage indisponible ou limite de 20 suivis atteinte.'); render();
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
    root.addEventListener('dedicalivres:catalog-loaded', e => { catalog = e.detail; updatePicker(); render(); });
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
