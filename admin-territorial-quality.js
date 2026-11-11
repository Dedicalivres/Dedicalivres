import {analyzeQuality,publishedDuplicateGroups} from './scripts/territorial-quality.mjs';
const context=window.DEDICALIVRES_ADMIN_CONTEXT;
const host=document.getElementById('v11-territorial-quality');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let assets,filter='upcoming',kindFilter='all',panelExpanded=false,state,loadError=false;
const KIND_LABELS={geography:'Géographie',dates:'Dates',duplicate:'Doublons',incomplete:'Fiche',other:'Autre'};
const status=e=>e.validated===true&&e.rejected!==true?'Validée en base':e.rejected===true?'Rejetée':'À valider';
const dates=e=>`${e.start_date||'Date absente'}${e.end_date&&e.end_date!==e.start_date?' → '+e.end_date:''}`;
function duplicateComparisons(events){
 const groups=publishedDuplicateGroups(events);
 if(!groups.length)return '<p>Aucun doublon publié exact détecté dans les annonces chargées.</p>';
 return `<div class="v11-duplicate-groups">${groups.map((group,index)=>`<section class="v11-duplicate-group" aria-labelledby="v11-duplicate-${index}"><h4 id="v11-duplicate-${index}">Doublon potentiel · décision humaine requise</h4><p>Comparez les fiches, choisissez celle à conserver, puis ouvrez uniquement celle à supprimer. Aucune suppression automatique.</p><div class="v11-duplicate-comparison">${group.map(e=>`<article class="v11-duplicate-card">${e.image_url?`<img src="${esc(e.image_url)}" alt="Image de ${esc(e.title||'l’événement')}" loading="lazy">`:'<div class="v11-duplicate-image-empty">Aucune image</div>'}<dl><dt>Titre</dt><dd>${esc(e.title||'Sans titre')}</dd><dt>Ville / pays</dt><dd>${esc(e.city||'Non renseignée')} · ${esc(e.country_code||'Non renseigné')}</dd><dt>Dates</dt><dd>${esc(dates(e))}</dd><dt>Type</dt><dd>${esc(e.type||'Non renseigné')}</dd><dt>Statut</dt><dd>${esc(status(e))}</dd><dt>Création</dt><dd>${esc(e.created_at||'Non disponible')}</dd><dt>ID</dt><dd><code>${esc(e.id)}</code></dd></dl><button type="button" class="v11-event-detail-trigger" data-event-detail="${esc(e.id)}">Ouvrir cette fiche</button></article>`).join('')}</div></section>`).join('')}</div>`;
}
function render(next){
 const previous=host?.querySelector('#v11-territorial-details');
 if(previous)panelExpanded=previous.open;
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
 const scoped=issues.filter(e=>filter==='all'||(e.published&&['future','ongoing','undated','invalid'].includes(e.status)));
 const selected=scoped.filter(e=>kindFilter==='all'||(KIND_LABELS[e.kind]?e.kind:'other')===kindFilter);
 const groups=new Map();for(const issue of selected)groups.set(issue.id,[...(groups.get(issue.id)||[]),issue]);
 const duplicateCount=publishedDuplicateGroups(state.events||[]).length;
 const categories=[['all','Toutes'],['geography','Géographie'],['dates','Dates'],['duplicate','Doublons'],['incomplete','Fiches'],['other','Autres']];
 const kindButtons=categories.map(([key,label])=>{
  const count=new Set(scoped.filter(e=>key==='all'||(KIND_LABELS[e.kind]?e.kind:'other')===key).map(e=>e.id)).size;
  if(!count && key!=='all')return '';
  return `<button type='button' class='v11-quality-tag' data-quality-kind='${key}' aria-pressed='${kindFilter===key}'>${label} (${count})</button>`;
 }).join('');
 host.innerHTML=`<details id='v11-territorial-details' class='v11-quality-collapsible'${panelExpanded?' open':''}><summary class='v11-quality-summary'><strong>Contrôles qualité</strong><span>${urgent.size} priorité(s) · ${ids.size} fiche(s) signalée(s) · ${duplicateCount} groupe(s) doublon</span><span class='v11-quality-expand'>Détails</span></summary><div class='v11-quality-content'><details class='v11-duplicate-review'><summary>Comparer les doublons publiés (${duplicateCount})</summary>${duplicateComparisons(state.events||[])}<p>Seul un administrateur peut décider une suppression. Aucun retrait automatique.</p></details><div class='v11-quality-tools'><label for='v11-territorial-scope'>Périmètre</label><select id='v11-territorial-scope'><option value='upcoming'${filter==='upcoming'?' selected':''}>Validées à venir / dates à confirmer</option><option value='all'${filter==='all'?' selected':''}>Toutes, archives comprises</option></select></div><div class='v11-quality-tags' role='group' aria-label='Filtrer les anomalies par catégorie'>${kindButtons}</div><p class='v11-quality-hint'>${(state.events||[]).length} fiches chargées dans le catalogue complet. Les contrôles sont informatifs et ne déclenchent aucun retrait. Cliquez sur une fiche pour la vérifier.</p><ul class='v11-territorial-issues'>${[...groups].map(([id,list])=>{
 const e=list[0];return `<li data-quality-event-id="${esc(id)}"><h4>${esc(e.title)}</h4><p>${esc(e.city)} · ${esc(e.region)} · ${esc(e.country)} — ${esc(e.start_date||'Date absente')}${e.end_date&&e.end_date!==e.start_date?' → '+esc(e.end_date):''} · ${e.published?'Validée en base':'À valider'}</p><ul>${list.map(x=>`<li><span class='v11-quality-kind'>${esc(KIND_LABELS[x.kind]||'Autre')}</span> <span class='v11-quality-origin'>${x.origin==='documentary'?'Signalement documentaire':'Contrôle automatique'}</span> ${esc(x.reason)}${x.source?` <a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer">Source à contrôler</a>${x.checkedOn?` (consultée le ${esc(x.checkedOn)})`:""}`:''}</li>`).join('')}</ul><button type="button" class="v11-event-detail-trigger" data-event-detail="${esc(id)}">Vérifier / corriger la fiche</button></li>`;
 }).join('')}</ul>${groups.size?'':'<p>Aucune alerte dans cette sélection. Cela ne constitue pas une vérification exhaustive des annonces.</p>'}</div></details>`;
 host.querySelector('#v11-territorial-details').addEventListener('toggle',event=>{panelExpanded=event.currentTarget.open;});
 host.querySelector('select').addEventListener('change',event=>{filter=event.target.value;panelExpanded=true;render(state);host.querySelector('select').focus();});
 host.querySelectorAll('[data-quality-kind]').forEach(button=>button.addEventListener('click',()=>{
  kindFilter=button.dataset.qualityKind;
  panelExpanded=true;
  render(state);
  host.querySelector(`[data-quality-kind='${kindFilter}']`)?.focus();
 }));
}
if(context&&host){
 context.subscribe(render);
 Promise.all(['docs/territoires/referentiel.json','docs/territoires/signalements.json'].map(async path=>{
  const response=await fetch(path);if(!response.ok)throw Error('Contrôles indisponibles');return response.json();
 })).then(value=>{assets=value;render(context.getState());}).catch(()=>{loadError=true;render(context.getState());});
}
