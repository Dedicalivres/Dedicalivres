#!/usr/bin/env python3
"""Delivery-only regression proofs; existing temporal semantics stay in their suite."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('delivery', ROOT / 'scripts/deliver-temporal-catalogues.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)
temporal = delivery.temporal


class DeliveryTests(unittest.TestCase):
    def test_day_and_dst_stop(self):
        for instant in ['2026-10-25T00:30:00+00:00', '2026-10-25T01:30:00+00:00']:
            delivery.check_day(dt.date(2026,10,25), dt.datetime.fromisoformat(instant))
            with self.assertRaises(ValueError):
                delivery.check_day(dt.date(2026,10,24), dt.datetime.fromisoformat(instant))

    def test_scope_refusals_including_cap(self):
        before={'evenement/a.html':b'Event','docs/territoires/catalogue-public.json':b'business'}
        for after in [dict(before, unexpected=b'new'), {'docs/territoires/catalogue-public.json':b'business'},
                      {**before,'evenement/a.html':b'changed'},
                      {**before,'docs/territoires/catalogue-public.json':b'changed'}]:
            with self.assertRaises(ValueError): temporal.assert_scope(before,after,{'index.html'})
        many={f'page-{i}.html':b'new' for i in range(251)}
        with self.assertRaises(ValueError): temporal.assert_scope({p:b'old' for p in many},many,set(many))

    def test_fresh_projection_delivery_and_tamper(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);root=base/'repo'
            temporal.run(ROOT,'git','clone','--quiet','--no-hardlinks',str(ROOT),str(root))
            sha=temporal.run(root,'git','rev-parse','HEAD').decode().strip()
            # Simulate tomorrow in Paris, independently of the host clock.
            day=dt.date.fromisoformat(json.loads((root/'docs/territoires/audit.json').read_text())['today'])+dt.timedelta(days=1)
            with patch.object(temporal.refresh,'paris_today',return_value=day):
                folder=base/'candidate'
                seal=delivery.project(root,folder,sha,day)
                report=json.loads((folder/'report.json').read_text())
                self.assertTrue(report['files'], 'fixture must exercise a nonempty temporal diff')
                self.assertEqual(report['events'], len(temporal.corpus(root)[1]))
                protected={p:content for p,content in temporal.files(root).items() if (p.startswith(('evenement/','auteurs/')) and p != 'evenement/index.html') or p in {
                    'docs/territoires/catalogue-public.json','docs/territoires/event-canonical-map.json','event-canonical.js'}}
                with self.assertRaisesRegex(ValueError,'base Git'):
                    delivery.apply(root,folder,'0'*40,day,seal,'PUBLISH_TEMPORAL')
                with self.assertRaisesRegex(ValueError,'confirmation'):
                    delivery.apply(root,folder,sha,day,seal,'')
                with self.assertRaisesRegex(ValueError,'altéré'):
                    delivery.read_candidate(folder,sha,day,'0'*64)
                original=(folder/'projection.patch').read_bytes()
                (folder/'projection.patch').write_bytes(original+b'bad patch\n')
                with self.assertRaisesRegex(ValueError,'altéré'):
                    delivery.read_candidate(folder,sha,day,seal)
                # Even a re-sealed malicious artifact must differ from fresh generation.
                forged=delivery.manifest(folder)
                (folder/'manifest.json').write_text(json.dumps(forged))
                with self.assertRaisesRegex(ValueError,'projection fraîche différente'):
                    delivery.apply(root,folder,sha,day,delivery.fingerprint(forged),'PUBLISH_TEMPORAL')
                self.assertEqual(temporal.run(root,'git','status','--porcelain'),b'')
                (folder/'projection.patch').write_bytes(original)
                (folder/'manifest.json').write_text(json.dumps(delivery.manifest(folder)))
                delivery.apply(root,folder,sha,day,seal,'PUBLISH_TEMPORAL')
                delivery.verify_applied(root,folder,sha,day,seal)
                for p,content in protected.items(): self.assertEqual((root/p).read_bytes(),content,p)
                unrelated=root/'unexpected.html';unrelated.write_text('unexpected')
                with self.assertRaisesRegex(ValueError,'fichier inattendu'):
                    delivery.verify_applied(root,folder,sha,day,seal)
                unrelated.unlink()
                with self.assertRaisesRegex(ValueError,'non propre'):
                    delivery.apply(root,folder,sha,day,seal,'PUBLISH_TEMPORAL')
                # No Event deletion or business change can survive the applied-diff guard.
                event=next(iter(temporal.corpus(root)[1].values()));event_path=root/event
                original_event=event_path.read_bytes();event_path.unlink()
                with self.assertRaises(ValueError): delivery.verify_applied(root,folder,sha,day,seal)
                event_path.write_bytes(original_event)
                data=root/'docs/territoires/catalogue-public.json';original_data=data.read_bytes();data.write_bytes(original_data+b'\n')
                with self.assertRaises(ValueError): delivery.verify_applied(root,folder,sha,day,seal)
                data.write_bytes(original_data)
                delivery.verify_applied(root,folder,sha,day,seal)
            with patch.object(temporal.refresh,'paris_today',return_value=day+dt.timedelta(days=1)):
                with self.assertRaisesRegex(ValueError,'jour Europe/Paris'):
                    delivery.read_candidate(folder,sha,day,seal)

    def test_retired_test_cannot_return_from_old_capture(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'repo'
            temporal.run(ROOT,'git','clone','--quiet','--no-hardlinks',str(ROOT),str(root))
            registry=json.loads((root/'event-retirements.json').read_text())
            target=registry['entries'][0]['canonical']
            # Restore a coherent old corpus in a disposable fixture, never production.
            for p in ['docs/territoires/catalogue-public.json','docs/territoires/event-canonical-map.json','sitemap-evenements.xml',target]:
                (root/p).write_bytes(temporal.run(root,'git','show','3616a4a8995c70bcc56809ab144b3b040d1154ce^:'+p))
            temporal.run(root,'git','add','--all')
            temporal.run(root,'git','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','test old capture isolation')
            sha=temporal.run(root,'git','rev-parse','HEAD').decode().strip()
            with self.assertRaisesRegex(ValueError,'retiré'):
                delivery.check_base(root,sha)

    def test_manual_workflow_shared_lock_and_fresh_artifacts(self):
        text=(ROOT/'.github/workflows/deliver-temporal-catalogues.yml').read_text()
        for name in ['publish-events.yml','refresh-event-index.yml']:
            other=(ROOT/'.github/workflows'/name).read_text()
            self.assertIn('group: dedicalivres-event-publication',other)
        self.assertIn('group: dedicalivres-event-publication',text)
        self.assertIn('cancel-in-progress: false',text)
        self.assertNotIn('schedule:',text)
        self.assertNotIn('SUPABASE',text)
        self.assertNotIn('CANARY',text)
        self.assertNotIn('PUBLICATION_AUTOMATION_ENABLED',text)
        readonly,write=text.split('  publish:',1)
        self.assertNotIn('contents: write',readonly)
        self.assertIn('persist-credentials: false',readonly)
        self.assertIn("if: github.ref == 'refs/heads/main'",readonly)
        self.assertIn("inputs.confirmation == 'PUBLISH_TEMPORAL'",write)
        self.assertIn('needs: project',write)
        self.assertEqual(text.count('name: temporal-candidate-${{ github.run_id }}'),2)
        self.assertGreaterEqual(text.count('git ls-remote origin refs/heads/main'),3)
        self.assertIn('test "$APPROVED_FINGERPRINT" = "$FRESH_FINGERPRINT"',write)
        self.assertIn('TZ=Europe/Paris date +%F',write)
        self.assertNotIn('--force',text)
        self.assertLess(write.index('deliver-temporal-catalogues.py verify'),write.index('git commit'))
        self.assertLess(write.index('git push'),write.index('verify-temporal-deployment.mjs'))
        self.assertIn("if: steps.publication.outputs.changed == 'true'",write)


if __name__ == '__main__':
    unittest.main()
