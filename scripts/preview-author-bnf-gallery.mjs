import fs from "node:fs";
import {renderReviewedGallery} from "./author-bnf-reviewed-gallery.mjs";
import {renderAuthorStaticPage} from "./author-static-page.mjs";
const author={id:"fixture",validated:true,published:true};
const presences=[{author_id:"fixture",validated:true,rejected:false,presence_verified:true,events:{id:"fixture-event",validated:true,rejected:false}}];
const ids=["ark:/12148/cb123456789","ark:/12148/cb123456788","ark:/12148/cb123456787"];
const titles=["Le roman de démonstration","Un voyage imaginaire","Les pages du futur"];
const candidates=ids.map((id,i)=>({bnf_arks:[id],titles:[titles[i]],status:"human_review_required"}));
const reviews=ids.map((id,i)=>({authorId:"fixture",noticeId:id,authorityId:"ark:/12148/cb987654321",title:titles[i],decision:"approved",reviewerId:"fixture",evidence:"synthetic",checkedAt:"2026-11-25T00:00:00Z",publisher:"Éditeur fictif",year:"2026"}));
const gallery=renderReviewedGallery({author,presences,candidates,reviews});
if(!gallery)throw new Error("Empty fixture preview");
fs.mkdirSync("bnf-preview-artifact",{recursive:true});
fs.writeFileSync("bnf-preview-artifact/index.html",'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Prévisualisation fictive BnF</title><style>body{font:1rem system-ui;margin:2rem auto;padding:0 1rem;max-width:70rem;color:#282238;background:#faf8f4}.bnf-gallery{display:flex;gap:1rem;overflow-x:auto;list-style:none;padding:0 0 1rem;scroll-snap-type:x proximity}.bnf-gallery>li{flex:0 0 min(16rem,75vw);border:1px solid #c9c1d6;border-radius:1rem;padding:1rem;background:white;scroll-snap-align:start}.bnf-gallery h3{font-family:Georgia,serif}a:focus-visible{outline:3px solid #643fac}</style><main><h1>Démo bibliographique Dédicalivres</h1><p>DONNÉES ENTIÈREMENT FICTIVES — liens illustratifs, aucune notice réelle ni autorisation de publication.</p>'+gallery.replace(/href="https:\/\/catalogue\.bnf\.fr\/[^"]+"/g,'href="#demo"')+'<p id="demo">Lien neutralisé dans cette démo.</p></main></html>');

const fixtureProfile={...author,pseudo:"Auteur de démonstration",slug:"auteur-demo-bnf",bio:"Biographie fictive pour la recette de la galerie bibliographique.",location:"Localisation fictive"};
const event={id:"fixture-event",title:"Rencontre de démonstration",city:"Rennes",country_code:"FR",start_date:"2026-12-01",validated:true,rejected:false};
const baseHtml=fs.readFileSync("author.html","utf8");
const rendered=renderAuthorStaticPage({baseHtml,author:fixtureProfile,events:[event],generatedAt:"2026-11-26",bibliography:{presences,candidates,reviews}});
// Synthetic offline preview only. Remove all scripts and remote/local navigation,
// canonical metadata, preconnects and external assets. Preserve generated content.
let preview=rendered.html
 .replace(/<script\b[\s\S]*?<\/script>/gi,"")
 .replace(/<link\b[^>]*>/gi,"")
 .replace(/<meta\b(?:[^>]*)(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/gi,"")
 .replace(/<meta name="robots"[^>]*>/i,'<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">')
 .replace(/<picture\b[\s\S]*?<\/picture>/gi,"<strong>Dédicalivres — aperçu</strong>")
 .replace(/<img\b[^>]*>/gi,"")
 .replace(/\s(?:href|src|srcset)="[^"]*"/gi,' href="#demo"')
 .replace(/<body([^>]*)>/i,'<body$1><p id="demo" role="note" style="padding:1rem;border:2px solid #8b5b19">APERÇU ISOLÉ — DONNÉES FICTIVES — aucune publication ni navigation réelle.</p>')
 .replace("</head>",()=>`<style>body{font:1rem system-ui;margin:auto;padding:1rem;max-width:70rem;line-height:1.5;color:#282238;background:#faf8f4}a{color:#3a1c71}header,footer,.author-profile,.event-card{padding:1rem;background:#fff;border-radius:.8rem;margin-bottom:1rem}.author-title{font-family:Georgia,serif}.author-avatar-placeholder{font-size:2rem}.section{margin-block:1.5rem}.author-bnf .bnf-gallery>li{background:white}.events-grid{display:grid;gap:1rem}h1,h2,h3{line-height:1.2}</style></head>`);
if(!preview.includes('id="bnf-heading"')||!preview.includes('noindex,nofollow')||/<script\b/i.test(preview))throw new Error("Unsafe or incomplete integrated preview");
fs.writeFileSync("bnf-preview-artifact/author-integrated.html",preview);
