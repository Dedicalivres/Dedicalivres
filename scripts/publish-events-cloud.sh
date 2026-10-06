#!/usr/bin/env bash
set -euo pipefail

ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  pwd
)"

export EVENT_PUBLISHER_USE_BUNDLED=1
export EVENT_PUBLISHER_PRESERVE_LEGACY=1
export DEDICALIVRES_ALLOW_EXTERNAL_EXPORT=1

export EVENT_PUBLISHER_EXPORT_DIR="${EVENT_PUBLISHER_EXPORT_DIR:-${RUNNER_TEMP:-/tmp}/dedicalivres-site-seo}"

if [[ -z "${DEDICALIVRES_SUPABASE_URL:-}" ]]; then
  echo "STOP : DEDICALIVRES_SUPABASE_URL absente."
  exit 1
fi

if [[ -z "${DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  echo "STOP : DEDICALIVRES_SUPABASE_PUBLISHABLE_KEY absente."
  exit 1
fi

cd "$ROOT"

exec \
  "$ROOT/scripts/publish-events-local.sh" \
  --apply
