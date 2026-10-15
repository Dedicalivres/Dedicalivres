#!/usr/bin/env python3
"""The isolated fixture builder never emits contacts, secrets, or an execution call."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("build_fixture", Path(__file__).with_name("build-automatte-dry-run-fixture.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
EVENT = "11111111-1111-4111-8111-111111111111"
DIRECT = "22222222-2222-4222-8222-222222222222"


class FixtureBuilderTests(unittest.TestCase):
    def test_deterministic_id_only_dry_run(self):
        with tempfile.TemporaryDirectory() as folder:
            ids = Path(folder) / "ids.json"
            manifest = Path(folder) / "manifest.json"
            ids.write_text(json.dumps({"event_ids": [EVENT, DIRECT], "direct_event_ids": [DIRECT]}))
            manifest.write_text(json.dumps([{"event_id": EVENT, "auto_matte_reference": "evenements:11", "technical_source": "private@example.test"}]))
            first = module.build(ids, manifest)
            self.assertEqual(first, module.build(ids, manifest))
            self.assertIn("false);", first)
            self.assertIn("rollback;", first)
            self.assertNotIn("private@example.test", first)
            self.assertNotIn("event_publication_jobs", first)

    def test_direct_and_ambiguous_manifest_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            ids = Path(folder) / "ids.json"
            manifest = Path(folder) / "manifest.json"
            ids.write_text(json.dumps({"event_ids": [EVENT, DIRECT], "direct_event_ids": [DIRECT]}))
            manifest.write_text(json.dumps([{"event_id": DIRECT, "auto_matte_reference": "evenements:11"}]))
            with self.assertRaisesRegex(ValueError, "soumission directe"):
                module.build(ids, manifest)
            manifest.write_text(json.dumps([{"event_id": EVENT, "auto_matte_reference": "evenements:11"}, {"event_id": EVENT, "auto_matte_reference": "evenements:12"}]))
            with self.assertRaisesRegex(ValueError, "ambigu"):
                module.build(ids, manifest)


if __name__ == "__main__":
    unittest.main()
