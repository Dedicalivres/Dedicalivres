// Offline, synthetic Admin V11 preview. No network, storage, auth or production data.
import fs from "node:fs";
const contract = fs.readFileSync(new URL("./author-bnf-admin-review-draft.mjs", import.meta.url),"utf8");
if (/<\/script/i.test(contract)) throw new Error("Unexpected script delimiter");
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Bibliographie — Admin V11 (prototype)</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f5f7;color:#223143;font:16px/1.5 system-ui,sans-serif}header{background:#24384b;color:white;padding:16px 24px}main{max-width:900px;margin:auto;padding:18px}h1,h2{line-height:1.2}h1{font-size:26px}h2{font-size:20px}.panel{background:white;border:1px solid #d7dde3;border-radius:12px;padding:18px;margin:14px 0}.notice{background:#fff5d9;border:1px solid #d3b966;border-radius:8px;padding:12px}.muted{color:#526172;font-size:14px}.candidate{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid #d7dde3}.candidate>div{min-width:0;overflow-wrap:anywhere}label{display:block;margin:10px 0}input[type=checkbox]{width:20px;height:20px;flex:none;vertical-align:middle;accent-color:#24597d}select,textarea,button{font:inherit}select,textarea{width:100%;border:1px solid #8795a3;border-radius:7px;padding:10px;background:white;color:#223143}button{border:1px solid #24597d;border-radius:8px;background:#24597d;color:white;padding:12px 16px;min-height:44px;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #bd6e00;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere}button.secondary{background:white;color:#24597d}fieldset{border:0;padding:0;margin:0}legend{font-weight:600} [hidden]{display:none!important}
</style>
<header><strong>Dédicalivres — Admin V11</strong></header><main><p class="muted">Communauté / Auteurs / Préparation éditoriale / Bibliographie</p><h1>Bibliographie · revue des candidats</h1><p class="notice"><strong>Prototype isolé.</strong> Auteur, notices et preuves fictifs. Aucune connexion, aucun enregistrement, aucune publication.</p>
<section class="panel"><h2>Auteur de démonstration</h2><p class="muted">Autorité de test · 3 références proposées · 0 décision réelle</p><p>Les résultats sont des propositions, jamais des associations confirmées automatiquement.</p></section>
<form id="review"><section class="panel"><fieldset><legend>Sélection des notices</legend><div id="candidates"></div></fieldset><button type="button" class="secondary" id="all">Tout sélectionner</button> <button type="button" class="secondary" id="none">Tout désélectionner</button></section>
<section class="panel"><h2>Préparer une décision</h2><label for="action">Orientation</label><select id="action"><option value="approve">Proposer la validation</option><option value="request_information">Demander un complément</option><option value="reject">Rejeter l'association</option></select><div id="identity"><p class="muted">Autorité fictive : ark:/12148/cb987654321</p><label><input id="authority" type="checkbox"> Identité de l'auteur vérifiée (simulation)</label><label><input id="role" type="checkbox"> Rôle d'auteur vérifié (simulation)</label></div><label for="evidence">Justification et éléments de preuve</label><textarea id="evidence" maxlength="2000" rows="4" placeholder="Saisir une justification fictive"></textarea><p><button type="submit">Préparer le brouillon</button></p><p class="muted">Cette action ne valide et ne publie rien.</p></section></form>
<section class="panel" aria-labelledby="out-title"><h2 id="out-title">Résultat de la simulation</h2><p id="status" role="status" aria-live="polite">Aucun brouillon préparé.</p><pre id="details" hidden></pre></section></main>
<script type="module">
${contract}
const records=["Un roman de démonstration","Un recueil de démonstration","Une édition de démonstration"].map((title,i)=>({bnf_arks:["ark:/12148/cb12345678"+(i+1)],titles:[title],status:"human_review_required"}));
const $=id=>document.getElementById(id);const checks=[];
for(const [i,c] of records.entries()){
 const label=document.createElement("label");label.className="candidate";
 const box=document.createElement("input");box.type="checkbox";checks.push(box);
 const info=document.createElement("div");const title=document.createElement("strong");title.textContent=c.titles[0];
 const meta=document.createElement("p");meta.className="muted";meta.textContent="Notice fictive · "+c.bnf_arks[0]+" · À examiner";
 info.append(title,meta);label.append(box,info);$("candidates").append(label);
}
$("all").addEventListener("click",()=>checks.forEach(c=>c.checked=true));
$("none").addEventListener("click",()=>checks.forEach(c=>c.checked=false));
$("action").addEventListener("change",()=>$("identity").hidden=$("action").value!=="approve");
const errors={invalid_context:"Contexte incorrect.",invalid_selection:"Sélectionner au moins une référence.",evidence_required:"Une justification est obligatoire.",identity_and_role_confirmation_required:"Confirmer les deux vérifications d'identité et de rôle.",invalid_or_duplicate_notice:"Notice invalide ou dupliquée.",missing_or_ambiguous_candidate:"Notice absente ou ambiguë."};
$("review").addEventListener("submit",event=>{
 event.preventDefault();
 const selections=records.filter((_,i)=>checks[i].checked).map(c=>({noticeId:c.bnf_arks[0],title:c.titles[0]}));
 const result=prepareBnfReviewDraft({authorId:"fixture-author",candidates:records,selections,action:$("action").value,authorityId:"ark:/12148/cb987654321",evidence:$("evidence").value,authorityConfirmed:$("authority").checked,roleConfirmed:$("role").checked});
 $("status").textContent=result.ok?"Brouillon simulé préparé pour "+result.items.length+" notice(s). Rien n’est enregistré.":errors[result.reason]||"Brouillon refusé.";
 $("details").hidden=!result.ok;
 $("details").textContent=result.ok?JSON.stringify(result,null,2):"";
});
</script></html>`;
fs.mkdirSync("bnf-preview-artifact",{recursive:true});
fs.writeFileSync("bnf-preview-artifact/admin-review-preview.html",html);
console.log("Generated offline Admin V11 synthetic preview");
