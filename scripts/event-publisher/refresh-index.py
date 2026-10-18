#!/usr/bin/env python3
"""Rafraîchit seulement l'index depuis les fiches Event déjà publiées."""
import argparse
import datetime as dt
import html
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('generate_events', HERE / 'generate-events.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

EVENT_JSON = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
CANONICAL = re.compile(r'<link rel="canonical" href="([^"]+)">')
CARD = re.compile(r'<a class="card" href="([^"]+)">')
BADGE = re.compile(r'<span class="badge">(.*?)</span>', re.S)
SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
ALLOWED_PATHS = {'evenement/index.html', 'sitemap-evenements.xml'}


def paris_today(now=None):
    return (now or dt.datetime.now(dt.timezone.utc)).astimezone(ZoneInfo('Europe/Paris')).date()


def sitemap_index_entry(source, index_url):
    try:
        root = ET.fromstring(source)
        if root.tag != f'{{{SITEMAP_NS}}}urlset':
            raise ValueError('racine sitemap invalide')
        entries = root.findall(f'{{{SITEMAP_NS}}}url')
        urls = []
        target = []
        for entry in entries:
            loc = entry.findall(f'{{{SITEMAP_NS}}}loc')
            if len(loc) != 1 or not loc[0].text:
                raise ValueError('URL sitemap absente ou multiple')
            urls.append(loc[0].text)
            if loc[0].text == index_url:
                target.append(entry)
        if len(urls) != len(set(urls)) or len(target) != 1:
            raise ValueError('URL sitemap dupliquée ou index absent')
        lastmod = target[0].findall(f'{{{SITEMAP_NS}}}lastmod')
        if len(lastmod) != 1 or not lastmod[0].text:
            raise ValueError('lastmod de l’index absent ou multiple')
        dt.date.fromisoformat(lastmod[0].text)
    except ET.ParseError as exc:
        raise ValueError(f'sitemap XML invalide : {exc}') from exc
    return lastmod[0].text


def updated_sitemap(source, index_url, today):
    old_date = sitemap_index_entry(source, index_url)
    matches = [match for match in re.finditer(r'<url>(.*?)</url>', source, re.S)
               if f'<loc>{index_url}</loc>' in match.group(1)]
    if len(matches) != 1:
        raise ValueError('entrée XML de l’index introuvable ou dupliquée')
    entry = matches[0]
    dates = list(re.finditer(r'<lastmod>([^<]+)</lastmod>', entry.group(1)))
    if len(dates) != 1 or dates[0].group(1) != old_date:
        raise ValueError('lastmod de l’index incohérent')
    start = entry.start(1) + dates[0].start(1)
    end = start + len(old_date)
    refreshed = source[:start] + today.isoformat() + source[end:]
    sitemap_index_entry(refreshed, index_url)
    return refreshed


def assert_refresh_scope(before_index, after_index, before_sitemap, after_sitemap,
                         changed_paths, today, index_url):
    if not changed_paths.issubset(ALLOWED_PATHS):
        raise ValueError('fichier hors périmètre du rafraîchissement')
    expected = (updated_sitemap(before_sitemap, index_url, today)
                if before_index != after_index else before_sitemap)
    sitemap_index_entry(after_sitemap, index_url)
    if after_sitemap != expected:
        raise ValueError('sitemap modifié hors du lastmod de l’index')
    actual = ({'evenement/index.html'} if before_index != after_index else set())
    if before_sitemap != after_sitemap:
        actual.add('sitemap-evenements.xml')
    if changed_paths != actual:
        raise ValueError('fichiers modifiés et contenus non alignés')


def verify_git_diff(root, today):
    status = subprocess.check_output(
        ['git', 'status', '--porcelain', '--untracked-files=all'], cwd=root, text=True)
    lines = status.splitlines()
    if any(line[:2] != ' M' for line in lines):
        raise ValueError('fichier non suivi, supprimé ou déjà indexé')
    changed_paths = {line[3:] for line in lines}
    def committed(path):
        return subprocess.check_output(['git', 'show', f'HEAD:{path}'], cwd=root).decode('utf-8')
    before_index = committed('evenement/index.html')
    after_index = (root / 'evenement/index.html').read_text(encoding='utf-8')
    before_sitemap = committed('sitemap-evenements.xml')
    after_sitemap = (root / 'sitemap-evenements.xml').read_text(encoding='utf-8')
    canonical = CANONICAL.findall(after_index)
    if len(canonical) != 1:
        raise ValueError('canonical de l’index invalide')
    assert_refresh_scope(before_index, after_index, before_sitemap, after_sitemap,
                         changed_paths, today, canonical[0])


def rebuild(root, today):
    event_root = root / 'evenement'
    index_path = event_root / 'index.html'
    current = index_path.read_text(encoding='utf-8')
    canonical = CANONICAL.findall(current)
    if len(canonical) != 1 or not canonical[0].endswith('/evenement/index.html'):
        raise ValueError('canonical de l’index invalide')
    base_url = canonical[0].removesuffix('/evenement/index.html')
    if not base_url.startswith('https://'):
        raise ValueError('origine canonique invalide')
    old_cards = CARD.findall(current)
    if len(old_cards) != len(set(old_cards)):
        raise ValueError('cartes dupliquées dans l’index')
    order = {name: position for position, name in enumerate(old_cards)}

    events = []
    for path in sorted(event_root.glob('*.html')):
        if path.name == 'index.html':
            continue
        page = path.read_text(encoding='utf-8')
        try:
            objects = [json.loads(block) for block in EVENT_JSON.findall(page)]
            matches = [obj for obj in objects if isinstance(obj, dict) and obj.get('@type') == 'Event']
            if len(matches) != 1:
                raise ValueError('JSON-LD Event absent ou multiple')
            data = matches[0]
            expected = f'{base_url}/evenement/{path.name}'
            if CANONICAL.findall(page) != [expected] or data.get('url') != expected:
                raise ValueError('URL canonique incohérente')
            address = data['location']['address']
            badge = BADGE.findall(page)
            start, end = data['startDate'], data['endDate']
            if not badge or not data['name'] or not address['addressLocality'] or not address['addressRegion']:
                raise ValueError('informations de carte manquantes')
            if address['addressCountry'] not in generator.COUNTRY_NAMES:
                raise ValueError('pays inconnu')
            event = {
                '_slug': path.stem, 'titre': data['name'], 'type': html.unescape(badge[0]),
                'ville': address['addressLocality'], 'departement': address['addressRegion'],
                'pays': generator.COUNTRY_NAMES[address['addressCountry']],
                'date_debut': start, 'date_fin': end,
            }
            if generator.index_status(event, today) == 'invalid':
                raise ValueError('dates invalides')
            events.append(event)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError(f'{path.name}: {exc}') from exc

    if not events or not set(old_cards).issubset({f"{event['_slug']}.html" for event in events}):
        raise ValueError('corpus de fiches incomplet')
    events.sort(key=lambda event: (event['date_debut'], order.get(f"{event['_slug']}.html", len(order)), event['_slug']))
    refreshed = generator.page_index(events, base_url, today)
    sitemap_path = root / 'sitemap-evenements.xml'
    sitemap = sitemap_path.read_text(encoding='utf-8')
    index_url = canonical[0]
    sitemap_index_entry(sitemap, index_url)
    if refreshed == current:
        return False
    refreshed_sitemap = updated_sitemap(sitemap, index_url, today)
    temp_paths = []
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=event_root,
                                         prefix='.index-', suffix='.tmp', delete=False) as handle:
            temp_paths.append(Path(handle.name))
            handle.write(refreshed)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=root,
                                         prefix='.sitemap-', suffix='.tmp', delete=False) as handle:
            temp_paths.append(Path(handle.name))
            handle.write(refreshed_sitemap)
        os.replace(temp_paths[0], index_path)
        os.replace(temp_paths[1], sitemap_path)
    finally:
        for temp_path in temp_paths:
            temp_path.unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=HERE.parent.parent)
    parser.add_argument('--today', type=dt.date.fromisoformat, default=paris_today())
    parser.add_argument('--verify-diff', action='store_true')
    args = parser.parse_args()
    try:
        if args.verify_diff:
            verify_git_diff(args.root, args.today)
            print('PASS diff index et sitemap')
            return
        changed = rebuild(args.root, args.today)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        parser.exit(2, f'STOP: index conservé : {exc}\n')
    print('UPDATED' if changed else 'UNCHANGED')


if __name__ == '__main__':
    main()
