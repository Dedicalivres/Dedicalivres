#!/usr/bin/env bash
set -euo pipefail

# Entirely local, fictitious PostgreSQL data. Never receives a Supabase URL.
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
container=''
trap 'if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi' EXIT
container=$(docker run --rm -d -e POSTGRES_PASSWORD=test postgres:17-alpine)
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null
docker cp "$repo_dir/scripts/p0c1-reconcile-historical-jobs.sql" "$container:/reconcile.sql"
docker cp "$repo_dir/scripts/p0c1-verify-historical-jobs.sql" "$container:/verify.sql"

sql() { docker exec -i "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -c "$1"; }
run_reconcile() {
  docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 \
    -v "deployment_evidence=${1:-38208721209:cd2817bb4b845f5ce3bc8d70075cff9abf905b8f}" \
    -f /reconcile.sql >/dev/null 2>&1
}
expect_refused() {
  if run_reconcile "${1:-}"; then echo "FAIL: unexpected acceptance" >&2; exit 1; fi
  [[ $(sql "select count(*) from public.event_publication_jobs where status='SUCCESS'") == 0 ]] || {
    echo "FAIL: partial mutation" >&2; exit 1;
  }
}
reset_fixture() {
  sql "drop schema if exists public cascade; create schema public; create table public.events (id uuid primary key, validated boolean, rejected boolean); create table public.event_publication_jobs (id uuid primary key, event_id uuid, target_event_id uuid, reason text, status text, attempt_count integer, batch_id uuid, commit_sha text, last_error text, started_at timestamptz, finished_at timestamptz, requested_at timestamptz, extra text); insert into public.events values ('14b81335-1dab-4f6d-9667-5e88675c6f98',true,false),('c69b157c-bf2f-4ddf-affa-a57497d261c2',false,true); insert into public.event_publication_jobs values ('21d2d1eb-5b65-46e3-9624-0e877df1702d','14b81335-1dab-4f6d-9667-5e88675c6f98','14b81335-1dab-4f6d-9667-5e88675c6f98','validation','FAILED',4,null,null,'original error',now(),now(),now(),'keep'),('c098bfc8-4482-4452-857d-d9227b422a41','c69b157c-bf2f-4ddf-affa-a57497d261c2','c69b157c-bf2f-4ddf-affa-a57497d261c2','unpublish','FAILED',4,null,null,'original error',now(),now(),now(),'keep'),('00000000-0000-0000-0000-000000000003',null,null,'manual','FAILED',9,null,null,'third job',now(),now(),now(),'keep');" >/dev/null
}

reset_fixture
[[ $(docker exec "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -f /verify.sql | cut -d'|' -f1) == t ]]
run_reconcile
[[ $(sql "select count(*) from public.event_publication_jobs where status='SUCCESS' and commit_sha='cd2817bb4b845f5ce3bc8d70075cff9abf905b8f' and attempt_count=4 and last_error='original error' and extra='keep'") == 2 ]]
[[ $(sql "select status || ':' || attempt_count || ':' || last_error from public.event_publication_jobs where id='00000000-0000-0000-0000-000000000003'") == 'FAILED:9:third job' ]]
if run_reconcile; then echo 'FAIL: second execution accepted' >&2; exit 1; fi
[[ $(sql "select count(*) from public.event_publication_jobs where status='SUCCESS'") == 2 ]]
echo 'PASS: two jobs, read-only check, history, third job, second execution'

reset_fixture
expect_refused 'unconfirmed'
echo 'PASS: deployment not confirmed'
reset_fixture
sql "delete from public.event_publication_jobs where id='21d2d1eb-5b65-46e3-9624-0e877df1702d'" >/dev/null
expect_refused
echo 'PASS: missing job'
reset_fixture
sql "update public.event_publication_jobs set status='BLOCKED' where id='21d2d1eb-5b65-46e3-9624-0e877df1702d'" >/dev/null
expect_refused
echo 'PASS: wrong status'
reset_fixture
sql "update public.event_publication_jobs set attempt_count=5 where id='21d2d1eb-5b65-46e3-9624-0e877df1702d'" >/dev/null
expect_refused
echo 'PASS: wrong attempt count'
reset_fixture
sql "update public.event_publication_jobs set commit_sha='already-set' where id='21d2d1eb-5b65-46e3-9624-0e877df1702d'" >/dev/null
expect_refused
echo 'PASS: existing commit'
reset_fixture
sql "update public.events set rejected=true where id='14b81335-1dab-4f6d-9667-5e88675c6f98'" >/dev/null
expect_refused
echo 'PASS: inconsistent business state'
reset_fixture
sql "insert into public.event_publication_jobs values ('00000000-0000-0000-0000-000000000004','14b81335-1dab-4f6d-9667-5e88675c6f98',null,'edit','RUNNING',1,null,null,null,null,null,now(),null)" >/dev/null
expect_refused
echo 'PASS: related concurrent job'
reset_fixture
sql "create function public.fail_second_job() returns trigger language plpgsql as \$\$ begin if new.id='c098bfc8-4482-4452-857d-d9227b422a41' then raise exception 'simulated failure'; end if; return new; end \$\$; create trigger fail_second_job before update on public.event_publication_jobs for each row execute function public.fail_second_job()" >/dev/null
expect_refused
echo 'PASS: simulated partial failure rolls back'
