#!/usr/bin/env python3
"""Project temporal HTML from published files only. Never apply or publish it."""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from xml.etree import ElementTree as ET

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('refresh', ROOT / 'scripts/event-publisher/refresh-index.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
ARCHIVE = re.compile(r'evenements-litteraires-france-archives-[1-9]\d*\.html')


def run(root, *args, env=None):
    return subprocess.check_output(args, cwd=root, env=env, stderr=subprocess.STDOUT)


def files(root):
    return {str(p.relative_to(root)): p.read_bytes() for p in root.rglob('*')
            if p.is_file() and '.git' not in p.relative_to(root).parts}


def sitemap_urls(xml):
    root = ET.fromstring(xml)
    if root.tag != NS + 'urlset':
        raise ValueError('racine sitemap invalide')
    urls = []
    for entry in root:
        loc = entry.findall(NS + 'loc')
        dates = entry.findall(NS + 'lastmod')
        if len(loc) != 1 or not loc[0].text or len(dates) != 1:
            raise ValueError('entrée sitemap invalide')
        dt.date.fromisoformat(dates[0].text)
        urls.append(loc[0].text)
    if len(urls) != len(set(urls)):
        raise ValueError('URL sitemap dupliquée')
    return urls


def corpus(root):
    mapping = json.loads((root / 'docs/territoires/event-canonical-map.json').read_text())
    snapshot = json.loads((root / 'docs/territoires/catalogue-public.json').read_text())
    ids = [str(e['id']) for e in snapshot['events']]
    if len(ids) != len(set(ids)) or set(ids) != set(mapping) or len(set(mapping.values())) != len(mapping):
        raise ValueError('corpus canonique incomplet, inconnu ou dupliqué')
    if any(not re.fullmatch(r'evenement/[^/]+\.html', p) or p == 'evenement/index.html'
           or not (root / p).is_file() for p in mapping.values()):
        raise ValueError('chemin canonique invalide')
    if any(e.get('validated') is not True or e.get('rejected') is not False for e in snapshot['events']):
        raise ValueError('événement non publié dans la capture')
    published = {p for p in files(root) if p.startswith('evenement/') and p.endswith('.html')
                 and p != 'evenement/index.html'}
    if published != set(mapping.values()):
        raise ValueError('fiches et canonicals non alignés')
    urls = sitemap_urls((root / 'sitemap-evenements.xml').read_text())
    if set(urls) != {'https://dedicalivres.fr/' + p for p in published | {'evenement/index.html'}}:
        raise ValueError('sitemap des fiches incohérent')
    return snapshot, mapping


def allowed_paths(root):
    audit = json.loads((root / 'docs/territoires/audit.json').read_text())
    cities = {p.name for p in root.glob('evenements-litteraires-*.html')
              if re.search(r'data-city="[^"]+"', p.read_text())}
    return {'index.html', 'salons-du-livre.html', 'dedicaces.html', 'evenement/index.html',
            'sitemap.xml', 'sitemap-evenements.xml', 'docs/territoires/audit.json'} | cities | {
                p['file'] for p in audit['territorialPages']} | {
                    p.name for p in root.glob('evenements-litteraires-france-archives-*.html')
                    if ARCHIVE.fullmatch(p.name)}


def assert_scope(before, after, allowed):
    removed = set(before) - set(after)
    changed = {p for p in after if before.get(p) != after[p]}
    added = set(after) - set(before)
    if removed or any(not ARCHIVE.fullmatch(p) for p in added):
        raise ValueError('suppression ou nouvelle page non autorisée')
    if len(changed) > 250 or changed - allowed - {p for p in added if ARCHIVE.fullmatch(p)}:
        raise ValueError('différentiel hors périmètre : ' + ', '.join(sorted(changed - allowed - added)))
    return changed


def seo(html):
    return re.findall(r'<title>.*?</title>|<meta\b[^>]+>|<link rel="canonical"[^>]+>|<h1\b[^>]*>.*?</h1>', html, re.S)



def preview_frame(html):
    html = re.sub(r'<!-- STATIC-EVENT-PREVIEW:[^:]+:START -->[\s\S]*?<!-- STATIC-EVENT-PREVIEW:[^:]+:END -->', 'PREVIEW', html)
    html = re.sub(r'<div id="current-events-grid"[^>]*>[\s\S]*?</div>(?=\s*</section>)', 'CURRENT', html)
    return re.sub(r'<p\s+id="(?:results-count|seo-count)"[^>]*>[\s\S]*?</p>', 'COUNT', html)


def structured(html):
    result = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        data = json.loads(block)
        if isinstance(data, dict):
            data.pop('dateModified', None)
        result.append(data)
    return result



def assert_previews(stage, day):
    events = {str(e['id']): e for e in json.loads((stage / 'docs/territoires/catalogue-public.json').read_text())['events']}
    def check(block, expected):
        ids = re.findall(r'<article[^>]*data-event-id="([^"]+)"', block)
        if len(ids) != len(set(ids)):
            raise ValueError('doublon dans un aperçu')
        for identifier in ids:
            e = events.get(identifier)
            if e is None or e.get('registration_force_status') == 'annule':
                raise ValueError('événement inconnu ou annulé dans un aperçu')
            event = {'date_debut': e['start_date'], 'date_fin': e.get('end_date')}
            if refresh.generator.index_status(event, day) != expected:
                raise ValueError('classement temporel incohérent dans un aperçu')
    for key, file in [('home', 'index.html'), ('salons', 'salons-du-livre.html'), ('dedicaces', 'dedicaces.html')]:
        html = (stage / file).read_text()
        blocks = re.findall(r'<!-- STATIC-EVENT-PREVIEW:' + key + r':START -->(.*?)<!-- STATIC-EVENT-PREVIEW:' + key + r':END -->', html, re.S)
        if len(blocks) != 1:
            raise ValueError('bloc statique absent ou multiple')
        check(blocks[0], 'future')
        if key == 'home':
            blocks = re.findall(r'<section id="current-events"[^>]*>(.*?)</section>', html, re.S)
            if len(blocks) != 1:
                raise ValueError('section en cours absente ou multiple')
            check(blocks[0], 'ongoing')



def assert_france_archives(stage, day):
    events = json.loads((stage / 'docs/territoires/catalogue-public.json').read_text())['events']
    france = {str(e['id']): e for e in events if e.get('country_code') == 'FR'}
    past = {identifier for identifier, e in france.items()
            if e.get('registration_force_status') != 'annule'
            and refresh.generator.index_status({'date_debut':e.get('start_date'), 'date_fin':e.get('end_date')}, day) == 'past'}
    paths = sorted(stage.glob('evenements-litteraires-france-archives-*.html'),
                   key=lambda p: int(p.stem.rsplit('-', 1)[-1]))
    expected_count = (len(past) + 49) // 50
    if [p.name for p in paths] != [f'evenements-litteraires-france-archives-{i}.html' for i in range(1, expected_count + 1)]:
        raise ValueError('pagination archives incohérente')
    ids = lambda html: re.findall(r'<li data-event-id="([^"]+)"', html)
    archived = []
    for number, path in enumerate(paths, 1):
        rows = ids(path.read_text())
        if len(rows) != min(50, len(past) - (number - 1) * 50):
            raise ValueError('taille de page archives incohérente')
        archived += rows
    if len(archived) != len(set(archived)) or set(archived) != past:
        raise ValueError('archive inconnue, non passée, dupliquée ou perdue')
    national = ids((stage / 'evenements-litteraires-france.html').read_text())
    if len(national + archived) != len(france) or set(national + archived) != set(france):
        raise ValueError('couverture France incomplète ou dupliquée')


def generate(stage, day, before, allowed):
    env = {**os.environ, 'PUBLICATION_REFERENCE_DATE': day.isoformat(), 'PYTHONDONTWRITEBYTECODE': '1'}
    # No captures, network requests, Event generation or job reservation.
    refresh.rebuild(stage, day)
    for script in ('build-static-agenda-previews.mjs', 'build-territorial-pages.mjs'):
        run(stage, 'node', 'scripts/' + script, env=env)
    run(stage, 'node', 'scripts/project-targeted-publication.mjs', 'temporal-aggregates', env=env)
    assert_previews(stage, day)
    assert_france_archives(stage, day)
    current = files(stage)
    changed = assert_scope(before, current, allowed)
    # Preserve SEO and every URL. Lastmod follows actual content, never capture time.
    xml = before['sitemap.xml'].decode()
    generated_urls = sitemap_urls(current['sitemap.xml'].decode())
    old_urls = sitemap_urls(xml)
    added_urls = [u for u in generated_urls if u not in old_urls]
    if any(not ARCHIVE.fullmatch(u.removeprefix('https://dedicalivres.fr/')) for u in added_urls):
        raise ValueError('nouvelle URL non autorisée')
    if set(old_urls) - set(generated_urls):
        raise ValueError('URL supprimée du sitemap')
    # The existing aggregate guard validated new archive pagination and its URLs.
    for url in added_urls:
        entries = re.findall(r'<url>[\s\S]*?</url>', current['sitemap.xml'].decode())
        entry = next(e for e in entries if f'<loc>{url}</loc>' in e)
        xml = xml.replace('</urlset>', '  ' + entry + '\n</urlset>')
    for path in sorted(changed):
        if not path.endswith('.html') or path == 'evenement/index.html':
            continue
        html = current[path].decode()
        if path in before and (seo(before[path].decode()) != seo(html)
                               or structured(before[path].decode()) != structured(html)):
            raise ValueError('métadonnées SEO modifiées : ' + path)
        if path in before and (path in {'index.html', 'salons-du-livre.html', 'dedicaces.html'}
                               or 'data-city=' in html):
            if preview_frame(before[path].decode()) != preview_frame(html):
                raise ValueError('contenu hors aperçu modifié : ' + path)
        ids = re.findall(r'<li data-event-id="([^"]+)"', html)
        if len(ids) != len(set(ids)):
            raise ValueError('événement dupliqué sur une page : ' + path)
        canonical = re.findall(r'<link rel="canonical" href="([^"]+)"\s*/?>', html)
        if len(canonical) != 1:
            raise ValueError('canonical absent ou multiple : ' + path)
        xml = refresh.updated_sitemap(xml, canonical[0], day)
    (stage / 'sitemap.xml').write_text(xml)
    after = files(stage)
    assert_scope(before, after, allowed)
    if sitemap_urls(xml) != old_urls + added_urls:
        raise ValueError('ordre du sitemap modifié')
    return after


def project(root, output, day):
    snapshot, mapping = corpus(root)
    old_day = dt.date.fromisoformat(json.loads((root / 'docs/territoires/audit.json').read_text())['today'])
    if day < old_day:
        raise ValueError('retour temporel interdit')
    output = output.resolve()
    if output == root.resolve() or root.resolve() in output.parents:
        raise ValueError('sortie requise hors du dépôt')
    if output.exists():
        raise ValueError('sortie déjà présente')
    with tempfile.TemporaryDirectory(prefix='dedicalivres-temporal-') as temp:
        stage = Path(temp) / 'repo'
        run(root, 'git', 'clone', '--quiet', '--no-hardlinks', str(root), str(stage))
        # Test the current scripts, including an uncommitted local candidate.
        shutil.copytree(root / 'scripts', stage / 'scripts', dirs_exist_ok=True)
        before = files(stage)
        for name in ('sitemap.xml', 'sitemap-evenements.xml'):
            sitemap_urls(before[name].decode())
        allowed = allowed_paths(stage)
        after = generate(stage, day, before, allowed)
        second = generate(stage, day, before, allowed)
        if after != second:
            raise ValueError('seconde exécution non idempotente')
        if corpus(stage) != (snapshot, mapping):
            raise ValueError('corpus métier modifié')
        # Include validated new archives in the complete patch.
        added = set(after) - set(before)
        if added:
            run(stage, 'git', 'add', '--intent-to-add', '--', *sorted(added))
        paths = sorted(p for p in after if after[p] != before.get(p))
        run(stage, 'git', 'diff', '--check', '--', *paths)
        patch = run(stage, 'git', 'diff', '--binary', '--', *paths) if paths else b''
        output.mkdir(parents=True)
        (output / 'projection.patch').write_bytes(patch)
        report = {'date': day.isoformat(), 'base': run(root, 'git', 'rev-parse', 'HEAD').decode().strip(),
                  'events': len(mapping), 'files': paths, 'created': sorted(added), 'deleted': [],
                  'html_pages': sum(p.endswith('.html') for p in paths), 'idempotent': True,
                  'event_pages_unchanged': True, 'canonical_map_unchanged': True,
                  'capturedAt_unchanged': True, 'publication': False}
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False))
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--today', type=dt.date.fromisoformat, default=refresh.paris_today())
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        project(ROOT, args.output, args.today)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        if isinstance(exc, subprocess.CalledProcessError):
            print(exc.output.decode(), file=sys.stderr)
        parser.exit(2, f'STOP: aucune projection publiée : {exc}\n')
