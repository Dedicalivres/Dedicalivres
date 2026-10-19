#!/usr/bin/env python3
"""Offline temporal projections and fail-closed regression checks."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import shutil
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('temporal', ROOT / 'scripts/refresh-temporal-catalogues.py')
temporal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(temporal)
DAYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-25', '2026-10-26']


class TemporalTests(unittest.TestCase):
    def test_boundary_parity_and_paris_dst(self):
        fixture = {'start_date': '2026-10-19', 'end_date': '2026-10-25'}
        script = "import {classify} from './scripts/territorial-catalog.mjs';console.log(JSON.stringify(JSON.parse(process.argv[1]).map(([e,d])=>classify(e,d))))"
        rows = [(fixture, day) for day in DAYS]
        node = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script, json.dumps(rows)], cwd=ROOT))
        self.assertEqual(node, ['future', 'ongoing', 'ongoing', 'ongoing', 'past'])
        py = [temporal.refresh.generator.index_status({'date_debut': fixture['start_date'], 'date_fin': fixture['end_date']}, dt.date.fromisoformat(day)) for day in DAYS]
        self.assertEqual(py, node)
        same_day = {'start_date':'2026-10-19', 'end_date':None}
        rows = [(same_day, day) for day in DAYS]
        self.assertEqual(json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script, json.dumps(rows)], cwd=ROOT)), ['future','ongoing','past','past','past'])
        for instant in ('2026-10-25T00:30:00+00:00','2026-10-25T01:30:00+00:00'):
            self.assertEqual(temporal.refresh.paris_today(dt.datetime.fromisoformat(instant)), dt.date(2026,10,25))
        for day in DAYS:
            instant = dt.datetime.fromisoformat(day + 'T23:30:00+00:00')
            self.assertEqual(temporal.refresh.paris_today(instant), dt.date.fromisoformat(day) + dt.timedelta(days=1))

    def test_five_complete_offline_projections_and_idempotence(self):
        with tempfile.TemporaryDirectory() as temp:
            for day in DAYS:
                with self.subTest(day=day):
                    report = temporal.project(ROOT, Path(temp) / day, dt.date.fromisoformat(day))
                    self.assertEqual(report['events'], len(json.loads((ROOT / 'docs/territoires/event-canonical-map.json').read_text())))
                    self.assertTrue(report['idempotent'])
                    self.assertTrue(report['event_pages_unchanged'])
                    self.assertEqual(report['deleted'], [])
                    self.assertFalse(report['publication'])

    def test_scope_stops(self):
        before = {'index.html': b'old', 'evenement/event.html': b'legacy'}
        for after in ({'index.html': b'new'}, {**before, 'other.html': b'new'},
                      {**before, 'evenement/event.html': b'changed'},
                      {**before, 'evenements-litteraires-new.html': b'new'}):
            with self.assertRaises(ValueError):
                temporal.assert_scope(before, after, {'index.html'})

    def test_unknown_incomplete_duplicate_canonical_stops(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp);docs = root / 'docs/territoires';docs.mkdir(parents=True)
            for events, mapping in [([{'id': 'new'}], {}), ([], {'known': 'evenement/a.html'}),
                                    ([{'id':'a'}, {'id':'a'}], {'a':'evenement/a.html'}),
                                    ([{'id':'a'}], {'a':'../a.html'})]:
                (docs / 'catalogue-public.json').write_text(json.dumps({'events':events}))
                (docs / 'event-canonical-map.json').write_text(json.dumps(mapping))
                with self.assertRaises(ValueError): temporal.corpus(root)

    def test_sitemap_stops_and_unrelated_entries_preserved(self):
        xml = (ROOT / 'sitemap.xml').read_text()
        url = 'https://dedicalivres.fr/'
        updated = temporal.refresh.updated_sitemap(xml, url, dt.date(2026, 10, 19))
        self.assertEqual(temporal.sitemap_urls(xml), temporal.sitemap_urls(updated))
        self.assertEqual(updated, temporal.refresh.updated_sitemap(updated, url, dt.date(2026, 10, 19)))
        import re
        strip = lambda value: re.sub(r'<url>\s*<loc>https://dedicalivres.fr/</loc>[\s\S]*?</url>', 'TARGET', value)
        self.assertEqual(strip(xml), strip(updated))
        for invalid in ('<broken>', xml.replace('</urlset>', re.search(r'<url>[\s\S]*?</url>', xml)[0]+'</urlset>')):
            with self.assertRaises((ValueError, temporal.ET.ParseError)): temporal.sitemap_urls(invalid)
        with self.assertRaises(ValueError): temporal.refresh.updated_sitemap(xml, 'https://missing.invalid/', dt.date(2026,10,19))

    def test_archive_loss_duplicate_and_nonpast_stop(self):
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            (stage / 'docs/territoires').mkdir(parents=True)
            shutil.copy2(ROOT / 'docs/territoires/catalogue-public.json', stage / 'docs/territoires/catalogue-public.json')
            for source in ROOT.glob('evenements-litteraires-france*.html'):
                shutil.copy2(source, stage / source.name)
            day = dt.date.fromisoformat(json.loads((ROOT / 'docs/territoires/audit.json').read_text())['today'])
            temporal.assert_france_archives(stage, day)
            page = stage / 'evenements-litteraires-france-archives-1.html'
            original = page.read_text()
            ids = re.findall(r'<li data-event-id="([^"]+)"', original)
            rows = json.loads((ROOT / 'docs/territoires/catalogue-public.json').read_text())['events']
            future = next(e['id'] for e in rows if e.get('country_code') == 'FR' and e.get('start_date', '') > day.isoformat())
            for invalid in (original.replace(ids[0], ids[1], 1), original.replace(ids[0], future, 1),
                            re.sub(r'<li data-event-id="[^"]+"[\s\S]*?</li>', '', original, count=1)):
                page.write_text(invalid)
                with self.assertRaises(ValueError): temporal.assert_france_archives(stage, day)

    def test_workflow_preview_only_same_lock(self):
        workflow = (ROOT / '.github/workflows/refresh-event-index.yml').read_text()
        self.assertIn('contents: read', workflow)
        self.assertIn('group: dedicalivres-event-publication', workflow)
        self.assertIn("cron: '30 2 * * *'", workflow)
        self.assertIn('actions/upload-artifact@v4', workflow)
        for forbidden in ('git push', 'git commit', 'SUPABASE', 'EXECUTE', 'contents: write'):
            self.assertNotIn(forbidden, workflow)
        self.assertNotIn('capture-', (ROOT / 'scripts/refresh-temporal-catalogues.py').read_text())


if __name__ == '__main__':
    unittest.main()
