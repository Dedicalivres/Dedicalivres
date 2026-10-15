#!/usr/bin/env python3
"""SQLite snapshot fixtures, including an active WAL; never touches production."""

import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("snapshot_automatte", Path(__file__).with_name("snapshot-automatte-sqlite.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SnapshotTests(unittest.TestCase):
    def make_database(self, path):
        connection = sqlite3.connect(path)
        connection.execute("CREATE TABLE evenements (id INTEGER PRIMARY KEY, derniere_maj TEXT, private_email TEXT)")
        connection.execute("CREATE TABLE dedicalivres_submissions (id INTEGER PRIMARY KEY, updated_at TEXT, remote_uuid TEXT, event_id INTEGER, status TEXT, http_status INTEGER, private_message TEXT)")
        connection.execute("INSERT INTO evenements VALUES (1, '2026-10-15', 'private@example.test')")
        connection.execute("INSERT INTO dedicalivres_submissions VALUES (1, '2026-10-15', '00000000-0000-4000-8000-000000000001', 1, 'accepted_pending', 201, 'private message')")
        connection.commit()
        return connection

    def test_stable_snapshot_and_no_private_export(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.sqlite3"
            connection = self.make_database(source)
            connection.close()
            before = module.sha256(source)
            output = Path(folder) / "snapshot.sqlite3"
            metadata = module.snapshot(source, output)
            self.assertEqual(module.sha256(source), before)
            self.assertEqual(module.sha256(output), metadata["snapshot_sha256"])
            self.assertEqual((metadata["events"], metadata["submission_rows"]), (1, 1))
            self.assertNotIn("private@example.test", str(metadata))
            self.assertNotIn(b"private@example.test", output.read_bytes())
            self.assertNotIn(b"private message", output.read_bytes())
            with self.assertRaises(ValueError):
                module.snapshot(source, output)

    def test_active_wal_is_included_without_immutable_source(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.sqlite3"
            connection = self.make_database(source)
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("INSERT INTO evenements VALUES (2, '2026-10-15', 'private2@example.test')")
            connection.commit()
            self.assertTrue(Path(str(source) + "-wal").exists())
            output = Path(folder) / "snapshot.sqlite3"
            metadata = module.snapshot(source, output)
            self.assertEqual(metadata["journal_mode"], "wal")
            self.assertTrue(metadata["wal_present_at_start"])
            self.assertEqual(metadata["events"], 2)
            self.assertFalse(metadata["source_changed_during_snapshot"])
            connection.close()

    def test_missing_and_invalid_source_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):
                module.snapshot(Path(folder) / "missing.sqlite3", Path(folder) / "out.sqlite3")
            source = Path(folder) / "incomplete.sqlite3"
            with sqlite3.connect(source) as connection:
                connection.execute("CREATE TABLE evenements (id INTEGER)")
            with self.assertRaisesRegex(ValueError, "manquante"):
                module.snapshot(source, Path(folder) / "out.sqlite3")

    def test_old_internal_activity_is_reported_not_assumed_fresh(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "old.sqlite3"
            connection = self.make_database(source)
            connection.execute("UPDATE evenements SET derniere_maj='2025-01-01'")
            connection.execute("UPDATE dedicalivres_submissions SET updated_at='2025-01-01'")
            connection.commit()
            connection.close()
            metadata = module.snapshot(source, Path(folder) / "out.sqlite3")
            self.assertEqual(metadata["last_event_update"], "2025-01-01")
            self.assertEqual(metadata["last_submission_update"], "2025-01-01")
            self.assertNotIn("source_fresh", metadata)


if __name__ == "__main__":
    unittest.main()
