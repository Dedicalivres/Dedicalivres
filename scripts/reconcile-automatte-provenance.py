#!/usr/bin/env python3
"""Read-only, fail-closed reconciliation of Auto-Matte submission IDs and events."""

import argparse
import json
import sqlite3
import uuid
from collections import Counter, defaultdict
from pathlib import Path


REQUIRED_COLUMNS = {
    "dedicalivres_submissions": {"id", "event_id", "remote_uuid", "status", "http_status"},
    "evenements": {"id"},
}
ACCEPTED = {"accepted_pending", "validated_remote"}


def canonical(value):
    try:
        parsed = uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None
    return str(parsed) if str(value).lower() == str(parsed) else None


def load_ids(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != {"event_ids", "direct_event_ids"}:
        raise ValueError("Entrée limitée à event_ids et direct_event_ids")
    result = []
    for key in ("event_ids", "direct_event_ids"):
        values = data[key]
        if not isinstance(values, list) or any(canonical(v) is None for v in values):
            raise ValueError(f"UUID invalide dans {key}")
        normalized = [canonical(value) for value in values]
        if len(normalized) != len(set(normalized)):
            raise ValueError(f"UUID dupliqué dans {key}")
        result.append(set(normalized))
    if not result[1] <= result[0]:
        raise ValueError("Soumission directe absente des événements")
    return result


def read_sqlite(path):
    db = Path(path)
    if not db.is_file():
        raise FileNotFoundError(f"Base Auto-Matte inaccessible : {db}")
    connection = sqlite3.connect(db.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)
    try:
        connection.execute("PRAGMA query_only=ON")
        for table, required in REQUIRED_COLUMNS.items():
            columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            if not required <= columns:
                raise ValueError(f"Schéma Auto-Matte incomplet : {table}")
        local_ids = {row[0] for row in connection.execute("SELECT id FROM evenements")}
        rows = connection.execute(
            "SELECT id,event_id,remote_uuid,status,http_status "
            "FROM dedicalivres_submissions ORDER BY id"
        ).fetchall()
        return local_ids, rows
    finally:
        connection.close()


def reconcile(event_ids, direct_ids, local_ids, rows):
    by_remote = defaultdict(list)
    by_local = defaultdict(set)
    anomalies = Counter()
    for row_id, event_id, raw_uuid, status, http_status in rows:
        raw_uuid = (raw_uuid or "").strip()
        if not raw_uuid:
            continue
        remote = canonical(raw_uuid)
        if remote is None:
            anomalies["invalid_remote_uuid"] += 1
            continue
        by_remote[remote].append((row_id, event_id, status, http_status))
        by_local[event_id].add(remote)

    confirmed = []
    review = []
    review_events = set()
    conflict_count = 0
    for remote in sorted(by_remote):
        entries = by_remote[remote]
        refs = {r[1] for r in entries}
        reasons = []
        if remote not in event_ids:
            reasons.append("remote_absent_in_supabase")
        if remote in direct_ids:
            reasons.append("direct_submission_conflict")
        if len(refs) != 1 or None in refs:
            reasons.append("multiple_or_missing_local_references")
        local_id = next(iter(refs)) if len(refs) == 1 else None
        if local_id not in local_ids:
            reasons.append("local_event_missing")
        if any(len(by_local[ref]) != 1 for ref in refs):
            reasons.append("local_reference_conflict")
        if not any(status in ACCEPTED and http_status == 201 for _, _, status, http_status in entries):
            reasons.append("accepted_post_trace_missing")
        if reasons:
            review.append({"event_id": remote, "auto_matte_reference": local_id, "reasons": sorted(set(reasons))})
            if remote in event_ids and remote not in direct_ids:
                review_events.add(remote)
            if any("conflict" in reason or "multiple" in reason for reason in reasons):
                conflict_count += 1
        else:
            confirmed.append({
                "event_id": remote,
                "auto_matte_reference": f"evenements:{local_id}",
                "technical_source": "veille.sqlite3:dedicalivres_submissions.remote_uuid",
                "checks": {
                    "uuid_exact": True,
                    "local_event_exists": True,
                    "unique_binding": True,
                    "accepted_post_201": True,
                    "no_direct_submission": True,
                },
                "future_provenance": {
                    "state": "OBSERVED",
                    "observed_channel": "AUTO_MATTE",
                    "attested_origin": None,
                },
            })
    confirmed_ids = {item["event_id"] for item in confirmed}
    unknown = event_ids - direct_ids - confirmed_ids - review_events
    for item in review:
        anomalies.update(item["reasons"])
    summary = {
        "supabase_total": len(event_ids),
        "auto_matte_total": len(local_ids),
        "submission_rows_examined": len(rows),
        "exact_remote_uuids": len(by_remote),
        "confirmed": len(confirmed),
        "ambiguous": len(review_events),
        "conflicts": conflict_count,
        "direct_submissions_excluded": len(direct_ids),
        "legacy_unknown": len(unknown),
        "anomalies": dict(sorted(anomalies.items())),
        "remote_not_in_supabase": sum("remote_absent_in_supabase" in r["reasons"] for r in review),
        "classification_note": "AUTO_MATTE_CONFIRMED is observed provenance, never DIRECT_VERIFIED or publication authorization.",
    }
    return summary, confirmed, review


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", required=True, help="Auto-Matte veille.sqlite3 (opened immutable/read-only)")
    parser.add_argument("--supabase-ids", required=True, help="Local JSON with event_ids and direct_event_ids only")
    parser.add_argument("--output-dir", required=True, help="Local output directory; do not commit production snapshots")
    args = parser.parse_args()
    event_ids, direct_ids = load_ids(args.supabase_ids)
    local_ids, rows = read_sqlite(args.sqlite)
    summary, manifest, review = reconcile(event_ids, direct_ids, local_ids, rows)
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    for name, value in (("summary.json", summary), ("manifest.json", manifest), ("review.json", review)):
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
