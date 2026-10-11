"""Offline checks for the opt-in static event structure."""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PUBLISHER = ROOT / "scripts" / "event-publisher"
sys.path.insert(0, str(PUBLISHER))
spec = importlib.util.spec_from_file_location("event_generator", PUBLISHER / "generate-events.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


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
        module.generer_sortie_atomique(events, output, base_url=base_url, sitemap_name="sitemap-evenements.xml", progressive_event_ids={"not-an-event"})
    except module.GenerationSeoError:
        pass
    else:
        raise AssertionError("absent ID accepted")

print("progressive event generator: PASS")
