"""Durable Lorient exclusion; no writes or remote calls. Node owns authorization."""
import json
import datetime as dt
import re
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent.parent
TARGET = 'eb6672b2-900f-4c6a-9021-ea84c5036769'
PAGE = 'evenement/salon-du-livre-jeunesse-du-pays-de-lorient-lorient-3441.html'


def excluded_ids():
    data = json.loads((ROOT / 'event-retirements.json').read_text())
    rows = data.get('entries')
    if data.get('version') != 1 or not isinstance(rows, list) or len(rows) != 1:
        raise RuntimeError('STOP registre de retrait ambigu')
    row = rows[0]
    if (row.get('event_id') != TARGET or row.get('canonical') != PAGE
            or row.get('reason') != 'private-test-not-an-event'
            or row.get('decision') != 'SITE-LORIENT-TEST-DEPUBLISH-02'
            or row.get('historical_job') != '80a4506a-357e-4df0-a5ac-5fe4ce27535f'):
        raise RuntimeError('STOP identité de retrait invalide')
    if row.get('status') == 'released':
        release = row.get('release') or {}
        if (not isinstance(release.get('decision'), str) or len(release['decision']) < 8
                or not isinstance(release.get('reason'), str) or not release['reason'].strip()
                or not re.match(r'^\d{4}-\d{2}-\d{2}T', release.get('approved_at', ''))):
            raise RuntimeError('STOP levée de retrait non documentée')
        dt.datetime.fromisoformat(release['approved_at'].replace('Z', '+00:00'))
        return set()
    if row.get('status') != 'excluded' or row.get('release', 'missing') is not None:
        raise RuntimeError('STOP statut de retrait invalide')
    return {TARGET}


def guard_jobs(jobs):
    if not any(isinstance(j, dict) and (j.get('target_event_id') or j.get('event_id')) == TARGET for j in jobs):
        return set()
    result = subprocess.run(['node', str(ROOT / 'scripts/retired-test-policy.mjs')],
                            input=json.dumps(jobs), text=True, capture_output=True, check=True)
    return set(json.loads(result.stdout)['authorized'])
