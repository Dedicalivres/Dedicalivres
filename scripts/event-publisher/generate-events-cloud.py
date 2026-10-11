#!/usr/bin/env python3

from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import uuid


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

CORE = HERE / "generate-events.py"

MANIFEST = (
    HERE /
    "legacy-enriched-events.json"
)

PROGRESSIVE_MANIFEST = HERE / "progressive-events.json"


def progressive_event_ids(path=None):
    path = path or PROGRESSIVE_MANIFEST
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RuntimeError("manifeste progressif absent ou invalide") from exc
    if not isinstance(data, dict) or set(data) != {"event_ids"} or not isinstance(data["event_ids"], list):
        raise RuntimeError("manifeste progressif : event_ids doit être le seul champ et un tableau")
    values = data["event_ids"]
    if len(values) > 2:
        raise RuntimeError("manifeste progressif : deux événements maximum")
    try:
        ids = [str(uuid.UUID(value)) for value in values if isinstance(value, str)]
    except ValueError as exc:
        raise RuntimeError("manifeste progressif : UUID invalide") from exc
    if len(ids) != len(values) or len(set(ids)) != len(ids):
        raise RuntimeError("manifeste progressif : identifiant invalide ou dupliqué")
    return ids


def authorized_pilot_depublications(selected):
    try:
        ids = json.loads(os.environ.get("PUBLICATION_DEPUBLISH_EVENT_IDS") or "[]")
        paths = json.loads(os.environ.get("PUBLICATION_DEPUBLISH_PATHS") or "[]")
    except ValueError as exc:
        raise RuntimeError("autorisation de dépublication invalide") from exc
    if not isinstance(ids, list) or not isinstance(paths, list) or len(ids) != len(paths):
        raise RuntimeError("IDs et chemins de dépublication non alignés")
    selected_ids = set(selected)
    if not selected_ids.intersection(ids):
        return set()
    try:
        canonical = json.loads((ROOT / "docs/territoires/event-canonical-map.json").read_text(encoding="utf-8"))
        legacy = json.loads(MANIFEST.read_text(encoding="utf-8"))["events"]
    except (OSError, ValueError, KeyError) as exc:
        raise RuntimeError("preuve canonique ou legacy indisponible") from exc
    authorized = set()
    for event_id, path in zip(ids, paths):
        if event_id not in selected_ids:
            continue
        if event_id in authorized or event_id in legacy or canonical.get(event_id) != path:
            raise RuntimeError("pilote dépublié : identité canonique invalide")
        if not isinstance(path, str) or not re.fullmatch(r"evenement/[^/]+\.html", path):
            raise RuntimeError("pilote dépublié : chemin canonique invalide")
        page = ROOT / path
        if not page.is_file():
            raise RuntimeError("pilote dépublié : fiche canonique absente")
        html = page.read_text(encoding="utf-8")
        match = re.search(r'data-event-id="([^"]+)"', html)
        if match is None or match.group(1) != event_id:
            raise RuntimeError("pilote dépublié : ID de la fiche incohérent")
        authorized.add(event_id)
    return authorized


def retire_depublished_pilots(selected, authorized, output_root):
    if not authorized:
        return
    try:
        generated = json.loads((output_root / "event-pages-manifest.json").read_text(encoding="utf-8"))["events"]
    except (OSError, ValueError, KeyError) as exc:
        raise RuntimeError("manifeste des fiches générées indisponible") from exc
    if not isinstance(generated, dict):
        raise RuntimeError("manifeste des fiches générées invalide")
    retired = authorized - set(generated)
    if not retired:
        return
    current = progressive_event_ids()
    if current != selected:
        raise RuntimeError("manifeste progressif modifié pendant la génération")
    remaining = [event_id for event_id in selected if event_id not in retired]
    temporary = PROGRESSIVE_MANIFEST.with_suffix(".json.tmp")
    temporary.write_text(json.dumps({"event_ids": remaining}, indent=2) + "\n", encoding="utf-8")
    temporary.replace(PROGRESSIVE_MANIFEST)
    print(f"PILOTES_RETIRES={len(retired)}")


def sha256(path):
    h = hashlib.sha256()

    with path.open("rb") as handle:
        while True:
            chunk = handle.read(
                1024 * 1024
            )

            if not chunk:
                break

            h.update(chunk)

    return h.hexdigest()


def argument_value(
    argv,
    name,
):
    for index, value in enumerate(
        argv
    ):
        if value == name:
            if index + 1 < len(argv):
                return argv[
                    index + 1
                ]

            return None

        prefix = name + "="

        if value.startswith(
            prefix
        ):
            return value[
                len(prefix):
            ]

    return None


def has_argument(
    argv,
    name,
):
    return any(
        value == name
        or value.startswith(
            name + "="
        )
        for value in argv
    )


def preserve_old_sitemap_urls(
    generated_sitemap,
):
    existing_sitemap = (
        ROOT /
        "sitemap-evenements.xml"
    )

    if (
        not existing_sitemap.is_file()
        or not generated_sitemap.is_file()
    ):
        return 0

    old_text = (
        existing_sitemap
        .read_text(
            encoding="utf-8"
        )
    )

    new_text = (
        generated_sitemap
        .read_text(
            encoding="utf-8"
        )
    )

    block_pattern = re.compile(
        r"<url>\s*.*?\s*</url>",
        re.S,
    )

    loc_pattern = re.compile(
        r"<loc>(.*?)</loc>",
        re.S,
    )

    def blocks(text):
        result = {}

        for block in (
            block_pattern.findall(
                text
            )
        ):
            match = (
                loc_pattern.search(
                    block
                )
            )

            if match:
                result[
                    match.group(1)
                    .strip()
                ] = block

        return result

    old_blocks = blocks(
        old_text
    )

    new_blocks = blocks(
        new_text
    )

    missing = [
        old_blocks[url]
        for url in old_blocks
        if url not in new_blocks
    ]

    if not missing:
        return 0

    closing = "</urlset>"

    if closing not in new_text:
        raise RuntimeError(
            "sitemap généré invalide"
        )

    insertion = (
        "\n"
        + "\n".join(
            missing
        )
        + "\n"
    )

    generated_sitemap.write_text(
        new_text.replace(
            closing,
            insertion + closing,
            1,
        ),
        encoding="utf-8",
    )

    return len(missing)


def preserve_unchanged_sitemap_lastmod(
    generated_sitemap,
    output_root,
):
    existing_sitemap = (
        ROOT /
        "sitemap-evenements.xml"
    )

    if (
        not existing_sitemap.is_file()
        or not generated_sitemap.is_file()
    ):
        return 0

    old_text = (
        existing_sitemap
        .read_text(
            encoding="utf-8"
        )
    )

    new_text = (
        generated_sitemap
        .read_text(
            encoding="utf-8"
        )
    )

    block_pattern = re.compile(
        r"<url>\s*.*?\s*</url>",
        re.S,
    )

    loc_pattern = re.compile(
        r"<loc>(.*?)</loc>",
        re.S,
    )

    def blocks(text):
        result = {}

        for block in (
            block_pattern.findall(
                text
            )
        ):
            match = (
                loc_pattern.search(
                    block
                )
            )

            if match:
                result[
                    match.group(1)
                    .strip()
                ] = block

        return result

    old_blocks = blocks(
        old_text
    )

    replacements = {}

    marker = "/evenement/"

    for block in (
        block_pattern.findall(
            new_text
        )
    ):
        match = (
            loc_pattern.search(
                block
            )
        )

        if not match:
            continue

        url = (
            match.group(1)
            .strip()
        )

        old_block = (
            old_blocks.get(
                url
            )
        )

        if not old_block:
            continue

        if marker not in url:
            continue

        filename = (
            url.split(
                marker,
                1
            )[1]
            .split(
                "?",
                1
            )[0]
            .split(
                "#",
                1
            )[0]
        )

        if (
            not filename
            or "/" in filename
            or "\\" in filename
            or filename in {
                ".",
                "..",
            }
        ):
            continue

        current_page = (
            ROOT /
            "evenement" /
            filename
        )

        generated_page = (
            output_root /
            "evenement" /
            filename
        )

        if (
            current_page.is_file()
            and generated_page.is_file()
            and sha256(
                current_page
            )
            == sha256(
                generated_page
            )
        ):
            replacements[
                url
            ] = old_block

    if not replacements:
        return 0

    def replace_block(match):
        block = match.group(0)

        loc = (
            loc_pattern.search(
                block
            )
        )

        if not loc:
            return block

        url = (
            loc.group(1)
            .strip()
        )

        return replacements.get(
            url,
            block,
        )

    stabilized = (
        block_pattern.sub(
            replace_block,
            new_text,
        )
    )

    generated_sitemap.write_text(
        stabilized,
        encoding="utf-8",
    )

    return len(
        replacements
    )


def preserve_pages(
    output_root,
):
    data = json.loads(
        MANIFEST.read_text(
            encoding="utf-8"
        )
    )

    events = (
        data.get("events")
        or {}
    )

    if len(events) != 282:
        raise RuntimeError(
            "manifest legacy != 282"
        )

    source_dir = (
        ROOT /
        "evenement"
    )

    destination_dir = (
        output_root /
        "evenement"
    )

    destination_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    legacy_count = 0

    for _event_id, filename in (
        events.items()
    ):
        source = (
            source_dir /
            filename
        )

        destination = (
            destination_dir /
            filename
        )

        if not source.is_file():
            raise RuntimeError(
                "page legacy absente : "
                + filename
            )

        shutil.copy2(
            source,
            destination,
        )

        if (
            sha256(source)
            != sha256(destination)
        ):
            raise RuntimeError(
                "restauration legacy non exacte : "
                + filename
            )

        legacy_count += 1

    # Rejet/suppression :
    # aucune disparition automatique
    # tant que la politique archive/410
    # n'est pas définie.
    archive_count = 0

    for source in (
        source_dir.glob(
            "*.html"
        )
    ):
        if (
            source.name
            == "index.html"
        ):
            continue

        destination = (
            destination_dir /
            source.name
        )

        if destination.exists():
            continue

        shutil.copy2(
            source,
            destination,
        )

        archive_count += 1

    sitemap_preserved = (
        preserve_old_sitemap_urls(
            output_root /
            "sitemap-evenements.xml"
        )
    )

    return (
        legacy_count,
        archive_count,
        sitemap_preserved,
    )


def main():
    argv = list(
        sys.argv[1:]
    )

    selected = progressive_event_ids()
    authorized = authorized_pilot_depublications(selected)
    for event_id in selected:
        argv.extend(["--progressive-event-id", event_id])
    for event_id in sorted(authorized):
        argv.extend(["--authorized-depublication-event-id", event_id])

    output_value = (
        argument_value(
            argv,
            "--sortie",
        )
    )

    if not output_value:
        raise RuntimeError(
            "--sortie est obligatoire"
        )

    output_root = (
        Path(output_value)
        .expanduser()
        .resolve()
    )

    runtime_root = (
        output_root.parent /
        ".dedicalivres-publisher-runtime"
    )

    runtime_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    empty_db = (
        runtime_root /
        "no-auto-matte.sqlite3"
    )

    empty_config = (
        runtime_root /
        "no-auto-matte.toml"
    )

    if empty_db.exists():
        empty_db.unlink()

    if empty_config.exists():
        empty_config.unlink()

    # Force explicitement l'absence
    # de SQLite/config Auto-Matte.
    if not has_argument(
        argv,
        "--db",
    ):
        argv.extend([
            "--db",
            str(empty_db),
        ])

    if not has_argument(
        argv,
        "--config",
    ):
        argv.extend([
            "--config",
            str(empty_config),
        ])

    command = [
        sys.executable,
        str(CORE),
        *argv,
    ]

    completed = subprocess.run(
        command,
        cwd=HERE,
    )

    if completed.returncode != 0:
        return completed.returncode

    if empty_db.exists():
        raise RuntimeError(
            "le publisher a créé/utilisé "
            "une SQLite Auto-Matte"
        )

    if empty_config.exists():
        raise RuntimeError(
            "le publisher a créé/utilisé "
            "une config Auto-Matte"
        )

    if "--dry-run" in argv:
        return 0

    if (
        os.environ.get(
            "EVENT_PUBLISHER_PRESERVE_LEGACY"
        )
        != "1"
    ):
        retire_depublished_pilots(selected, authorized, output_root)
        return 0

    (
        legacy_count,
        archive_count,
        sitemap_preserved,
    ) = preserve_pages(
        output_root
    )

    sitemap_lastmod_preserved = (
        preserve_unchanged_sitemap_lastmod(
            output_root /
            "sitemap-evenements.xml",
            output_root,
        )
    )

    retire_depublished_pilots(selected, authorized, output_root)

    print(
        f"LEGACY_PRESERVED={legacy_count}"
    )

    print(
        f"ARCHIVE_PRESERVED={archive_count}"
    )

    print(
        "SITEMAP_URLS_PRESERVED="
        f"{sitemap_preserved}"
    )

    print(
        "SITEMAP_LASTMOD_PRESERVED="
        f"{sitemap_lastmod_preserved}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(
        main()
    )
