import datetime as dt
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('refresh_index', HERE / 'refresh-index.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

BASE = 'https://dedicalivres.fr'
INDEX_URL = BASE + '/evenement/index.html'


def sitemap_xml(*slugs, date='2026-10-09'):
    urls = [INDEX_URL] + [f'{BASE}/evenement/{slug}.html' for slug in slugs]
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + ''.join(f'  <url><loc>{url}</loc><lastmod>{date}</lastmod></url>\n'
                      for url in urls) + '</urlset>\n')


def event(slug, start, end):
    return {'_slug': slug, 'titre': slug, 'type': 'Salon', 'ville': 'Paris',
            'departement': 'Île-de-France', 'pays': 'France',
            'date_debut': start, 'date_fin': end}


def detail(root, ev, *, canonical=True):
    url = f"{BASE}/evenement/{ev['_slug']}.html"
    data = {'@type': 'Event', 'name': ev['titre'], 'url': url,
            'startDate': ev['date_debut'], 'endDate': ev['date_fin'],
            'location': {'address': {'addressLocality': ev['ville'],
                                     'addressRegion': ev['departement'],
                                     'addressCountry': 'FR'}}}
    markup = (f'<link rel="canonical" href="{url if canonical else BASE}">'
              f'<script type="application/ld+json">{json.dumps(data)}</script>'
              '<span class="badge">Salon</span>')
    (root / 'evenement' / f"{ev['_slug']}.html").write_text(markup)


class RefreshIndexTest(unittest.TestCase):
    def test_dates_idempotence_and_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'evenement').mkdir()
            events = [event('ended', '2026-10-08', '2026-10-09'),
                      event('ongoing', '2026-10-09', '2026-10-10'),
                      event('future', '2026-10-11', '2026-10-12')]
            for ev in events:
                detail(root, ev)
            index = root / 'evenement' / 'index.html'
            index.write_text(refresh.generator.page_index(events[:2], BASE, dt.date(2026, 10, 9)))
            sitemap = root / 'sitemap-evenements.xml'
            sitemap_text = sitemap_xml('ended', 'ongoing', 'future')
            sitemap.write_text(sitemap_text)
            self.assertTrue(refresh.rebuild(root, dt.date(2026, 10, 10)))
            current = index.read_text()
            first_sitemap = sitemap.read_text()
            self.assertNotIn('href="ended.html"', current)
            self.assertIn('href="ongoing.html"', current)
            self.assertIn('href="future.html"', current)
            self.assertIn('2 rendez-vous à venir ou en cours (1 en cours, 1 à venir)', current)
            self.assertEqual(first_sitemap,
                             sitemap_text.replace('<lastmod>2026-10-09</lastmod>',
                                                  '<lastmod>2026-10-10</lastmod>', 1))
            self.assertFalse(refresh.rebuild(root, dt.date(2026, 10, 10)))
            self.assertEqual(index.read_text(), current)
            self.assertEqual(sitemap.read_text(), first_sitemap)
            self.assertTrue(refresh.rebuild(root, dt.date(2026, 10, 11)))
            self.assertNotIn('href="ongoing.html"', index.read_text())
            self.assertIn('href="future.html"', index.read_text())
            self.assertEqual(sitemap.read_text(),
                             sitemap_text.replace('<lastmod>2026-10-09</lastmod>',
                                                  '<lastmod>2026-10-11</lastmod>', 1))

    def test_invalid_detail_preserves_index(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'evenement').mkdir()
            ev = event('future', '2026-10-11', '2026-10-12')
            detail(root, ev, canonical=False)
            index = root / 'evenement' / 'index.html'
            original = refresh.generator.page_index([ev], BASE, dt.date(2026, 10, 10))
            index.write_text(original)
            sitemap_path = root / 'sitemap-evenements.xml'
            sitemap_path.write_text(sitemap_xml('future'))
            with self.assertRaisesRegex(ValueError, 'canonique'):
                refresh.rebuild(root, dt.date(2026, 10, 11))
            self.assertEqual(index.read_text(), original)
            self.assertEqual(sitemap_path.read_text(), sitemap_xml('future'))
            self.assertEqual(sorted(p.name for p in (root / 'evenement').iterdir()),
                             ['future.html', 'index.html'])

    def test_bad_sitemap_stops_before_either_write(self):
        for bad in ('<urlset>', sitemap_xml('future').replace(INDEX_URL, BASE + '/missing.html'),
                    sitemap_xml('future').replace('</urlset>',
                        f'<url><loc>{INDEX_URL}</loc><lastmod>2026-10-09</lastmod></url></urlset>'),
                    sitemap_xml('future').replace('</urlset>',
                        f'<url><loc>{BASE}/evenement/future.html</loc>'
                        '<lastmod>2026-10-09</lastmod></url></urlset>'),
                    sitemap_xml('future').replace('2026-10-09', 'not-a-date', 1)):
            with self.subTest(bad=bad[:50]), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'evenement').mkdir()
                ev = event('future', '2026-10-11', '2026-10-12')
                detail(root, ev)
                index = root / 'evenement/index.html'
                original = refresh.generator.page_index([ev], BASE, dt.date(2026, 10, 10))
                index.write_text(original)
                target = root / 'sitemap-evenements.xml'
                target.write_text(bad)
                with self.assertRaises(ValueError):
                    refresh.rebuild(root, dt.date(2026, 10, 11))
                self.assertEqual(index.read_text(), original)
                self.assertEqual(target.read_text(), bad)

    def test_scope_rejects_other_url_and_unexpected_file(self):
        before = sitemap_xml('future')
        after = refresh.updated_sitemap(before, INDEX_URL, dt.date(2026, 10, 10))
        refresh.assert_refresh_scope('before', 'after', before, after,
                                     {'evenement/index.html', 'sitemap-evenements.xml'},
                                     dt.date(2026, 10, 10), INDEX_URL)
        with self.assertRaisesRegex(ValueError, 'hors du lastmod'):
            refresh.assert_refresh_scope('before', 'after', before,
                after.replace(f'{BASE}/evenement/future.html', f'{BASE}/evenement/other.html'),
                {'evenement/index.html', 'sitemap-evenements.xml'},
                dt.date(2026, 10, 10), INDEX_URL)
        with self.assertRaisesRegex(ValueError, 'hors périmètre'):
            refresh.assert_refresh_scope('before', 'after', before, after,
                {'evenement/index.html', 'sitemap-evenements.xml', 'evenement/other.html'},
                dt.date(2026, 10, 10), INDEX_URL)

    def test_workflow_diff_gate_rejects_partial_or_extra_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'evenement').mkdir()
            before_index = f'<link rel="canonical" href="{INDEX_URL}">before'
            (root / 'evenement/index.html').write_text(before_index + ' after')
            before_sitemap = sitemap_xml('future')
            target = root / 'sitemap-evenements.xml'
            target.write_text(refresh.updated_sitemap(before_sitemap, INDEX_URL,
                                                       dt.date(2026, 10, 10)))
            status = ' M evenement/index.html\n M sitemap-evenements.xml\n'

            def git(args, **_kwargs):
                if args[1] == 'status':
                    return status
                return (before_index if args[2].endswith('index.html')
                        else before_sitemap).encode()

            with mock.patch.object(refresh.subprocess, 'check_output', side_effect=git):
                refresh.verify_git_diff(root, dt.date(2026, 10, 10))
                target.write_text(before_sitemap)
                with self.assertRaisesRegex(ValueError, 'sitemap modifié'):
                    refresh.verify_git_diff(root, dt.date(2026, 10, 10))
                target.write_text(refresh.updated_sitemap(before_sitemap, INDEX_URL,
                                                           dt.date(2026, 10, 10)))
                status += '?? evenement/unexpected.html\n'
                with self.assertRaisesRegex(ValueError, 'non suivi'):
                    refresh.verify_git_diff(root, dt.date(2026, 10, 10))

    def test_paris_date_and_production_sitemap_invariants(self):
        instant = dt.datetime(2026, 10, 17, 22, 30, tzinfo=dt.timezone.utc)
        self.assertEqual(refresh.paris_today(instant), dt.date(2026, 10, 18))
        source = (HERE.parent.parent / 'sitemap-evenements.xml').read_text()
        lastmod = dt.date.fromisoformat(refresh.sitemap_index_entry(source, INDEX_URL))
        self.assertEqual(refresh.updated_sitemap(source, INDEX_URL, lastmod), source)

        next_date = lastmod + dt.timedelta(days=1)
        updated = refresh.updated_sitemap(source, INDEX_URL, next_date)
        self.assertEqual(refresh.sitemap_index_entry(updated, INDEX_URL), next_date.isoformat())
        self.assertEqual(refresh.updated_sitemap(updated, INDEX_URL, next_date), updated)

        blocks = lambda text: re.findall(r'<url>.*?</url>', text, re.S)
        before, after = blocks(source), blocks(updated)
        self.assertGreater(len(before), 1)
        self.assertEqual(len(after), len(before))
        urls = lambda entries: [re.search(r'<loc>([^<]+)</loc>', entry).group(1)
                                for entry in entries]
        self.assertEqual(urls(after), urls(before))
        for url, original, refreshed in zip(urls(before), before, after):
            if url == INDEX_URL:
                self.assertEqual(refreshed.replace(f'<lastmod>{next_date}</lastmod>',
                                                   f'<lastmod>{lastmod}</lastmod>'), original)
            else:
                self.assertEqual(refreshed, original)


if __name__ == '__main__':
    unittest.main()
