"""
Générateur des pages événement publiques de Dédicalivres.

POURQUOI
--------
Aujourd'hui dedicalivres.fr charge ses événements en JavaScript : Google ne
voit AUCUN événement dans le HTML, donc rien n'est indexé. Ce script résout
exactement ça : il lit le catalogue public Supabase et écrit, pour chaque
événement validé et non rejeté,
une **page HTML statique** dont le contenu (titre, dates, lieu, description)
est présent dans le code source, avec un balisage **schema.org/Event en
JSON-LD** (résultats enrichis Google : encart date + lieu + affiche). Il génère
aussi un `index.html` et un `sitemap.xml` à soumettre dans Search Console.

Supabase décide seul du corpus public. Auto-Matte conserve sa base SQLite pour
la veille et l'enrichissement, sans pouvoir publier une fiche à lui seul.

USAGE
-----
    python3 generer_pages_seo.py                     # export local sécurisé
    python3 generer_pages_seo.py --dry-run           # mesure sans remplacement
    python3 generer_pages_seo.py --config config.yaml

La sortie est strictement confinée à `../exports/site-seo/`. La publication vers
Dédicalivres est une opération distincte, non réalisée par ce générateur.

100% bibliothèque standard Python — aucune dépendance.
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from publisher_compat import fusionner, normaliser, normaliser_titre_dedup
from publisher_compat import SUBMITTED_STATUSES
PAYS_ISO = {'France': 'FR', 'Belgique': 'BE', 'Suisse': 'CH', 'Luxembourg': 'LU', 'Monaco': 'MC'}
TYPES = [('Dédicace', ('dedicace', 'dédicace', 'signature', 'rencontre avec')), ('Festival', ('festival',)), ('Salon', ('salon', 'foire du livre', 'fete du livre', 'fête du livre', 'marche du livre', 'marché du livre'))]
MARQUE = 'Dédicalivres'
COULEUR = '#3a1c71'
PUBLIC_EVENT_COLUMNS = 'id,title,type,country_code,region,city,start_date,end_date,website,description,image_url,validated,rejected'
COUNTRY_NAMES = {'FR': 'France', 'BE': 'Belgique', 'CH': 'Suisse', 'LU': 'Luxembourg', 'MC': 'Monaco'}
MANIFEST_NAME = 'event-pages-manifest.json'
REPORT_NAME = 'event-pages-report.json'
SEO_BLOCKLIST = {'eterritoire.fr', 'brocabrac.fr', 'jds.fr', 'infolocale.fr', 'out.be', 'loumina.fr', 'libratheque.fr', 'unidivers.fr', 'agendaculturel.fr', 'openagenda.com', 'thebookedition.com', 'bod.fr', 'actualitte.com', 'laforetdulivre.fr', 'nouvelleslitteratures.com'}
AUTEURS_JUNK = {'', 'oui', 'non', 'yes', 'no', 'true', 'false', '-', 'n/a', '?'}

class DoublonExactSeoError(RuntimeError):
    """Bloque un export qui contient encore un doublon exact."""

class GenerationSeoError(RuntimeError):
    """Bloque un run avant tout remplacement de la sortie précédente."""

def slug(texte, maxlen=70):
    t = unicodedata.normalize('NFKD', str(texte or '')).encode('ascii', 'ignore').decode()
    t = re.sub('[^a-zA-Z0-9]+', '-', t).strip('-').lower()
    return t[:maxlen].rstrip('-') or 'evenement'

def deduire_type(titre):
    t = (titre or '').lower()
    for (label, motifs) in TYPES:
        if any((m in t for m in motifs)):
            return label
    return 'Événement littéraire'

def _host(u):
    from urllib.parse import urlparse
    try:
        return urlparse(u or '').netloc.lower().removeprefix('www.')
    except Exception:
        return ''

def publiable(d):
    """Filtre qualité : ne créer une page que pour une fiche solide
    (vrai quand + vrai où + source fiable + un minimum de contenu)."""
    if not iso_date(d.get('date_debut')):
        return False
    if not (d.get('ville') or '').strip():
        return False
    if d.get('site_type') == 'agregateur':
        return False
    if _host(d.get('source')) in SEO_BLOCKLIST or _host(d.get('site')) in SEO_BLOCKLIST:
        return False
    substance = len((d.get('description') or '').strip()) >= 40 or bool(d.get('affiche')) or d.get('site_type') == 'officiel'
    return bool(substance)

def iso_date(valeur):
    """Retourne 'YYYY-MM-DD' si la valeur ressemble à une date ISO, sinon ''."""
    if valeur and re.match('^\\d{4}-\\d{2}-\\d{2}', str(valeur)):
        return str(valeur)[:10]
    return ''

def normalize_multiline_text(value):
    """Normalise un texte éditorial sans écraser ses paragraphes.

    Les contenus collectés peuvent contenir des fins de ligne Windows ou des
    espaces avant un saut de ligne. On conserve les retours à la ligne utiles,
    tout en supprimant uniquement ces caractères de présentation parasites.
    """
    text = str(value or '').replace('\r\n', '\n').replace('\r', '\n')
    return '\n'.join((line.rstrip(' \t') for line in text.split('\n'))).strip()

def normalize_inline_text(value):
    """Nettoie un champ court destiné à une seule ligne HTML."""
    return re.sub('\\s+', ' ', str(value or '')).strip()

def date_fr(iso):
    """'2026-07-19' -> '19 juillet 2026'."""
    mois = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    try:
        (a, m, j) = iso.split('-')
        return f'{int(j)} {mois[int(m)]} {a}'
    except Exception:
        return iso

def esc(v):
    return html.escape(str(v or ''), quote=True)

def cle_doublon_exact(ev):
    """Retourne le triplet exact partagé avec le moteur de veille.

    Une clé incomplète est volontairement ignorée : aucune fiche sans titre,
    ville ou date de début ne peut être fusionnée automatiquement.
    """
    titre = normaliser_titre_dedup(ev.get('titre') or '')
    ville = normaliser(ev.get('ville') or '')
    date_debut = str(ev.get('date_debut') or '').strip()[:10]
    if not titre or not ville or (not date_debut):
        return None
    return (titre, ville, date_debut)

def _rang_canonique(ev):
    try:
        score = float(ev.get('score') or 0)
    except (TypeError, ValueError):
        score = 0
    try:
        identifiant = int(ev.get('id'))
    except (TypeError, ValueError):
        identifiant = 2 ** 63 - 1
    return (-score, identifiant)

def _identifiant_evenement(ev):
    try:
        return int(ev.get('id'))
    except (TypeError, ValueError):
        return None

def charger_soumissions_seo(con, event_ids):
    """Charge sans écriture toutes les preuves distantes du périmètre SEO."""
    ids = sorted({int(value) for value in event_ids if value is not None})
    if not ids:
        return {}
    placeholders_ids = ','.join('?' * len(ids))
    statuts = sorted(SUBMITTED_STATUSES)
    placeholders_statuts = ','.join('?' * len(statuts))
    try:
        rows = con.execute(f'SELECT id,event_id,remote_uuid,status FROM dedicalivres_submissions WHERE event_id IN ({placeholders_ids}) AND status IN ({placeholders_statuts}) ORDER BY id', (*ids, *statuts)).fetchall()
    except sqlite3.OperationalError:
        return {}
    resultat = {}
    for row in rows:
        soumission = dict(row)
        resultat.setdefault(int(soumission['event_id']), []).append(soumission)
    return resultat

def _soumissions_significatives(groupe, soumissions_par_evenement):
    resultat = []
    for ev in groupe:
        event_id = _identifiant_evenement(ev)
        for soumission in soumissions_par_evenement.get(event_id, []):
            if str(soumission.get('status') or '') in SUBMITTED_STATUSES:
                resultat.append((ev, soumission))
    return resultat

def _choisir_canonique(groupe, soumissions_par_evenement):
    """Choisit la fiche protégée et refuse les identités distantes ambiguës."""
    soumissions = _soumissions_significatives(groupe, soumissions_par_evenement)
    remote_uuids = {str(soumission.get('remote_uuid') or '').strip() for (_, soumission) in soumissions if str(soumission.get('remote_uuid') or '').strip()}
    if len(remote_uuids) > 1:
        ids = ', '.join((str(ev.get('id') or '?') for ev in groupe))
        raise DoublonExactSeoError(f'Export SEO refusé : plusieurs soumissions distantes pour un même doublon exact, remote_uuid={sorted(remote_uuids)!r}, ids=[{ids}]')
    if soumissions:
        ids_soumis = {_identifiant_evenement(ev) for (ev, _) in soumissions}
        candidats = [ev for ev in groupe if _identifiant_evenement(ev) in ids_soumis]
        return (min(candidats, key=_rang_canonique), True)
    candidats_soumis = [ev for ev in groupe if str(ev.get('statut') or '').strip().lower() == 'soumis']
    if candidats_soumis:
        return (min(candidats_soumis, key=_rang_canonique), True)
    return (min(groupe, key=_rang_canonique), False)

def compter_groupes_multidates(evs):
    """Compte les mêmes titres/villes présents à plusieurs dates distinctes."""
    groupes = {}
    for ev in evs:
        titre = normaliser_titre_dedup(ev.get('titre') or '')
        ville = normaliser(ev.get('ville') or '')
        date_debut = str(ev.get('date_debut') or '').strip()[:10]
        if titre and ville and date_debut:
            groupes.setdefault((titre, ville), set()).add(date_debut)
    return sum((1 for dates in groupes.values() if len(dates) > 1))

def consolider_doublons_exacts(evs, soumissions_par_evenement=None):
    """Fusionne en mémoire les seuls doublons exacts exportables.

    La fiche canonique est choisie par score décroissant puis ID croissant.
    Une preuve de soumission distante, puis le statut local ``soumis``, ont
    priorité sur le score. Plusieurs UUID distants distincts bloquent l'export.
    """
    soumissions_par_evenement = soumissions_par_evenement or {}
    groupes = {}
    incomplets = []
    for ev in evs:
        cle = cle_doublon_exact(ev)
        if cle is None:
            incomplets.append(ev)
        else:
            groupes.setdefault(cle, []).append(ev)
    resultat = list(incomplets)
    groupes_exacts = 0
    doublons_detectes = 0
    consolides = 0
    groupes_consolides = 0
    groupes_proteges_resolus = 0
    for groupe in groupes.values():
        if len(groupe) == 1:
            resultat.append(groupe[0])
            continue
        groupes_exacts += 1
        doublons_detectes += len(groupe) - 1
        (selection, protege) = _choisir_canonique(groupe, soumissions_par_evenement)
        canonique = dict(selection)
        identifiant_canonique = canonique.get('id')
        autres = sorted((ev for ev in groupe if ev is not selection), key=_rang_canonique)
        for doublon in autres:
            canonique = fusionner(canonique, doublon)
            canonique['id'] = identifiant_canonique
        resultat.append(canonique)
        consolides += len(groupe) - 1
        groupes_consolides += 1
        if protege:
            groupes_proteges_resolus += 1
    rapport = {'avant': len(evs), 'apres': len(resultat), 'groupes_exacts': groupes_exacts, 'doublons_exacts': doublons_detectes, 'consolides': consolides, 'groupes_consolides': groupes_consolides, 'groupes_proteges_resolus': groupes_proteges_resolus, 'groupes_multidates': compter_groupes_multidates(evs)}
    return (resultat, rapport)

def verifier_absence_doublons_exacts(evs):
    """Refuse explicitement toute régression avant écriture de l'export."""
    groupes = {}
    for ev in evs:
        cle = cle_doublon_exact(ev)
        if cle is not None:
            groupes.setdefault(cle, []).append(ev)
    conflits = [(cle, groupe) for (cle, groupe) in groupes.items() if len(groupe) > 1]
    if not conflits:
        return
    (cle, groupe) = conflits[0]
    ids = ', '.join((str(ev.get('id') or '?') for ev in groupe))
    raise DoublonExactSeoError(f'Export SEO refusé : doublon exact restant titre={cle[0]!r}, ville={cle[1]!r}, date={cle[2]!r}, ids=[{ids}]')

def attribuer_slugs(evs):
    """Attribue une URL stable et unique à partir de l'identifiant Supabase."""
    vus = set()
    for ev in evs:
        valeur = str(ev.get('_slug_override') or '')
        if not valeur:
            valeur = slug(f"{ev['titre']}-{ev['ville']}")
            identifiant = slug(ev.get('_slug_suffix') or ev.get('id'), maxlen=64)
            valeur = f'{valeur}-{identifiant}'
        if not re.fullmatch('[a-z0-9][a-z0-9-]*', valeur):
            raise DoublonExactSeoError(f'Export SEO refusé : slug invalide {valeur!r}')
        if valeur in vus:
            raise DoublonExactSeoError(f'Export SEO refusé : slug dupliqué {valeur!r}')
        vus.add(valeur)
        ev['_slug'] = valeur
    return evs

def afficher_rapport_dedup(rapport):
    print(f"Déduplication exacte SEO : {rapport['avant']} fiches avant, {rapport['apres']} après, {rapport['groupes_exacts']} groupes exacts, {rapport['doublons_exacts']} doublons détectés, {rapport['consolides']} fiches consolidées, {rapport['groupes_consolides']} groupes consolidés, {rapport['groupes_proteges_resolus']} groupes protégés résolus, {rapport['groupes_multidates']} groupes multi-dates laissés intacts.", flush=True)

def jsonld_event(ev, url):
    debut = iso_date(ev['date_debut'])
    fin = iso_date(ev['date_fin']) or debut
    data = {'@context': 'https://schema.org', '@type': 'Event', 'name': ev['titre'], 'eventStatus': 'https://schema.org/EventScheduled', 'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode', 'url': url}
    if debut:
        data['startDate'] = debut
    if fin:
        data['endDate'] = fin
    place = {'@type': 'Place', 'name': ev['lieu'] or ev['ville'] or ev['titre']}
    adresse = {'@type': 'PostalAddress'}
    if ev['adresse']:
        adresse['streetAddress'] = ev['adresse']
    if ev['ville']:
        adresse['addressLocality'] = ev['ville']
    if ev['code_postal']:
        adresse['postalCode'] = ev['code_postal']
    if ev['departement']:
        adresse['addressRegion'] = ev['departement']
    adresse['addressCountry'] = PAYS_ISO.get(ev['pays'], ev['pays'] or '')
    place['address'] = adresse
    data['location'] = place
    if ev['affiche']:
        data['image'] = ev['affiche']
    if ev['description']:
        data['description'] = ev['description'][:500]
    if ev['site']:
        data['organizer'] = {'@type': 'Organization', 'name': ev['ville'] or MARQUE, 'url': ev['site']}
    return json.dumps(data, ensure_ascii=False, indent=2)

def jsonld_breadcrumb(ev, base_url, url):
    items = [{'@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': base_url + '/'}, {'@type': 'ListItem', 'position': 2, 'name': 'Agenda', 'item': base_url + '/evenement/'}, {'@type': 'ListItem', 'position': 3, 'name': ev['titre'], 'item': url}]
    return json.dumps({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': items}, ensure_ascii=False)
CSS = f'\n:root{{--brand:{COULEUR};--ink:#1c1430;--muted:#5b5470;--line:#e7e1f0;--bg:#faf9fc}}\n*{{box-sizing:border-box}}\nbody{{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;\ncolor:var(--ink);background:var(--bg);line-height:1.6}}\na{{color:var(--brand)}}\nheader.site{{background:var(--brand);color:#fff;padding:14px 20px}}\nheader.site a{{color:#fff;text-decoration:none;font-weight:700}}\n.wrap{{max-width:760px;margin:0 auto;padding:24px 20px 60px}}\n.crumb{{font-size:13px;color:var(--muted);margin:6px 0 18px}}\n.crumb a{{color:var(--muted)}}\nh1{{font-size:28px;line-height:1.25;margin:.2em 0 .4em}}\n.badge{{display:inline-block;background:#efe9f8;color:var(--brand);border-radius:999px;\npadding:3px 12px;font-size:13px;font-weight:600}}\n.meta{{margin:18px 0;padding:16px 18px;background:#fff;border:1px solid var(--line);border-radius:12px}}\n.meta div{{margin:4px 0}}\n.meta b{{color:var(--muted);font-weight:600;display:inline-block;min-width:90px}}\n.affiche{{max-width:100%;border-radius:12px;margin:18px 0;border:1px solid var(--line)}}\n.cta{{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;\npadding:11px 20px;border-radius:10px;font-weight:600;margin-top:10px}}\n.desc{{margin:18px 0}}\nfooter{{border-top:1px solid var(--line);margin-top:40px;padding-top:18px;\nfont-size:13px;color:var(--muted)}}\n.card{{display:block;background:#fff;border:1px solid var(--line);border-radius:12px;\npadding:14px 16px;margin:10px 0;text-decoration:none;color:var(--ink)}}\n.card:hover{{border-color:var(--brand)}}\n.card .t{{font-weight:700}}.card .s{{color:var(--muted);font-size:14px}}\n'

def page_event(ev, base_url):
    url = f"{base_url}/evenement/{ev['_slug']}.html"
    typ = ev.get('type') or deduire_type(ev['titre'])
    debut = iso_date(ev['date_debut'])
    fin = iso_date(ev['date_fin'])
    lieu_txt = ', '.join([p for p in (ev['ville'], ev['departement']) if p]) or ev['pays']
    when = date_fr(debut) if debut else ''
    if fin and fin != debut:
        when += f' → {date_fr(fin)}'
    titre_page = f"{ev['titre']} — {lieu_txt} | {MARQUE}"
    descr = (ev['description'] or f"{typ} : {ev['titre']} à {lieu_txt}{(' le ' + when if when else '')}. Dates, lieu et informations pratiques sur {MARQUE}.")[:300]
    parts = []
    parts.append('<!doctype html><html lang="fr"><head>')
    parts.append('<meta charset="utf-8">')
    parts.append('<meta name="viewport" content="width=device-width,initial-scale=1">')
    parts.append(f'<title>{esc(titre_page)}</title>')
    parts.append(f'<meta name="description" content="{esc(descr)}">')
    parts.append(f'<link rel="canonical" href="{esc(url)}">')
    parts.append(f'<meta name="theme-color" content="{COULEUR}">')
    parts.append('<link rel="stylesheet" href="/style.css?v=event-share-cta-1">')
    parts.append('<link rel="stylesheet" href="/accessibilite.css?v=a11y-8">')
    parts.append('<link rel="stylesheet" href="/local-preferences.css?v=2">')
    parts.append('<meta property="og:type" content="event">')
    parts.append(f'''<meta property="og:title" content="{esc(ev['titre'])}">''')
    parts.append(f'<meta property="og:description" content="{esc(descr)}">')
    parts.append(f'<meta property="og:url" content="{esc(url)}">')
    if ev['affiche']:
        parts.append(f'''<meta property="og:image" content="{esc(ev['affiche'])}">''')
    parts.append('<meta name="twitter:card" content="summary_large_image">')
    parts.append(f'<script type="application/ld+json">{jsonld_event(ev, url)}</script>')
    parts.append(f'<script type="application/ld+json">{jsonld_breadcrumb(ev, base_url, url)}</script>')
    parts.append(f'<style>{CSS}</style></head><body>')
    parts.append(f'<header class="site"><a href="{esc(base_url)}/">{MARQUE}</a></header>')
    parts.append('<div class="wrap">')
    parts.append(f'''<nav class="crumb"><a href="{esc(base_url)}/">Accueil</a> › <a href="index.html">Agenda</a> › {esc(ev['titre'])}</nav>''')
    parts.append(f'''<article id="event-detail" class="event-detail" data-event-id="{esc(ev['id'])}">''')
    parts.append(f'<span class="badge">{esc(typ)}</span>')
    parts.append(f"<h1>{esc(ev['titre'])}</h1>")
    parts.append('<div class="meta">')
    if when:
        parts.append(f'<div><b>Dates</b> {esc(when)}</div>')
    if lieu_txt:
        parts.append(f'<div><b>Lieu</b> {esc(lieu_txt)}</div>')
    if ev['adresse']:
        parts.append(f"<div><b>Adresse</b> {esc(ev['adresse'])}{(', ' + esc(ev['code_postal']) if ev['code_postal'] else '')}</div>")
    if ev['pays']:
        parts.append(f"<div><b>Pays</b> {esc(ev['pays'])}</div>")
    if ev['auteurs']:
        parts.append(f"<div><b>Auteurs</b> {esc(ev['auteurs'])}</div>")
    parts.append('</div>')
    if ev['affiche']:
        parts.append(f'''<img class="affiche" src="{esc(ev['affiche'])}" alt="Affiche : {esc(ev['titre'])}" loading="lazy">''')
    if ev['description']:
        parts.append(f"""<div class="desc">{esc(ev['description'])}</div>""")
    if ev['site']:
        parts.append(f'''<a class="cta" href="{esc(ev['site'])}" rel="noopener" target="_blank">Site officiel de l'événement</a>''')
    parts.append('</article>')
    parts.append('<footer>')
    if ev['source']:
        parts.append(f'''Source : <a href="{esc(ev['source'])}" rel="nofollow noopener" target="_blank">{esc(ev['source'][:60])}</a><br>''')
    parts.append(f"Fiche publiée par l'association {MARQUE}. Vérifiez toujours les informations sur le site de l'organisateur.")
    parts.append('</footer></div>')
    parts.append('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>')
    parts.append('<script src="/config.js?v=shared-client-1"></script>')
    parts.append('<script src="/geography.js?v=v1-francophone-20260620-map-authors"></script>')
    parts.append('<script src="/tracking-v4.js?v=p1-static-1"></script>')
    parts.append('<script src="/event.js?v=static-canonical-1"></script>')
    parts.append('<script src="/author-local-draft.js?v=4"></script>')
    parts.append('<script src="/url-normalizer.js?v=1"></script>')
    parts.append('<script src="/authors-presence.js?v=static-canonical-1"></script>')
    parts.append('<script src="/ludique.js?v=ludique-21" defer></script>')
    parts.append('<script src="/accessibilite.js?v=a11y-7" defer></script>')
    parts.append('</body></html>')
    return '\n'.join(parts)

def index_status(ev, today):
    try:
        start = dt.date.fromisoformat(iso_date(ev['date_debut']))
        end = dt.date.fromisoformat(iso_date(ev['date_fin']) or start.isoformat())
    except ValueError:
        return 'invalid'
    if end < start:
        return 'invalid'
    if end < today:
        return 'past'
    return 'ongoing' if start <= today else 'future'

def page_index(evs, base_url, today=None):
    today = today or dt.date.today()
    ongoing = [ev for ev in evs if index_status(ev, today) == 'ongoing']
    future = [ev for ev in evs if index_status(ev, today) == 'future']
    listed = ongoing + future
    parts = ['<!doctype html><html lang="fr"><head><meta charset="utf-8">', '<meta name="viewport" content="width=device-width,initial-scale=1">', f'<title>Agenda littéraire — salons, festivals et dédicaces | {MARQUE}</title>', '<meta name="description" content="Tous les salons du livre, festivals littéraires et dédicaces à venir en France, Belgique, Suisse, Luxembourg et Monaco.">', f'<link rel="canonical" href="{esc(base_url)}/evenement/index.html">', f'<meta name="theme-color" content="{COULEUR}">', f'<style>{CSS}</style></head><body>', f'<header class="site"><a href="{esc(base_url)}/">{MARQUE}</a></header>', '<div class="wrap">', '<h1>Agenda littéraire francophone</h1>', f'<p>{len(listed)} rendez-vous à venir ou en cours ({len(ongoing)} en cours, {len(future)} à venir) : salons, festivals et dédicaces en France, Belgique, Suisse, Luxembourg et Monaco.</p>']
    for ev in listed:
        lieu = ', '.join([p for p in (ev['ville'], ev['departement']) if p]) or ev['pays']
        when = date_fr(iso_date(ev['date_debut'])) if iso_date(ev['date_debut']) else ''
        parts.append(f'''<a class="card" href="{esc(ev['_slug'])}.html"><div class="t">{esc(ev['titre'])}</div><div class="s">{esc(ev.get('type') or deduire_type(ev['titre']))} · {esc(lieu)}{(' · ' + esc(when) if when else '')}</div></a>''')
    parts.append('</div></body></html>')
    return '\n'.join(parts)

def sitemap(evs, base_url):
    today = dt.date.today().isoformat()
    lignes = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'.replace('sitemap.org', 'sitemaps.org')]
    lignes.append(f'  <url><loc>{esc(base_url)}/evenement/index.html</loc><lastmod>{today}</lastmod><changefreq>daily</changefreq></url>')
    for ev in evs:
        lastmod = iso_date(ev['derniere_maj']) or today
        lignes.append(f"  <url><loc>{esc(base_url)}/evenement/{ev['_slug']}.html</loc><lastmod>{lastmod}</lastmod><changefreq>weekly</changefreq></url>")
    lignes.append('</urlset>')
    return '\n'.join(lignes)

def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda : handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def _public_event_request(url, key, cursor=None, limit=500):
    query = {'select': PUBLIC_EVENT_COLUMNS, 'validated': 'eq.true', 'rejected': 'eq.false', 'order': 'id.asc', 'limit': str(limit)}
    if cursor is not None:
        query['id'] = f'gt.{cursor}'
    endpoint = f"{url.rstrip('/')}/rest/v1/events?{urllib.parse.urlencode(query)}"
    return urllib.request.Request(endpoint, headers={'apikey': key, 'Authorization': f'Bearer {key}'}, method='GET')

def charger_evenements_publics(url, key, *, opener=urllib.request.urlopen, limit=500):
    """Lit tout le catalogue public, avec pagination stable par identifiant."""
    if not url or not key:
        raise GenerationSeoError('configuration Supabase publique manquante')
    rows = []
    seen = set()
    cursor = None
    for _ in range(200):
        request = _public_event_request(url, key, cursor=cursor, limit=limit)
        try:
            with opener(request, timeout=30) as response:
                page = json.loads(response.read().decode('utf-8'))
        except Exception as exc:
            raise GenerationSeoError(f'lecture Supabase impossible : {type(exc).__name__}') from exc
        if not isinstance(page, list):
            raise GenerationSeoError('réponse Supabase invalide')
        if not page:
            return rows
        for row in page:
            identifier = str((row or {}).get('id') or '').strip()
            if not identifier or identifier in seen:
                raise GenerationSeoError('pagination Supabase incohérente')
            if row.get('validated') is not True or row.get('rejected') is not False:
                raise GenerationSeoError(f'événement non public reçu : {identifier}')
            seen.add(identifier)
            rows.append(row)
        cursor = str(page[-1]['id'])
        if len(page) < limit:
            return rows
    raise GenerationSeoError('catalogue Supabase trop volumineux ou pagination non terminée')

def normaliser_evenement_public(row):
    country_code = normalize_inline_text(row.get('country_code')).upper()
    event = {'id': str(row.get('id') or '').strip(), 'titre': normalize_inline_text(row.get('title')), 'type': normalize_inline_text(row.get('type')), 'date_debut': iso_date(row.get('start_date')), 'date_fin': iso_date(row.get('end_date')), 'lieu': normalize_inline_text(row.get('city')), 'adresse': '', 'ville': normalize_inline_text(row.get('city')), 'code_postal': '', 'departement': normalize_inline_text(row.get('region')), 'pays': COUNTRY_NAMES.get(country_code, country_code), 'affiche': str(row.get('image_url') or '').strip(), 'site': str(row.get('website') or '').strip(), 'source': str(row.get('website') or '').strip(), 'auteurs': '', 'description': normalize_multiline_text(row.get('description')), 'derniere_maj': ''}
    if not event['id'] or not event['titre']:
        raise GenerationSeoError('événement public sans identifiant ou titre')
    return event

def appliquer_indices_slugs_sqlite(events, database):
    """Préserve les suffixes historiques sans laisser SQLite publier une ligne.

    Le corpus reste exactement celui reçu de Supabase. La base locale sert
    seulement à retrouver l'ancien identifiant numérique d'une même fiche.
    Une correspondance ambiguë est ignorée au profit de l'UUID Supabase.
    """
    database = Path(database).expanduser().resolve()
    if not database.is_file():
        return {'remote': 0, 'exact': 0, 'uuid': len(events)}
    connection = sqlite3.connect(f'file:{database}?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        locals_by_key = {}
        locals_by_id = {}
        for record in connection.execute('select * from evenements'):
            local = dict(record)
            locals_by_id[str(local['id'])] = local
            key = (normaliser_titre_dedup(local.get('titre') or ''), normaliser(local.get('ville') or ''), iso_date(local.get('date_debut')))
            if all(key):
                locals_by_key.setdefault(key, set()).add(str(local['id']))
        remote = {}
        try:
            records = connection.execute("select remote_uuid,event_id from dedicalivres_submissions where remote_uuid is not null and trim(remote_uuid) <> ''")
            for record in records:
                remote.setdefault(str(record['remote_uuid']), set()).add(str(record['event_id']))
        except sqlite3.OperationalError:
            pass
    finally:
        connection.close()
    counts = {'remote': 0, 'exact': 0, 'uuid': 0}
    for event in events:
        candidates = remote.get(str(event['id']), set())
        local_id = None
        if len(candidates) == 1:
            local_id = next(iter(candidates))
            counts['remote'] += 1
        else:
            key = (normaliser_titre_dedup(event.get('titre') or ''), normaliser(event.get('ville') or ''), iso_date(event.get('date_debut')))
            candidates = locals_by_key.get(key, set())
            if len(candidates) == 1:
                local_id = next(iter(candidates))
                counts['exact'] += 1
            else:
                counts['uuid'] += 1
        if local_id is None:
            continue
        event['_slug_suffix'] = local_id
        local = locals_by_id.get(local_id) or {}
        event['lieu'] = normalize_inline_text(local.get('lieu')) or event['lieu']
        event['adresse'] = normalize_inline_text(local.get('adresse'))
        event['code_postal'] = normalize_inline_text(local.get('code_postal'))
        event['auteurs'] = normalize_inline_text(local.get('auteurs'))
        event['source'] = str(local.get('source') or event['source']).strip()
        event['description'] = event['description'] or normalize_multiline_text(local.get('description'))
        event['affiche'] = event['affiche'] or str(local.get('affiche') or '').strip()
        event['site'] = event['site'] or str(local.get('site') or '').strip()
    return counts

def appliquer_slugs_statiques_existants(events, event_root):
    """Réutilise une URL publiée si son identité publique exacte est inchangée."""
    event_root = Path(event_root).expanduser().resolve()
    if not event_root.is_dir():
        return 0
    candidates = {}
    script_pattern = re.compile('<script type="application/ld\\+json">(.*?)</script>', re.DOTALL)
    for page in event_root.glob('*.html'):
        if page.name == 'index.html' or page.is_symlink():
            continue
        try:
            text = page.read_text(encoding='utf-8')
            payload = None
            for raw in script_pattern.findall(text):
                value = json.loads(raw)
                if value.get('@type') == 'Event':
                    payload = value
                    break
            if payload is None:
                continue
            address = (payload.get('location') or {}).get('address') or {}
            key = (normaliser_titre_dedup(payload.get('name') or ''), normaliser(address.get('addressLocality') or ''), iso_date(payload.get('startDate')))
            if all(key):
                candidates.setdefault(key, set()).add(page.stem)
        except (OSError, ValueError, TypeError):
            continue
    preserved = 0
    for event in events:
        key = (normaliser_titre_dedup(event.get('titre') or ''), normaliser(event.get('ville') or ''), iso_date(event.get('date_debut')))
        slugs = candidates.get(key, set())
        if len(slugs) == 1:
            event['_slug_override'] = next(iter(slugs))
            preserved += 1
    return preserved

def _load_credentials(config_path):
    url = str(os.environ.get('DEDICALIVRES_SUPABASE_URL') or '').strip()
    key = str(os.environ.get('DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY') or '').strip()
    return (url, key)

def _page_files(root):
    event_root = Path(root) / 'evenement'
    if not event_root.is_dir():
        return {}
    return {path.name: path for path in event_root.glob('*.html') if path.is_file() and path.name != 'index.html'}

def _read_manifest(root):
    path = Path(root) / MANIFEST_NAME
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        events = payload.get('events') or {}
        return {str(key): str(value) for (key, value) in events.items()}
    except (OSError, ValueError, TypeError):
        return {}

def _non_event_inventory(root):
    root = Path(root)
    if not root.is_dir():
        return {}
    generated = {MANIFEST_NAME, REPORT_NAME, 'sitemap-evenements.xml'}
    result = {}
    for path in root.rglob('*'):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if relative.parts and relative.parts[0] == 'evenement':
            continue
        if relative.as_posix() in generated:
            continue
        result[relative.as_posix()] = _sha256(path)
    return result

def _build_report(events, current_root, staged_root, sitemap_name):
    existing = _page_files(current_root)
    staged = _page_files(staged_root)
    (existing_names, staged_names) = (set(existing), set(staged))
    common = existing_names & staged_names
    updated = sorted((name for name in common if _sha256(existing[name]) != _sha256(staged[name])))
    unchanged = sorted(common - set(updated))
    old_manifest = _read_manifest(current_root)
    new_manifest = {str(event['id']): event['_slug'] for event in events}
    slug_changes = [{'event_id': identifier, 'avant': old_manifest[identifier], 'apres': slug_value} for (identifier, slug_value) in sorted(new_manifest.items()) if identifier in old_manifest and old_manifest[identifier] != slug_value]
    return {'status': 'PASS', 'source': 'supabase.events', 'public_events': len(events), 'existing_pages': len(existing), 'created_pages': sorted(staged_names - existing_names), 'updated_pages': updated, 'removed_pages': sorted(existing_names - staged_names), 'unchanged_pages': unchanged, 'slug_changes': slug_changes, 'sitemap_entries': len(events) + 1, 'sitemap': sitemap_name, 'errors': []}

def _validate_staged(events, staged_root, base_url, sitemap_name, preserved_before):
    root = Path(staged_root)
    pages = _page_files(root)
    expected = {f"{event['_slug']}.html": event for event in events}
    if set(pages) != set(expected):
        raise GenerationSeoError('corpus de pages différent du corpus Supabase')
    if len(expected) != len(events):
        raise GenerationSeoError('slug dupliqué')
    for (name, event) in expected.items():
        canonical = f'''<link rel="canonical" href="{base_url}/evenement/{event['_slug']}.html">'''
        if canonical not in pages[name].read_text(encoding='utf-8'):
            raise GenerationSeoError(f'canonical incohérente : {name}')
    sitemap_path = root / sitemap_name
    try:
        xml_root = ET.parse(sitemap_path).getroot()
    except (OSError, ET.ParseError) as exc:
        raise GenerationSeoError('sitemap invalide') from exc
    namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    locations = {node.text for node in xml_root.findall('sm:url/sm:loc', namespace)}
    expected_locations = {f'{base_url}/evenement/index.html'}
    expected_locations.update((f"{base_url}/evenement/{event['_slug']}.html" for event in events))
    if locations != expected_locations:
        raise GenerationSeoError('sitemap non aligné sur les pages')
    if _non_event_inventory(root) != preserved_before:
        raise GenerationSeoError('un fichier hors corpus événement a été modifié')

def generer_sortie_atomique(events, output, *, base_url, sitemap_name, dry_run=False):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    preserved_before = _non_event_inventory(output)
    previous_exists = output.exists()
    staging = Path(tempfile.mkdtemp(prefix=f'.{output.name}-staging-', dir=output.parent))
    backup = output.parent / f'.{output.name}-previous'
    try:
        if previous_exists:
            shutil.copytree(output, staging, dirs_exist_ok=True)
        event_root = staging / 'evenement'
        event_root.mkdir(parents=True, exist_ok=True)
        for old_page in event_root.glob('*.html'):
            old_page.unlink()
        for event in events:
            (event_root / f"{event['_slug']}.html").write_text(page_event(event, base_url), encoding='utf-8')
        (event_root / 'index.html').write_text(page_index(events, base_url), encoding='utf-8')
        (staging / sitemap_name).write_text(sitemap(events, base_url), encoding='utf-8')
        manifest = {'version': 1, 'source': 'supabase.events', 'events': {str(event['id']): event['_slug'] for event in events}}
        (staging / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        _validate_staged(events, staging, base_url, sitemap_name, preserved_before)
        report = _build_report(events, output, staging, sitemap_name)
        (staging / REPORT_NAME).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if dry_run:
            return report
        if backup.exists():
            shutil.rmtree(backup)
        if previous_exists:
            os.replace(output, backup)
        try:
            os.replace(staging, output)
        except Exception:
            if previous_exists and backup.exists() and (not output.exists()):
                os.replace(backup, output)
            raise
        if backup.exists():
            shutil.rmtree(backup)
        return report
    finally:
        if staging.exists():
            shutil.rmtree(staging)

def _print_report(report, *, dry_run):
    print('=== Génération statique Supabase → Dédicalivres ===')
    print(f"STATUT={report['status']}")
    print(f"MODE={('DRY-RUN' if dry_run else 'LOCAL')}")
    print(f"EVENEMENTS_PUBLICS={report['public_events']}")
    print(f"PAGES_EXISTANTES={report['existing_pages']}")
    print(f"PAGES_CREEES={len(report['created_pages'])}")
    print(f"PAGES_MISES_A_JOUR={len(report['updated_pages'])}")
    print(f"PAGES_SUPPRIMEES={len(report['removed_pages'])}")
    print(f"PAGES_INCHANGEES={len(report['unchanged_pages'])}")
    print(f"SLUGS_MODIFIES={len(report['slug_changes'])}")
    print(f"ENTREES_SITEMAP={report['sitemap_entries']}")
    print('ERREURS=0')

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source_root = Path(__file__).resolve().parent
    project_root = source_root.parent
    ap.add_argument('--config', default=str(source_root / 'config.yaml'))
    ap.add_argument('--db', default=str(project_root / 'runtime' / 'veille.sqlite3'), help='SQLite locale facultative, utilisée uniquement pour préserver les suffixes de slug')
    ap.add_argument('--existing-event-pages', default='', help='dossier evenement existant, lu uniquement pour préserver les URLs inchangées')
    ap.add_argument('--sortie', default=str(project_root / 'exports' / 'site-seo'))
    ap.add_argument('--sitemap-name', default='sitemap-evenements.xml', choices=('sitemap-evenements.xml',))
    ap.add_argument('--base-url', default='https://dedicalivres.fr')
    ap.add_argument('--dry-run', action='store_true', help='valider sans remplacer la sortie locale')
    args = ap.parse_args()
    expected_output = (project_root / 'exports' / 'site-seo').resolve()
    output = Path(args.sortie).expanduser().resolve()
    if os.environ.get('DEDICALIVRES_ALLOW_EXTERNAL_EXPORT') != '1' and output != expected_output:
        ap.error(f'la sortie SEO doit rester dans Auto-Matte : {expected_output} (reçu : {output})')
    try:
        (url, key) = _load_credentials(Path(args.config).expanduser().resolve())
        rows = charger_evenements_publics(url, key)
        events = [normaliser_evenement_public(row) for row in rows]
        slug_sources = appliquer_indices_slugs_sqlite(events, args.db)
        static_slugs = appliquer_slugs_statiques_existants(events, args.existing_event_pages) if args.existing_event_pages else 0
        attribuer_slugs(events)
        events.sort(key=lambda event: (iso_date(event['date_debut']) or '9999', str(event['id'])))
        report = generer_sortie_atomique(events, output, base_url=args.base_url.rstrip('/'), sitemap_name=args.sitemap_name, dry_run=args.dry_run)
        _print_report(report, dry_run=args.dry_run)
        print(f"SLUGS_PRESERVES=remote:{slug_sources['remote']},exact:{slug_sources['exact']},uuid:{slug_sources['uuid']}")
        print(f'SLUGS_STATIQUES_PRESERVES={static_slugs}')
        print('Publication Dédicalivres non effectuée.')
    except (GenerationSeoError, OSError, ValueError) as exc:
        print(f'❌ Génération refusée : {exc}', file=sys.stderr)
        raise SystemExit(2) from None
if __name__ == '__main__':
    main()
