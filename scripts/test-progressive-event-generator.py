"""Offline checks for the opt-in static event structure."""
import importlib.util
import json
import re
import shutil
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



# JSON-LD must not turn a city or a website into an invented organizer.
with tempfile.TemporaryDirectory() as tmp:
    fixture = Path(tmp)
    (fixture / 'docs/territoires').mkdir(parents=True)
    (fixture / 'evenement').mkdir()
    mapping_path = fixture / 'docs/territoires/event-canonical-map.json'
    mapping_path.write_text('{}')
    fresh = event('00000000-0000-4000-8000-000000000099', '', 'Salon de test', 'Senlis',
                  'Hauts-de-France', '2026-10-03', '2026-10-04', 'Description vérifiée')
    fresh.update(site='https://official.example/', lieu='Espace Saint-Pierre', adresse='Place Saint-Pierre', code_postal='60300')
    url = 'https://dedicalivres.fr/evenement/' + fresh['_slug'] + '.html'
    with patch.object(module, '__file__', str(fixture / 'scripts/event-publisher/generate-events.py')):
        payload = json.loads(module.jsonld_event(fresh, url))
        assert 'organizer' not in payload
        assert payload['startDate'] == fresh['date_debut'] and payload['endDate'] == fresh['date_fin']
        assert payload['location']['name'] == fresh['lieu']
        assert payload['location']['address'] == {'@type':'PostalAddress', 'streetAddress':'Place Saint-Pierre',
            'addressLocality':'Senlis', 'postalCode':'60300', 'addressRegion':'Hauts-de-France', 'addressCountry':'FR'}
        rendered = module.page_event(fresh, 'https://dedicalivres.fr')
        assert f'data-event-id="{fresh["id"]}"' in rendered
        assert f'<link rel="canonical" href="{url}">' in rendered
        assert '3 octobre 2026' in rendered and '4 octobre 2026' in rendered
        breadcrumb = json.loads(module.jsonld_breadcrumb(fresh, 'https://dedicalivres.fr', url))
        assert breadcrumb['@type'] == 'BreadcrumbList' and breadcrumb['itemListElement'][-1]['item'] == url
        existing = {'@context':'https://schema.org','@type':'Event','url':url,
                    'organizer':{'@type':'Organization','name':'Bibliothèque municipale','url':'https://organizer.example/'}}
        path = 'evenement/' + fresh['_slug'] + '.html'
        mapping_path.write_text(json.dumps({fresh['id']:path}))
        def save_existing(value):
            (fixture / path).write_text(f'<link rel="canonical" href="{url}"><script type="application/ld+json">'+json.dumps(value)+'</script>')
        save_existing(existing)
        assert json.loads(module.jsonld_event(fresh, url))['organizer'] == existing['organizer']
        without = {k:v for k,v in existing.items() if k != 'organizer'}
        save_existing(without)
        assert 'organizer' not in json.loads(module.jsonld_event(fresh, url))
        save_existing({**existing, 'url':'https://wrong.example/'})
        try:
            module.jsonld_event(fresh, url)
        except module.GenerationSeoError:
            pass
        else:
            raise AssertionError('source publiée incohérente acceptée')

# All already-published organizer values remain unchanged, including unknown or
# inaccurate values that require separately authorized business correction.
canonical_organizers = json.loads((ROOT / 'docs/territoires/event-canonical-map.json').read_text())
for identifier, relative in canonical_organizers.items():
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', (ROOT / relative).read_text(), re.S)
    published = next(obj for obj in map(json.loads, blocks) if isinstance(obj,dict) and obj.get('@type') == 'Event')
    assert module.published_organizer(identifier) == published.get('organizer')
print('PASS JSON-LD organizer: no city inference, known enrichment retained, canonical source checked')


events = [
    event("b2bf907d-6b39-4c86-a38d-70cc73531da3", "https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev/event-images/2026/06/1780512372624-6123fda2-40f2-469c-ba5e-db6eaa78b80d.jpg", "MYTH & LOVE", "Moulins", "Auvergne-Rhône-Alpes", "2027-10-30", "2027-10-31", ""),
    event("433a1069-e745-4de8-bfc5-94ddbddb5b65", "", "Salon du livre Thornslove : Romance sous tous ses genres", "Louverné", "Pays de la Loire", "2027-09-18", "2027-09-19", "Salon littéraire spécial romance, 90 stands et animations."),
]
events[0].update(adresse="12 rue de Test", code_postal="03000", auteurs="Autrice de test")
base_url = "https://dedicalivres.fr"

# Le catalogue canonique et les seuls jobs sélectionnés définissent la sortie.
known, other = events[0]['id'], events[1]['id']
pending = ['00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000002',
           '00000000-0000-4000-8000-000000000003']
surprise = '00000000-0000-4000-8000-000000000004'
source = [{'id': identifier} for identifier in [known, other, *pending, surprise]]
canonical = {known: 'evenement/known.html', other: 'evenement/other.html'}
job_id = '11111111-1111-4111-8111-111111111111'
other_job_id = '22222222-2222-4222-8222-222222222222'
def job(reason, identifier, identifier_job=job_id):
    return {'id': identifier_job, 'event_id': identifier, 'reason': reason}
def selected(reason, identifier):
    return module.select_published_rows(source, canonical, [job(reason, identifier)])
assert [row['id'] for row in selected('edit', known)] == [known, other]
assert [row['id'] for row in selected('validation', pending[0])] == [known, other, pending[0]]
assert [row['id'] for row in selected('unpublish', known)] == [other]
assert [row['id'] for row in selected('manual', None)] == [known, other]
assert selected('edit', known) == selected('edit', known)
for invalid_source, invalid_canonical, selected_jobs in [
    (source[:-1] + [source[0]], canonical, [job('edit', known)]),
    (source[1:], canonical, [job('edit', known)]),
    (source, {known: 'evenement/index.html'}, [job('edit', known)]),
    (source, canonical, [job('edit', pending[0])]),
    (source, canonical, [job('unpublish', pending[0])]),
    (source, canonical, [job('edit', known), job('edit', known, other_job_id)]),
]:
    try:
        module.select_published_rows(invalid_source, invalid_canonical, selected_jobs)
    except module.GenerationSeoError:
        pass
    else:
        raise AssertionError('sélection publique invalide acceptée')

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

    # Parcours complet du wrapper, avec la seule lecture distante remplacée
    # par le générateur local sur un corpus temporaire.
    fixture_root = temp / "wrapper-root"
    source_pages = fixture_root / "evenement"
    source_pages.mkdir(parents=True)
    (fixture_root / "docs/territoires").mkdir(parents=True)
    for filename in protected.values():
        shutil.copy2(ROOT / "evenement" / filename, source_pages / filename)

    withdrawn = event("00000000-0000-0000-0000-000000000004", "", "Fiche rejetée", "Rouen", "Normandie", "2027-11-01", "2027-11-01", "Ancienne fiche publique")
    kept = event("00000000-0000-0000-0000-000000000005", "", "Fiche conservée", "Lille", "Hauts-de-France", "2027-11-02", "2027-11-02", "Fiche toujours publique")
    published = event("00000000-0000-0000-0000-000000000006", "", "Nouvelle fiche", "Seclin", "Hauts-de-France", "2027-11-03", "2027-11-03", "Nouvelle publication")
    withdrawn_path = f"evenement/{withdrawn['_slug']}.html"
    for current in (withdrawn, kept):
        (source_pages / f"{current['_slug']}.html").write_text(module.page_event(current, base_url), encoding="utf-8")
    assert (fixture_root / withdrawn_path).is_file()
    (fixture_root / "sitemap-evenements.xml").write_text(module.sitemap([withdrawn, kept], base_url), encoding="utf-8")
    (fixture_root / "docs/territoires/event-canonical-map.json").write_text(json.dumps({withdrawn["id"]: withdrawn_path}), encoding="utf-8")
    wrapper_manifest = temp / "wrapper-progressive-events.json"
    wrapper_manifest.write_text('{"event_ids": []}', encoding="utf-8")

    def generate_for_wrapper(command, **_kwargs):
        assert command[1] == str(PUBLISHER / "generate-events.py")
        target = Path(command[command.index("--sortie") + 1])
        module.generer_sortie_atomique([kept, published], target, base_url=base_url, sitemap_name="sitemap-evenements.xml")
        assert not (target / withdrawn_path).exists()
        assert f"/evenement/{withdrawn['_slug']}.html</loc>" not in (target / "sitemap-evenements.xml").read_text(encoding="utf-8")
        return types.SimpleNamespace(returncode=0)

    wrapper_output = temp / "wrapper-authorized-output"
    authorization = {
        "PUBLICATION_DEPUBLISH_EVENT_IDS": json.dumps([withdrawn["id"]]),
        "PUBLICATION_DEPUBLISH_PATHS": json.dumps([withdrawn_path]),
        "EVENT_PUBLISHER_PRESERVE_LEGACY": "1",
    }
    with patch.object(cloud, "ROOT", fixture_root), patch.object(cloud, "PROGRESSIVE_MANIFEST", wrapper_manifest), patch.object(cloud.subprocess, "run", side_effect=generate_for_wrapper) as runner, patch.dict(cloud.os.environ, authorization), patch.object(sys, "argv", ["generate-events-cloud.py", "--sortie", str(wrapper_output)]):
        assert cloud.main() == 0
        runner.assert_called_once()

    sitemap = (wrapper_output / "sitemap-evenements.xml").read_text(encoding="utf-8")
    assert not (wrapper_output / withdrawn_path).exists()
    assert f"/evenement/{withdrawn['_slug']}.html</loc>" not in sitemap
    for current in (kept, published):
        page = wrapper_output / "evenement" / f"{current['_slug']}.html"
        assert page.is_file()
        assert f"/evenement/{current['_slug']}.html</loc>" in sitemap
    assert len(protected) == 282
    for filename in protected.values():
        assert (wrapper_output / "evenement" / filename).read_bytes() == (source_pages / filename).read_bytes()

    # Sans autorisation, le wrapper restaure la fiche et son URL.
    unauthorized_output = temp / "wrapper-unauthorized-output"
    with patch.object(cloud, "ROOT", fixture_root), patch.object(cloud, "PROGRESSIVE_MANIFEST", wrapper_manifest), patch.object(cloud.subprocess, "run", side_effect=generate_for_wrapper), patch.dict(cloud.os.environ, {"PUBLICATION_DEPUBLISH_EVENT_IDS": "[]", "PUBLICATION_DEPUBLISH_PATHS": "[]", "EVENT_PUBLISHER_PRESERVE_LEGACY": "1"}), patch.object(sys, "argv", ["generate-events-cloud.py", "--sortie", str(unauthorized_output)]):
        assert cloud.main() == 0
    assert (unauthorized_output / withdrawn_path).is_file()
    assert f"/evenement/{withdrawn['_slug']}.html</loc>" in (unauthorized_output / "sitemap-evenements.xml").read_text(encoding="utf-8")

    with patch.object(cloud, "ROOT", fixture_root), patch.object(cloud, "PROGRESSIVE_MANIFEST", wrapper_manifest), patch.object(cloud.subprocess, "run") as runner, patch.dict(cloud.os.environ, {**authorization, "PUBLICATION_DEPUBLISH_EVENT_IDS": json.dumps([kept["id"]])}), patch.object(sys, "argv", ["generate-events-cloud.py", "--sortie", str(temp / "wrapper-invalid-output")]):
        try:
            cloud.main()
        except RuntimeError:
            pass
        else:
            raise AssertionError("autorisation incohérente acceptée")
        runner.assert_not_called()

with tempfile.TemporaryDirectory() as directory:
    fixture_root = Path(directory) / "site"
    source = fixture_root / "evenement"
    source.mkdir(parents=True)
    protected = json.loads((PUBLISHER / "legacy-enriched-events.json").read_text())["events"]
    for filename in protected.values():
        shutil.copy2(ROOT / "evenement" / filename, source / filename)
    target_id, target_file = next(iter(protected.items()))
    output = Path(directory) / "generated"
    (output / "evenement").mkdir(parents=True)
    generated = output / "evenement" / target_file
    generated.write_text("MODIFICATION NON AUTORISÉE", encoding="utf-8")
    with patch.object(cloud, "ROOT", fixture_root):
        assert cloud.preserve_pages(output)[0] == 282
    assert generated.read_bytes() == (source / target_file).read_bytes()
    assert all((output / "evenement" / filename).read_bytes()
               == (source / filename).read_bytes()
               for filename in protected.values())

print("progressive event generator: PASS")
