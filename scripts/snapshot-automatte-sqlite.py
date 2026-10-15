#!/usr/bin/env python3
"""Create a minimal, consistent SQLite projection from a read-only source."""

import argparse
import datetime as dt
import hashlib
import json
import os
import sqlite3
import tempfile
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def snapshot(source_path, output_path):
    source_path = Path(source_path).resolve(strict=True)
    output_path = Path(output_path)
    if not source_path.is_file() or output_path.exists() or source_path == output_path.resolve():
        raise ValueError("Source inaccessible ou cliché cible déjà présent")
    source_before = source_path.stat()
    wal_present = Path(str(source_path) + "-wal").exists()
    source = sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True)
    temporary = None
    try:
        source.execute("PRAGMA query_only=ON")
        journal_mode = source.execute("PRAGMA journal_mode").fetchone()[0]
        required = {
            "evenements": {"id", "derniere_maj"},
            "dedicalivres_submissions": {"id", "event_id", "remote_uuid", "status", "http_status", "updated_at"},
        }
        for table, columns in required.items():
            actual = {row[1] for row in source.execute(f"PRAGMA table_info({table})")}
            if not columns <= actual:
                raise ValueError(f"Table Auto-Matte manquante ou incomplète : {table}")
        # The first SELECT pins a SQLite read snapshot, including committed WAL
        # pages. Keep that transaction open through both source table reads.
        source.execute("BEGIN")
        event_rows = source.execute("SELECT id FROM evenements ORDER BY id").fetchall()
        last_event_update = source.execute("SELECT max(derniere_maj) FROM evenements").fetchone()[0]
        submission_rows = source.execute(
            "SELECT id,event_id,remote_uuid,status,http_status "
            "FROM dedicalivres_submissions ORDER BY id"
        ).fetchall()
        last_submission = source.execute("SELECT max(updated_at) FROM dedicalivres_submissions").fetchone()[0]
        source.execute("ROLLBACK")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        handle, temporary = tempfile.mkstemp(prefix=".automatte-snapshot-", suffix=".sqlite3", dir=output_path.parent)
        os.close(handle)
        with sqlite3.connect(temporary) as destination:
            destination.execute("CREATE TABLE evenements (id INTEGER PRIMARY KEY)")
            destination.execute(
                "CREATE TABLE dedicalivres_submissions ("
                "id INTEGER PRIMARY KEY,event_id INTEGER,remote_uuid TEXT,status TEXT,http_status INTEGER)"
            )
            destination.executemany("INSERT INTO evenements (id) VALUES (?)", event_rows)
            destination.executemany(
                "INSERT INTO dedicalivres_submissions VALUES (?,?,?,?,?)", submission_rows
            )
        with sqlite3.connect(Path(temporary).as_uri() + "?mode=ro&immutable=1", uri=True) as backup:
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Cliché SQLite incohérent")
            event_count = backup.execute("SELECT count(*) FROM evenements").fetchone()[0]
            submission_count = backup.execute("SELECT count(*) FROM dedicalivres_submissions").fetchone()[0]
            if event_count != len(event_rows) or submission_count != len(submission_rows):
                raise ValueError("Cliché SQLite incomplet")
        source_after = source_path.stat()
        metadata = {
            "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source_path": str(source_path),
            "source_mtime_utc": dt.datetime.fromtimestamp(source_before.st_mtime, dt.timezone.utc).isoformat(),
            "source_changed_during_snapshot": (source_before.st_mtime_ns, source_before.st_size) != (source_after.st_mtime_ns, source_after.st_size),
            "wal_present_at_start": wal_present,
            "journal_mode": journal_mode,
            "snapshot_sha256": sha256(temporary),
            "events": event_count,
            "submission_rows": submission_count,
            "last_submission_update": last_submission,
            "last_event_update": last_event_update,
        }
        os.replace(temporary, output_path)
        temporary = None
        return metadata
    finally:
        source.close()
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    args = parser.parse_args()
    if Path(args.metadata).resolve() in {Path(args.source).resolve(), Path(args.output).resolve()}:
        raise ValueError("Métadonnées et base SQLite doivent avoir des chemins distincts")
    if Path(args.metadata).exists():
        raise ValueError("Fichier de métadonnées déjà présent")
    result = snapshot(args.source, args.output)
    Path(args.metadata).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "source_path"}, sort_keys=True))


if __name__ == "__main__":
    main()
