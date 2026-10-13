#!/usr/bin/env bash
set -euo pipefail

# Disposable local PostgreSQL only. Never accepts a Supabase connection.
# The real queue trigger is imported from its lifecycle migration; only its
# table/auth dependencies are reduced local fixtures.
# Scope limit: this proves the real trigger's DELETE path and the migration
# transaction, not a complete replay of every Supabase migration or worker.
root=$(cd "$(dirname "$0")/.." && pwd)
container=''
duplicate_container=''
cleanup() {
  [[ -z "$container" ]] || docker rm -f "$container" >/dev/null 2>&1 || true
  [[ -z "$duplicate_container" ]] || docker rm -f "$duplicate_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT
start_postgres() { docker run --rm -d -e POSTGRES_PASSWORD=test postgres:17-alpine; }
wait_ready() {
  local target=$1
  for _ in $(seq 1 30); do
    docker exec "$target" psql -X -U postgres -Atq -c 'select 1' >/dev/null 2>&1 && return
    sleep 1
  done
  docker exec "$target" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -c 'select 1' >/dev/null
}
sql() { docker exec "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
expect_error_matching() {
  local expected=$1 statement=$2 output
  if output=$(sql "$statement" 2>&1); then
    fail "expected PostgreSQL refusal containing $expected"
  fi
  [[ "$output" == *"$expected"* ]] || fail "unexpected PostgreSQL refusal: $output"
}

container=$(start_postgres)
wait_ready "$container"
sql "create extension pgcrypto; create schema private; create schema auth; create role anon; create role authenticated; create role service_role; create function auth.uid() returns uuid language sql stable as \$fn\$ select null::uuid \$fn\$; create table public.events (id uuid primary key, validated boolean, rejected boolean, title text, type text, country_code text, region text, city text, start_date text, end_date text, description text, image_url text, website text, price text, lat text, lng text, featured text, verified text, registration_enabled text, registration_open_date text, registration_deadline text, registration_url text, registration_audience text, registration_note text, registration_force_status text); create table public.event_publication_jobs (id uuid primary key default gen_random_uuid(), event_id uuid references public.events(id) on delete set null, target_event_id uuid, dispatch_token uuid, dispatch_requested_at timestamptz, reason text, status text, requested_at timestamptz, requested_by uuid, attempt_count integer default 0, batch_id uuid, commit_sha text, started_at timestamptz, finished_at timestamptz, last_error text); create unique index event_publication_jobs_one_pending_per_event_idx on public.event_publication_jobs (event_id) where event_id is not null and status = 'PENDING';" >/dev/null
docker cp "$root/supabase/migrations/20261012155223_publication_batch_state_machine.sql" "$container:/batch.sql"
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /batch.sql >/dev/null
docker cp "$root/supabase/migrations/20261008143516_event_publication_lifecycle.sql" "$container:/lifecycle.sql"
docker exec "$container" sh -c "sed -n '71,340p' /lifecycle.sql > /real-queue-trigger.sql"
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /real-queue-trigger.sql >/dev/null
echo 'SCOPE: real DELETE trigger; reduced PostgreSQL fixture; no full Supabase replay'

event='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
third='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
batch='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
reset_data() {
  sql "truncate public.event_publication_jobs, public.events; insert into public.events (id,validated,rejected) values ('$event',false,false),('$third',false,false);" >/dev/null
}
insert_pending() {
  local reason=$1
  sql "insert into public.event_publication_jobs (event_id,target_event_id,reason,status,attempt_count,requested_at) values ('$event','$event','$reason','PENDING',0,'2026-10-13T00:00:00Z');" >/dev/null
}
selected_delete() { sql "select jsonb_agg(to_jsonb(j) order by id) from public.event_publication_jobs j where j.target_event_id='$event' and j.status='PENDING'"; }
assert_one_delete_pending() {
  [[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$event' and status='PENDING' and reason='delete'") == 1 ]] || fail 'expected one PENDING delete'
  [[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$event' and status='PENDING'") == 1 ]] || fail 'expected no other PENDING target job'
}

# RED: unmodified real AFTER DELETE trigger creates a second PENDING job.
reset_data
insert_pending validation
sql "delete from public.events where id='$event'" >/dev/null
[[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$event' and status='PENDING'") == 2 ]] || fail 'RED fixture did not reproduce the duplicate'
expect_error_matching 'PUBLICATION_BATCH_STALE_SELECTION' "select count(*) from public.claim_event_publication_batch('$(selected_delete)'::jsonb,'$batch')"
echo 'RED PASS: real trigger yields PUBLICATION_BATCH_STALE_SELECTION'

# Apply only after clearing RED data: the migration must instead reject existing
# duplicates without changing them.
reset_data
docker cp "$root/supabase/migrations/20261013162613_coalesce_pending_delete_target.sql" "$container:/fix.sql"
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /fix.sql >/dev/null

for reason in validation edit unpublish; do
  reset_data
  insert_pending "$reason"
  sql "delete from public.events where id='$event'" >/dev/null
  assert_one_delete_pending
  [[ $(sql "select count(*) from public.claim_event_publication_batch('$(selected_delete)'::jsonb,'$batch')") == 1 ]] || fail "GREEN reservation failed for $reason"
  echo "GREEN PASS: PENDING $reason to DELETE"
done

reset_data
sql "delete from public.events where id='$event'" >/dev/null
assert_one_delete_pending
echo 'GREEN PASS: DELETE without prior PENDING'

reset_data
sql "insert into public.event_publication_jobs (event_id,target_event_id,reason,status,attempt_count,requested_at) values ('$event','$event','manual','RUNNING',2,'2026-10-12T00:00:00Z'),(null,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','manual','FAILED',3,'2026-10-11T00:00:00Z'),(null,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','manual','SUCCESS',1,'2026-10-10T00:00:00Z'),('$third','$third','edit','PENDING',0,'2026-10-09T00:00:00Z'); delete from public.events where id='$event'" >/dev/null
assert_one_delete_pending
[[ $(sql "select status||':'||attempt_count from public.event_publication_jobs where target_event_id='$event' and reason='manual'") == RUNNING:2 ]] || fail 'RUNNING changed'
[[ $(sql "select status||':'||attempt_count from public.event_publication_jobs where target_event_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'") == FAILED:3 ]] || fail 'FAILED changed'
[[ $(sql "select status||':'||attempt_count from public.event_publication_jobs where target_event_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'") == SUCCESS:1 ]] || fail 'SUCCESS changed'
[[ $(sql "select count(*) from public.events where id='$third'") == 1 ]] || fail 'third event changed'
[[ $(sql "select status||':'||event_id from public.event_publication_jobs where target_event_id='$third'") == PENDING:"$third" ]] || fail 'third event job changed'
# The batch RPC refuses any RUNNING row by design. Remove only this test fixture
# after proving preservation, then prove that the sole DELETE is claimable.
sql "delete from public.event_publication_jobs where status='RUNNING'" >/dev/null
[[ $(sql "select count(*) from public.claim_event_publication_batch('$(selected_delete)'::jsonb,'ffffffff-ffff-4fff-8fff-ffffffffffff')") == 1 ]] || fail 'GREEN reservation failed for delete'
echo 'GREEN PASS: histories and third event preserved; DELETE claimable'

reset_data
insert_pending edit
sql "create function public.fail_delete_job() returns trigger language plpgsql as \$fn\$ begin if new.reason = 'delete' then raise exception 'SIMULATED_DELETE_JOB_ERROR'; end if; return new; end \$fn\$; create trigger aa_fail_delete_job before insert on public.event_publication_jobs for each row execute function public.fail_delete_job();" >/dev/null
expect_error_matching 'SIMULATED_DELETE_JOB_ERROR' "delete from public.events where id='$event'"
[[ $(sql "select count(*) from public.events where id='$event'") == 1 ]] || fail 'event deletion was not rolled back'
[[ $(sql "select status from public.event_publication_jobs where target_event_id='$event' and reason='edit'") == PENDING ]] || fail 'pending transition was not rolled back'
sql "drop trigger aa_fail_delete_job on public.event_publication_jobs; drop function public.fail_delete_job()" >/dev/null
echo 'GREEN PASS: DELETE error rolls back event and pending transition'

# Separate ephemeral database: duplicate historical PENDING rows must stop the
# migration before index/function/trigger creation, without any row mutation.
duplicate_container=$(start_postgres)
wait_ready "$duplicate_container"
docker exec "$duplicate_container" psql -X -U postgres -v ON_ERROR_STOP=1 -c "create schema private; create schema auth; create role anon; create role authenticated; create table public.events (id uuid primary key); create table public.event_publication_jobs (id uuid primary key, target_event_id uuid, status text, finished_at timestamptz, last_error text); insert into public.event_publication_jobs values ('11111111-1111-4111-8111-111111111111','$event','PENDING',null,null),('22222222-2222-4222-8222-222222222222','$event','PENDING',null,null);" >/dev/null
before=$(docker exec "$duplicate_container" psql -X -U postgres -Atq -c "select jsonb_agg(to_jsonb(j) order by id) from public.event_publication_jobs j")
docker cp "$root/supabase/migrations/20261013162613_coalesce_pending_delete_target.sql" "$duplicate_container:/fix.sql"
if duplicate_error=$(docker exec "$duplicate_container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /fix.sql 2>&1); then
  fail 'duplicate precheck unexpectedly accepted historical duplicates'
fi
[[ "$duplicate_error" == *PENDING_TARGET_EVENT_DUPLICATES* ]] || fail "unexpected duplicate refusal: $duplicate_error"
after=$(docker exec "$duplicate_container" psql -X -U postgres -Atq -c "select jsonb_agg(to_jsonb(j) order by id) from public.event_publication_jobs j")
[[ "$before" == "$after" ]] || fail 'duplicate precheck mutated historical jobs'
echo 'PRECHECK PASS: historical duplicates stop migration without mutation'
