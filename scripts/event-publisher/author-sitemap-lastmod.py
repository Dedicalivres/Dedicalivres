"""Update only changed author lastmod values in an existing targeted sitemap."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
from xml.etree import ElementTree as ET

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('refresh', Path(__file__).with_name('refresh-index.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
INDEX = 'https://dedicalivres.fr/auteurs/'


def update(source, urls, changed, day):
    today = dt.date.fromisoformat(day)
    if today.isoformat() != day or '<!DOCTYPE' in source.upper() or '<!ENTITY' in source.upper():
        raise ValueError('sitemap/date ambigu')
    root = ET.fromstring(source)
    if root.tag != NS + 'urlset' or any(entry.tag != NS + 'url' for entry in root):
        raise ValueError('racine ou entrée sitemap invalide')
    actual = []
    for entry in root:
        loc = entry.findall(NS + 'loc')
        if len(loc) != 1 or not loc[0].text:
            raise ValueError('URL absente ou multiple')
        dates = entry.findall(NS + 'lastmod')
        if len(dates) > 1:
            raise ValueError('lastmod multiple')
        if dates:
            if not dates[0].text or dt.date.fromisoformat(dates[0].text).isoformat() != dates[0].text:
                raise ValueError('lastmod invalide')
        actual.append(loc[0].text)
    if not isinstance(urls, list) or not isinstance(changed, list) or INDEX not in urls \
            or len(urls) != len(set(urls)) or len(actual) != len(set(actual)) \
            or set(actual) != set(urls) or len(changed) != len(set(changed)) \
            or not set(changed) <= set(urls) - {INDEX}:
        raise ValueError('URL ajoutée, supprimée, inconnue ou dupliquée')
    # Validate every author entry, including those which will remain untouched.
    for url in urls:
        if url != INDEX:
            previous = refresh.sitemap_index_entry(source, url)
            if dt.date.fromisoformat(previous).isoformat() != previous:
                raise ValueError('lastmod ambigu')
    result = source
    for url in changed:
        if dt.date.fromisoformat(refresh.sitemap_index_entry(source, url)) > today:
            raise ValueError('retour temporel lastmod interdit')
        result = refresh.updated_sitemap(result, url, today)
    return result


if __name__ == '__main__':
    try:
        payload = json.load(sys.stdin)
        sys.stdout.write(update(payload['source'], payload['urls'], payload['changed'], payload['day']))
    except (ValueError, KeyError, TypeError, ET.ParseError) as error:
        print(f'STOP sitemap auteurs : {error}', file=sys.stderr)
        raise SystemExit(2)
