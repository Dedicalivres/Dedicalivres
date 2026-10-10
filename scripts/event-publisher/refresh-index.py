#!/usr/bin/env python3
"""Rafraîchit seulement l'index depuis les fiches Event déjà publiées."""
import argparse
import datetime as dt
import html
import importlib.util
import json
import os
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('generate_events', HERE / 'generate-events.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

EVENT_JSON = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
CANONICAL = re.compile(r'<link rel="canonical" href="([^"]+)">')
CARD = re.compile(r'<a class="card" href="([^"]+)">')
BADGE = re.compile(r'<span class="badge">(.*?)</span>', re.S)


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
    if refreshed == current:
        return False
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=event_root,
                                         prefix='.index-', suffix='.tmp', delete=False) as handle:
            temp_path = Path(handle.name)
            handle.write(refreshed)
        os.replace(temp_path, index_path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=HERE.parent.parent)
    parser.add_argument('--today', type=dt.date.fromisoformat, default=dt.datetime.now(dt.timezone.utc).date())
    args = parser.parse_args()
    try:
        changed = rebuild(args.root, args.today)
    except (OSError, ValueError) as exc:
        parser.exit(2, f'STOP: index conservé : {exc}\n')
    print('UPDATED' if changed else 'UNCHANGED')


if __name__ == '__main__':
    main()
