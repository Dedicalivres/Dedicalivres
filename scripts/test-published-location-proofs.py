import importlib.util
import json
import os
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "scripts/event-publisher"))

file = root / "scripts/event-publisher/generate-events.py"
spec = importlib.util.spec_from_file_location("generator", file)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

proofs = json.loads(
    (root / "scripts/event-publisher/verified-event-locations.json").read_text()
)["events"]
mapping = json.loads(
    (root / "docs/territoires/event-canonical-map.json").read_text()
)

previous = os.environ.get("PUBLICATION_JOBS")
os.environ["PUBLICATION_JOBS"] = "[]"

try:
    for identifier, proof in proofs.items():
        page = (root / mapping[identifier]).read_text()
        objects = [
            json.loads(value)
            for value in re.findall(
                r'<script type="application/ld\+json">(.*?)</script>',
                page, re.S
            )
        ]
        published = next(
            item for item in objects if item.get("@type") == "Event"
        )

        event = {
            "id": identifier,
            "titre": published["name"],
            "ville": proof["city"],
            "pays": proof["country"],
            "departement": proof["region"],
            "date_debut": proof["date"],
            "date_fin": proof["date"],
            "description": " ".join(proof["description_evidence"]),
        }

        assert generator.verified_location(event) == proof
        assert generator.published_organizer(
            identifier, event
        ) == published.get("organizer")

        changed = {**event, "ville": "Ville différente"}
        try:
            generator.verified_location(changed)
        except generator.GenerationSeoError:
            pass
        else:
            raise AssertionError("Changement de ville non bloqué")

        missing_evidence = {**event, "description": ""}
        try:
            generator.verified_location(missing_evidence)
        except generator.GenerationSeoError:
            pass
        else:
            raise AssertionError("Perte de preuve non bloquée")

        print("PASS conservation et protection :", published["name"])
finally:
    if previous is None:
        os.environ.pop("PUBLICATION_JOBS", None)
    else:
        os.environ["PUBLICATION_JOBS"] = previous
