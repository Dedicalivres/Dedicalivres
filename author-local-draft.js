(function () {
  'use strict';
  // Only reusable author information; never consent, files, tokens or event dates.
  const allowed = ['pseudo', 'author_pseudo', 'participant_type', 'publication_mode', 'author_profile_url', 'author_profile_url_type', 'book_or_publisher_url', 'book_or_publisher_url_type', 'publisher_name', 'organization_name', 'organization_website', 'contact_name', 'contact_email'];
  const profileAllowed = ['bio', 'location', 'website', 'shop_url', 'profile_type'];
  function bind(form) {
    if (form.dataset.localDraft) return;
    form.dataset.localDraft = 'true';
    const isProfileForm = form.id === 'author-profile-submission-form';
    const storedFields = isProfileForm ? ['request_type', ...allowed, ...profileAllowed] : allowed;
    const key = 'dedicalivres_author_draft_v1_' + form.id;
    const box = document.createElement('fieldset'); box.className = isProfileForm ? 'local-author-draft local-author-draft-compact' : 'local-author-draft';
    const legend = document.createElement('legend'); legend.textContent = isProfileForm ? 'Retrouver mes informations sur cet appareil' : 'Retrouver mes informations auteur'; box.append(legend);
    const label = document.createElement('label');
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.defaultChecked = false;
    label.append(toggle, ' Conserver mes informations auteur dans ce navigateur'); box.append(label);
    const info = document.createElement('p'); info.textContent = 'Sur un appareil personnel uniquement. Les coordonnées restent accessibles aux utilisateurs de ce navigateur. Photos et consentement ne sont pas conservés. Les informations sont transmises au site uniquement lorsque vous envoyez le formulaire.'; box.append(info);
    const feedback = document.createElement('p'); feedback.setAttribute('role', 'status'); box.append(feedback);
    const forget = document.createElement('button'); forget.type = 'button'; forget.textContent = isProfileForm ? 'Effacer les informations mémorisées' : 'Effacer les informations auteur mémorisées'; box.append(forget);
    form.prepend(box);
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved?.version === 1 && saved.fields && typeof saved.fields === 'object') {
        toggle.checked = true;
        toggle.defaultChecked = true;
        storedFields.forEach(name => {
          const field = form.elements.namedItem(name);
          if (field && typeof saved.fields[name] === 'string') {
            field.value = saved.fields[name].slice(0, name === 'bio' ? 5000 : 1000);
            if (typeof field.dispatchEvent === 'function') {
              field.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              const selected = Array.from(field).find(item => item.checked);
              selected?.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        });
        feedback.textContent = 'Informations auteur restaurées depuis ce navigateur.';
      }
    } catch (_) { feedback.textContent = 'Le stockage local est indisponible ou illisible.'; }
    function clear() {
      try { localStorage.removeItem(key); toggle.checked = false; toggle.defaultChecked = false; feedback.textContent = 'Informations mémorisées effacées. La saisie actuelle reste dans le formulaire.'; }
      catch (_) { feedback.textContent = 'Impossible d’effacer le stockage de ce navigateur.'; }
    }
    function save() {
      if (!toggle.checked) return;
      const fields = {};
      storedFields.forEach(name => { const field = form.elements.namedItem(name); if (field && typeof field.value === 'string') fields[name] = field.value.slice(0, name === 'bio' ? 5000 : 1000); });
      try { localStorage.setItem(key, JSON.stringify({ version: 1, fields })); toggle.defaultChecked = true; feedback.textContent = 'Informations auteur enregistrées dans ce navigateur.'; }
      catch (_) { feedback.textContent = 'Enregistrement impossible. Votre saisie reste disponible sur cette page.'; }
    }
    toggle.onchange = () => toggle.checked ? save() : clear();
    forget.onclick = clear;
    window.addEventListener('storage', event => {
      if ((event.key === key && event.newValue === null) || event.key === null) {
        toggle.checked = false; toggle.defaultChecked = false;
        feedback.textContent = 'Mémorisation désactivée : les données ont été effacées dans un autre onglet. Votre saisie actuelle est conservée.';
      }
    });
    form.addEventListener('input', event => { if (storedFields.includes(event.target.name)) save(); });
    form.addEventListener('change', event => { if (storedFields.includes(event.target.name)) save(); });
  }
  function scan() { document.querySelectorAll('#author-presence-form, #submission-form, #author-profile-submission-form').forEach(bind); }
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
