#!/usr/bin/env python3
"""Isolated fixture tests; no network, Supabase write, or publication."""

import hashlib
import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("reconcile-automatte-provenance.py")
spec = importlib.util.spec_from_file_location("reconcile_automatte", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
UUIDS = [f"00000000-0000-4000-8000-{n:012x}" for n in range(1, 8)]


class ReconciliationTests(unittest.TestCase):
    def test_exact_and_missing_uuid(self):
        summary, manifest, review = module.reconcile(set(UUIDS[:2]), set(), {11}, [(1, 11, UUIDS[0], "accepted_pending", 201)])
        self.assertEqual((summary["confirmed"], summary["legacy_unknown"]), (1, 1))
        self.assertEqual(manifest[0]["auto_matte_reference"], "evenements:11")
        self.assertEqual(manifest[0]["future_provenance"]["state"], "OBSERVED")
        self.assertIsNone(manifest[0]["future_provenance"]["attested_origin"])
        self.assertEqual(review, [])

    def test_duplicate_uuid_and_contradictory_local_reference(self):
        rows = [(1, 11, UUIDS[0], "accepted_pending", 201), (2, 12, UUIDS[0], "validated_remote", 201)]
        summary, manifest, review = module.reconcile({UUIDS[0]}, set(), {11, 12}, rows)
        self.assertEqual((summary["confirmed"], summary["conflicts"]), (0, 1))
        self.assertIn("multiple_or_missing_local_references", review[0]["reasons"])
        rows = [(1, 11, UUIDS[0], "accepted_pending", 201), (2, 11, UUIDS[1], "accepted_pending", 201)]
        summary, manifest, review = module.reconcile(set(UUIDS[:2]), set(), {11}, rows)
        self.assertEqual((summary["confirmed"], summary["conflicts"]), (0, 2))

    def test_direct_form_ambiguous_and_missing_data(self):
        rows = [(1, 11, UUIDS[0], "accepted_pending", 201), (2, 12, UUIDS[1], "submission_completed", 0),
                (3, 13, UUIDS[2], "accepted_pending", 201), (4, 14, "invalid", "accepted_pending", 201)]
        summary, manifest, review = module.reconcile(set(UUIDS[:3]), {UUIDS[0]}, {11, 12}, rows)
        self.assertEqual(summary["confirmed"], 0)
        self.assertEqual(summary["direct_submissions_excluded"], 1)
        self.assertEqual(summary["ambiguous"], 2)
        self.assertEqual(summary["anomalies"]["invalid_remote_uuid"], 1)
        self.assertEqual(len(review), 3)

    def test_duplicated_journal_rows_same_binding_are_not_conflict(self):
        rows = [(1, 11, UUIDS[0], "accepted_pending", 201), (2, 11, UUIDS[0], "validated_remote", 201)]
        summary, manifest, _ = module.reconcile({UUIDS[0]}, set(), {11}, rows)
        self.assertEqual((summary["confirmed"], summary["conflicts"]), (1, 0))
        self.assertEqual(len(manifest), 1)

    def test_remote_absent_in_supabase_is_never_confirmed(self):
        summary, manifest, review = module.reconcile(set(), set(), {11}, [(1, 11, UUIDS[0], "accepted_pending", 201)])
        self.assertEqual(summary["remote_not_in_supabase"], 1)
        self.assertEqual(manifest, [])
        self.assertIn("remote_absent_in_supabase", review[0]["reasons"])

    def test_missing_database_and_invalid_supabase_input(self):
        with self.assertRaises(FileNotFoundError):
            module.read_sqlite("/nonexistent/automatte-veille.sqlite3")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "ids.json"
            path.write_text(json.dumps({"event_ids": [UUIDS[0], UUIDS[0]], "direct_event_ids": []}))
            with self.assertRaisesRegex(ValueError, "dupliqué"):
                module.load_ids(path)
            path.write_text(json.dumps({"event_ids": [UUIDS[0], UUIDS[0].upper()], "direct_event_ids": []}))
            with self.assertRaisesRegex(ValueError, "dupliqué"):
                module.load_ids(path)

    def test_cli_is_read_only_deterministic_and_private_data_free(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            database = root / "veille.sqlite3"
            with sqlite3.connect(database) as con:
                con.execute("CREATE TABLE evenements (id INTEGER PRIMARY KEY, email TEXT)")
                con.execute("INSERT INTO evenements VALUES (11, 'private@example.test')")
                con.execute("CREATE TABLE dedicalivres_submissions (id INTEGER PRIMARY KEY,event_id INTEGER,remote_uuid TEXT,status TEXT,http_status INTEGER,message TEXT)")
                con.execute("INSERT INTO dedicalivres_submissions VALUES (1,11,?,?,201,'private message')", (UUIDS[0], "accepted_pending"))
            ids = root / "ids.json"
            ids.write_text(json.dumps({"event_ids": [UUIDS[0]], "direct_event_ids": []}))
            before = hashlib.sha256(database.read_bytes()).hexdigest()
            outputs = []
            for n in (1, 2):
                output = root / f"out{n}"
                subprocess.run([sys.executable, str(SCRIPT), "--sqlite", str(database), "--supabase-ids", str(ids), "--output-dir", str(output)], check=True, capture_output=True, text=True)
                outputs.append({p.name: p.read_bytes() for p in output.iterdir()})
            self.assertEqual(outputs[0], outputs[1])
            self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(), before)
            result = b"".join(outputs[0].values())
            self.assertNotIn(b"private@example.test", result)
            self.assertNotIn(b"private message", result)
            self.assertIsNone(json.loads(outputs[0]["manifest.json"])[0]["future_provenance"]["attested_origin"])
            self.assertNotIn(b"event_publication_jobs", result)


if __name__ == "__main__":
    unittest.main()
