#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---check}"

if [[ "$MODE" != "--check" && "$MODE" != "--apply" ]]; then
  echo "Usage:"
  echo "  scripts/publish-events-local.sh --check"
  echo "  scripts/publish-events-local.sh --apply"
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AUTO_ROOT="${AUTO_MATTE_ROOT:-/Users/leguillyjean-christophe/Documents/Projects/Auto-Matte}"
GEN="$AUTO_ROOT/source/generer_pages_seo.py"
EXPORT="$AUTO_ROOT/exports/site-seo"

cd "$ROOT"

echo "================================================"
echo " DEDICALIVRES — PUBLICATION EVENEMENTS LOCALE"
echo "================================================"
echo "MODE=$MODE"
echo "ROOT=$ROOT"
echo "AUTO_MATTE=$AUTO_ROOT"

if [[ ! -f "$GEN" ]]; then
  echo "STOP : générateur Auto-Matte introuvable."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo
  echo "STOP : dépôt non propre."
  git status --short
  exit 1
fi

echo
echo "=== GIT ==="
git branch --show-current
git log -1 --oneline

echo
echo "=== GENERATEUR ==="
python3 -m py_compile "$GEN"
echo "PASS py_compile"

echo
echo "=== DRY RUN AUTO-MATTE ==="

python3 "$GEN" \
  --existing-event-pages "$ROOT/evenement" \
  --sortie "$EXPORT" \
  --dry-run

if [[ "$MODE" == "--check" ]]; then
  echo
  echo "=== TESTS ETAT COURANT ==="

  node scripts/test-territorial-pages.mjs
  node scripts/test-author-seo-pages.mjs
  node scripts/test-event-canonical-client.mjs
  node scripts/test-static-agenda-previews.mjs
  node scripts/test-public-event-canonical-links.mjs

  echo
  echo "PASS CHECK : aucune publication effectuée."
  exit 0
fi

echo
echo "=== GENERATION REELLE AUTO-MATTE ==="

python3 "$GEN" \
  --existing-event-pages "$ROOT/evenement" \
  --sortie "$EXPORT"

if [[ ! -d "$EXPORT/evenement" ]]; then
  echo "STOP : export evenement/ absent."
  exit 1
fi

if [[ ! -f "$EXPORT/sitemap-evenements.xml" ]]; then
  echo "STOP : sitemap export absent."
  exit 1
fi

echo
echo "=== GARDE-FOU URL HISTORIQUES ==="

python3 - "$ROOT" "$EXPORT" <<'PY'
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1])
export = Path(sys.argv[2])

def pages(directory):
    return {
        p.name
        for p in directory.glob("*.html")
        if p.name != "index.html"
    }

old = pages(root / "evenement")
new = pages(export / "evenement")

added = sorted(new - old)
removed = sorted(old - new)

print("Pages actuelles :", len(old))
print("Pages générées :", len(new))
print("Ajouts :", len(added))
print("Suppressions / changements d'URL :", len(removed))

if added:
    for name in added[:20]:
        print("  +", name)

if removed:
    for name in removed[:20]:
        print("  -", name)

    raise SystemExit(
        "STOP : aucune suppression ou perte d'URL historique automatique autorisée."
    )

sitemap = export / "sitemap-evenements.xml"

tree = ET.parse(sitemap)
ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}

entries = tree.findall(".//s:url", ns)

print("Sitemap :", len(entries))

if len(entries) != len(new) + 1:
    raise SystemExit(
        "STOP : sitemap et corpus généré non alignés."
    )

print("PASS garde-fou")
PY

echo
echo "=== COPIE VERS LE WORKTREE ==="

rsync -a \
  "$EXPORT/evenement/" \
  "$ROOT/evenement/"

cp \
  "$EXPORT/sitemap-evenements.xml" \
  "$ROOT/sitemap-evenements.xml"

echo
echo "=== SNAPSHOT PUBLIC ==="
node scripts/capture-territorial-catalog.mjs

echo
echo "=== CANONICAL MAP ==="
node scripts/build-event-canonical-map.mjs

echo
echo "=== CLIENT CANONIQUE NAVIGATEUR ==="
node scripts/build-event-canonical-client.mjs

echo
echo "=== PAGES TERRITORIALES ==="
node scripts/build-territorial-pages.mjs

echo
echo "=== APERCUS STATIQUES AGENDA ==="
node scripts/build-static-agenda-previews.mjs

echo
echo "=== PAGES AUTEURS ==="
node scripts/build-author-pages.mjs

echo
echo "=== TESTS ==="

node scripts/test-territorial-pages.mjs
node scripts/test-author-seo-pages.mjs
node scripts/test-event-canonical-client.mjs
node scripts/test-static-agenda-previews.mjs
node scripts/test-public-event-canonical-links.mjs
node --check event.js
node --check authors-presence.js

echo
echo "=== INVARIANTS FINAUX ==="

python3 - <<'PY'
from pathlib import Path
import json
import xml.etree.ElementTree as ET

pages = [
    p for p in Path("evenement").glob("*.html")
    if p.name != "index.html"
]

mapping = json.loads(
    Path(
        "docs/territoires/event-canonical-map.json"
    ).read_text(encoding="utf-8")
)

missing = json.loads(
    Path(
        "docs/territoires/event-canonical-missing.json"
    ).read_text(encoding="utf-8")
)

tree = ET.parse("sitemap-evenements.xml")
ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
entries = tree.findall(".//s:url", ns)

print("Fiches :", len(pages))
print("Canonical map :", len(mapping))
print("Missing :", len(missing))
print("Sitemap :", len(entries))

assert len(mapping) == len(pages)
assert not missing
assert len(entries) == len(pages) + 1

for p in pages:
    html = p.read_text(encoding="utf-8")

    assert 'rel="canonical"' in html, p
    assert 'data-event-id=' in html, p
    assert '/event.js' in html, p
    assert '/accessibilite.css' in html, p

print("PASS invariants")
PY

echo
echo "=== DIFF CHECK ==="
git diff --check

echo
echo "=== ETAT FINAL ==="
git status --short

echo
echo "=== DIFF STAT ==="
git diff --stat

echo
echo "================================================"
echo " PUBLICATION PREPAREE LOCALEMENT"
echo " Aucun git add / commit / push n'a été exécuté."
echo "================================================"
