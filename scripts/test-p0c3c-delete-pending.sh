#!/usr/bin/env bash
set -euo pipefail

# Disposable local PostgreSQL only. Never accepts a Supabase connection.
root=$(cd "$(dirname "$0")/.." && pwd)
container=''
trap 'if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi' EXIT
container=$(docker run --rm -d -e POSTGRES_PASSWORD=test postgres:17-alpine)
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null
sql() { docker exec "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -c "$1"; }
expect_error() { if sql "$1" >/dev/null 2>&1; then echo "FAIL: expected refusal" >&2; exit 1; fi; }

sql "create schema private; create role anon; create role authenticated; create role service_role; create table public.events (id uuid primary key, validated boolean, rejected boolean); create table public.event_publication_jobs (id uuid primary key, event_id uuid references public.events(id) on delete set null, target_event_id uuid, reason text, status text, attempt_count integer default 0, batch_id uuid, commit_sha text, requested_at timestamptz, started_at timestamptz, finished_at timestamptz, last_error text);" >/dev/null
docker cp "$root/supabase/migrations/20261012155223_publication_batch_state_machine.sql" "$container:/batch.sql"
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /batch.sql >/dev/null

# Minimal representation of the current AFTER DELETE branch: it always inserts
# a PENDING delete job, after the FK has nulled the former PENDING edit job.
sql "create function private.queue_event_publication_job() returns trigger language plpgsql as \$\$ begin if tg_op = 'DELETE' then insert into public.event_publication_jobs (id,event_id,target_event_id,reason,status,attempt_count,requested_at) values ('22222222-2222-4222-8222-222222222222',null,old.id,'delete','PENDING',0,'2026-10-13T00:00:00Z'); return old; end if; return new; end \$\$; create trigger events_queue_static_publication after delete on public.events for each row execute function private.queue_event_publication_job();" >/dev/null

event='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
edit='11111111-1111-4111-8111-111111111111'
batch='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
seed() {
  sql "truncate public.event_publication_jobs, public.events; insert into public.events values ('$event',true,false); insert into public.event_publication_jobs (id,event_id,target_event_id,reason,status,attempt_count,requested_at) values ('$edit','$event','$event','edit','PENDING',0,'2026-10-13T00:00:00Z'); delete from public.events where id='$event';" >/dev/null
}
selected() { sql "select jsonb_agg(to_jsonb(j) order by id) from public.event_publication_jobs j where j.target_event_id='$event' and j.status='PENDING'"; }

seed
[[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$event' and status='PENDING'") == 2 ]]
expect_error "select count(*) from public.claim_event_publication_batch('$(selected)'::jsonb,'$batch')"
echo 'RED reproduced: stale edit plus delete is refused atomically'

docker cp "$root/supabase/migrations/20261013162613_coalesce_pending_delete_target.sql" "$container:/fix.sql"
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /fix.sql >/dev/null

seed
[[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$event' and status='PENDING' and reason='delete'") == 1 ]]
[[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$event' and status='BLOCKED' and reason='edit'") == 1 ]]
sql "insert into public.event_publication_jobs (id,event_id,target_event_id,reason,status,attempt_count,requested_at) values ('33333333-3333-4333-8333-333333333333',null,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','manual','RUNNING',2,'2026-10-12T00:00:00Z'),('44444444-4444-4444-8444-444444444444',null,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','manual','FAILED',3,'2026-10-11T00:00:00Z');" >/dev/null
[[ $(sql "select status||':'||attempt_count from public.event_publication_jobs where id='33333333-3333-4333-8333-333333333333'") == RUNNING:2 ]]
[[ $(sql "select status||':'||attempt_count from public.event_publication_jobs where id='44444444-4444-4444-8444-444444444444'") == FAILED:3 ]]
sql "delete from public.event_publication_jobs where id='33333333-3333-4333-8333-333333333333'" >/dev/null
[[ $(sql "select count(*) from public.claim_event_publication_batch('$(selected)'::jsonb,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')") == 1 ]]
echo 'GREEN: DELETE coalesces pending work; RUNNING and FAILED remain unchanged'
