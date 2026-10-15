#!/usr/bin/env python3
"""Build SQL for an isolated PostgreSQL dry-run from ID-only local inputs."""

import argparse
import hashlib
import json
import uuid
from pathlib import Path


def canonical(value):
    return str(uuid.UUID(value)) if isinstance(value, str) and str(uuid.UUID(value)) == value else None


def build(ids_path, manifest_path):
    ids = json.loads(Path(ids_path).read_text(encoding="utf-8"))
    manifest_bytes = Path(manifest_path).read_bytes()
    manifest = json.loads(manifest_bytes)
    if set(ids) != {"event_ids", "direct_event_ids"} or not isinstance(manifest, list):
        raise ValueError("Entrée invalide")
    events, direct = ids["event_ids"], ids["direct_event_ids"]
    if not isinstance(events, list) or not isinstance(direct, list):
        raise ValueError("Ensembles UUID invalides")
    if any(canonical(value) is None for value in events + direct) or len(events) != len(set(events)) or len(direct) != len(set(direct)):
        raise ValueError("UUID invalide ou dupliqué")
    if not set(direct) <= set(events):
        raise ValueError("Soumission directe sans événement")
    rows = []
    for item in manifest:
        if not isinstance(item, dict) or canonical(item.get("event_id")) is None:
            raise ValueError("Manifeste invalide")
        reference = item.get("auto_matte_reference")
        if not isinstance(reference, str) or not reference.startswith("evenements:") or not reference[11:].isdigit():
            raise ValueError("Référence Auto-Matte invalide")
        rows.append({"event_id": item["event_id"], "auto_matte_reference": reference})
    if len(rows) != len({row["event_id"] for row in rows}) or len(rows) != len({row["auto_matte_reference"] for row in rows}):
        raise ValueError("Manifeste ambigu")
    if not {row["event_id"] for row in rows} <= set(events) - set(direct):
        raise ValueError("Manifeste hors périmètre ou soumission directe")
    digest = hashlib.sha256(manifest_bytes).hexdigest()
    event_json = json.dumps(events, separators=(",", ":"))
    direct_json = json.dumps(direct, separators=(",", ":"))
    rows_json = json.dumps(rows, separators=(",", ":"))
    return "\n".join((
        "\\set ON_ERROR_STOP on",
        "begin;",
        f"insert into public.events (id,title) select value::uuid,'fixture' from jsonb_array_elements_text('{event_json}'::jsonb) x(value);",
        f"insert into public.event_submission_contacts (event_id) select value::uuid from jsonb_array_elements_text('{direct_json}'::jsonb) x(value);",
        "select eligible||':'||already_present||':'||conflicts||':'||excluded||':'||blocked as dry_run "
        f"from private.prepare_auto_matte_observed_import('{rows_json}'::jsonb,'{event_json}'::jsonb,'{direct_json}'::jsonb,'{digest}',false);",
        "select count(*) as provenance_rows_after_preview from private.event_provenance;",
        "rollback;",
        "",
    ))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        raise ValueError("Fichier cible déjà présent")
    output.write_text(build(args.ids, args.manifest), encoding="utf-8")
    print("Dry-run SQL fixture generated; never execute against production")


if __name__ == "__main__":
    main()
