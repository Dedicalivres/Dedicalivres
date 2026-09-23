import {qualify,validDate,eventHref} from './territorial-catalog.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(s));
export const pilots=[
 {id:'FR-BRE',label:'Bretagne',country:'France',code:'FR',countryUrl:'index.html?country=FR#agenda',image:"https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev/event-images/2026/09/1790175488170-ec149276-cbbd-4a3b-bbf8-36d470890eb6.png",imageWidth:2172,imageHeight:724,file:'evenements-litteraires-bretagne.html',canonical:'https://dedicalivres.fr/evenements-litteraires-bretagne',creation:'Date de création publique non établie. Page présente dans le dépôt depuis le 27 avril 2026.'},
 {id:'BE-WAL',label:'Wallonie',country:'Belgique',code:'BE',countryUrl:'evenements-litteraires-belgique.html',image:"https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev/event-images/2026/09/1790175473845-66b96fa3-9e2d-4b0a-8a30-234707af0b67.png",imageWidth:1916,imageHeight:821,file:'evenements-litteraires-wallonie.html',canonical:'https://dedicalivres.fr/evenements-litteraires-wallonie',creation:'Page créée le 22 septembre 2026.'}
];

export function renderTerritory({p,events,registry,verified={},capturedAt,live=false}){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date(capturedAt));
 const {accepted}=qualify(events,registry,[],today);
function item(e){
 const note=verified[e.id];
 const evidence=note&&['start_date','end_date','city','title'].every(k=>note[k]===e[k])?note:null;
 const venue=evidence?`<p>Lieu : ${esc(evidence.venue)} · <a href="${esc(evidence.source)}">Source organisatrice</a></p>`:'';

 const dates=e.status!=='invalid'&&validDate(e.start_date)?(e.end_date&&e.end_date!==e.start_date?`Du <time datetime="${esc(e.start_date)}">${date(e.start_date)}</time> au <time datetime="${esc(e.end_date)}">${date(e.end_date)}</time>`:`<time datetime="${esc(e.start_date)}">${date(e.start_date)}</time>`):'Dates à confirmer';
 return `<li data-event-id="${esc(e.id)}" data-status="${e.status}"><p class="event-date">${dates}${e.status==='ongoing'?' · En cours':''}${e.status==='registration-cancelled'?' · Inscriptions annulées':''}</p><h3><a href="${eventHref(e)}">${esc(String(e.title||'Événement sans titre').trim())}</a></h3><p>${esc(e.city)} · ${esc(e.type)}</p>${venue}<a href="${eventHref(e)}">Voir la fiche et les options d’agenda</a></li>`;
}
function list(rows){return rows.length?`<ul class="territory-list">${rows.map(item).join('\n')}</ul>`:'<p>Aucun événement dans cette catégorie au jour de l’actualisation.</p>';}
 const rows=accepted.filter(e=>e.territoryId===p.id).sort((a,b)=>(a.start_date||'9999').localeCompare(b.start_date||'9999')||String(a.title||'').localeCompare(String(b.title||''),'fr')||String(a.id).localeCompare(String(b.id)));
 const future=rows.filter(e=>['future','ongoing'].includes(e.status));
 const past=rows.filter(e=>e.status==='past');
 const undated=rows.filter(e=>['undated','invalid'].includes(e.status));
 const cancelled=rows.filter(e=>e.status==='registration-cancelled');
 const years=[...new Set(past.map(e=>e.start_date.slice(0,4)))].sort().reverse();
 const stats={total:rows.length,upcoming:future.length,ongoing:future.filter(e=>e.status==='ongoing').length,past:past.length,undated:undated.length,cancelled:cancelled.length,excluded:0};
 const main=`<main id="territory-content" class="container seo-content" data-territory-id="${p.id}" data-as-of="${today}">
 <nav class="territory-breadcrumb" aria-label="Fil d’Ariane"><a href="index.html">Accueil</a><span aria-hidden="true">›</span><a href="${p.countryUrl}">${p.country}</a><span aria-hidden="true">›</span><span aria-current="page">${p.label}</span></nav>
 <img class="territory-banner" src="${esc(p.image)}" width="${p.imageWidth}" height="${p.imageHeight}" alt="${esc(p.country)} · ${esc(p.label)}" fetchpriority="high">
 <section class="territory-hero"><p class="territory-kicker">Explorer les territoires · ${p.country}</p><h1>Les rendez-vous du livre en ${p.label}</h1><p>Salons, festivals et rencontres avec les auteurs : préparez vos prochaines sorties et retrouvez les événements passés.</p><p>${p.creation}<br>Dernière actualisation de ce catalogue : <time datetime="${capturedAt}">${date(today)}</time> (capture publique à ${capturedAt.slice(11,16)} UTC).</p></section>
 <p id="territory-refresh-status" role="status">${live?"Catalogue public actualisé.":"Catalogue enregistré à la date indiquée ci-dessus."}</p><button id="territory-refresh" class="btn-secondary" type="button" hidden>Actualiser le catalogue</button>
 <dl class="territory-stats"><div><dt>Événements référencés ici</dt><dd data-count="total">${stats.total}</dd></div><div><dt>À venir ou en cours</dt><dd data-count="upcoming">${stats.upcoming}</dd></div><div><dt>Dont en cours</dt><dd data-count="ongoing">${stats.ongoing}</dd></div><div><dt>Événements passés</dt><dd data-count="past">${stats.past}</dd></div></dl>
 <nav class="territory-jumps" aria-label="Sections du catalogue"><a href="#a-venir">À venir et en cours</a><a href="#archives">Archives</a><a href="#perimetre">Périmètre et dates</a><a href="${pilots.find(x=>x.id!==p.id).file}">Explorer ${p.id==='FR-BRE'?'la Wallonie':'la Bretagne'}</a></nav>
 <section id="a-venir" aria-labelledby="upcoming-title"><h2 id="upcoming-title">À venir et en cours</h2>${list(future)}</section>
 <section id="archives" aria-labelledby="archive-title"><h2 id="archive-title">Archives</h2>${years.length?years.map(year=>`<h3>${year}</h3>${list(past.filter(e=>e.start_date.startsWith(year)).reverse())}`).join('\n'):'<p>Aucune archive référencée.</p>'}</section>
 <section id="sans-date"><h2>Dates à confirmer (${stats.undated})</h2>${list(undated)}</section>
 <section id="annules"><h2>Inscriptions annulées (${stats.cancelled})</h2>${list(cancelled)}</section>
 <aside id="perimetre" class="territory-note"><h2>Comprendre ce catalogue</h2><p>Ce total correspond exactement aux événements listés sur cette page : à venir ou en cours, passés, sans date et avec inscriptions annulées. Il ne représente pas tous les événements du territoire. Toutes les annonces publiques rattachées à ce territoire dans le catalogue sont reprises ; les contrôles de qualité ne les retirent pas.</p><p>Classement arrêté au ${date(today)}. Un événement reste en cours jusqu’à sa date de fin incluse ; sans date de fin, sa date de début sert de dernier jour. Les inscriptions signalées comme annulées sont isolées. L’annulation de l’événement lui-même n’est pas renseignée par cet extrait : aucun statut « confirmé » n’est déduit de cette absence. Le lieu précis est affiché lorsqu’une source organisatrice a pu être vérifiée ; il n’est pas fourni par cet extrait public. Consultez la fiche et le site de l’organisateur avant de vous déplacer.</p><p>La date d’actualisation correspond à la capture du catalogue, pas à une modification de chaque événement. Avec JavaScript, le catalogue public est relu à l’ouverture et peut être actualisé avec le bouton ci-dessus. Sans JavaScript, les données datées ci-dessus restent consultables. Les listes et les compteurs restent consultables sans JavaScript ; les favoris et les choix d’agenda existants se trouvent sur la fiche de l’événement et nécessitent JavaScript.</p></aside>
 <p><a href="index.html#territoires-pilotes">Explorer les territoires</a> · <a href="soumettre.html">Proposer un événement</a></p></main>`;
 return {main,stats,rows};
}
