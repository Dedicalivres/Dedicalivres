/*
  DÉDICALIVRES — ADMIN SUPERVISION V1
*/
(function () {
  "use strict";
  const config = window.DEDICALIVRES_CONFIG;
  if (!config || !window.supabase) { alert("Configuration Supabase manquante."); return; }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const state = { session:null, events:[], authors:[], visits:[], statusFilter:"pending", typeFilter:"", search:"" };
  const els = {};
  document.addEventListener("DOMContentLoaded", init);

  async function init(){ cacheDom(); bindEvents(); await checkSession(); }
  function cacheDom(){
    ["login-panel","admin-panel","email","password","login-button","login-message","logout-button","refresh-button","admin-count","events-list","admin-search","admin-status-filter","admin-type-filter","visits-today-big","visits-total-odo","visits-week","unique-today","pages-per-visit","best-page","visits-bars","top-pages","quick-pending","quick-published","quick-featured","newsletter-count","author-presence-count","author-presence-search","author-presence-list","insta-soon-count","insta-needs-work-count","insta-featured-candidates-count","generate-weekly-review","instagram-output","copy-instagram-output","clear-instagram-output"].forEach(id=>els[toCamel(id)]=document.getElementById(id));
  }
  function bindEvents(){
    els.loginButton?.addEventListener("click", handleLogin);
    els.password?.addEventListener("keydown", e=>{ if(e.key==="Enter") handleLogin(); });
    els.logoutButton?.addEventListener("click", handleLogout);
    els.refreshButton?.addEventListener("click", loadAll);
    els.adminSearch?.addEventListener("input", ()=>{ state.search=els.adminSearch.value.trim(); renderEvents(); });
    els.adminStatusFilter?.addEventListener("change", ()=>{ state.statusFilter=els.adminStatusFilter.value; renderEvents(); });
    els.adminTypeFilter?.addEventListener("change", ()=>{ state.typeFilter=els.adminTypeFilter.value; renderEvents(); });
    els.authorPresenceSearch?.addEventListener("input", renderAuthors);
    els.eventsList?.addEventListener("click", handleEventAction);
    els.generateWeeklyReview?.addEventListener("click", generateWeeklyReview);
    els.copyInstagramOutput?.addEventListener("click", copyInstagram);
    els.clearInstagramOutput?.addEventListener("click", ()=>{ if(els.instagramOutput) els.instagramOutput.value=""; });
  }
  async function checkSession(){ const {data}=await client.auth.getSession(); state.session=data?.session||null; if(state.session){ showAdmin(); await loadAll(); } else showLogin(); }
  async function handleLogin(){
    const email=els.email?.value.trim()||"", password=els.password?.value||"";
    if(!email||!password){ showLoginMessage("Email et mot de passe obligatoires.","error"); return; }
    setLoginLoading(true); showLoginMessage("Connexion en cours…","");
    try{ const {data,error}=await client.auth.signInWithPassword({email,password}); if(error) throw error; state.session=data.session; showAdmin(); await loadAll(); }
    catch(error){ console.error(error); showLoginMessage("Connexion impossible : "+error.message,"error"); showLogin(); }
    finally{ setLoginLoading(false); }
  }
  async function handleLogout(){ await client.auth.signOut(); state.session=null; state.events=[]; showLogin(); }
  function showAdmin(){ els.loginPanel?.classList.add("hidden"); els.adminPanel?.classList.remove("hidden"); }
  function showLogin(){ els.adminPanel?.classList.add("hidden"); els.loginPanel?.classList.remove("hidden"); }
  function showLoginMessage(text,type){ if(els.loginMessage){ els.loginMessage.textContent=text; els.loginMessage.className="message "+(type||""); } }
  function setLoginLoading(v){ if(els.loginButton){ els.loginButton.disabled=v; els.loginButton.textContent=v?"Connexion…":"Connexion"; } }

  async function loadAll(){
    setText(els.adminCount,"Chargement des données…");
    await Promise.allSettled([loadEvents(),loadVisits(),loadNewsletter(),loadAuthors()]);
    renderAll();
  }
  async function loadEvents(){ const {data,error}=await client.from("events").select("*").order("created_at",{ascending:false}); if(error){console.error(error); state.events=[]; setText(els.adminCount,"Impossible de charger les événements."); return;} state.events=Array.isArray(data)?data:[]; }
  async function loadVisits(){ const {data,error}=await client.from("site_visits").select("created_at,path,page_title,user_agent").order("created_at",{ascending:false}).limit(5000); if(error){ console.warn("Stats indisponibles :",error); state.visits=[]; return; } state.visits=Array.isArray(data)?data:[]; }
  async function loadNewsletter(){ const {count,error}=await client.from("newsletter_subscribers").select("*",{count:"exact",head:true}); setText(els.newsletterCount,error?"—":(count||0)); }
  async function loadAuthors(){
    const {data,error}=await client.from("event_authors_presence").select("id,pseudo,website,author_slug,validated,created_at,event_id,events(id,title,city,region,start_date)").order("created_at",{ascending:false});
    if(error){ console.warn("Auteurs indisponibles :", error); state.authors=[]; return; } state.authors=Array.isArray(data)?data:[];
  }
  function renderAll(){ renderStats(); renderQuickStats(); renderEvents(); renderAuthors(); renderInstagramStats(); setText(els.adminCount,`${state.events.length} événement${state.events.length>1?"s":""} au total.`); }

  function renderStats(){
    const visits=state.visits, today=dateKey(new Date()), weekStart=startOfDay(addDays(new Date(),-6));
    const todayVisits=visits.filter(v=>v.created_at && dateKey(new Date(v.created_at))===today);
    const weekVisits=visits.filter(v=>v.created_at && new Date(v.created_at)>=weekStart);
    setText(els.visitsTodayBig,todayVisits.length); setText(els.visitsTotalOdo,visits.length); setText(els.visitsWeek,weekVisits.length);
    setText(els.uniqueToday,`Visiteurs estimés : ${new Set(todayVisits.map(v=>v.user_agent||"inconnu")).size}`);
    const uniqueTotal=new Set(visits.map(v=>v.user_agent||"inconnu")).size||1; setText(els.pagesPerVisit,`Pages / visite : ${(visits.length/uniqueTotal).toFixed(1)}`);
    const top=getTopPages(visits)[0]; setText(els.bestPage,top?cleanPath(top.path):"—");
    renderVisitsBars(weekVisits); renderTopPages(visits);
  }
  function renderVisitsBars(weekVisits){
    if(!els.visitsBars) return;
    const days=Array.from({length:7},(_,i)=>{ const d=addDays(new Date(),i-6), key=dateKey(d), count=weekVisits.filter(v=>dateKey(new Date(v.created_at))===key).length; return {count,label:new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(d)}; });
    const max=Math.max(1,...days.map(d=>d.count));
    els.visitsBars.innerHTML=days.map(d=>`<div class="bar-item"><span class="bar-value">${d.count}</span><div class="bar-track"><div class="bar-fill" style="height:${Math.max(7,Math.round(d.count/max*100))}%"></div></div><span class="bar-label">${escapeHtml(d.label)}</span></div>`).join("");
  }
  function renderTopPages(visits){
    if(!els.topPages) return; const rows=getTopPages(visits).slice(0,8);
    els.topPages.innerHTML=rows.length?rows.map(r=>`<div class="top-page-row"><span>${escapeHtml(cleanPath(r.path))}</span><strong>${r.count}</strong></div>`).join(""):`<p class="empty">Aucune visite enregistrée.</p>`;
  }
  function getTopPages(visits){ const map=new Map(); visits.forEach(v=>{const p=v.path||"/"; map.set(p,(map.get(p)||0)+1);}); return [...map.entries()].map(([path,count])=>({path,count})).sort((a,b)=>b.count-a.count); }
  function renderQuickStats(){
    setText(els.quickPending,state.events.filter(e=>!e.validated&&!e.rejected).length);
    setText(els.quickPublished,state.events.filter(e=>e.validated&&!e.rejected).length);
    setText(els.quickFeatured,state.events.filter(e=>e.featured).length);
    setText(els.authorPresenceCount,state.authors.length);
  }
  function renderEvents(){
    if(!els.eventsList) return; const filtered=getFilteredEvents();
    els.eventsList.innerHTML=filtered.length?filtered.map(renderEventCard).join(""):`<p class="empty">Aucun événement dans cette vue.</p>`;
  }
  function getFilteredEvents(){
    const search=normalize(state.search), status=state.statusFilter, type=state.typeFilter;
    return state.events.filter(e=>{
      const hay=normalize([e.title,e.city,e.region,e.type,e.description,e.source_label].filter(Boolean).join(" "));
      if(search&&!hay.includes(search)) return false; if(type&&e.type!==type) return false;
      if(status==="pending") return !e.validated&&!e.rejected; if(status==="published") return !!e.validated&&!e.rejected; if(status==="featured") return !!e.featured; if(status==="rejected") return !!e.rejected; return true;
    });
  }
  function renderEventCard(e){
    const status=getStatus(e), img=resolveImage(e.image_url);
    return `<article class="event-card-admin" data-event-id="${escapeAttribute(e.id)}">${img?`<img class="event-thumb" src="${escapeAttribute(img)}" alt="${escapeAttribute(e.title||"Événement")}" />`:`<div class="event-thumb-placeholder"></div>`}<div class="event-content"><div class="badges"><span class="badge ${status}">${statusLabel(status)}</span>${e.type?`<span class="badge">${escapeHtml(e.type)}</span>`:""}${e.featured?`<span class="badge featured">Mis en avant</span>`:""}${e.verified?`<span class="badge verified">Vérifié</span>`:""}</div><h3>${escapeHtml(e.title||"Sans titre")}</h3><div class="event-meta"><span>📍 ${escapeHtml([e.city,e.region].filter(Boolean).join(", ")||"Lieu non renseigné")}</span><span>📅 ${escapeHtml(formatDateRange(e.start_date,e.end_date))}</span>${e.website?`<span>🔗 <a href="${escapeAttribute(e.website)}" target="_blank" rel="noopener">Site officiel</a></span>`:""}</div><p class="event-description">${escapeHtml(e.description||"Aucune description.")}</p><div class="event-actions">${(!e.validated||e.rejected)?`<button type="button" data-action="validate" data-id="${escapeAttribute(e.id)}">Valider</button>`:""}${!e.rejected?`<button class="danger" type="button" data-action="reject" data-id="${escapeAttribute(e.id)}">Refuser</button>`:""}<button class="secondary" type="button" data-action="toggle-featured" data-id="${escapeAttribute(e.id)}">${e.featured?"Retirer avant":"Mettre en avant"}</button><button class="secondary" type="button" data-action="toggle-verified" data-id="${escapeAttribute(e.id)}">${e.verified?"Retirer vérif.":"Vérifier"}</button><a class="button-link" href="event.html?id=${encodeURIComponent(e.id)}" target="_blank">Voir</a><button class="danger" type="button" data-action="delete" data-id="${escapeAttribute(e.id)}">Supprimer</button></div></div></article>`;
  }
  async function handleEventAction(event){
    const b=event.target.closest("button[data-action]"); if(!b) return; const id=b.dataset.id, action=b.dataset.action, current=state.events.find(x=>String(x.id)===String(id)); if(!current) return; b.disabled=true;
    try{ if(action==="validate") await updateEvent(id,{validated:true,rejected:false}); if(action==="reject") await updateEvent(id,{validated:false,rejected:true}); if(action==="toggle-featured") await updateEvent(id,{featured:!current.featured}); if(action==="toggle-verified") await updateEvent(id,{verified:!current.verified}); if(action==="delete"&&confirm(`Supprimer définitivement « ${current.title||"cet événement"} » ?`)) await deleteEvent(id); }
    catch(err){ console.error(err); alert("Action impossible : "+err.message); } finally{ b.disabled=false; }
  }
  async function updateEvent(id,patch){ const {data,error}=await client.from("events").update(patch).eq("id",id).select("*"); if(error) throw error; if(!data?.length) throw new Error("Aucune ligne modifiée. Vérifie les droits RLS."); state.events=state.events.map(e=>String(e.id)===String(id)?data[0]:e); renderAll(); }
  async function deleteEvent(id){ const {error}=await client.from("events").delete().eq("id",id); if(error) throw error; state.events=state.events.filter(e=>String(e.id)!==String(id)); renderAll(); }
  function renderAuthors(){
    if(!els.authorPresenceList) return; const q=normalize(els.authorPresenceSearch?.value||"");
    const rows=state.authors.filter(r=>{const ev=r.events||{}; return !q||normalize([r.pseudo,r.website,r.author_slug,ev.title,ev.city,ev.region].filter(Boolean).join(" ")).includes(q);});
    setText(els.authorPresenceCount,rows.length);
    els.authorPresenceList.innerHTML=rows.length?rows.slice(0,20).map(r=>{const ev=r.events||{}; return `<div class="author-row"><span><strong>${escapeHtml(r.pseudo||"Auteur")}</strong><small>${escapeHtml(ev.title||"Événement inconnu")}${ev.city?" — "+escapeHtml(ev.city):""}</small><small>${r.website?escapeHtml(r.website):"Site non renseigné"}</small></span><strong>${r.validated?"OK":"À voir"}</strong></div>`;}).join(""):`<p class="empty">Aucun auteur déclaré.</p>`;
  }
  function renderInstagramStats(){ const today=startOfDay(new Date()), in14=addDays(today,14); const upcoming=state.events.filter(e=>{const d=e.start_date?new Date(e.start_date):null; return e.validated&&!e.rejected&&d&&d>=today&&d<=in14;}); setText(els.instaSoonCount,upcoming.length); setText(els.instaNeedsWorkCount,upcoming.filter(e=>!e.image_url||!e.description||!e.city||!e.website).length); setText(els.instaFeaturedCandidatesCount,upcoming.filter(e=>!e.featured).length); }
  function generateWeeklyReview(){ if(!els.instagramOutput) return; const today=startOfDay(new Date()), in14=addDays(today,14); const upcoming=state.events.filter(e=>{const d=e.start_date?new Date(e.start_date):null; return e.validated&&!e.rejected&&d&&d>=today&&d<=in14;}).slice(0,8); els.instagramOutput.value=upcoming.length?["📚 Les prochains rendez-vous Dédicalivres","",...upcoming.map(e=>`• ${e.title||"Événement"} — ${formatDateRange(e.start_date,e.end_date)} — ${e.city||"ville à préciser"}`),"","#dedicalivres #salondulivre #dedicace #lecture #auteurs"].join("\n"):"Aucun événement validé à venir dans les 14 prochains jours."; }
  async function copyInstagram(){ if(!els.instagramOutput) return; await navigator.clipboard.writeText(els.instagramOutput.value||""); alert("Texte copié."); }

  function getStatus(e){ if(e.rejected) return "rejected"; if(e.validated) return "published"; return "pending"; }
  function statusLabel(s){ return s==="published"?"Publié":s==="rejected"?"Refusé":"À valider"; }
  function formatDateRange(s,e){ if(!s) return "Date non renseignée"; const a=formatDate(s), b=e&&e!==s?formatDate(e):""; return b?`${a} → ${b}`:a; }
  function formatDate(v){ return new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v)); }
  function resolveImage(path){ if(!path) return ""; return /^https?:\/\//i.test(path)?path:`${config.assetsBaseUrl||""}${path}`; }
  function cleanPath(p){ return (p||"/").replace(/^\//,"")||"/"; }
  function setText(el,v){ if(el) el.textContent=String(v); }
  function dateKey(d){ return d.toISOString().slice(0,10); }
  function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function normalize(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g," ").toLowerCase().trim(); }
  function escapeHtml(v){ return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
  function escapeAttribute(v){ return escapeHtml(v).replace(/`/g,"&#096;"); }
  function toCamel(id){ return id.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()); }
})();
