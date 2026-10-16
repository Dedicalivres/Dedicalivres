#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL only. No production connection or migration application.
root=$(cd "$(dirname "$0")/.." && pwd)
container=''
trap 'if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi' EXIT
container=$(docker run --rm -d -e POSTGRES_PASSWORD=test postgres:17-alpine)
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
# The image's temporary init server accepts Unix-socket checks before its
# final TCP server starts. Wait for the final server before the first psql.
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
docker cp "$root/supabase/migrations/20261012155223_publication_batch_state_machine.sql" "$container:/batch.sql"
docker cp "$root/supabase/migrations/20261014043617_publication_canary_guard.sql" "$container:/canary.sql"
docker cp "$root/supabase/migrations/20261014120000_admin_canary_evidence_status.sql" "$container:/admin-evidence.sql"
docker cp "$root/supabase/migrations/20261014161135_canary_direct_provenance.sql" "$container:/direct-provenance.sql"
docker cp "$root/supabase/migrations/20261015051416_admin_latest_direct_canary_reference.sql" "$container:/latest-direct-reference.sql"
docker cp "$root/supabase/migrations/20261016051119_direct_canary_dossier_idempotence.sql" "$container:/direct-idempotence.sql"
sql() { docker exec "$container" psql -X -U postgres -Atq -v ON_ERROR_STOP=1 -c "$1"; }
expect_error() {
  local result
  if result=$(sql "$1" 2>&1); then
    echo "FAIL: expected refusal" >&2; exit 1
  fi
  [[ "$result" == *"$2"* ]] || { echo "FAIL: expected $2, got $result" >&2; exit 1; }
}
expect_equal() {
  if [[ "$1" != "$2" ]]; then
    echo "FAIL $3: expected $2, got $1" >&2
    exit 1
  fi
}
event='11111111-1111-4111-8111-111111111111'
job='22222222-2222-4222-8222-222222222222'
other='33333333-3333-4333-8333-333333333333'
checked_event='66666666-6666-4666-8666-666666666666'
batch='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
sql "create schema private; create schema auth; create role anon; create role authenticated; create role service_role; create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('test.uid',true),'')::uuid \$\$; create function private.is_admin() returns boolean language sql stable security definer as \$\$ select current_setting('test.admin',true)='true' \$\$; create table public.events (id uuid primary key, title text, city text, start_date date, end_date date, validated boolean, rejected boolean, verified boolean, registration_force_status text, website text, description text, region text, country_code text, lat double precision, lng double precision); create table public.event_submission_contacts (event_id uuid primary key references public.events(id), submitter_name text, submitter_email text, created_at timestamptz default now()); create table public.event_publication_jobs (id uuid primary key, event_id uuid, target_event_id uuid, reason text, status text, attempt_count integer, batch_id uuid, commit_sha text, requested_at timestamptz, started_at timestamptz, finished_at timestamptz, last_error text);" >/dev/null
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /batch.sql >/dev/null
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /canary.sql >/dev/null
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /admin-evidence.sql >/dev/null
legacy_event='99999999-9999-4999-8999-999999999999'
sql "insert into public.events values ('$legacy_event','Salon ancien','Paris',current_date+20,current_date+20,true,false,false,null,'https://organizer.example/events/ancien','Lieu ancien','Île-de-France','FR',48.86,2.35)" >/dev/null
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_publication_canary_evidence('$legacy_event','https://organizer.example/events/ancien','Official organizer','Salon ancien','Salon ancien','Paris',(current_date+20)::text,(current_date+20)::text,true)" >/dev/null
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /direct-provenance.sql >/dev/null
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /latest-direct-reference.sql >/dev/null
docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -f /direct-idempotence.sql >/dev/null
[[ $(sql "select proof_type from private.publication_canary_evidence where event_id='$legacy_event'") == PUBLIC_OFFICIAL ]]
[[ $(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_status from public.get_publication_canary_evidence('$legacy_event')") == valid ]]
echo 'PASS preexisting PUBLIC_OFFICIAL proof survives additive migration'
sql "insert into public.events values ('$event','Salon confirmé','Lille',current_date+20,current_date+20,true,false,true,null,'https://organizer.example/events/salon-2026','Salon à la librairie','Hauts-de-France','FR',50.63,3.05),('$other','Autre salon','Lyon',current_date+21,current_date+21,true,false,false,null,null,null,null,'FR',null,null); insert into public.event_publication_jobs (id,event_id,target_event_id,reason,status,attempt_count,requested_at) values ('$job','$event','$event','validation','PENDING',0,now()),('$other','$other','$other','validation','PENDING',0,now()+interval '1 minute');" >/dev/null
latest_direct_reference() { sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_id||':'||dossier_reference||':'||dossier_state from public.get_latest_direct_publication_canary_reference('$1')" | tail -1; }
expect_equal "$(latest_direct_reference "$event")" '' 'no proof returns no direct reference'
expect_equal "$(latest_direct_reference "$legacy_event")" '' 'latest PUBLIC_OFFICIAL returns no direct reference'
expect_error "set role anon; select * from public.get_latest_direct_publication_canary_reference('$event')" 'permission denied'
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select * from public.get_latest_direct_publication_canary_reference('$event')" CANARY_ADMIN_REQUIRED
expect_error "set test.admin='true'; set role authenticated; select * from public.get_latest_direct_publication_canary_reference('$event')" CANARY_ADMIN_REQUIRED
expect_error "set test.uid='$event'; set test.admin='true'; set role authenticated; select * from public.get_latest_direct_publication_canary_reference('00000000-0000-4000-8000-000000000000')" CANARY_EVENT_NOT_FOUND
for role in anon authenticated service_role; do
  [[ $(sql "select has_function_privilege('$role','public.get_latest_direct_publication_canary_reference(uuid)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_table_privilege('$role','private.publication_canary_evidence','SELECT')") == f ]]
done
echo 'PASS Admin-only latest direct reference: empty/public cases and private ACL'
selected() { sql "select to_jsonb(j) from public.event_publication_jobs j where id='$1'"; }
claim() { sql "select count(*) from public.claim_publication_canary_batch('[$(selected "$1")]'::jsonb,'$2'::uuid,$3,1)"; }
arm() { sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.arm_publication_canary($1,'Reviewed GitHub Actions incidents and Supabase jobs');" >/dev/null; }
proof() { sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_publication_canary_evidence('$event','https://organizer.example/events/salon-2026','Official organizer','Salon confirmed','Salon confirmé','Lille',(current_date+20)::text,(current_date+20)::text,true);" >/dev/null; }
proof_state() { sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_status||':'||pending_validation_job||':'||technical_candidate from public.get_publication_canary_evidence('$event')" | tail -1; }

[[ $(proof_state) == none:true:false ]]
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select * from public.get_publication_canary_evidence('$event')" CANARY_ADMIN_REQUIRED
[[ $(sql "select count(*) from private.publication_canary_evidence where event_id='$event'") == 0 ]]

# The Admin V11 path must compare a full expected snapshot under a row lock.
sql "insert into public.events values ('$checked_event','Salon confirmé','Lille',current_date+20,current_date+20,true,false,true,null,'https://organizer.example/events/salon-2026','Salon à la librairie','Hauts-de-France','FR',50.63,3.05)" >/dev/null
checked_call="set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_publication_canary_evidence_checked('$checked_event','https://organizer.example/events/salon-2026','Official organizer','Salon confirmed','Salon confirmé','Lille','Hauts-de-France','FR','Salon à la librairie','https://organizer.example/events/salon-2026',(current_date+20)::text,(current_date+20)::text,50.63,3.05,true)"
checked_count() { sql "select count(*) from private.publication_canary_evidence where event_id='$checked_event'"; }
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select public.record_publication_canary_evidence_checked('$checked_event','https://organizer.example/events/salon-2026','Official organizer','Salon confirmed','Salon confirmé','Lille','Hauts-de-France','FR','Salon à la librairie','https://organizer.example/events/salon-2026',(current_date+20)::text,(current_date+20)::text,50.63,3.05,true)" CANARY_ADMIN_REQUIRED
for change in \
  "title='Autre salon'" \
  "city='Paris'" \
  "region='Normandie'" \
  "country_code='BE'" \
  "description='Lieu changé'" \
  "website='https://other.example/events/salon'" \
  "start_date=current_date+21" \
  "end_date=current_date+21" \
  "lat=50.64" \
  "lng=3.06" \
  "region=null" \
  "description=null" \
  "website=null" \
  "end_date=null" \
  "lat=null" \
  "lng=null"; do
  sql "update public.events set $change where id='$checked_event'" >/dev/null
  expect_error "$checked_call" CANARY_SOURCE_EVIDENCE_STALE
  [[ $(checked_count) == 0 ]]
  sql "update public.events set title='Salon confirmé',city='Lille',region='Hauts-de-France',country_code='FR',description='Salon à la librairie',website='https://organizer.example/events/salon-2026',start_date=current_date+20,end_date=current_date+20,lat=50.63,lng=3.05 where id='$checked_event'" >/dev/null
done
sql "$checked_call" >/dev/null
[[ $(checked_count) == 1 ]]
sql "update public.events set region=null,description=null,website=null,end_date=null,lat=null,lng=null where id='$checked_event'" >/dev/null
checked_null="set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_publication_canary_evidence_checked('$checked_event','https://organizer.example/events/salon-2026','Official organizer','Salon confirmed','Salon confirmé','Lille',null,'FR',null,null,(current_date+20)::text,null,null,null,true)"
sql "$checked_null" >/dev/null
[[ $(checked_count) == 2 ]]
[[ $(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_status from public.get_publication_canary_evidence('$checked_event')" | tail -1) == valid ]]
[[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$checked_event'") == 0 ]]
[[ $(sql "select count(*) from private.publication_canary_attempts") == 0 ]]
echo 'PASS checked proof: all fields, NULL, admin ACL, append-only history, no publication'

# Two concurrent proof writers serialize on the same event row and both append.
sql "begin; $checked_null; select pg_sleep(2); commit" >/dev/null &
background=$!
sleep 0.3
sql "$checked_null" >/dev/null
wait "$background"
[[ $(checked_count) == 4 ]]
echo 'PASS concurrent proof writes remain coherent'

# An editor committing while the RPC waits must leave no new proof.
sql "begin; update public.events set description='Lieu changé en concurrence' where id='$checked_event'; select pg_sleep(2); commit" >/dev/null &
background=$!
sleep 0.3
expect_error "$checked_null" CANARY_SOURCE_EVIDENCE_STALE
wait "$background"
[[ $(checked_count) == 4 ]]
echo 'PASS concurrent event edit is rejected without evidence mutation'

[[ $(sql "select armed::text||':'||halted::text from public.publication_canary_status()") == false:false ]]
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_NOT_ARMED
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select public.arm_publication_canary(99,'Unauthorized attempt to activate automatic publication')" CANARY_ADMIN_REQUIRED
arm 99
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
[[ $(sql "select private.publication_canary_source_url_valid('https://instagram.com/organizer')") == f ]]
[[ $(sql "select private.publication_canary_source_url_valid('https://instagram.com/p/SpecificPost123')") == t ]]
echo 'PASS disarmed and missing source evidence'

proof
[[ $(proof_state) == valid:true:true ]]
sql "update private.publication_canary_evidence set checked_at=now()-interval '31 days' where event_id='$event'" >/dev/null
[[ $(proof_state) == expired:true:false ]]
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
sql "update private.publication_canary_evidence set checked_at=now(), city_snapshot='Paris' where event_id='$event'" >/dev/null
[[ $(proof_state) == invalidated:true:false ]]
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
sql "update private.publication_canary_evidence set city_snapshot='Lille' where event_id='$event'" >/dev/null
sql "update public.events set website='https://unrelated.example/event' where id='$event'" >/dev/null
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
sql "update public.events set website='https://organizer.example/events/salon-2026' where id='$event'" >/dev/null
for change in \
  "description='Nouvelle adresse'" \
  "region='Normandie'" \
  "country_code='BE'" \
  "lat=50.64" \
  "lng=3.06" \
  "description=null" \
  "region=null" \
  "lat=null" \
  "lng=null"; do
  sql "update public.events set $change where id='$event'" >/dev/null
  [[ $(proof_state) == invalidated:true:false ]]
  expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
  sql "update public.events set description='Salon à la librairie',region='Hauts-de-France',country_code='FR',lat=50.63,lng=3.05 where id='$event'" >/dev/null
done
sql "update public.events set description='Salon déplacé à la médiathèque' where id='$event'" >/dev/null
proof
[[ $(proof_state) == valid:true:true ]]
[[ $(sql "select count(*) from private.publication_canary_evidence where event_id='$event'") == 2 ]]
[[ $(sql "select count(*) from public.publication_canary_candidate() where id='$job'") == 1 ]]
echo 'PASS venue snapshots reject changed values and NULL transitions; fresh proof restores eligibility'
for reason in edit unpublish delete; do
  sql "update public.event_publication_jobs set reason='$reason' where id='$job'" >/dev/null
  expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
done
sql "update public.event_publication_jobs set reason='validation' where id='$job'" >/dev/null
sql "update public.events set registration_force_status='annule' where id='$event'" >/dev/null
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
sql "update public.events set registration_force_status=null where id='$event'" >/dev/null
sql "update public.events set start_date=current_date-1,end_date=current_date-1 where id='$event'; update private.publication_canary_evidence set start_date_snapshot=(current_date-1)::text,end_date_snapshot=(current_date-1)::text where event_id='$event'" >/dev/null
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'$batch',100,1)" CANARY_SOURCE_OR_JOB_INVALID
sql "update public.events set start_date=current_date+20,end_date=current_date+20 where id='$event'; update private.publication_canary_evidence set start_date_snapshot=(current_date+20)::text,end_date_snapshot=(current_date+20)::text where event_id='$event'" >/dev/null
[[ $(claim "$job" "$batch" 100) == 1 ]]
[[ $(sql "select count(*) from private.publication_canary_attempts") == 1 ]]
echo 'PASS first verified reservation; stale and contradictory proof refused'

expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$other")]'::jsonb,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',101,1)" CANARY_24H_LIMIT
sql "select count(*) from public.complete_event_publication_batch('[{\"id\":\"$job\",\"attempt_count\":1}]'::jsonb,'$batch','SUCCESS','0123456789abcdef0123456789abcdef01234567',null)" >/dev/null
sql "update private.publication_canary_attempts set reserved_at=now()-interval '25 hours'; update private.publication_canary_evidence set event_id='$other',title_snapshot='Autre salon',city_snapshot='Lyon',website_snapshot=null,description_snapshot=null,region_snapshot=null,country_code_snapshot='FR',lat_snapshot=null,lng_snapshot=null,start_date_snapshot=(current_date+21)::text,end_date_snapshot=(current_date+21)::text where event_id='$event'" >/dev/null
[[ $(sql "select count(*) from public.publication_canary_candidate() where id='$other'") == 1 ]]
sql "update public.events set region='Auvergne-Rhône-Alpes',lat=45.76 where id='$other'" >/dev/null
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$other")]'::jsonb,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',101,1)" CANARY_SOURCE_OR_JOB_INVALID
sql "update public.events set region=null,lat=null where id='$other'" >/dev/null
[[ $(sql "select count(*) from public.publication_canary_candidate() where id='$other'") == 1 ]]
[[ $(claim "$other" 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' 101) == 1 ]]
[[ $(sql "select count(*) from private.publication_canary_attempts") == 2 ]]
echo 'PASS 24-hour sliding quota and next reservation'

sql "select public.record_publication_canary_incident(101,1,null,'Generation failed')" >/dev/null
[[ $(sql "select halted::text from public.publication_canary_status()") == true ]]
[[ $(sql "select incident_batch_id from private.publication_canary_state") == bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb ]]
sql "select count(*) from public.complete_event_publication_batch('[{\"id\":\"$other\",\"attempt_count\":1}]'::jsonb,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','FAILED',null,'Generation failed')" >/dev/null
[[ $(sql "select status from public.event_publication_jobs where id='$other'") == PENDING ]]
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$job")]'::jsonb,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',102,1)" CANARY_NOT_ARMED
expect_error "set test.uid='$event'; set test.admin='true'; select public.arm_publication_canary(100,'Reviewed GitHub Actions incidents and Supabase jobs')" CANARY_INCIDENT_NOT_REVIEWED
arm 101
[[ $(sql "select halted::text from public.publication_canary_status()") == false ]]
[[ $(sql "select count(*) from public.publication_canary_candidate() where id='$other'") == 0 ]]
[[ $(sql "select count(*) from private.publication_canary_reviews where reviewed_by='$event'") == 2 ]]
echo 'PASS persistent incident and explicit admin clearance'

sql "insert into public.events values ('44444444-4444-4444-8444-444444444444','Concurrent salon','Paris',current_date+22,current_date+22,true,false,false,null,null,null,null,'FR',null,null); insert into public.event_publication_jobs (id,event_id,target_event_id,reason,status,attempt_count,requested_at) values ('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444','validation','PENDING',0,now()); insert into private.publication_canary_evidence (event_id,source_url,source_identity,event_reference,title_snapshot,city_snapshot,description_snapshot,region_snapshot,country_code_snapshot,lat_snapshot,lng_snapshot,start_date_snapshot,end_date_snapshot,checked_by,human_confirmed) values ('44444444-4444-4444-8444-444444444444','https://organizer.example/events/concurrent','Official organizer','Concurrent salon','Concurrent salon','Paris',null,null,'FR',null,null,(current_date+22)::text,(current_date+22)::text,'$event',true); update private.publication_canary_attempts set reserved_at=now()-interval '25 hours';" >/dev/null
sql "create function public.slow_canary_claim() returns trigger language plpgsql as \$\$ begin perform pg_sleep(2); return new; end \$\$; create trigger slow_canary_claim before update on public.event_publication_jobs for each row when (new.status='RUNNING') execute function public.slow_canary_claim();" >/dev/null
concurrent='55555555-5555-4555-8555-555555555555'
sql "select count(*) from public.claim_publication_canary_batch('[$(selected "$concurrent")]'::jsonb,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',102,1)" >/dev/null &
background=$!
sleep 0.3
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$concurrent")]'::jsonb,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',103,1)" 'could not obtain lock'
wait "$background"
[[ $(sql "select count(*) from private.publication_canary_attempts") == 3 ]]
sql "drop trigger slow_canary_claim on public.event_publication_jobs; drop function public.slow_canary_claim()" >/dev/null
echo 'PASS concurrent CANARY reservation has one winner'

for role in anon authenticated service_role; do
  [[ $(sql "select has_function_privilege('$role','public.arm_publication_canary(bigint,text)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.record_publication_canary_evidence(uuid,text,text,text,text,text,text,text,boolean)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.get_publication_canary_evidence(uuid)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.record_publication_canary_evidence_checked(uuid,text,text,text,text,text,text,text,text,text,text,text,double precision,double precision,boolean)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.claim_publication_canary_batch(jsonb,uuid,bigint,integer)','EXECUTE')") == $([[ $role == service_role ]] && echo t || echo f) ]]
  [[ $(sql "select has_table_privilege('$role','private.publication_canary_evidence','INSERT')") == f ]]
done
echo 'PASS separated admin and publisher grants'

# E5-C: a direct proof is separate from the unchanged official-public route.
direct_event='77777777-7777-4777-8777-777777777777'
direct_job='88888888-8888-4888-8888-888888888888'
sql "insert into public.events values ('$direct_event','Salon direct','Nantes',current_date+25,current_date+25,true,false,true,null,'https://example.org','Salle des fêtes','Pays de la Loire','FR',47.22,-1.55)" >/dev/null
direct_call="set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_direct_publication_canary_evidence_checked('$direct_event','$direct_event',null,'DIRECT_ORGANIZER','OFFICIAL_PHONE','evidence:Proof12345','Salon direct','Nantes','Pays de la Loire','FR','Salle des fêtes','https://example.org',(current_date+25)::text,(current_date+25)::text,47.22,-1.55,true)"
direct_proofs() { sql "select count(*) from private.publication_canary_evidence where event_id='$direct_event'"; }
direct_attestations() { sql "select count(*) from private.event_provenance where event_id='$direct_event' and state='ATTESTED'"; }
direct_candidate() { sql "select count(*) from public.publication_canary_candidate() where id='$direct_job'"; }
direct_status() { sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_status from public.get_publication_canary_evidence('$direct_event')" | tail -1; }
expect_error "$direct_call" CANARY_DIRECT_SUBMISSION_INVALID
[[ $(direct_proofs) == 0 && $(direct_attestations) == 0 ]]
sql "insert into public.event_submission_contacts(event_id,submitter_name,submitter_email) values ('$direct_event','Organisation test','organizer@example.test')" >/dev/null
expect_error "$(sed "s/'DIRECT_ORGANIZER'/NULL/" <<< "$direct_call")" CANARY_DIRECT_EVIDENCE_INVALID
expect_error "$(sed "s/'OFFICIAL_PHONE'/NULL/" <<< "$direct_call")" CANARY_DIRECT_EVIDENCE_INVALID
expect_error "$(sed "s/'evidence:Proof12345'/NULL/" <<< "$direct_call")" CANARY_DIRECT_EVIDENCE_INVALID
expect_error "$(sed "s/'DIRECT_ORGANIZER'/'AUTO_MATTE'/" <<< "$direct_call")" CANARY_DIRECT_EVIDENCE_INVALID
expect_error "$(sed "s#'evidence:Proof12345'#'https://public.example/poster.jpg'#" <<< "$direct_call")" CANARY_DIRECT_EVIDENCE_INVALID
expect_error "$(sed "s/'$direct_event','$direct_event'/'$direct_event','$other'/" <<< "$direct_call")" CANARY_DIRECT_SUBMISSION_INVALID
expect_error "${direct_call/,true)/,false)}" CANARY_DIRECT_EVIDENCE_INVALID
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select public.record_direct_publication_canary_evidence_checked('$direct_event','$direct_event',null,'DIRECT_ORGANIZER','OFFICIAL_PHONE','evidence:Proof12345','Salon direct','Nantes','Pays de la Loire','FR','Salle des fêtes','https://example.org',(current_date+25)::text,(current_date+25)::text,47.22,-1.55,true)" CANARY_ADMIN_REQUIRED
expect_error "set role anon; select public.record_direct_publication_canary_evidence_checked('$direct_event','$direct_event',null,'DIRECT_ORGANIZER','OFFICIAL_PHONE','evidence:Proof12345','Salon direct','Nantes','Pays de la Loire','FR','Salle des fêtes','https://example.org',(current_date+25)::text,(current_date+25)::text,47.22,-1.55,true)" 'permission denied'
expect_error "$direct_call" CANARY_DIRECT_DOSSIER_NOT_VERIFIED
[[ $(direct_proofs) == 0 && $(direct_attestations) == 0 ]]
sql "insert into private.event_provenance(event_id,state,observed_channel,declared_origin) values ('$direct_event','DECLARED','DIRECT_FORM','DIRECT_ORGANIZER')" >/dev/null
sql "insert into private.event_provenance(event_id,state,observed_channel,auto_matte_reference) values ('$direct_event','OBSERVED','AUTO_MATTE','local:123')" >/dev/null
[[ $(direct_candidate) == 0 ]]
[[ $(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select observed_channel||':'||declared_origin||':'||attested_origin from public.get_event_provenance('$direct_event')") == DIRECT_FORM:DIRECT_ORGANIZER:LEGACY_UNKNOWN ]]
[[ $(sql "select count(*) from public.event_publication_jobs where target_event_id='$direct_event'") == 0 ]]
echo 'PASS direct gate: contact, identity, role, private reference, admin rights, no partial write or job'

# A dossier is a private verification record, generated by SQL, then explicitly
# reviewed. Neither a fabricated reference nor an unreviewed record is enough.
dossier_call="set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_direct_publication_canary_dossier('$direct_event','$direct_event','DIRECT_ORGANIZER','OFFICIAL_PHONE','Official organiser contact page independently consulted','Official telephone contact independently checked; organiser confirmed this event, venue and dates')"
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select public.record_direct_publication_canary_dossier('$direct_event','$direct_event','DIRECT_ORGANIZER','OFFICIAL_PHONE','Official organiser contact page independently consulted','Official telephone contact independently checked; organiser confirmed this event, venue and dates')" CANARY_ADMIN_REQUIRED
expect_error "set role anon; select public.record_direct_publication_canary_dossier('$direct_event','$direct_event','DIRECT_ORGANIZER','OFFICIAL_PHONE','Official organiser contact page independently consulted','Official telephone contact independently checked; organiser confirmed this event, venue and dates')" 'permission denied'
dossier_ref=$(sql "$dossier_call" | tail -1)
[[ $dossier_ref == evidence:* ]]
expect_equal "$(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select dossier_state from public.get_direct_publication_canary_dossier('$dossier_ref')" | tail -1)" PENDING_REVIEW 'admin can inspect private dossier before verification'
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select * from public.get_direct_publication_canary_dossier('$dossier_ref')" CANARY_ADMIN_REQUIRED
expect_error "set role anon; select * from public.get_direct_publication_canary_dossier('$dossier_ref')" 'permission denied'
direct_call=${direct_call/evidence:Proof12345/$dossier_ref}
expect_error "$direct_call" CANARY_DIRECT_DOSSIER_NOT_VERIFIED
expect_error "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$dossier_ref',false)" CANARY_DIRECT_DOSSIER_CONFIRMATION_REQUIRED
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$dossier_ref',true)" CANARY_ADMIN_REQUIRED
expect_error "set role anon; select public.verify_direct_publication_canary_dossier('$direct_event','$dossier_ref',true)" 'permission denied'
sql "update public.events set description='Location changed before dossier review' where id='$direct_event'" >/dev/null
expect_error "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$dossier_ref',true)" CANARY_DIRECT_DOSSIER_INVALID
sql "update public.events set description='Salle des fêtes' where id='$direct_event'" >/dev/null
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$dossier_ref',true)" >/dev/null
expect_error "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$dossier_ref',true)" CANARY_DIRECT_DOSSIER_INVALID
expect_equal "$(sql "select state from private.publication_canary_source_dossiers where evidence_reference='$dossier_ref'")" VERIFIED 'verified dossier state'
expect_error "$(sed "s/'$dossier_ref'/'evidence:Imaginary123'/" <<< "$direct_call")" CANARY_DIRECT_DOSSIER_NOT_VERIFIED
sql "insert into public.event_submission_contacts(event_id,submitter_name,submitter_email) values ('$other','Other organisation','other@example.test')" >/dev/null
other_ref=$(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_direct_publication_canary_dossier('$other','$other','DIRECT_ORGANIZER','OFFICIAL_PHONE','Another official source independently consulted','Another organiser confirmed the separate event at another place')" | tail -1)
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$other','$other_ref',true)" >/dev/null
expect_error "$(sed "s/'$dossier_ref'/'$other_ref'/" <<< "$direct_call")" CANARY_DIRECT_DOSSIER_NOT_VERIFIED
expect_equal "$(direct_attestations)" 0 'no attestation from absent or mismatched dossier'
echo 'PASS private dossier: generated reference, verified state, event/submission binding and ACL'

# Keep a public proof behind the direct proof: revocation must not fall back to it.
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_publication_canary_evidence('$direct_event','https://organizer.example/events/direct','Official organizer','Salon direct','Salon direct','Nantes',(current_date+25)::text,(current_date+25)::text,true)" >/dev/null
before_direct_event=$(sql "select to_jsonb(e)::text from public.events e where id='$direct_event'")
first_direct_id=$(C3C_TEST_CONTAINER="$container" C3C_TEST_SQL="$direct_call" node "$root/scripts/test-direct-canary-network.mjs")
expect_equal "$(sql "$direct_call" | tail -1)" "$first_direct_id" 'new client context returns original proof'
expect_equal "$(direct_attestations)" 1 'six sequential replays have one attestation'
expect_equal "$(direct_proofs)" 2 'six sequential replays preserve one direct proof'
expect_equal "$(sql "select count(*) from public.event_publication_jobs where target_event_id='$direct_event'")" 0 'lost response creates no job'
expect_equal "$(sql "select to_jsonb(e)::text from public.events e where id='$direct_event'")" "$before_direct_event" 'lost response and replays do not edit event'
expect_error "insert into private.event_provenance (event_id,state,observed_channel,attested_origin,submission_event_id,identity_method,justification_reference,dossier_id,verified_by,verified_at) select event_id,state,observed_channel,attested_origin,submission_event_id,identity_method,justification_reference,dossier_id,verified_by,verified_at from private.event_provenance where id=(select provenance_id from private.publication_canary_evidence where id=$first_direct_id)" event_provenance_direct_dossier_once_idx
expect_error "insert into private.publication_canary_evidence (event_id,source_url,source_identity,event_reference,title_snapshot,city_snapshot,website_snapshot,description_snapshot,region_snapshot,country_code_snapshot,lat_snapshot,lng_snapshot,start_date_snapshot,end_date_snapshot,checked_by,human_confirmed,proof_type,provenance_id) select event_id,source_url,source_identity,event_reference,title_snapshot,city_snapshot,website_snapshot,description_snapshot,region_snapshot,country_code_snapshot,lat_snapshot,lng_snapshot,start_date_snapshot,end_date_snapshot,checked_by,human_confirmed,proof_type,provenance_id from private.publication_canary_evidence where id=$first_direct_id" publication_canary_direct_provenance_once_idx
[[ $(direct_attestations) == 1 && $(direct_proofs) == 2 ]]
expect_error "$(sed "s/,null,'DIRECT_ORGANIZER'/,'DIRECT_AUTHOR','DIRECT_ORGANIZER'/" <<< "$direct_call")" CANARY_DIRECT_DOSSIER_ALREADY_USED
expect_equal "$(latest_direct_reference "$direct_event")" "$first_direct_id:$dossier_ref:VERIFIED" 'reload retrieves latest direct ID and verified dossier reference'
expect_equal "$(sql "begin read only; set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_id from public.get_latest_direct_publication_canary_reference('$direct_event'); commit" | head -1)" "$first_direct_id" 'reference RPC works in a read-only transaction'
[[ $(direct_proofs) == 2 && $(direct_attestations) == 1 ]]
[[ $(direct_status) == valid ]]
[[ $(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select attested_origin||':'||attestation_state||':'||proof_type||':'||history_count from public.get_event_provenance('$direct_event')") == DIRECT_ORGANIZER:ATTESTED:DIRECT_VERIFIED:3 ]]
sql "insert into public.event_publication_jobs(id,event_id,target_event_id,reason,status,attempt_count,requested_at) values ('$direct_job','$direct_event','$direct_event','validation','PENDING',0,now()+interval '3 minutes')" >/dev/null
[[ $(direct_candidate) == 1 ]]
for change in "title='Autre titre'" "city='Rennes'" "region='Bretagne'" "country_code='BE'" "description='Autre lieu'" "website=null" "start_date=current_date+26" "end_date=null" "lat=null" "lng=-1.56"; do
  sql "update public.events set $change where id='$direct_event'" >/dev/null
  [[ $(direct_status) == invalidated && $(direct_candidate) == 0 ]]
  sql "update public.events set title='Salon direct',city='Nantes',region='Pays de la Loire',country_code='FR',description='Salle des fêtes',website='https://example.org',start_date=current_date+25,end_date=current_date+25,lat=47.22,lng=-1.55 where id='$direct_event'" >/dev/null
done
expect_error "$(sed "s/'Pays de la Loire'/NULL/" <<< "$direct_call")" CANARY_SOURCE_EVIDENCE_STALE
[[ $(direct_attestations) == 1 && $(direct_proofs) == 2 ]]
sql "update public.events set region=null,description=null,website=null,end_date=null,lat=null,lng=null where id='$direct_event'" >/dev/null
expect_error "$direct_call" CANARY_SOURCE_EVIDENCE_STALE
null_ref=$(sql "$dossier_call" | tail -1)
expect_error "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$dossier_ref',true)" CANARY_DIRECT_DOSSIER_INVALID
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$null_ref',true)" >/dev/null
direct_null="set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_direct_publication_canary_evidence_checked('$direct_event','$direct_event',null,'DIRECT_ORGANIZER','OFFICIAL_PHONE','$null_ref','Salon direct','Nantes',null,'FR',null,null,(current_date+25)::text,null,null,null,true)"
# Six simultaneous first-use calls must all converge on one committed proof.
replay_dir=$(mktemp -d)
pids=()
for n in 1 2 3 4 5 6; do
  sql "$direct_null" > "$replay_dir/$n" & pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(sort -u "$replay_dir"/* | wc -l | tr -d ' ') == 1 ]]
rm -r "$replay_dir"
[[ $(direct_attestations) == 2 && $(direct_proofs) == 3 ]]
second_direct_id=$(sql "select id from private.publication_canary_evidence where event_id='$direct_event' order by checked_at desc,id desc limit 1")
expect_equal "$(latest_direct_reference "$direct_event")" "$second_direct_id:$null_ref:VERIFIED" 'newest direct proof replaces previous reference'
sql "update private.publication_canary_evidence set checked_at=statement_timestamp() where id in ($first_direct_id,$second_direct_id)" >/dev/null
expect_equal "$(latest_direct_reference "$direct_event")" "$second_direct_id:$null_ref:VERIFIED" 'equal checked_at breaks tie by descending proof ID'
expect_error "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.revoke_direct_publication_canary_evidence('$direct_event',$first_direct_id,'Source independently rechecked')" CANARY_DIRECT_PROOF_NOT_LATEST
expect_equal "$(sql "select count(*) from private.event_provenance where event_id='$direct_event' and state='REVOKED'")" 0 'stale revocation does not write'
[[ $(direct_status) == valid && $(direct_attestations) == 2 ]]
echo 'PASS direct proof: exact snapshot, venue, dates and NULL transitions'

# Six concurrent replays of the same committed proof cannot append rows.
pids=()
for _ in 1 2 3 4 5 6; do
  sql "$direct_null" >/dev/null & pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
[[ $(direct_attestations) == 2 && $(direct_proofs) == 3 ]]
# An intervening event edit refuses without any partial row.
sql "begin; update public.events set description='Changed concurrently' where id='$direct_event'; select pg_sleep(2); commit" >/dev/null &
background=$!
sleep 0.3
expect_error "$direct_null" CANARY_SOURCE_EVIDENCE_STALE
wait "$background"
[[ $(direct_attestations) == 2 ]]
sql "update public.events set description=null where id='$direct_event'" >/dev/null
echo 'PASS six concurrent replays and stale edit refusal'

latest_direct_proof=$(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_id from public.get_latest_direct_publication_canary_reference('$direct_event')" | tail -1)
expect_error "set test.uid='$event'; set test.admin='false'; set role authenticated; select public.revoke_direct_publication_canary_evidence('$direct_event',$latest_direct_proof,'Source independently rechecked')" CANARY_ADMIN_REQUIRED
expect_error "set role anon; select public.get_event_provenance('$direct_event')" 'permission denied'
expect_error "set role anon; select public.revoke_direct_publication_canary_evidence('$direct_event',$latest_direct_proof,'Source independently rechecked')" 'permission denied'
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.revoke_direct_publication_canary_evidence('$direct_event',$latest_direct_proof,'Source independently rechecked')" >/dev/null
expect_equal "$(latest_direct_reference "$direct_event")" "$latest_direct_proof:$null_ref:REVOKED" 'revoked latest direct reference remains readable'
expect_equal "$(direct_status)" invalidated 'revoked proof status'
expect_equal "$(direct_candidate)" 0 'revoked proof candidate'
expect_equal "$(sql "select count(*) from private.event_provenance where event_id='$direct_event' and state='REVOKED'")" 1 'revocation history'
expect_equal "$(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select attestation_state from public.get_event_provenance('$direct_event')")" REVOKED 'revoked provenance state'
expect_error "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.revoke_direct_publication_canary_evidence('$direct_event',$latest_direct_proof,'Source independently rechecked')" CANARY_DIRECT_ALREADY_REVOKED
expect_equal "$(direct_proofs)" 3 'revocation leaves proof history unchanged'
expect_equal "$(sql "select state from private.publication_canary_source_dossiers where evidence_reference='$null_ref'")" REVOKED 'revoked dossier state'
expect_error "$direct_null" CANARY_DIRECT_DOSSIER_NOT_VERIFIED
renewed_ref=$(sql "$dossier_call" | tail -1)
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$renewed_ref',true)" >/dev/null
direct_null=${direct_null/$null_ref/$renewed_ref}
sql "$direct_null" >/dev/null
expect_equal "$(direct_status)" valid 'renewed proof status'
# Simulate time passing for the complete history, preserving latest-proof ordering.
sql "update private.publication_canary_evidence set checked_at=checked_at-interval '31 days' where event_id='$direct_event'" >/dev/null
expect_equal "$(direct_status)" expired 'expired proof status'
expect_equal "$(direct_candidate)" 0 'expired proof candidate'
expired_direct_id=$(sql "select id from private.publication_canary_evidence where event_id='$direct_event' order by checked_at desc,id desc limit 1")
expect_equal "$(latest_direct_reference "$direct_event")" "$expired_direct_id:$renewed_ref:VERIFIED" 'expired latest direct reference remains readable'
expect_error "$direct_null" CANARY_DIRECT_DOSSIER_ALREADY_USED
new_ref=$(sql "$dossier_call" | tail -1)
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$new_ref',true)" >/dev/null
direct_null=${direct_null/$renewed_ref/$new_ref}
sql "$direct_null" >/dev/null
expect_equal "$(direct_status)" valid 'fresh proof status'
echo 'PASS direct revocation, no older-proof fallback, expiry and new dossier evidence'

# A revocation in flight blocks claim, rather than allowing an uncertain reservation.
latest_direct_proof=$(sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select proof_id from public.get_latest_direct_publication_canary_reference('$direct_event')" | tail -1)
sql "begin; set test.uid='$event'; set test.admin='true'; set role authenticated; select public.revoke_direct_publication_canary_evidence('$direct_event',$latest_direct_proof,'Source independently rechecked'); select pg_sleep(2); commit" >/dev/null &
background=$!
sleep 0.3
sql "update private.publication_canary_attempts set reserved_at=now()-interval '25 hours'" >/dev/null
expect_error "select count(*) from public.claim_publication_canary_batch('[$(selected "$direct_job")]'::jsonb,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',104,1)" 'could not obtain lock'
wait "$background"
[[ $(direct_candidate) == 0 ]]
[[ $(sql "select status from public.event_publication_jobs where id='$direct_job'") == PENDING ]]
[[ $(sql "select count(*) from private.publication_canary_attempts") == 3 ]]
echo 'PASS concurrent revocation blocks claim without partial reservation'

for role in anon authenticated service_role; do
  [[ $(sql "select has_table_privilege('$role','private.event_provenance','SELECT')") == f ]]
  [[ $(sql "select has_table_privilege('$role','private.event_provenance','INSERT')") == f ]]
  [[ $(sql "select has_table_privilege('$role','private.publication_canary_source_dossiers','SELECT')") == f ]]
  [[ $(sql "select has_table_privilege('$role','private.publication_canary_source_dossiers','INSERT')") == f ]]
  [[ $(sql "select has_function_privilege('$role','public.record_direct_publication_canary_dossier(uuid,uuid,text,text,text,text)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.get_direct_publication_canary_dossier(text)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.verify_direct_publication_canary_dossier(uuid,text,boolean)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.record_direct_publication_canary_evidence_checked(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,double precision,double precision,boolean)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.revoke_direct_publication_canary_evidence(uuid,bigint,text)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
  [[ $(sql "select has_function_privilege('$role','public.get_event_provenance(uuid)','EXECUTE')") == $([[ $role == authenticated ]] && echo t || echo f) ]]
done
echo 'PASS direct private ACL, RPC grants and history'

# A newer public proof hides all older direct references, even after reload.
replacement_ref=$(sql "$dossier_call" | tail -1)
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.verify_direct_publication_canary_dossier('$direct_event','$replacement_ref',true)" >/dev/null
replacement_call=${direct_null/$new_ref/$replacement_ref}
sql "$replacement_call" >/dev/null
sql "set test.uid='$event'; set test.admin='true'; set role authenticated; select public.record_publication_canary_evidence('$direct_event','https://organizer.example/events/direct','Official organizer','Salon direct','Salon direct','Nantes',(current_date+25)::text,null,true)" >/dev/null
expect_error "$replacement_call" CANARY_DIRECT_DOSSIER_ALREADY_USED
expect_equal "$(latest_direct_reference "$direct_event")" '' 'newer PUBLIC_OFFICIAL prevents older direct fallback'
expect_equal "$(sql "select proof_type from private.publication_canary_evidence where event_id='$direct_event' order by checked_at desc,id desc limit 1")" PUBLIC_OFFICIAL 'public proof is latest'
expect_equal "$(sql "select count(*) from public.event_publication_jobs where target_event_id='$direct_event'")" 1 'reference reads create no jobs'
expect_equal "$(sql "select status from public.event_publication_jobs where id='$direct_job'")" PENDING 'reference reads preserve job state'
echo 'PASS read-only Admin references: reload, revocation race, expiry and no fallback'
