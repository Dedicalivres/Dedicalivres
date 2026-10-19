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

    def test_workflow_separates_index_write_and_projection_read(self):
        workflow = (ROOT / '.github/workflows/refresh-event-index.yml').read_text()
        global_part, jobs = workflow.split('jobs:', 1)
        index, projection = jobs.split('  project-temporal:', 1)
        self.assertIn('permissions:\n  contents: read', global_part)
        self.assertIn('group: dedicalivres-event-publication', global_part)
        self.assertIn('cancel-in-progress: false', global_part)
        self.assertEqual(workflow.count("cron: '30 2 * * *'"), 1)
        self.assertIn('contents: write', index)
        self.assertIn('refresh-index.py --verify-diff', index)
        self.assertLess(index.index('refresh-index.py --verify-diff'), index.index('git add --'))
        self.assertEqual(re.findall(r'git add -- (.+)', index), ['evenement/index.html sitemap-evenements.xml'])
        self.assertIn('git diff --cached --check', index)
        self.assertIn('git push origin HEAD:main', index)
        self.assertIn('main_sha: ${{ steps.main.outputs.sha }}', index)
        self.assertIn('needs: refresh-index', projection)
        self.assertIn('contents: read', projection)
        self.assertIn('ref: main', projection)
        self.assertIn('persist-credentials: false', projection)
        self.assertIn('EXPECTED_MAIN_SHA: ${{ needs.refresh-index.outputs.main_sha }}', projection)
        self.assertIn('test "$(git rev-parse HEAD)" = "$EXPECTED_MAIN_SHA"', projection)
        self.assertIn('actions/upload-artifact@v4', projection)
        for forbidden in ('git push', 'git commit', 'git add', 'contents: write', 'git apply'):
            self.assertNotIn(forbidden, projection)
        for forbidden in ('SUPABASE', 'EXECUTE', 'capture-', 'PUBLICATION_AUTOMATION_ENABLED'):
            self.assertNotIn(forbidden, workflow)

    def test_index_refresh_then_projection_from_updated_main(self):
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp) / 'repo'
            temporal.run(ROOT, 'git', 'clone', '--quiet', '--no-hardlinks', str(ROOT), str(stage))
            day = dt.date(2026, 10, 20)
            temporal.refresh.rebuild(stage, day)
            temporal.refresh.verify_git_diff(stage, day)
            changed = temporal.run(stage, 'git', 'diff', '--name-only').decode().splitlines()
            self.assertEqual(set(changed), {'evenement/index.html', 'sitemap-evenements.xml'})
            temporal.run(stage, 'git', 'add', '--', *changed)
            temporal.run(stage, 'git', '-c', 'user.name=Offline Test', '-c', 'user.email=test@example.invalid',
                         'commit', '--quiet', '-m', 'test: refreshed index in disposable clone')
            updated_sha = temporal.run(stage, 'git', 'rev-parse', 'HEAD').decode().strip()
            report = temporal.project(stage, Path(temp) / 'projection', day)
            self.assertEqual(report['base'], updated_sha)
            self.assertNotIn('evenement/index.html', report['files'])
            self.assertNotIn('sitemap-evenements.xml', report['files'])
            self.assertEqual(temporal.run(stage, 'git', 'status', '--porcelain'), b'')

    def test_city_selection_matches_generic_heading(self):
        # Extract the existing pure selection function, without running builders.
        script = r"""
import fs from 'node:fs';import vm from 'node:vm';
import {classify} from './scripts/territorial-catalog.mjs';
const source=fs.readFileSync('scripts/build-static-agenda-previews.mjs','utf8');
const body=source.slice(source.indexOf('function citySelection('),source.indexOf('function typeClass('));
const today='2026-10-19';
const upcoming=e=>e.validated===true&&e.rejected===false&&['future','ongoing'].includes(classify(e,today));
const select=vm.runInNewContext('('+body.trim()+')',{upcoming,clean:v=>String(v||'').trim()});
const base={validated:true,rejected:false,title:'Livre'};
const past={...base,id:'past',start_date:'2026-10-17',end_date:'2026-10-18'};
const ongoing={...base,id:'ongoing',start_date:today,end_date:'2026-10-20'};
const future={...base,id:'future',start_date:'2026-10-21',end_date:'2026-10-21'};
console.log(JSON.stringify([[past,ongoing,future],[ongoing],[past],[]].map(rows=>select(rows))));
"""
        selections = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))
        self.assertEqual([r['id'] for r in selections[0]['rows']], ['ongoing', 'future'])
        self.assertEqual([r['id'] for r in selections[1]['rows']], ['ongoing'])
        self.assertEqual(selections[2]['mode'], 'archive')
        self.assertEqual(selections[3]['mode'], 'empty')
        cities = [p for p in ROOT.glob('evenements-litteraires-*.html') if 'data-city=' in p.read_text()]
        self.assertTrue(cities)
        for page in cities:
            html = page.read_text()
            self.assertNotRegex(html, r'(?i)prochains événements')
            self.assertRegex(html, r'<h1>Événements littéraires à [^<]+</h1>')


if __name__ == '__main__':
    unittest.main()
