import datetime as dt
import importlib.util
import sys
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('generate_events', HERE / 'generate-events.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class IndexDatesTest(unittest.TestCase):
    def test_ongoing_future_and_past(self):
        today = dt.date(2026, 10, 10)
        def event(slug, start, end):
            return {'_slug': slug, 'titre': slug, 'type': 'Salon', 'ville': 'Paris',
                    'departement': '', 'pays': 'France', 'date_debut': start, 'date_fin': end}

        events = [
            event('past', '2026-10-08', '2026-10-09'),
            event('ongoing', '2026-10-09', '2026-10-10'),
            event('future', '2026-10-11', ''),
            event('invalid', '2026-10-12', '2026-10-11'),
        ]
        self.assertEqual([generator.index_status(ev, today) for ev in events],
                         ['past', 'ongoing', 'future', 'invalid'])
        html = generator.page_index(events, 'https://www.dedicalivres.fr', today)
        self.assertIn('2 rendez-vous à venir ou en cours (1 en cours, 1 à venir)', html)
        self.assertIn('href="ongoing.html"', html)
        self.assertIn('href="future.html"', html)
        self.assertNotIn('href="past.html"', html)
        self.assertNotIn('href="invalid.html"', html)
        self.assertIn('<link rel="canonical" href="https://www.dedicalivres.fr/evenement/index.html">', html)
        sitemap = generator.sitemap([{**ev, 'derniere_maj': ''} for ev in events],
                                    'https://www.dedicalivres.fr')
        self.assertIn('/evenement/past.html</loc>', sitemap)


if __name__ == '__main__':
    unittest.main()
