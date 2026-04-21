{\rtf1\ansi\ansicpg1252\cocoartf2869
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;\f1\fnil\fcharset0 HelveticaNeue;\f2\fnil\fcharset0 .AppleSystemUIFontMonospaced-Regular;
}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 /* ============================================\
   Dedicalivres \'96 API Airtable\
   Connexion & affichage de l'agenda public\
   ============================================\
\
   \uc0\u9888 \u65039  AVANT DE D\'c9MARRER :\
   Remplace les 3 variables ci-dessous\
   par tes vraies informations Airtable.\
   ============================================ */\
\
// --- CONFIGURATION (\'e0 personnaliser) ---\
const AIRTABLE_API_KEY  = "
\f1\fs26 pat2vepbmBglyjMcT.340422cc0a3d7bf47aaeee1b4107050416ebf011d632ed926fa15fffb5392963
\f0\fs24 ";   // patXXXXXXXXXXX\
const AIRTABLE_BASE_ID  = "
\f2 app5daPwshp3bRm64
\f1\fs26 \

\f0\fs24 ";             // appXXXXXXXXXXX\
const AIRTABLE_TABLE    = "\'e9venements";              // Nom exact de ta table\
\
// --- URL de l'API ---\
const API_URL = `[api.airtable.com](https://api.airtable.com/v0/$\{AIRTABLE_BASE_ID\}/$\{encodeURIComponent(AIRTABLE_TABLE)\})`;\
\
// --- Variables globales ---\
let tousLesEvenements = [];\
\
/* ============================================\
   R\'c9CUP\'c9RATION DES DONN\'c9ES AIRTABLE\
   ============================================ */\
async function chargerEvenements() \{\
  try \{\
    let tousRecords = [];\
    let offset = null;\
\
    // Boucle pagination (Airtable limite \'e0 100 r\'e9sultats par appel)\
    do \{\
      let url = `$\{API_URL\}?filterByFormula=\{Validation\}="Valid\'e9"&sort[0][field]=Date d\'e9but&sort[0][direction]=asc`;\
      if (offset) url += `&offset=$\{offset\}`;\
\
      const reponse = await fetch(url, \{\
        headers: \{\
          Authorization: `Bearer $\{AIRTABLE_API_KEY\}`,\
          "Content-Type": "application/json"\
        \}\
      \});\
\
      if (!reponse.ok) throw new Error(`Erreur API : $\{reponse.status\}`);\
\
      const data = await reponse.json();\
      tousRecords = [...tousRecords, ...data.records];\
      offset = data.offset || null;\
\
    \} while (offset);\
\
    tousLesEvenements = tousRecords;\
    afficherEvenements(tousLesEvenements);\
\
  \} catch (erreur) \{\
    console.error("Erreur chargement Airtable :", erreur);\
    afficherErreur();\
  \}\
\}\
\
/* ============================================\
   AFFICHAGE DES CARTES\
   ============================================ */\
function afficherEvenements(evenements) \{\
  const grille = document.getElementById("grille-evenements");\
  const compteur = document.getElementById("compteur-texte");\
\
  // Filtres actifs\
  const region  = document.getElementById("filtre-region").value;\
  const type    = document.getElementById("filtre-type").value;\
  const entree  = document.getElementById("filtre-entree").value;\
\
  // Filtrage\
  const filtres = evenements.filter(evt => \{\
    const f = evt.fields;\
    const matchRegion = region  ? f["R\'e9gion"] === region  : true;\
    const matchType   = type    ? f["Type"]   === type    : true;\
    const matchEntree = entree  ? f["Entr\'e9e"] === entree  : true;\
    // On ne montre que les \'e9v\'e9nements \'e0 venir ou en cours\
    const dateDebut = f["Date d\'e9but"] ? new Date(f["Date d\'e9but"]) : null;\
    const dateFin   = f["Date fin"]   ? new Date(f["Date fin"])   : dateDebut;\
    const aujourd   = new Date();\
    const matchDate = dateFin ? dateFin >= aujourd : true;\
    return matchRegion && matchType && matchEntree && matchDate;\
  \});\
\
  // Compteur\
  compteur.textContent = filtres.length > 0\
    ? `\uc0\u55357 \u56538  $\{filtres.length\} \'e9v\'e9nement$\{filtres.length > 1 ? "s" : ""\} trouv\'e9$\{filtres.length > 1 ? "s" : ""\}`\
    : "Aucun \'e9v\'e9nement pour ces filtres";\
\
  // Affichage\
  grille.innerHTML = "";\
\
  if (filtres.length === 0) \{\
    grille.innerHTML = `\
      <div class="vide">\
        <div class="vide-icon">\uc0\u55357 \u56557 </div>\
        <p>Aucun \'e9v\'e9nement trouv\'e9 pour ces crit\'e8res.</p>\
        <p>Essaie d'autres filtres ou <a href="#">soumets un \'e9v\'e9nement</a> !</p>\
      </div>`;\
    return;\
  \}\
\
  filtres.forEach(evt => \{\
    grille.appendChild(creerCarte(evt));\
  \});\
\}\
\
/* ============================================\
   CR\'c9ATION D'UNE CARTE \'c9V\'c9NEMENT\
   ============================================ */\
function creerCarte(evt) \{\
  const f = evt.fields;\
\
  // Donn\'e9es\
  const nom         = f["Nom"]          || "\'c9v\'e9nement sans titre";\
  const type        = f["Type"]         || "Autre";\
  const dateDebut   = f["Date d\'e9but"]   ? formaterDate(f["Date d\'e9but"]) : "Date \'e0 confirmer";\
  const dateFin     = f["Date fin"]     ? formaterDate(f["Date fin"])   : null;\
  const ville       = f["Ville"]        || "";\
  const region      = f["R\'e9gion"]       || "";\
  const description = f["Description"]  || "Aucune description disponible.";\
  const entree      = f["Entr\'e9e"]       || "Gratuit";\
  const lien        = f["Lien"]         || "#";\
  const affiche     = f["Affiche"]      ? f["Affiche"][0]?.url : null;\
\
  // Classes CSS selon type\
  const typeClass = \{\
    "Salon"    : "type-salon",\
    "Festival" : "type-festival",\
    "D\'e9dicace" : "type-dedicace",\
    "Autre"    : "type-autre"\
  \}[type] || "type-autre";\
\
  const entreeClass = entree === "Gratuit" ? "entree-gratuit" : "entree-payant";\
\
  // P\'e9riode\
  const periode = dateFin && dateFin !== dateDebut\
    ? `$\{dateDebut\} \uc0\u8594  $\{dateFin\}`\
    : dateDebut;\
\
  // Emoji type\
  const typeEmoji = \{\
    "Salon"    : "\uc0\u55357 \u56538 ",\
    "Festival" : "\uc0\u55356 \u57258 ",\
    "D\'e9dicace" : "\uc0\u9997 \u65039 ",\
    "Autre"    : "\uc0\u55357 \u56524 "\
  \}[type] || "\uc0\u55357 \u56524 ";\
\
  // Construction HTML\
  const carte = document.createElement("div");\
  carte.className = "carte";\
\
  carte.innerHTML = `\
    $\{affiche\
      ? `<img class="carte-image" src="$\{affiche\}" alt="$\{nom\}" loading="lazy"/>`\
      : `<div class="carte-image-placeholder">$\{typeEmoji\}</div>`\
    \}\
    <div class="carte-body">\
      <span class="carte-type $\{typeClass\}">$\{typeEmoji\} $\{type\}</span>\
      <h2 class="carte-titre">$\{nom\}</h2>\
      <div class="carte-meta">\
        <span>\uc0\u55357 \u56517  $\{periode\}</span>\
        $\{ville ? `<span>\uc0\u55357 \u56525  $\{ville\}$\{region ? ` \'97 $\{region\}` : ""\}</span>` : ""\}\
      </div>\
      <p class="carte-description">$\{description\}</p>\
      <div class="carte-footer">\
        <span class="carte-entree $\{entreeClass\}">$\{entree\}</span>\
        $\{lien !== "#"\
          ? `<a class="carte-lien" href="$\{lien\}" target="_blank">Voir l'\'e9v\'e9nement \uc0\u8594 </a>`\
          : ""\
        \}\
      </div>\
    </div>`;\
\
  return carte;\
\}\
\
/* ============================================\
   UTILITAIRES\
   ============================================ */\
function formaterDate(dateISO) \{\
  const d = new Date(dateISO);\
  return d.toLocaleDateString("fr-FR", \{\
    day  : "2-digit",\
    month: "long",\
    year : "numeric"\
  \});\
\}\
\
function afficherErreur() \{\
  document.getElementById("grille-evenements").innerHTML = `\
    <div class="vide">\
      <div class="vide-icon">\uc0\u9888 \u65039 </div>\
      <p>Impossible de charger l'agenda pour le moment.</p>\
      <p>V\'e9rifie ta connexion ou contacte <a href="mailto:contact@Dedicalivres.fr">contact@Dedicalivres.fr</a></p>\
    </div>`;\
  document.getElementById("compteur-texte").textContent = "Erreur de chargement";\
\}\
\
function resetFiltres() \{\
  document.getElementById("filtre-region").value = "";\
  document.getElementById("filtre-type").value   = "";\
  document.getElementById("filtre-entree").value = "";\
  afficherEvenements(tousLesEvenements);\
\}\
\
/* ============================================\
   \'c9COUTEURS D'\'c9V\'c9NEMENTS\
   ============================================ */\
document.getElementById("filtre-region").addEventListener("change", () => afficherEvenements(tousLesEvenements));\
document.getElementById("filtre-type").addEventListener("change",   () => afficherEvenements(tousLesEvenements));\
document.getElementById("filtre-entree").addEventListener("change", () => afficherEvenements(tousLesEvenements));\
\
/* ============================================\
   INITIALISATION\
   ============================================ */\
document.addEventListener("DOMContentLoaded", chargerEvenements);\
}