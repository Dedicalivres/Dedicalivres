#!/usr/bin/env bash
set -euo pipefail
# Disposable local PostgreSQL only. Never accepts a production connection.
root=$(cd "$(dirname "$0")/.." && pwd)
container=''
trap 'if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi' EXIT
container=$(docker run --rm -d -e POSTGRES_PASSWORD=test postgres:17-alpine)
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null
docker cp "$root/supabase/migrations/20261012155223_publication_batch_state_machine.sql" "$container:/migration.sql"
sql() { docker exec "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -c "$1"; }
expect_error() { if sql "$1" >/dev/null 2>&1; then echo "FAIL: expected refusal" >&2; exit 1; fi; }
sql "create role anon; create role authenticated; create role service_role; create table public.events (id uuid primary key, validated boolean, rejected boolean); create table public.event_publication_jobs (id uuid primary key, event_id uuid, target_event_id uuid, reason text, status text, attempt_count integer, batch_id uuid, commit_sha text, requested_at timestamptz, started_at timestamptz, finished_at timestamptz, last_error text);" >/dev/null
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /migration.sql >/dev/null
batch='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
first='11111111-1111-4111-8111-111111111111'
second='22222222-2222-4222-8222-222222222222'
third='33333333-3333-4333-8333-333333333333'
reset_fixture() {
  sql "truncate public.event_publication_jobs, public.events; insert into public.events values ('aaaaaaaa-0000-4000-8000-000000000001',true,false),('aaaaaaaa-0000-4000-8000-000000000002',false,true); insert into public.event_publication_jobs (id,event_id,target_event_id,reason,status,attempt_count,requested_at,last_error) values ('$first','aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','validation','PENDING',0,'2026-10-12T00:00:00Z','prior'),('$second','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000002','unpublish','PENDING',0,'2026-10-12T00:00:00Z',null),('$third',null,null,'manual','FAILED',4,'2026-10-12T00:00:00Z','historic');" >/dev/null
}
snapshot() { sql "select jsonb_agg(to_jsonb(j) order by id) from public.event_publication_jobs j where id in ('$first','$second')"; }
claim() { sql "select count(*) from public.claim_event_publication_batch('${1}'::jsonb,'$batch')"; }
complete() {
  local commit="null" error="null"
  [[ -z "${3:-}" ]] || commit="'${3}'"
  [[ -z "${4:-}" ]] || error="'${4}'"
  sql "select count(*) from public.complete_event_publication_batch('${1}'::jsonb,'$batch','${2}',$commit,$error)"
}

reset_fixture
one=$(sql "select to_jsonb(j) from public.event_publication_jobs j where id='$first'")
[[ $(claim "[$one]") == 1 ]]
[[ $(sql "select status||':'||attempt_count from public.event_publication_jobs where id='$first'") == RUNNING:1 ]]
echo 'PASS 01 single claim'

reset_fixture
selected=$(snapshot)
[[ $(claim "$selected") == 2 ]]
[[ $(sql "select count(*) from public.event_publication_jobs where batch_id='$batch' and status='RUNNING' and attempt_count=1") == 2 ]]
[[ $(sql "select status||':'||attempt_count||':'||last_error from public.event_publication_jobs where id='$third'") == FAILED:4:historic ]]
echo 'PASS 02 multiple claim and third job isolation'

reset_fixture
selected=$(snapshot)
sql "create or replace function public.slow_claim() returns trigger language plpgsql as \$\$ begin perform pg_sleep(2); return new; end \$\$; create trigger slow_claim before update on public.event_publication_jobs for each row when (new.status='RUNNING') execute function public.slow_claim();" >/dev/null
sql "select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'$batch')" >/dev/null &
background=$!
sleep 0.3
expect_error "select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')"
wait "$background"
sql "drop trigger slow_claim on public.event_publication_jobs; drop function public.slow_claim()" >/dev/null
[[ $(sql "select count(*) from public.event_publication_jobs where status='RUNNING'") == 2 ]]
echo 'PASS 03 concurrent claim refused'

reset_fixture
selected=$(snapshot)
sql "delete from public.event_publication_jobs where id='$second'" >/dev/null
expect_error "select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'$batch')"
[[ $(sql "select status from public.event_publication_jobs where id='$first'") == PENDING ]]
echo 'PASS 04 partial batch refused'

for state in RUNNING FAILED BLOCKED; do
  reset_fixture
  selected=$(snapshot)
  sql "update public.event_publication_jobs set status='$state' where id='$second'" >/dev/null
  expect_error "select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'$batch')"
  [[ $(sql "select status from public.event_publication_jobs where id='$first'") == PENDING ]]
  echo "PASS claim refuses $state"
done

reset_fixture
selected=$(snapshot)
sql "update public.event_publication_jobs set attempt_count=3 where id='$second'" >/dev/null
expect_error "select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'$batch')"
echo 'PASS 08 attempt ceiling'

reset_fixture
selected=$(snapshot)
sql "update public.events set rejected=true where id='aaaaaaaa-0000-4000-8000-000000000001'" >/dev/null
expect_error "select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'$batch')"
[[ $(sql "select count(*) from public.event_publication_jobs where status='PENDING'") == 2 ]]
echo 'PASS business state changed before claim'

reset_fixture
selected=$(snapshot)
claim "$selected" >/dev/null
running=$(snapshot)
sha='0123456789abcdef0123456789abcdef01234567'
[[ $(complete "$running" SUCCESS "$sha" '') == 2 ]]
[[ $(sql "select count(*) from public.event_publication_jobs where status='SUCCESS' and commit_sha='$sha' and attempt_count=1") == 2 ]]
[[ $(sql "select last_error from public.event_publication_jobs where id='$first'") == prior ]]
expect_error "select count(*) from public.complete_event_publication_batch('$running'::jsonb,'$batch','SUCCESS','$sha',null)"
echo 'PASS 09 success, history, and 15 replay refusal'

reset_fixture
selected=$(snapshot)
claim "$selected" >/dev/null
running=$(snapshot)
[[ $(complete "$running" FAILED '' 'generation timeout') == 2 ]]
[[ $(sql "select count(*) from public.event_publication_jobs where status='PENDING' and attempt_count=1 and batch_id is null and last_error like '%generation timeout%'") == 2 ]]
selected=$(snapshot)
[[ $(sql "select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')") == 2 ]]
[[ $(sql "select count(*) from public.event_publication_jobs where status='RUNNING' and attempt_count=2") == 2 ]]
echo 'PASS 10 failure before commit and 14 new attempt'

reset_fixture
sql "update public.event_publication_jobs set attempt_count=2 where id in ('$first','$second')" >/dev/null
selected=$(snapshot)
claim "$selected" >/dev/null
running=$(snapshot)
[[ $(complete "$running" FAILED '' 'push rejected') == 2 ]]
[[ $(sql "select count(*) from public.event_publication_jobs where status='FAILED' and attempt_count=3") == 2 ]]
echo 'PASS maximum attempts become FAILED'

reset_fixture
selected=$(snapshot)
claim "$selected" >/dev/null
running=$(snapshot)
sql "insert into public.event_publication_jobs (id,event_id,target_event_id,reason,status,attempt_count,requested_at) values ('44444444-4444-4444-8444-444444444444','aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','edit','PENDING',0,now())" >/dev/null
[[ $(complete "$running" FAILED '' 'source changed') == 2 ]]
[[ $(sql "select status from public.event_publication_jobs where id='$first'") == FAILED ]]
[[ $(sql "select status from public.event_publication_jobs where id='44444444-4444-4444-8444-444444444444'") == PENDING ]]
echo 'PASS newer validation preserved, old batch not requeued over it'

reset_fixture
selected=$(snapshot)
claim "$selected" >/dev/null
running=$(snapshot)
sql "create or replace function public.fail_second() returns trigger language plpgsql as \$\$ begin if new.id='$second' and new.status='SUCCESS' then raise exception 'simulated partial failure'; end if; return new; end \$\$; create trigger fail_second before update on public.event_publication_jobs for each row execute function public.fail_second();" >/dev/null
expect_error "select count(*) from public.complete_event_publication_batch('$running'::jsonb,'$batch','SUCCESS','$sha',null)"
[[ $(sql "select count(*) from public.event_publication_jobs where status='RUNNING' and batch_id='$batch'") == 2 ]]
echo 'PASS partial finalization rollback'

reset_fixture
selected=$(snapshot)
claim "$selected" >/dev/null
running=$(snapshot)
sql "update public.event_publication_jobs set attempt_count=2 where id='$second'" >/dev/null
expect_error "select count(*) from public.complete_event_publication_batch('$running'::jsonb,'$batch','SUCCESS','$sha',null)"
[[ $(sql "select count(*) from public.event_publication_jobs where status='RUNNING'") == 2 ]]
echo 'PASS changed attempt refused'

reset_fixture
expect_error "select count(*) from public.complete_event_publication_batch('[]'::jsonb,'$batch','SUCCESS','$sha',null)"
echo 'PASS 20 zero-line finalization refused'

reset_fixture
selected=$(snapshot)
expect_error "set role anon; select count(*) from public.claim_event_publication_batch('$selected'::jsonb,'$batch')"
[[ $(sql "select count(*) from public.event_publication_jobs where status='PENDING'") == 2 ]]
echo 'PASS anon cannot execute claim'
