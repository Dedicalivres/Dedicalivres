import {analyzeQuality} from './scripts/territorial-quality.mjs';
const context=window.DEDICALIVRES_ADMIN_CONTEXT;
const host=document.getElementById('v11-territorial-quality');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let assets,filter='upcoming',state,loadError=false;
function render(next){
 state=next;
 if(!host)return;
 if(!state?.authenticated){host.hidden=true;host.replaceChildren();return;}
 host.hidden=false;
 if(loadError){host.textContent='Contrôle territorial indisponible. Aucune annonce modifiée.';return;}
 if(!assets||state.status!=='ready'){
  host.textContent=state.status==='error'?'Catalogue admin indisponible : contrôle territorial non effectué.':'Chargement des contrôles territoriaux…';return;
 }
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
 const issues=analyzeQuality(state.events||[],assets[0],assets[1],today);
 const ids=new Set(issues.map(e=>e.id));
 const urgent=new Set(issues.filter(e=>e.published&&['future','ongoing','undated','invalid'].includes(e.status)).map(e=>e.id));
 const selected=issues.filter(e=>filter==='all'||(e.published&&['future','ongoing','undated','invalid'].includes(e.status)));
 const groups=new Map();for(const issue of selected)groups.set(issue.id,[...(groups.get(issue.id)||[]),issue]);
 host.innerHTML=`<div class="v11-panel-head"><div><p class="v11-section-label">AIDE AU CONTRÔLE</p><h3>Anomalies territoriales à vérifier</h3></div></div><p><strong>${ids.size} annonce(s) signalée(s)</strong>, dont ${urgent.size} publiée(s) à venir ou aux dates à confirmer. Aucun retrait ni correction automatique.</p><label for="v11-territorial-scope">Afficher</label> <select id="v11-territorial-scope"><option value="upcoming"${filter==='upcoming'?' selected':''}>Publiées à venir / dates à confirmer</option><option value="all"${filter==='all'?' selected':''}>Toutes les alertes, archives comprises</option></select><p>Contrôle des ${(state.events||[]).length} annonces chargées. Le chargement actuel de l’admin est plafonné à 1 000 annonces.</p><p>Ouvrez la fiche pour vérifier les données et utiliser l’éditeur existant. Les contrôles sont recalculés après l’enregistrement ; une correction conforme fait disparaître son alerte.</p><ul class="v11-territorial-issues">${[...groups].map(([id,list])=>{
 const e=list[0];return `<li data-quality-event-id="${esc(id)}"><h4>${esc(e.title)}</h4><p>${esc(e.city)} · ${esc(e.region)} · ${esc(e.country)} — ${esc(e.start_date||'Date absente')}${e.end_date&&e.end_date!==e.start_date?' → '+esc(e.end_date):''} · ${e.published?'Publiée':'À valider'}</p><ul>${list.map(x=>`<li>${esc(x.reason)}${x.source?` <a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer">Source à contrôler</a>${x.checkedOn?` (consultée le ${esc(x.checkedOn)})`:""}`:''}</li>`).join('')}</ul><button type="button" class="v11-event-detail-trigger" data-event-detail="${esc(id)}">Vérifier / corriger la fiche</button></li>`;
 }).join('')}</ul>${groups.size?'':'<p>Aucune alerte dans cette sélection. Cela ne constitue pas une vérification exhaustive des annonces.</p>'}`;
 host.querySelector('select').addEventListener('change',event=>{filter=event.target.value;render(state);host.querySelector('select').focus();});
}
if(context&&host){
 context.subscribe(render);
 Promise.all(['docs/territoires/referentiel.json','docs/territoires/signalements.json'].map(async path=>{
  const response=await fetch(path);if(!response.ok)throw Error('Contrôles indisponibles');return response.json();
 })).then(value=>{assets=value;render(context.getState());}).catch(()=>{loadError=true;render(context.getState());});
}
