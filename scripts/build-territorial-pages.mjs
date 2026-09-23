import {territories,renderTerritory,countryLinks} from './territorial-render.mjs';
import {analyzeQuality} from './territorial-quality.mjs';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {qualify,duplicateGroups,territoryFor} from './territorial-catalog.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const snapshot=read('docs/territoires/catalogue-public.json');
const registry=read('docs/territoires/referentiel.json');
const observations=read('docs/territoires/signalements.json');
const verified=read('docs/territoires/verifications-organisateurs.json');
const reviewedOn='2026-09-23';
const issues=analyzeQuality(snapshot.events,registry,observations,snapshot.capturedAt.slice(0,10));
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date(snapshot.capturedAt));
const {accepted,rejected}=qualify(snapshot.events,registry,observations,today);
// Reuse the existing regional page shell (header, footer, site styles and navigation).
const base=fs.readFileSync('evenements-litteraires-bretagne.html','utf8');
const results=[];
const selected=process.argv.includes('--sample')?territories.filter(p=>p.kind==='country'||['FR-BRE','BE-WAL','CH-local-24'].includes(p.id)):territories;
for(const p of selected){
 const {main,stats,rows}=renderTerritory({p,events:snapshot.events,registry,verified,capturedAt:snapshot.capturedAt});
 let html=base.replace('href="index.html?country=FR#agenda">France</a>', 'href="evenements-litteraires-france.html">France</a>').replace(/<main[\s\S]*?<\/main>/,main)
 .replace(/<title>[\s\S]*?<\/title>/,`<title>Événements littéraires en ${p.label}, ${p.country} — Dédicalivres</title>`)
 .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${stats.total} événements littéraires référencés en ${p.label}, ${p.country} : prochaines rencontres et archives par année. Catalogue actualisé le ${today}." />`)
 .replace(/<link rel="canonical"[^>]*>/,`<link rel="canonical" href="${p.canonical}" />`)
 .replace(/<meta property="og:(title|description|url)"[^>]*>/g,'')
 .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'')
 .replace(/<script\b[^>]*src="(?:https:[^"]*|config\.js[^" ]*|geography\.js[^" ]*|seo-pages\.js[^" ]*|tracking-v4\.js[^" ]*)"[^>]*><\/script>/g,'')
 .replace(/<body[^>]*>/,`<body class="seo-page territorial-page" data-region="${p.label}" data-country-code="${p.code}">`)
 .replace(/\s*<link rel="stylesheet" href="territorial-pages.css"\s*\/>/g,'')
 .replace('</head>',`<link rel="stylesheet" href="territorial-pages.css" />\n<meta property="og:title" content="Événements littéraires en ${p.label} — ${p.country}" />\n<meta property="og:description" content="${stats.total} événements référencés : prochains rendez-vous et archives." />\n<meta property="og:url" content="${p.canonical}" />\n<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:`Événements littéraires en ${p.label}`,url:p.canonical,dateModified:reviewedOn,breadcrumb:{'@type':'BreadcrumbList',itemListElement:[{name:p.country,item:'https://dedicalivres.fr/'+p.countryUrl},{name:p.label,item:p.canonical}].map((x,i)=>({'@type':'ListItem',position:i+1,...x}))}})}</script>\n</head>`);
 html=html.replace(/<script[^>]*src="territorial-pages.js"[^>]*><\/script>/g,'').replace('</body>','<script src="config.js?v=territorial-live-1"></script>\n<script type="module" src="territorial-pages.js"></script>\n</body>');
 html=html.replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n');
 fs.writeFileSync(p.file,html);
 results.push({...p,...stats,ids:rows.map(e=>e.id)});
}
const pages=fs.readdirSync('.').filter(f=>/^evenements-litteraires.*\.html$/.test(f)).map(file=>{
 const h=fs.readFileSync(file,'utf8');return {file,region:h.match(/data-region="([^"]*)"/)?.[1]||null,country:h.match(/data-country-code="([^"]*)"/)?.[1]||null,city:h.match(/data-city="([^"]*)"/)?.[1]||null,canonical:h.match(/rel="canonical" href="([^"]*)"/)?.[1]||null};
});
// Keep the earlier historical collision audit; do not scan evenement/.
const staticIdCollisions=read('docs/territoires/audit.json').staticIdCollisions;
const audit={base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),capturedAt:snapshot.capturedAt,today,total:snapshot.events.length,registryCountries:registry.map(c=>({code:c.code,name:c.name,type:c.subdivisionLabel,territories:c.territories.length})),territoryCounts:registry.flatMap(c=>c.territories.map(t=>({...t,country:c.code,count:snapshot.events.filter(e=>e.country_code===c.code&&e.region===t.label).length}))),pages,duplicateEvents:duplicateGroups(snapshot.events),staticIdCollisions,unknownTerritories:accepted.filter(e=>!territoryFor(e,registry)),notPublic:rejected,qualityIssues:issues,pilots:results.filter(p=>['FR-BRE','BE-WAL'].includes(p.id)),territorialPages:results};
fs.writeFileSync('docs/territoires/audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(results.map(({label,total,upcoming,past,excluded})=>({label,total,upcoming,past,excluded})),null,2));

const index=fs.readFileSync('index.html','utf8');
fs.writeFileSync('index.html',index.replace(/<section id="territoires-pilotes"[\s\S]*?<\/section>/,`<section id="territoires-pilotes" class="container seo-text-block" aria-labelledby="territoires-pilotes-title"><h2 id="territoires-pilotes-title">Explorer Dédicalivres par région</h2><nav aria-label="Agendas par pays"><p>${countryLinks()}</p></nav></section>`));
