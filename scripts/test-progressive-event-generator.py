"""Offline checks for the opt-in static event structure."""
import importlib.util
import json
import re
import sys
import tempfile
import types
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
PUBLISHER = ROOT / "scripts" / "event-publisher"
sys.path.insert(0, str(PUBLISHER))
spec = importlib.util.spec_from_file_location("event_generator", PUBLISHER / "generate-events.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cloud_spec = importlib.util.spec_from_file_location("cloud_event_generator", PUBLISHER / "generate-events-cloud.py")
cloud = importlib.util.module_from_spec(cloud_spec)
cloud_spec.loader.exec_module(cloud)


def event(identifier, image, title, city, region, start, end, description):
    return {
        "id": identifier, "_slug": f"fixture-{identifier}", "titre": title,
        "type": "Salon", "date_debut": start, "date_fin": end,
        "ville": city, "departement": region, "pays": "France",
        "lieu": city, "adresse": "", "code_postal": "", "auteurs": "",
        "description": description, "affiche": image,
        "site": "", "source": "", "derniere_maj": "2026-10-11",
    }


events = [
    event("b2bf907d-6b39-4c86-a38d-70cc73531da3", "https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev/event-images/2026/06/1780512372624-6123fda2-40f2-469c-ba5e-db6eaa78b80d.jpg", "MYTH & LOVE", "Moulins", "Auvergne-Rhône-Alpes", "2027-10-30", "2027-10-31", ""),
    event("433a1069-e745-4de8-bfc5-94ddbddb5b65", "", "Salon du livre Thornslove : Romance sous tous ses genres", "Louverné", "Pays de la Loire", "2027-09-18", "2027-09-19", "Salon littéraire spécial romance, 90 stands et animations."),
]
events[0].update(adresse="12 rue de Test", code_postal="03000", auteurs="Autrice de test")
base_url = "https://dedicalivres.fr"
for current in events:
    old = module.page_event(current, base_url)
    assert old == module.page_event(current, base_url, progressive=False)
    assert '.detail-body' not in old
    assert 'class="detail-body"' not in old
    assert '/event.js?v=static-canonical-1' in old
    assert 'data-detail-version=' not in old
    assert 'href="/index.html#agenda"' not in old
    new = module.page_event(current, base_url, progressive=True)
    for marker in ('class="detail-body"', 'class="detail-title"',
                   'class="detail-primary-actions"', 'detail-secondary-actions',
                   'id="detail-favorite-btn"', 'id="detail-calendar-btn"'):
        assert marker in new, marker
    assert new.count('class="a11y-showcase"') == 1
    assert new.count('type="application/ld+json"') == 2
    assert '/event.js?v=progressive-static-1' in new
    assert 'href="/index.html#agenda"' in new
    assert 'href="index.html#agenda"' not in new
    assert 'data-detail-version="progressive-1"' in new
    assert ('class="detail-image-frame"' in new) == bool(current['affiche'])
    assert ('class="detail-image detail-image-placeholder"' in new) == (not current['affiche'])
    if current['adresse']:
        assert current['adresse'] in new and current['auteurs'] in new
    assert old.split('<link rel="canonical"')[1].split('>')[0] == new.split('<link rel="canonical"')[1].split('>')[0]

with tempfile.TemporaryDirectory() as directory:
    output = Path(directory) / "site"
    report = module.generer_sortie_atomique(events, output, base_url=base_url, sitemap_name="sitemap-evenements.xml")
    assert report['created_pages'] and not report['removed_pages']
    old_pages = {path.name: path.read_bytes() for path in (output / "evenement").glob("*.html")}
    old_sitemap = (output / "sitemap-evenements.xml").read_bytes()
    report = module.generer_sortie_atomique(events, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={events[0]['id']})
    assert report['updated_pages'] == [f"{events[0]['_slug']}.html"]
    assert not report['removed_pages'] and not report['created_pages']
    assert (output / "evenement" / f"{events[1]['_slug']}.html").read_bytes() == old_pages[f"{events[1]['_slug']}.html"]
    assert (output / "sitemap-evenements.xml").read_bytes() == old_sitemap
    assert module.generer_sortie_atomique(events, output, base_url=base_url, sitemap_name="sitemap-evenements.xml")['updated_pages'] == [f"{events[0]['_slug']}.html"]
    legacy_id = next(iter(json.loads((PUBLISHER / "legacy-enriched-events.json").read_text())['events']))
    legacy_event = {**events[0], "id": legacy_id, "_slug": f"legacy-{legacy_id}"}
    try:
        module.generer_sortie_atomique([*events, legacy_event], output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={legacy_id})
    except module.GenerationSeoError:
        pass
    else:
        raise AssertionError("legacy ID accepted")
    try:
        module.generer_sortie_atomique([*events, legacy_event], output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={legacy_id}, authorized_depublication_ids={legacy_id})
    except module.GenerationSeoError:
        pass
    else:
        raise AssertionError("authorized legacy ID accepted")
    try:
        module.generer_sortie_atomique(events, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={"not-an-event"})
    except module.GenerationSeoError:
        pass
    else:
        raise AssertionError("absent ID accepted")
    try:
        module.generer_sortie_atomique(events, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={"00000000-0000-0000-0000-000000000099"})
    except module.GenerationSeoError:
        pass
    else:
        raise AssertionError("unknown public ID accepted")
    for invalid_ids in ([events[0]['id'], events[0]['id']], [events[0]['id'], events[1]['id'], "00000000-0000-0000-0000-000000000003"]):
        try:
            module.generer_sortie_atomique(events, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids=invalid_ids)
        except module.GenerationSeoError:
            pass
        else:
            raise AssertionError("duplicate or oversized selection accepted")

with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    manifest = temp / "progressive-events.json"
    manifest.write_text('{"event_ids": []}', encoding="utf-8")
    with patch.object(cloud, "PROGRESSIVE_MANIFEST", manifest), patch.object(cloud.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)) as runner:
        with patch.object(sys, "argv", ["generate-events-cloud.py", "--sortie", str(temp / "empty-output"), "--dry-run"]):
            assert cloud.main() == 0
        assert "--progressive-event-id" not in runner.call_args.args[0]
    selected = ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"]
    manifest.write_text(json.dumps({"event_ids": selected}), encoding="utf-8")
    assert cloud.progressive_event_ids(manifest) == selected
    with patch.object(cloud, "PROGRESSIVE_MANIFEST", manifest), patch.object(cloud.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)) as runner:
        for dry_run in (True, False):
            argv = ["generate-events-cloud.py", "--sortie", str(temp / "cloud-output")]
            if dry_run:
                argv.append("--dry-run")
            with patch.object(sys, "argv", argv), patch.dict(cloud.os.environ, {"EVENT_PUBLISHER_PRESERVE_LEGACY": "0"}):
                assert cloud.main() == 0
            command = runner.call_args.args[0]
            assert command[1] == str(PUBLISHER / "generate-events.py")
            assert [command[i + 1] for i, arg in enumerate(command[:-1]) if arg == "--progressive-event-id"] == selected

    for invalid in ({}, {"event_ids": "x"}, {"event_ids": selected, "other": 1},
                    {"event_ids": [selected[0], selected[0]]}, {"event_ids": selected + ["00000000-0000-0000-0000-000000000003"]},
                    {"event_ids": ["not-an-uuid"]}, {"event_ids": [123]}):
        manifest.write_text(json.dumps(invalid), encoding="utf-8")
        try:
            cloud.progressive_event_ids(manifest)
        except RuntimeError:
            pass
        else:
            raise AssertionError(f"invalid manifest accepted: {invalid}")
    with patch.object(cloud, "PROGRESSIVE_MANIFEST", manifest), patch.object(cloud.subprocess, "run") as runner:
        with patch.object(sys, "argv", ["generate-events-cloud.py", "--sortie", str(temp / "invalid-output"), "--dry-run"]):
            try:
                cloud.main()
            except RuntimeError:
                pass
            else:
                raise AssertionError("invalid manifest did not stop cloud publisher")
        runner.assert_not_called()

    pilot = [{**event, "id": identifier, "_slug": f"pilot-{identifier}"} for event, identifier in zip(events, selected)]
    output = temp / "pilot-site"
    module.generer_sortie_atomique(pilot, output, base_url=base_url, sitemap_name="sitemap-evenements.xml")
    before = {path.name: path.read_text(encoding="utf-8") for path in (output / "evenement").glob("*.html") if path.name != "index.html"}
    sitemap_before = (output / "sitemap-evenements.xml").read_bytes()
    control = module.generer_sortie_atomique(pilot, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", dry_run=True, progressive_event_ids=selected)
    assert len(control["updated_pages"]) == 2
    assert {path.name: path.read_text(encoding="utf-8") for path in (output / "evenement").glob("*.html") if path.name != "index.html"} == before
    first = module.generer_sortie_atomique(pilot, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids=selected)
    assert len(first["updated_pages"]) == 2 and len(first["updated_pages"]) <= 250
    assert not first["created_pages"] and not first["removed_pages"]
    after = {path.name: path.read_text(encoding="utf-8") for path in (output / "evenement").glob("*.html") if path.name != "index.html"}
    for filename, html in after.items():
        assert 'data-detail-version="progressive-1"' in html
        assert re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S) == re.findall(r'<script type="application/ld\+json">(.*?)</script>', before[filename], re.S)
        assert re.search(r'<link rel="canonical"[^>]+>', html).group() == re.search(r'<link rel="canonical"[^>]+>', before[filename]).group()
    assert (output / "sitemap-evenements.xml").read_bytes() == sitemap_before
    second = module.generer_sortie_atomique(pilot, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids=selected)
    assert not second["updated_pages"] and not second["removed_pages"]
    assert {path.name: path.read_text(encoding="utf-8") for path in (output / "evenement").glob("*.html") if path.name != "index.html"} == after
    preserved, _, _ = cloud.preserve_pages(output)
    assert preserved == 282
    protected = json.loads((PUBLISHER / "legacy-enriched-events.json").read_text(encoding="utf-8"))["events"]
    for filename in protected.values():
        assert (output / "evenement" / filename).read_bytes() == (ROOT / "evenement" / filename).read_bytes()

    nonlegacy_page = next(
        page for page in (ROOT / "evenement").glob("*.html")
        if page.name != "index.html" and page.name not in protected.values()
    )
    retired_path = f"evenement/{nonlegacy_page.name}"
    retired_output = temp / "retired-site"
    module.generer_sortie_atomique(pilot, retired_output, base_url=base_url, sitemap_name="sitemap-evenements.xml")
    cloud.preserve_pages(retired_output, {retired_path})
    assert not (retired_output / retired_path).exists()
    assert f"/evenement/{nonlegacy_page.name}</loc>" not in (retired_output / "sitemap-evenements.xml").read_text(encoding="utf-8")

    # Un pilote retiré du catalogue ne doit pas bloquer une autre publication.
    third = {**pilot[1], "id": "00000000-0000-0000-0000-000000000003", "_slug": "third-event"}
    remaining = [pilot[1], third]
    for reason in ("rejet", "suppression"):
        with tempfile.TemporaryDirectory() as lifecycle_dir:
            lifecycle = Path(lifecycle_dir) / "site"
            module.generer_sortie_atomique(pilot, lifecycle, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids=selected)
            try:
                module.generer_sortie_atomique(remaining, lifecycle, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids=selected)
            except module.GenerationSeoError:
                pass
            else:
                raise AssertionError(f"{reason}: blocage initial non reproduit")
            report = module.generer_sortie_atomique(remaining, lifecycle, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids=selected, authorized_depublication_ids={selected[0]})
            assert report["created_pages"] and report["removed_pages"] == [f"pilot-{selected[0]}.html"]
            assert not (lifecycle / "evenement" / f"pilot-{selected[0]}.html").exists()
            assert 'data-detail-version="progressive-1"' in (lifecycle / "evenement" / f"pilot-{selected[1]}.html").read_text()
            assert (lifecycle / "evenement" / "third-event.html").exists()
            module.generer_sortie_atomique(remaining, lifecycle, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={selected[1]})
            try:
                module.generer_sortie_atomique(remaining, lifecycle, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={selected[0]})
            except module.GenerationSeoError:
                pass
            else:
                raise AssertionError("ID inconnu accepté sans job autorisé")

    with tempfile.TemporaryDirectory() as lifecycle_dir:
        fixture_root = Path(lifecycle_dir)
        (fixture_root / "evenement").mkdir()
        (fixture_root / "docs/territoires").mkdir(parents=True)
        pilot_path = f"evenement/pilot-{selected[0]}.html"
        (fixture_root / pilot_path).write_text(f'<article id="event-detail" data-event-id="{selected[0]}"></article>')
        (fixture_root / "docs/territoires/event-canonical-map.json").write_text(json.dumps({selected[0]: pilot_path}))
        manifest = fixture_root / "progressive-events.json"
        manifest.write_text(json.dumps({"event_ids": selected}))
        environment = {"PUBLICATION_DEPUBLISH_EVENT_IDS": json.dumps([selected[0]]), "PUBLICATION_DEPUBLISH_PATHS": json.dumps([pilot_path])}
        with patch.object(cloud, "ROOT", fixture_root), patch.object(cloud, "PROGRESSIVE_MANIFEST", manifest), patch.dict(cloud.os.environ, environment):
            assert cloud.authorized_pilot_depublications(selected) == {selected[0]}
            output_manifest = fixture_root / "event-pages-manifest.json"
            output_manifest.write_text(json.dumps({"events": {selected[0]: "pilot-first", selected[1]: "pilot-second"}}))
            cloud.retire_depublished_pilots(selected, {selected[0]}, fixture_root)
            assert cloud.progressive_event_ids() == selected  # un job edit ne retire pas un pilote encore public
            output_manifest.write_text(json.dumps({"events": {selected[1]: "pilot-second", third["id"]: "third-event"}}))
            with patch.object(cloud.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)) as runner:
                with patch.object(sys, "argv", ["generate-events-cloud.py", "--sortie", str(fixture_root), "--dry-run"]):
                    assert cloud.main() == 0
                    assert cloud.progressive_event_ids() == selected
                with patch.object(sys, "argv", ["generate-events-cloud.py", "--sortie", str(fixture_root)]), patch.dict(cloud.os.environ, {"EVENT_PUBLISHER_PRESERVE_LEGACY": "0"}):
                    assert cloud.main() == 0
                assert "--authorized-depublication-event-id" in runner.call_args.args[0]
                assert cloud.progressive_event_ids() == [selected[1]]
            manifest.write_text(json.dumps({"event_ids": selected}))
            cloud.retire_depublished_pilots(selected, {selected[0]}, fixture_root)
            assert cloud.progressive_event_ids() == [selected[1]]
            for bad_path in ("evenement/unknown.html", "../outside.html"):
                with patch.dict(cloud.os.environ, {"PUBLICATION_DEPUBLISH_PATHS": json.dumps([bad_path])}):
                    try:
                        cloud.authorized_pilot_depublications(selected)
                    except RuntimeError:
                        pass
                    else:
                        raise AssertionError("mauvaise preuve de dépublication acceptée")
            with patch.dict(cloud.os.environ, {"PUBLICATION_DEPUBLISH_EVENT_IDS": json.dumps(["00000000-0000-0000-0000-000000000099"])}):
                try:
                    cloud.authorized_pilot_depublications(["00000000-0000-0000-0000-000000000099"])
                except RuntimeError:
                    pass
                else:
                    raise AssertionError("ID inconnu accepté comme ancien pilote")
    module.generer_sortie_atomique(pilot, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids=selected)
    assert cloud.preserve_pages(output)[0] == 282
    original_pages = {path.name for path in (ROOT / "evenement").glob("*.html") if path.name != "index.html"}
    final_pages = {path.name for path in (output / "evenement").glob("*.html") if path.name != "index.html"}
    assert original_pages <= final_pages
    for filename in protected.values():
        assert (output / "evenement" / filename).read_bytes() == (ROOT / "evenement" / filename).read_bytes()

print("progressive event generator: PASS")
