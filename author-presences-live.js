/* Actualisation publique des présences; aucune session ADMIN ni écriture. */
(function(root) {
  "use strict";
  const ids = ["ongoing", "upcoming", "past"];
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const clean = v => String(v ?? "").trim();
  const dayParis = now => new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  function classify(rows, today) {
    const groups = {ongoing:[],upcoming:[],past:[]}, seen = new Set();
    for (const row of rows) {
      const e = row.events;
      if (row.validated !== true || row.rejected === true || row.archived_at !== null ||
          !e || e.validated !== true || e.rejected !== false || !uuid.test(e.id) || seen.has(e.id)) continue;
      seen.add(e.id);
      const start = clean(e.start_date), end = clean(e.end_date || start);
      groups[end && end < today ? "past" : start && start <= today ? "ongoing" : "upcoming"].push(e);
    }
    for (const id of ids) groups[id].sort((a,b) => (id === "past" ? -1 : 1) *
      clean(a.start_date || "9999").localeCompare(clean(b.start_date || "9999")) || a.id.localeCompare(b.id));
    return groups;
  }
  async function load(slug, cfg, fetcher) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !cfg?.supabaseUrl || !cfg?.supabaseAnonKey) throw Error("Configuration");
    const base = cfg.supabaseUrl.replace(/\/$/,"") + "/rest/v1/";
    const headers = {apikey:cfg.supabaseAnonKey, Authorization:"Bearer " + cfg.supabaseAnonKey};
    async function query(table, params) {
      const r = await fetcher(base + table + "?" + new URLSearchParams(params), {headers,cache:"no-store",credentials:"omit"});
      if (!r.ok) throw Error("Lecture publique " + r.status);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw Error("Réponse invalide");
      return rows;
    }
    const authors = await query("authors",{select:"id",slug:"eq."+slug,validated:"eq.true",published:"eq.true",publication_ready:"eq.true",editorial_status:"eq.READY",merged_into:"is.null",limit:"2"});
    if (!authors.length) return null;
    if (authors.length !== 1 || !uuid.test(authors[0].id)) throw Error("Identité ambiguë");
    const all = [];
    for (let offset=0; offset<10000; offset+=100) {
      const rows = await query("event_authors_presence",{
        select:"id,validated,rejected,archived_at,events(id,title,city,country_code,region,start_date,end_date,type,image_url,validated,rejected)",
        author_id:"eq."+authors[0].id,validated:"eq.true",rejected:"not.is.true",archived_at:"is.null",
        order:"id.asc",limit:"100",offset:String(offset)});
      all.push(...rows);
      if (rows.length < 100) return all;
    }
    throw Error("Pagination incomplète");
  }
  function render(doc, event) {
    const el = (tag, cls, value) => {const n=doc.createElement(tag); if(cls)n.className=cls; if(value)n.textContent=value; return n;};
    const date = v => {if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return "Date à confirmer"; return new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(v+"T00:00:00Z"));};
    const card=el("article","event-card"); card.dataset.eventId=event.id;
    const title=clean(event.title)||"Sans titre";
    let image;
    try {const u=new URL(event.image_url,root.location.origin); if(event.image_url && ["https:","http:"].includes(u.protocol)){image=el("img","card-image");image.src=u.href;image.alt=title;image.loading="lazy";}} catch {}
    card.append(image||el("div","card-image"));
    const body=el("div","card-body");
    if(event.type){const tags=el("div","card-tags");tags.append(el("span","badge",event.type));body.append(tags);}
    body.append(el("h3","card-title",title));
    const meta=el("div","card-meta");
    const label=date(event.start_date)+(event.end_date && event.end_date!==event.start_date?" – "+date(event.end_date):"");
    const country=({FR:"France",BE:"Belgique",CH:"Suisse",LU:"Luxembourg",MC:"Monaco"})[event.country_code]||event.country_code;
    const place=[...new Set([event.city,event.region,country].map(clean).filter(Boolean))].join(" · ");
    meta.append(el("span","", "📅 "+label),el("span","", "📍 "+(place||"Lieu non précisé")));body.append(meta);
    const footer=el("div","card-footer"),link=el("a","card-link","Voir le détail");
    link.href=root.DEDICALIVRES_EVENT_CANONICAL?.href(event.id)||"/event.html?id="+encodeURIComponent(event.id);
    footer.append(link);body.append(footer);card.append(body);return card;
  }
  async function refresh(doc, cfg, fetcher, now=new Date()) {
    const main=doc.querySelector("main[data-generated-author-page][data-author-slug]");
    if(!main)return;
    const grids=ids.map(id=>doc.getElementById("author-events-"+id));
    if(grids.some(g=>!g))return;
    const status=doc.createElement("p");status.className="author-note";status.setAttribute("role","status");
    status.textContent="Actualisation des présences…";grids[0].parentNode.before(status);
    try {
      const rows=await load(main.dataset.authorSlug,cfg,fetcher);
      const groups=classify(rows||[],dayParis(now));
      const fragments=ids.map(id=>{
        const fragment=doc.createDocumentFragment();
        for(const e of groups[id])fragment.append(render(doc,e));
        if(!groups[id].length){const a=doc.createElement("article");a.className="empty-state";const p=doc.createElement("p");p.textContent="Aucun événement "+({ongoing:"en cours",upcoming:"à venir",past:"passé"})[id]+" indiqué.";a.append(p);fragment.append(a);}
        return fragment;
      });
      grids.forEach((g,i)=>g.replaceChildren(fragments[i]));
      status.textContent=rows===null?"Fiche non disponible dans le catalogue public.":"Présences actualisées.";
    } catch {status.textContent="Actualisation indisponible : affichage de la dernière version enregistrée.";}
  }
  if(typeof module==="object" && module.exports) module.exports={classify,load,dayParis,refresh};
  else if(root.document) refresh(root.document,root.DEDICALIVRES_CONFIG,root.fetch.bind(root));
})(typeof window!=="undefined"?window:globalThis);
