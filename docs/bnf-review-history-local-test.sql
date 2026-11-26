-- LOCAL DISPOSABLE database only. Run after bnf-review-history-draft.sql as local owner.
-- All synthetic inserts are rolled back. No connection to production.
begin;
do $test$
declare
 a uuid := '00000000-0000-0000-0000-000000000001';
 r uuid := '00000000-0000-0000-0000-000000000002';
 req uuid := '00000000-0000-0000-0000-000000000003';
 n text := 'ark:/12148/cb123456789';
 au text := 'ark:/12148/cb987654321';
 role_name text;
begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_schema_privilege(role_name,'bnf_review_private','USAGE') or
     has_table_privilege(role_name,'bnf_review_private.decision_history','SELECT') or
     has_table_privilege(role_name,'bnf_review_private.decision_history','INSERT') or
     has_table_privilege(role_name,'bnf_review_private.decision_history','UPDATE') or
     has_table_privilege(role_name,'bnf_review_private.decision_history','DELETE') then
   raise exception 'Unexpected access for %', role_name;
  end if;
 end loop;
 if not exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace
   where s.nspname='bnf_review_private' and c.relname='decision_history'
   and c.relrowsecurity and c.relforcerowsecurity) then raise exception 'RLS missing'; end if;
 insert into bnf_review_private.decision_history
 (author_id,notice_id,revision,request_id,reviewer_id,action,authority_id,title,evidence,source_retrieved_at,source_sha256)
 values(a,n,1,req,r,'approve',au,'Titre fictif','Preuve fictive',now(),repeat('a',64));
 begin
  insert into bnf_review_private.decision_history
  (author_id,notice_id,revision,request_id,reviewer_id,action,authority_id,title,evidence,source_retrieved_at,source_sha256)
  values(a,n,1,req,r,'approve',au,'Titre fictif','Preuve fictive',now(),repeat('a',64));
  raise exception 'Duplicate accepted';
 exception when unique_violation then null; end;
 begin
  insert into bnf_review_private.decision_history
  (author_id,notice_id,revision,previous_revision,request_id,reviewer_id,action,title,evidence,source_retrieved_at,source_sha256)
  values(a,n,3,2,'00000000-0000-0000-0000-000000000004',r,'reject','Titre fictif','Correction fictive',now(),repeat('a',64));
  raise exception 'Missing predecessor accepted';
 exception when foreign_key_violation then null; end;
 begin
  insert into bnf_review_private.decision_history
  (author_id,notice_id,revision,previous_revision,request_id,reviewer_id,action,title,evidence,source_retrieved_at,source_sha256)
  values(a,n,2,1,'00000000-0000-0000-0000-000000000004',r,'approve','Titre fictif','Preuve fictive',now(),repeat('a',64));
  raise exception 'Approval without authority accepted';
 exception when check_violation then null; end;
 insert into bnf_review_private.decision_history
 (author_id,notice_id,revision,previous_revision,request_id,reviewer_id,action,title,evidence,source_retrieved_at,source_sha256)
 values(a,n,2,1,'00000000-0000-0000-0000-000000000004',r,'reject','Titre fictif','Correction fictive',now(),repeat('a',64));
 if (select count(*) from bnf_review_private.decision_history where author_id=a and notice_id=n) <> 2
 then raise exception 'History not preserved'; end if;
 raise notice 'PASS: permissions, RLS, duplicate, revision, authority and correction checks';
end
$test$;
rollback;
