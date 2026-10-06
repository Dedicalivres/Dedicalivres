from __future__ import annotations

"""Compatibilité minimale du publisher statique Dédicalivres.

Extraction ciblée des fonctions nécessaires au générateur SEO ; aucun moteur de veille Auto-Matte n’est embarqué.
"""

import json

import re

import unicodedata

MOTS_VIDES = {'le', 'la', 'les', 'de', 'du', 'des', 'd', 'l', 'et', 'a', 'au', 'aux', 'en', 'sur', 'salon', 'festival', 'fete', 'livre', 'livres', 'litteraire', 'edition', 'eme', 'e'}

def normaliser(texte: str) -> str:
    if not isinstance(texte, str):
        texte = str(texte) if texte else ''
    txt = unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode()
    txt = re.sub('\\b(?:\\d+)(?:e|eme|er)?\\b', ' ', txt.lower())
    txt = re.sub('[^a-z0-9 ]', ' ', txt)
    return ' '.join((m for m in txt.split() if m not in MOTS_VIDES))

def normaliser_titre_dedup(texte: str) -> str:
    """Normalisation dédiée aux titres pour l'anti-doublon.

    Contrairement à normaliser(), conserve les mots structurants du domaine
    littéraire (salon, festival, livre, fête...). Cela évite qu'un titre
    générique comme « Salon du livre » devienne une chaîne vide.
    """
    if not isinstance(texte, str):
        texte = str(texte) if texte else ''
    txt = unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode()
    txt = re.sub('\\b(?:\\d+)(?:e|eme|er)?\\b', ' ', txt.lower())
    txt = re.sub('[^a-z0-9 ]', ' ', txt)
    return ' '.join(txt.split())

def _prov(ev):
    p = ev.get('provenance') or {}
    if isinstance(p, str):
        try:
            p = json.loads(p)
        except Exception:
            p = {}
    return p if isinstance(p, dict) else {}

def association_confirmee(a, b):
    """Une URL partagée ne prouve pas l'identité d'un événement."""

    def identity_title(value):
        text = unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode().lower()
        return ' '.join(re.sub('[^a-z0-9]', ' ', text).split())
    title_a = identity_title(a.get('titre'))
    title_b = identity_title(b.get('titre'))
    if not title_a or title_a != title_b:
        return False
    support = False
    for key in ('date_debut', 'ville', 'pays', 'code_postal'):
        (left, right) = (str(a.get(key) or '').strip(), str(b.get(key) or '').strip())
        if not left or not right:
            continue
        if key == 'date_debut':
            (left, right) = (left[:10], right[:10])
        else:
            (left, right) = (unicodedata.normalize('NFKD', left).casefold(), unicodedata.normalize('NFKD', right).casefold())
        if left != right:
            return False
        if key in {'date_debut', 'ville'}:
            support = True
    return support

def signaler_association(ev):
    result = dict(ev)
    raw = result.get('qualite') or {}
    try:
        quality = json.loads(raw) if isinstance(raw, str) else dict(raw)
    except (ValueError, TypeError):
        quality = {}
    if not isinstance(quality, dict):
        quality = {}
    reason = 'Association incertaine : preuve non rattachée à cet événement'
    errors = quality.get('erreurs') or []
    errors = errors if isinstance(errors, list) else [str(errors)]
    quality['erreurs'] = list(dict.fromkeys([str(e) for e in errors] + [reason]))
    quality['association_a_verifier'] = True
    quality['ok'] = False
    result['qualite'] = json.dumps(quality, ensure_ascii=False)
    return result

def fusionner(ev1: dict, ev2: dict) -> dict:
    """Fusion champ par champ en favorisant données officielles et confiance."""
    if not association_confirmee(ev1, ev2):
        return signaler_association(ev1)
    (a, b) = (dict(ev1), dict(ev2))
    (ca, cb) = (int(a.get('confiance') or 0), int(b.get('confiance') or 0))
    fusion = dict(a)
    prov = _prov(a)
    prov2 = _prov(b)
    champs = set(a) | set(b)
    for k in champs:
        (va, vb) = (a.get(k), b.get(k))
        if vb and (not va):
            fusion[k] = vb
            if k in prov2:
                prov[k] = prov2[k]
        elif vb and va and (k in {'description', 'affiche', 'adresse', 'lieu', 'auteurs', 'code_postal'}):
            if cb >= ca and len(str(vb)) > len(str(va)) * 1.15:
                fusion[k] = vb
                if k in prov2:
                    prov[k] = prov2[k]
    if b.get('source_officielle') and (not fusion.get('source_officielle')):
        fusion['source_officielle'] = b['source_officielle']
    if b.get('site') and b.get('site_type') in {'officiel', 'social_officiel'} and (fusion.get('site_type') not in {'officiel', 'social_officiel'}):
        (fusion['site'], fusion['site_type']) = (b['site'], b.get('site_type') or 'officiel')
        fusion['source_officielle'] = b.get('source_officielle') or b['site']
        if 'site' in prov2:
            prov['site'] = prov2['site']
    fusion['provenance'] = json.dumps(prov, ensure_ascii=False)
    fusion['confiance'] = max(ca, cb)
    from .qualite import fusionner_reserves
    fusionner_reserves(fusion, a, b)
    return fusion



SUBMITTED_STATUSES = {'accepted_pending', 'validated_remote', 'duplicate_remote'}
