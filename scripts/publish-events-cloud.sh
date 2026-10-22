#!/usr/bin/env bash
set -euo pipefail

ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  pwd
)"

export EVENT_PUBLISHER_USE_BUNDLED=1
export EVENT_PUBLISHER_PRESERVE_LEGACY=1
export DEDICALIVRES_ALLOW_EXTERNAL_EXPORT=1
if [[ "${PUBLICATION_P0_TARGETED:-false}" != "true" ]]; then
  export PUBLICATION_TARGETED=true
fi

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

if [[ -n "${PUBLICATION_BRIVE_EDIT_AUTHORIZATION:-}" ]]; then
  [[ -z "${PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION:-}" ]] || exit 1
  exec node scripts/project-brive-edit.mjs prepare-claimed
fi

if [[ -n "${PUBLICATION_TEST_UNPUBLISH_AUTHORIZATION:-}" ]]; then
  exec node scripts/prepare-lorient-retirement.mjs
fi

# Seal public source and the read-only queue before generating any output.
export PUBLICATION_SOURCE_ISOLATION="$(mktemp -d "${RUNNER_TEMP:-/tmp}/publication-isolation.XXXXXX")/proof.json"
node scripts/targeted-source-isolation.mjs prepare "$PUBLICATION_SOURCE_ISOLATION"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "PUBLICATION_SOURCE_ISOLATION=$PUBLICATION_SOURCE_ISOLATION" >> "$GITHUB_ENV"
fi

exec \
  "$ROOT/scripts/publish-events-local.sh" \
  --apply
