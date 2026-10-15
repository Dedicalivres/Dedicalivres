#!/usr/bin/env python3
"""The isolated fixture builder never emits contacts, secrets, or an execution call."""

import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("build_fixture", Path(__file__).with_name("build-automatte-dry-run-fixture.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
EVENT = "11111111-1111-4111-8111-111111111111"
DIRECT = "22222222-2222-4222-8222-222222222222"
OTHER = "33333333-3333-4333-8333-333333333333"


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
            hashes = {}
            module.build(ids, manifest, hashes)
            expected = hashlib.sha256(f"{EVENT}\tevenements:11\n".encode()).hexdigest()
            self.assertEqual(hashes["import_canonical_sha256"], expected)
            self.assertIn(expected, first)
            self.assertEqual(hashes["manifest_file_sha256"], hashlib.sha256(manifest.read_bytes()).hexdigest())
            self.assertNotEqual(hashes["manifest_file_sha256"], expected)

    def test_canonical_hash_ignores_row_order_but_detects_pair_changes(self):
        rows = [{"event_id": EVENT, "auto_matte_reference": "evenements:11"},
                {"event_id": OTHER, "auto_matte_reference": "evenements:12"}]
        digest = module.canonical_manifest_sha256(rows)
        self.assertEqual(digest, module.canonical_manifest_sha256(list(reversed(rows))))
        self.assertNotEqual(digest, module.canonical_manifest_sha256(rows[:1]))
        self.assertNotEqual(digest, module.canonical_manifest_sha256(rows + [{"event_id": DIRECT, "auto_matte_reference": "evenements:13"}]))
        self.assertNotEqual(digest, module.canonical_manifest_sha256([rows[0], {**rows[1], "auto_matte_reference": "evenements:13"}]))

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
