#!/usr/bin/env python3
"""Seal or apply a freshly revalidated temporal projection. No remote writes."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('temporal', ROOT / 'scripts/refresh-temporal-catalogues.py')
temporal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(temporal)
from retired_test_policy import excluded_ids


def sha(data):
    return hashlib.sha256(data).hexdigest()


def check_day(day, now=None):
    if day != temporal.refresh.paris_today(now):
        raise ValueError('jour Europe/Paris incohérent ou périmé')


def check_base(root, expected, clean=True):
    if not re.fullmatch('[0-9a-f]{40}', expected or '') or temporal.run(root, 'git', 'rev-parse', 'HEAD').decode().strip() != expected:
        raise ValueError('base Git modifiée')
    if clean and temporal.run(root, 'git', 'status', '--porcelain', '--untracked-files=all'):
        raise ValueError('copie Git non propre')
    snapshot, mapping = temporal.corpus(root)
    if set(mapping) & excluded_ids():
        raise ValueError('événement retiré encore présent dans le catalogue')
    return len(snapshot['events'])


def manifest(folder):
    report = json.loads((folder / 'report.json').read_text())
    return {'version': 1, 'base': report['base'], 'date': report['date'],
            'report_sha256': sha((folder / 'report.json').read_bytes()),
            'patch_sha256': sha((folder / 'projection.patch').read_bytes())}


def fingerprint(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode())


def read_candidate(folder, expected, day, approved):
    check_day(day)
    value = manifest(folder)
    if value != json.loads((folder / 'manifest.json').read_text()) or fingerprint(value) != approved:
        raise ValueError('patch ou rapport altéré, empreinte non approuvée')
    if value['base'] != expected or value['date'] != day.isoformat():
        raise ValueError('projection obsolète ou base différente')
    return json.loads((folder / 'report.json').read_text())


def project(root, folder, expected, day):
    check_day(day)
    count = check_base(root, expected)
    report = temporal.project(root, folder, day)
    if report['base'] != expected or report['events'] != count:
        raise ValueError('base ou corpus changé pendant la projection')
    check_base(root, expected)
    check_day(day)
    value = manifest(folder)
    (folder / 'manifest.json').write_text(json.dumps(value, indent=2) + '\n')
    result = fingerprint(value)
    print('Empreinte PREVIEW temporelle : ' + result)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('fingerprint=' + result + '\n')
    return result


def verify_applied(root, folder, expected, day, approved):
    report = read_candidate(folder, expected, day, approved)
    count = check_base(root, expected, clean=False)
    if report['events'] != count or temporal.run(root, 'git', 'ls-files', '--others', '--exclude-standard'):
        raise ValueError('corpus changé ou fichier inattendu')
    actual = temporal.run(root, 'git', 'diff', 'HEAD', '--binary')
    if actual != (folder / 'projection.patch').read_bytes():
        raise ValueError('diff appliqué différent du patch validé')
    temporal.run(root, 'git', 'diff', 'HEAD', '--check')


def apply(root, folder, expected, day, approved, confirmation):
    if confirmation != 'PUBLISH_TEMPORAL':
        raise ValueError('confirmation manuelle explicite requise')
    check_base(root, expected)
    report = read_candidate(folder, expected, day, approved)
    # Never trust an old artifact: rerun the existing complete, idempotent projector.
    with tempfile.TemporaryDirectory(prefix='temporal-revalidate-') as temp:
        fresh = Path(temp) / 'fresh'
        if project(root, fresh, expected, day) != approved:
            raise ValueError('projection fraîche différente : STOP sans application')
    patch = folder / 'projection.patch'
    if patch.read_bytes():
        temporal.run(root, 'git', 'apply', '--check', str(patch))
        temporal.run(root, 'git', 'apply', str(patch))
    if report['created']:
        temporal.run(root, 'git', 'add', '--intent-to-add', '--', *report['created'])
    verify_applied(root, folder, expected, day, approved)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['project', 'apply', 'verify'])
    parser.add_argument('--expected-base', required=True)
    parser.add_argument('--day', required=True, type=temporal.dt.date.fromisoformat)
    parser.add_argument('--folder', required=True, type=Path)
    parser.add_argument('--fingerprint', default='')
    parser.add_argument('--confirmation', default='')
    args = parser.parse_args()
    try:
        folder = args.folder.resolve()
        if folder == ROOT or ROOT in folder.parents:
            raise ValueError('sortie requise hors du dépôt')
        if args.mode == 'project':
            project(ROOT, folder, args.expected_base, args.day)
        elif args.mode == 'apply':
            apply(ROOT, folder, args.expected_base, args.day, args.fingerprint, args.confirmation)
        else:
            verify_applied(ROOT, folder, args.expected_base, args.day, args.fingerprint)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        if isinstance(exc, subprocess.CalledProcessError):
            print(exc.output.decode(), file=sys.stderr)
        parser.exit(2, f'STOP livraison temporelle : {exc}\n')
