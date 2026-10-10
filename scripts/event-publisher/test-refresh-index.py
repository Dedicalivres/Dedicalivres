import datetime as dt
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('refresh_index', HERE / 'refresh-index.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

BASE = 'https://dedicalivres.fr'


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
            sitemap.write_text('unchanged')
            self.assertTrue(refresh.rebuild(root, dt.date(2026, 10, 10)))
            current = index.read_text()
            self.assertNotIn('href="ended.html"', current)
            self.assertIn('href="ongoing.html"', current)
            self.assertIn('href="future.html"', current)
            self.assertIn('2 rendez-vous à venir ou en cours (1 en cours, 1 à venir)', current)
            self.assertFalse(refresh.rebuild(root, dt.date(2026, 10, 10)))
            self.assertEqual(index.read_text(), current)
            self.assertTrue(refresh.rebuild(root, dt.date(2026, 10, 11)))
            self.assertNotIn('href="ongoing.html"', index.read_text())
            self.assertIn('href="future.html"', index.read_text())
            self.assertEqual(sitemap.read_text(), 'unchanged')

    def test_invalid_detail_preserves_index(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'evenement').mkdir()
            ev = event('future', '2026-10-11', '2026-10-12')
            detail(root, ev, canonical=False)
            index = root / 'evenement' / 'index.html'
            original = refresh.generator.page_index([ev], BASE, dt.date(2026, 10, 10))
            index.write_text(original)
            with self.assertRaisesRegex(ValueError, 'canonique'):
                refresh.rebuild(root, dt.date(2026, 10, 11))
            self.assertEqual(index.read_text(), original)
            self.assertEqual(sorted(p.name for p in (root / 'evenement').iterdir()),
                             ['future.html', 'index.html'])


if __name__ == '__main__':
    unittest.main()
