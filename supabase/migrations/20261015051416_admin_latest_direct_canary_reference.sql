-- SITE-C3C-03-E5-D0. Read-only Admin contract for the latest direct proof.
-- No schema change, backfill, event/job write or CANARY activation.
begin;

create function public.get_latest_direct_publication_canary_reference(p_event_id uuid)
returns table (proof_id bigint, dossier_reference text, dossier_state text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'CANARY_ADMIN_REQUIRED';
  end if;
  perform 1 from public.events e where e.id = p_event_id;
  if not found then raise exception 'CANARY_EVENT_NOT_FOUND'; end if;

  -- Select the latest proof before testing its type: never fall back to an
  -- older DIRECT_VERIFIED proof when a newer proof is public or invalid.
  return query
    select latest.id, dossier.evidence_reference, dossier.state
    from (
      select proof.id, proof.proof_type, proof.provenance_id
      from private.publication_canary_evidence proof
      where proof.event_id = p_event_id
      order by proof.checked_at desc, proof.id desc
      limit 1
    ) latest
    join private.event_provenance provenance
      on provenance.id = latest.provenance_id
    join private.publication_canary_source_dossiers dossier
      on dossier.id = provenance.dossier_id
    where latest.proof_type = 'DIRECT_VERIFIED'
      and provenance.event_id = p_event_id
      and provenance.submission_event_id = p_event_id
      and provenance.justification_reference = dossier.evidence_reference
      and dossier.event_id = p_event_id
      and dossier.submission_event_id = p_event_id;
end;
$$;
revoke all on function public.get_latest_direct_publication_canary_reference(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_latest_direct_publication_canary_reference(uuid)
  to authenticated;

commit;
