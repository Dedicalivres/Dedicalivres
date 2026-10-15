#!/usr/bin/env bash
set -euo pipefail
# Disposable Docker PostgreSQL only. Never connects to Supabase production.
root=$(cd "$(dirname "$0")/.." && pwd)
container=''
trap 'if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi' EXIT
container=$(docker run --rm -d -e POSTGRES_PASSWORD=test postgres:17-alpine)
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
sql() { docker exec "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -c "$1"; }
expect() { [[ "$1" == "$2" ]] || { echo "FAIL $3: expected $2, got $1" >&2; exit 1; }; }
expect_error() {
  local output
  if output=$(sql "$1" 2>&1); then echo 'FAIL expected SQL refusal' >&2; exit 1; fi
  [[ "$output" == *"$2"* ]] || { echo "FAIL expected $2, got $output" >&2; exit 1; }
}
for migration in \
  20261012155223_publication_batch_state_machine.sql \
  20261014043617_publication_canary_guard.sql \
  20261014120000_admin_canary_evidence_status.sql \
  20261014161135_canary_direct_provenance.sql \
  20261015051416_admin_latest_direct_canary_reference.sql \
  20261015180737_auto_matte_observed_import_guard.sql; do
  docker cp "$root/supabase/migrations/$migration" "$container:/$migration"
done
sql "create schema private; create schema auth; create role anon; create role authenticated; create role service_role; create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('test.uid',true),'')::uuid \$\$; create function private.is_admin() returns boolean language sql stable security definer as \$\$ select current_setting('test.admin',true)='true' \$\$; create table public.events (id uuid primary key, title text, city text, start_date date, end_date date, validated boolean, rejected boolean, verified boolean, registration_force_status text, website text, description text, region text, country_code text, lat double precision, lng double precision); create table public.event_submission_contacts (event_id uuid primary key references public.events(id), submitter_name text, submitter_email text, created_at timestamptz default now()); create table public.event_publication_jobs (id uuid primary key, event_id uuid, target_event_id uuid, reason text, status text, attempt_count integer, batch_id uuid, commit_sha text, requested_at timestamptz, started_at timestamptz, finished_at timestamptz, last_error text);" >/dev/null
for migration in \
  20261012155223_publication_batch_state_machine.sql \
  20261014043617_publication_canary_guard.sql \
  20261014120000_admin_canary_evidence_status.sql \
  20261014161135_canary_direct_provenance.sql \
  20261015051416_admin_latest_direct_canary_reference.sql \
  20261015180737_auto_matte_observed_import_guard.sql; do
  docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f "/$migration" >/dev/null
done
if [[ -n "${AUTOMATTE_DRY_RUN_SQL:-}" ]]; then
  [[ -f "$AUTOMATTE_DRY_RUN_SQL" ]] || { echo 'Missing isolated dry-run SQL' >&2; exit 1; }
  docker cp "$AUTOMATTE_DRY_RUN_SQL" "$container:/actual-dry-run.sql"
  actual=$(docker exec "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -f /actual-dry-run.sql)
  expect "$actual" $'107:0:0:0:0\n0' 'real ID-only isolated dry-run'
  expect "$(sql 'select count(*) from public.events')" '0' 'dry-run fixture rolled back'
  echo 'PASS current 701/20 snapshot: 107 eligible in isolated empty-provenance fixture, zero writes'
fi
one='11111111-1111-4111-8111-111111111111'
two='22222222-2222-4222-8222-222222222222'
three='33333333-3333-4333-8333-333333333333'
four='44444444-4444-4444-8444-444444444444'
five='55555555-5555-4555-8555-555555555555'
six='66666666-6666-4666-8666-666666666666'
missing='99999999-9999-4999-8999-999999999999'
hash_for() {
  python3 -c 'import hashlib,json,sys; rows=json.loads(sys.argv[1]); payload="".join(r["event_id"]+"\t"+r["auto_matte_reference"]+"\n" for r in sorted(rows,key=lambda r:(r["event_id"],r["auto_matte_reference"]))); print(hashlib.sha256(payload.encode("utf-8")).hexdigest())' "$1"
}
sql "insert into public.events (id,title) values ('$one','One'),('$two','Two'),('$three','Three'),('$four','Four'),('$five','Five'),('$six','Six')" >/dev/null
expected="[\"$one\",\"$two\",\"$three\",\"$four\",\"$five\",\"$six\"]"
direct='[]'
manifest_one="[{\"event_id\":\"$one\",\"auto_matte_reference\":\"evenements:11\"}]"
manifest_two="[{\"event_id\":\"$two\",\"auto_matte_reference\":\"evenements:12\"}]"
call() { local digest; digest=$(hash_for "$1"); sql "select eligible||':'||already_present||':'||conflicts||':'||excluded||':'||blocked from private.prepare_auto_matte_observed_import('$1'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$digest',$2)"; }
count() { sql 'select count(*) from private.event_provenance'; }
hash=$(hash_for "$manifest_one")
expect "$(call "$manifest_one" false)" '1:0:0:0:0' 'first dry-run'
expect_error "select * from private.prepare_auto_matte_observed_import('$manifest_one'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',false)" AUTO_MATTE_IMPORT_MANIFEST_SHA256_MISMATCH
expect_error "select * from private.prepare_auto_matte_observed_import('$manifest_one'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',true)" AUTO_MATTE_IMPORT_MANIFEST_SHA256_MISMATCH
manifest_one_two="[{\"event_id\":\"$one\",\"auto_matte_reference\":\"evenements:11\"},{\"event_id\":\"$two\",\"auto_matte_reference\":\"evenements:12\"}]"
manifest_two_one="[{\"event_id\":\"$two\",\"auto_matte_reference\":\"evenements:12\"},{\"event_id\":\"$one\",\"auto_matte_reference\":\"evenements:11\"}]"
expect "$(hash_for "$manifest_one_two")" "$(hash_for "$manifest_two_one")" 'row order independent'
expect "$(call "$manifest_two_one" false)" '2:0:0:0:0' 'reordered manifest valid'
expect_error "select * from private.prepare_auto_matte_observed_import('$manifest_one_two'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$hash',true)" AUTO_MATTE_IMPORT_MANIFEST_SHA256_MISMATCH
expect_error "select * from private.prepare_auto_matte_observed_import('$manifest_two'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$(hash_for "$manifest_one_two")',true)" AUTO_MATTE_IMPORT_MANIFEST_SHA256_MISMATCH
changed_ref="[{\"event_id\":\"$one\",\"auto_matte_reference\":\"evenements:99\"}]"
expect_error "select * from private.prepare_auto_matte_observed_import('$changed_ref'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$hash',true)" AUTO_MATTE_IMPORT_MANIFEST_SHA256_MISMATCH
expect "$(count)" '0' 'invalid hashes cannot import'
expect "$(sql "begin read only; select eligible||':'||already_present||':'||conflicts||':'||excluded||':'||blocked from private.prepare_auto_matte_observed_import('$manifest_one'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$hash',false); rollback" | head -n 1)" '1:0:0:0:0' 'dry-run allowed in read-only transaction'
expect "$(count)" '0' 'dry-run writes nothing'
expect "$(call "$manifest_one" true)" '1:0:0:0:0' 'first insert'
expect "$(call "$manifest_one" true)" '0:1:0:0:0' 'idempotent rerun'
expect "$(count)" '1' 'single observation'
expect "$(sql "select state||':'||observed_channel||':'||coalesce(attested_origin,'NULL')||':'||auto_matte_reference from private.event_provenance where event_id='$one'")" 'OBSERVED:AUTO_MATTE:NULL:evenements:11' 'observed only'
echo 'PASS dry-run, first insert, idempotence, observed-only shape'

manifest_missing="[{\"event_id\":\"$missing\",\"auto_matte_reference\":\"evenements:99\"}]"
manifest_conflict="[{\"event_id\":\"$three\",\"auto_matte_reference\":\"evenements:11\"}]"
manifest_bad="[{\"event_id\":\"$three\",\"auto_matte_reference\":\"bad\"}]"
manifest_three="[{\"event_id\":\"$three\",\"auto_matte_reference\":\"evenements:13\"}]"
manifest_four="[{\"event_id\":\"$four\",\"auto_matte_reference\":\"evenements:14\"}]"
manifest_five="[{\"event_id\":\"$five\",\"auto_matte_reference\":\"evenements:15\"}]"
manifest_six="[{\"event_id\":\"$six\",\"auto_matte_reference\":\"evenements:16\"}]"
expect "$(call "$manifest_missing" false)" '0:0:0:0:1' 'missing UUID'
expect_error "select * from private.prepare_auto_matte_observed_import('$manifest_one'::jsonb,'[]'::jsonb,'[]'::jsonb,'$hash',true)" AUTO_MATTE_IMPORT_EXPORT_STALE
sql "insert into public.event_submission_contacts (event_id) values ('$two')" >/dev/null
direct="[\"$two\"]"
expect "$(call "$manifest_two" false)" '0:0:0:1:0' 'direct form excluded'
expect_error "select * from private.prepare_auto_matte_observed_import('$manifest_two'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$(hash_for "$manifest_two")',true)" AUTO_MATTE_IMPORT_PRECONDITION_FAILED
expect "$(call "$manifest_conflict" false)" '0:0:1:0:0' 'reference conflict'
expect "$(call "$manifest_bad" false)" '0:0:0:0:1' 'ambiguous reference'
duplicate="[{\"event_id\":\"$five\",\"auto_matte_reference\":\"evenements:15\"},{\"event_id\":\"$five\",\"auto_matte_reference\":\"evenements:15\"}]"
expect "$(call "$duplicate" false)" '1:0:0:0:1' 'duplicate manifest row'
expect_error "select * from private.prepare_auto_matte_observed_import('$duplicate'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$(hash_for "$duplicate")',true)" AUTO_MATTE_IMPORT_PRECONDITION_FAILED
echo 'PASS stale export, absent UUID, direct form, ambiguous reference'

sql "insert into private.event_provenance (event_id,state,observed_channel,attested_origin,verified_by,verified_at) values ('$three','ATTESTED','ADMIN','ADMIN_MANUAL','$three',now())" >/dev/null
expect "$(call "$manifest_three" false)" '0:0:1:0:0' 'human attestation conflict'
mixed="[{\"event_id\":\"$four\",\"auto_matte_reference\":\"evenements:14\"},{\"event_id\":\"$three\",\"auto_matte_reference\":\"evenements:13\"}]"
expect_error "select * from private.prepare_auto_matte_observed_import('$mixed'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$(hash_for "$mixed")',true)" AUTO_MATTE_IMPORT_PRECONDITION_FAILED
expect "$(count)" '2' 'atomic batch rollback'
expect "$(call "$manifest_four" true)" '1:0:0:0:0' 'safe retry after failure'
partial="[{\"event_id\":\"$one\",\"auto_matte_reference\":\"evenements:11\"},{\"event_id\":\"$five\",\"auto_matte_reference\":\"evenements:15\"}]"
expect "$(call "$partial" true)" '1:1:0:0:0' 'partial rerun'
six_hash=$(hash_for "$manifest_six")
sql "begin; select * from private.prepare_auto_matte_observed_import('$manifest_six'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$six_hash',true); rollback" >/dev/null
expect "$(sql "select count(*) from private.event_provenance where event_id='$six'")" '0' 'interrupted transaction rolled back'
sql "begin; select * from private.prepare_auto_matte_observed_import('$manifest_six'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$six_hash',true); select pg_sleep(1); commit" >/dev/null &
background=$!
sleep 0.2
expect "$(call "$manifest_six" true)" '0:1:0:0:0' 'concurrent rerun serializes'
wait "$background"
expect "$(sql "select count(*) from private.event_provenance where event_id='$six'")" '1' 'no concurrent duplicate'
expect_error "insert into private.event_provenance (event_id,state,observed_channel,auto_matte_reference) values ('$one','OBSERVED','AUTO_MATTE','evenements:99')" 'duplicate key value'
expect "$(sql "select count(*) from private.event_provenance where state='ATTESTED' and event_id='$three'")" '1' 'human attestation preserved'
expect "$(sql 'select count(*) from public.event_publication_jobs')" '0' 'no jobs'
expect "$(sql "select count(*) from public.events where title in ('One','Two','Three','Four','Five','Six')")" '6' 'events unchanged'
expect "$(sql 'select armed::text from public.publication_canary_status()')" 'false' 'CANARY disarmed'
expect "$(sql "select has_function_privilege('anon','private.prepare_auto_matte_observed_import(jsonb,jsonb,jsonb,text,boolean)','EXECUTE')||':'||has_function_privilege('authenticated','private.prepare_auto_matte_observed_import(jsonb,jsonb,jsonb,text,boolean)','EXECUTE')||':'||has_function_privilege('service_role','private.prepare_auto_matte_observed_import(jsonb,jsonb,jsonb,text,boolean)','EXECUTE')")" 'false:false:false' 'private ACL'
sql "insert into public.events (id,title) values ('$missing','Later event')" >/dev/null
expect_error "select * from private.prepare_auto_matte_observed_import('$manifest_one'::jsonb,'$expected'::jsonb,'$direct'::jsonb,'$hash',true)" AUTO_MATTE_IMPORT_EXPORT_STALE
echo 'PASS conflict rollback, safe retry, historical attestation, ACL, no jobs or CANARY change'
