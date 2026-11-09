"use strict";
(function installHotteTools() {
  "use strict";

  // H-E08 laboratory only. No Supabase calls, writes, payments, or mail dispatches.
  const PUBLIC_PREVIEW = "https://dedicalivres-hotte-he08-demonstration-1quymkl6r.vercel.app/";
  const FLOATING_PREVIEW = "https://dedicalivres-hotte-he08-demonstration-25tphmydc.vercel.app/site-widgets.html";

  const initialLots = Object.freeze([
    { title: "La Forêt des Étoiles", author: "Auteur fictif A", format: "Papier", price: 18.90, accepted: true },
    { title: "Minuit sur les Quais", author: "Auteur fictif B", format: "Papier", price: 21.50, accepted: true },
    { title: "La Mémoire des Neiges", author: "Auteur fictif C", format: "Papier", price: 19.90, accepted: true },
    { title: "Les Cartes du Vent", author: "Auteur fictif D", format: "Numérique", price: 9.99, accepted: false }
  ]);
  let lots = initialLots.map((lot) => ({ ...lot }));

  function authorized() {
    const state = window.DEDICALIVRES_ADMIN_CONTEXT?.getState?.();
    return state?.authenticated === true && state?.status === "ready";
  }

  function openWidgets() {
    if (!authorized()) return;
    const panel = document.getElementById("v11-partner-widget-panel");
    const legacy = panel?.querySelector(".v11-partner-widget-shell");
    if (!panel || !legacy) return;

    if (!panel.querySelector("#v11-widget-hub-nav")) {
      panel.insertAdjacentHTML("afterbegin", `
        <nav class="v11-hotte-tabs" id="v11-widget-hub-nav" aria-label="Choisir un widget">
          <button type="button" data-v11-widget-tab="agenda" aria-selected="true">Agenda · partenaires</button>
          <button type="button" data-v11-widget-tab="hotte" aria-selected="false">Hotte de Noël</button>
          <button type="button" data-v11-widget-tab="helloasso" aria-selected="false">HelloAsso · dons</button>
        </nav>
      `);

      panel.insertAdjacentHTML("beforeend", `
        <section class="v11-hotte-addon" id="v11-widget-hotte" hidden aria-label="Widget Hotte de Noël">
          <div class="v11-hotte-intro">
            <div><p class="v11-section-label">ÉVÉNEMENT · NOËL 2026</p><h3>Widget flottant de la Hotte</h3>
              <p>Design approuvé : ouverture déployée, réduction au logo, réouverture au clic. Démonstration sans activation sur le site.</p></div>
            <span class="v11-chip neutral">LABORATOIRE</span>
          </div>
          <div class="v11-hotte-widget-stage" aria-label="Aperçu fictif du widget flottant">
            <div class="v11-hotte-stage-site"><strong>Dédicalivres</strong><p>Accueil du site · Aperçu de placement</p></div>
            <div class="v11-hotte-preview-float" id="v11-hotte-widget-float">
              <div class="v11-hotte-float-expanded" id="v11-hotte-float-expanded">
                <button type="button" class="v11-hotte-float-minus" id="v11-hotte-minimize" aria-label="Réduire le widget Hotte">−</button>
                <div class="v11-hotte-float-head"><span class="v11-hotte-seal" aria-hidden="true"><small>LA HOTTE</small><strong>NOËL</strong><em>2026</em></span>
                  <div><strong>La communauté des auteurs de Dédicalivres prend part à l’aventure !</strong>
                    <p>Des auteurs partagent leurs histoires et offrent des livres aux lecteurs.</p></div>
                </div>
                <span class="v11-hotte-float-link">Découvrir la Hotte</span>
              </div>
              <button type="button" class="v11-hotte-float-reduced" id="v11-hotte-expand" aria-label="Déployer le widget Hotte" hidden>
                <span class="v11-hotte-seal" aria-hidden="true"><small>LA HOTTE</small><strong>NOËL</strong><em>2026</em></span>
              </button>
            </div>
          </div>
          <p class="v11-hotte-note">Emplacement prévu : accueil Dédicalivres, en bas à droite. Les commandes ci-dessus ne changent que cet aperçu.</p>
          <p class="v11-hotte-links"><a href="${FLOATING_PREVIEW}" target="_blank" rel="noopener noreferrer">Voir la simulation complète du widget</a>
            <a href="${PUBLIC_PREVIEW}" target="_blank" rel="noopener noreferrer">Voir la Hotte côté visiteur</a></p>
          <div class="v11-hotte-lock">Publication désactivée : aucune date d'ouverture validée, aucune inscription réelle et aucun widget ajouté à dedicalivres.fr.</div>
        </section>

        <section class="v11-hotte-addon" id="v11-widget-helloasso" hidden aria-label="Widget HelloAsso">
          <div class="v11-hotte-intro">
            <div><p class="v11-section-label">SOUTIEN À L'ASSOCIATION</p><h3>Widget HelloAsso</h3>
              <p>Un module de dons mutualisé, utilisable sur Dédicalivres toute l'année et sur la page de chaque opération.</p></div>
            <span class="v11-chip neutral">EN ATTENTE</span>
          </div>
          <div class="v11-hotte-donation">
            <span class="v11-hotte-donation-mark">✦</span><h4>La lecture se partage. Le soutien reste libre.</h4>
            <p>Un don n'augmente jamais les chances de gagner. Les inscriptions et les données de la Hotte ne sont pas transmises à HelloAsso.</p>
            <div class="v11-hotte-lock">Le code officiel du formulaire de don n'est pas configuré. Aucun paiement n'est accessible dans l'administration.</div>
            <p><a href="https://www.helloasso.com/associations/dedicalivres" target="_blank" rel="noopener noreferrer">Consulter la fiche associative HelloAsso</a></p>
          </div>
          <p class="v11-hotte-note">Emplacements prévus : page Hotte pendant l'opération, accueil Dédicalivres toute l'année. La collecte reste indépendante du tirage.</p>
        </section>
      `);

      panel.querySelector("#v11-widget-hub-nav").addEventListener("click", (event) => {
        const button = event.target.closest("[data-v11-widget-tab]");
        if (button) selectWidgetTab(button.dataset.v11WidgetTab);
      });
      panel.querySelector("#v11-hotte-minimize")?.addEventListener("click", () => setWidgetReduced(true));
      panel.querySelector("#v11-hotte-expand")?.addEventListener("click", () => setWidgetReduced(false));
    }
    selectWidgetTab("agenda");
  }

  function setWidgetReduced(reduced) {
    const expanded = document.getElementById("v11-hotte-float-expanded");
    const compact = document.getElementById("v11-hotte-expand");
    if (!expanded || !compact) return;
    expanded.hidden = reduced;
    compact.hidden = !reduced;
    if (reduced) compact.focus(); else document.getElementById("v11-hotte-minimize")?.focus();
  }

  function selectWidgetTab(name) {
    const panel = document.getElementById("v11-partner-widget-panel");
    if (!panel) return;
    panel.querySelectorAll("[data-v11-widget-tab]").forEach((button) => {
      const selected = button.dataset.v11WidgetTab === name;
      button.setAttribute("aria-selected", String(selected));
      button.classList.toggle("is-selected", selected);
    });
    const agenda = panel.querySelector(".v11-partner-widget-shell");
    if (agenda) agenda.hidden = name !== "agenda";
    for (const value of ["hotte", "helloasso"]) {
      const block = document.getElementById("v11-widget-" + value);
      if (block) block.hidden = value !== name;
    }
  }

  function openHotte() {
    if (!authorized()) return;
    const panel = document.getElementById("v11-hotte-panel");
    if (!panel) return;
    if (!panel.querySelector("#v11-hotte-dashboard")) {
      panel.innerHTML = `
        <section id="v11-hotte-dashboard" class="v11-hotte-dashboard">
          <div class="v11-hotte-intro">
            <div><p class="v11-section-label">OUTILS / ÉVÉNEMENTS ASSOCIATIFS</p>
              <h3>Hotte de Noël · Édition 2026</h3>
              <p>Gestion et consultation du parcours public, intégrées à l'Admin V11 sur le modèle du module NFC.</p></div>
            <span class="v11-chip neutral">Brouillon · simulation</span>
          </div>
          <div class="v11-hotte-tabs" id="v11-hotte-navigation" aria-label="Navigation Hotte">
            <button type="button" data-v11-hotte-tab="gestion" aria-selected="true">Gestion de la Hotte</button>
            <button type="button" data-v11-hotte-tab="visiteur" aria-selected="false">Aperçu visiteur</button>
          </div>
          <div class="v11-hotte-section" id="v11-hotte-gestion">
            <div class="v11-hotte-kpis">
              <article><span>Participants vérifiés</span><strong>24</strong><small>Fictifs, aucune adresse réelle</small></article>
              <article><span>Lots proposés</span><strong id="v11-hotte-total-lots">—</strong><small>Données de démonstration</small></article>
              <article><span>Lots validés</span><strong id="v11-hotte-accepted-lots">—</strong><small>Simulation de validation</small></article>
              <article><span>Valeur neuve validée</span><strong id="v11-hotte-total-value">—</strong><small>Estimation fictive en euros</small></article>
            </div>
            <div class="v11-hotte-detail-grid">
              <section class="v11-hotte-box"><h4>État de l'opération</h4>
                <p><strong>Participation :</strong> fermée · <strong>Tirage :</strong> non exécuté · <strong>Livraison :</strong> par les auteurs.</p>
                <p>Frais de port à la charge du gagnant : <strong>option C sous réserve de validation juridique</strong>. Délai de réclamation projeté : 14 jours.</p>
                <div class="v11-hotte-lock">Aucun contrôle réel d'inscription, paiement, tirage, expédition ou messagerie dans ce laboratoire.</div>
              </section>
              <section class="v11-hotte-box"><h4>Contrôles avant activation</h4>
                <p>Engagements des auteurs, règlement, source et valeur des ouvrages, gestion des adresses, réception des e-mails et preuve de tirage.</p>
                <p>Tout reste <strong>hors production</strong> tant que la recette juridique, technique et Safari n'est pas achevée.</p>
              </section>
            </div>
            <section class="v11-hotte-box">
              <div class="v11-hotte-heading"><h4>Inventaire fictif des cadeaux</h4><button type="button" id="v11-hotte-reset" class="v11-button secondary">Réinitialiser</button></div>
              <div class="v11-hotte-table-wrap"><table class="v11-hotte-table">
                <thead><tr><th>Ouvrage / auteur fictifs</th><th>Format</th><th>Valeur neuve</th><th>Statut</th></tr></thead>
                <tbody id="v11-hotte-lots-body"></tbody></table></div>
              <form id="v11-hotte-lot-form" class="v11-hotte-form">
                <label>Ouvrage fictif<input name="title" type="text" maxlength="100" required placeholder="Titre de démonstration"></label>
                <label>Auteur fictif<input name="author" type="text" maxlength="80" required placeholder="Auteur de démonstration"></label>
                <label>Format<select name="format"><option value="Papier">Papier</option><option value="Numérique">Numérique</option></select></label>
                <label>Valeur neuve (€)<input name="price" type="number" min="0" max="500" step="0.01" required placeholder="18.90"></label>
                <button type="submit" class="v11-button secondary">Ajouter (démo)</button>
              </form>
              <p id="v11-hotte-feedback" class="v11-hotte-note" role="status" aria-live="polite">Les changements disparaissent au rechargement. Aucune donnée enregistrée.</p>
            </section>
            <section class="v11-hotte-box"><h4>Traçabilité et expéditions</h4>
              <p>Gagnants, réclamations, confirmations des auteurs et incidents seront supervisés ici lorsque le backend privé aura été conçu et audité.</p>
              <div class="v11-hotte-lock">Rôles et droits à définir avant raccordement : un auteur n'accédera qu'aux envois de ses propres lots.</div>
            </section>
          </div>
          <section class="v11-hotte-section" id="v11-hotte-visiteur" hidden>
            <div class="v11-hotte-visitor-head"><div><h4>Visiteur : prévisualisation de la Hotte</h4>
              <p>Page fictive isolée du navigateur administrateur. Aucune donnée personnelle ni clé Supabase ne lui est transmise.</p></div>
              <a href="${PUBLIC_PREVIEW}" target="_blank" rel="noopener noreferrer">Ouvrir dans un onglet séparé</a>
            </div>
            <div class="v11-hotte-preview-frame">
              <iframe id="v11-hotte-visitor-iframe" title="Aperçu fictif du site visiteur de la Hotte de Noël"
                sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy"></iframe>
            </div>
            <p class="v11-hotte-note">Si le navigateur bloque l'aperçu intégré, utilisez le lien ci-dessus. Ce cadre ne doit jamais charger une page de gestion authentifiée.</p>
          </section>
        </section>`;

      panel.querySelector("#v11-hotte-navigation")?.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-v11-hotte-tab]");
        if (trigger) selectHotteTab(trigger.dataset.v11HotteTab);
      });

      panel.querySelector("#v11-hotte-lot-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!authorized()) return;
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const title = String(data.get("title") || "").trim();
        const author = String(data.get("author") || "").trim();
        const format = String(data.get("format") || "");
        const price = Number(data.get("price"));
        if (!title || !author || !["Papier", "Numérique"].includes(format) ||
            !Number.isFinite(price) || price < 0 || price > 500) {
          setFeedback("Saisie fictive invalide.");
          return;
        }
        lots.push({ title, author, format, price, accepted: false });
        form.reset();
        renderLots();
        setFeedback("Lot fictif ajouté en mémoire, sans écriture en base.");
      });

      panel.querySelector("#v11-hotte-reset")?.addEventListener("click", () => {
        lots = initialLots.map((lot) => ({ ...lot }));
        renderLots();
        setFeedback("Simulation réinitialisée.");
      });

      renderLots();
    }
    selectHotteTab("gestion");
  }

  function setFeedback(text) {
    const feedback = document.getElementById("v11-hotte-feedback");
    if (feedback) feedback.textContent = text;
  }

  function renderLots() {
    const body = document.getElementById("v11-hotte-lots-body");
    if (!body) return;
    body.replaceChildren();
    lots.forEach((lot, i) => {
      const row = document.createElement("tr");
      const bookCell = document.createElement("td");
      const name = document.createElement("strong");
      name.textContent = lot.title;
      const author = document.createElement("small");
      author.textContent = lot.author;
      bookCell.append(name, document.createElement("br"), author);
      const formatCell = document.createElement("td");
      formatCell.textContent = lot.format;
      const priceCell = document.createElement("td");
      priceCell.textContent = euro(lot.price);
      const statusCell = document.createElement("td");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = lot.accepted;
      checkbox.setAttribute("aria-label", "Valider fictivement " + lot.title);
      checkbox.addEventListener("change", () => {
        lot.accepted = checkbox.checked;
        renderLots();
        setFeedback("Validation fictive modifiée localement.");
      });
      label.append(checkbox, document.createTextNode(" " + (lot.accepted ? "Validé (démo)" : "À vérifier")));
      statusCell.append(label);
      row.append(bookCell, formatCell, priceCell, statusCell);
      body.append(row);
    });
    const set = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };
    set("v11-hotte-total-lots", String(lots.length));
    set("v11-hotte-accepted-lots", String(lots.filter((lot) => lot.accepted).length));
    set("v11-hotte-total-value", euro(lots.filter((lot) => lot.accepted).reduce((a, b) => a + b.price, 0)));
  }

  function euro(amount) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
  }

  function selectHotteTab(tab) {
    const visible = tab === "visiteur" ? "visiteur" : "gestion";
    document.querySelectorAll("[data-v11-hotte-tab]").forEach((button) => {
      const selected = button.dataset.v11HotteTab === visible;
      button.setAttribute("aria-selected", String(selected));
      button.classList.toggle("is-selected", selected);
    });
    const management = document.getElementById("v11-hotte-gestion");
    const visitor = document.getElementById("v11-hotte-visiteur");
    if (management) management.hidden = visible !== "gestion";
    if (visitor) visitor.hidden = visible !== "visiteur";
    if (visible === "visiteur") {
      const frame = document.getElementById("v11-hotte-visitor-iframe");
      if (frame && !frame.getAttribute("src")) frame.setAttribute("src", PUBLIC_PREVIEW);
    }
  }

  window.DEDICALIVRES_V11_HOTTE_TOOLS = Object.freeze({
    openWidgets,
    openHotte
  });
})();
