begin;

do $$
declare
  historical_total bigint;
  historical_site bigint;
  historical_event bigint;
  historical_visits bigint;
  source_site bigint;
  source_event bigint;
  source_visits bigint;
  deleted_site bigint;
  deleted_event bigint;
  deleted_visits bigint;
  remaining_site bigint;
  remaining_event bigint;
  remaining_visits bigint;
begin
  select
    count(*),
    count(*) filter (where origin_table = 'site_visits'),
    count(*) filter (where origin_table = 'event_visits'),
    count(*) filter (where origin_table = 'visits')
  into historical_total, historical_site, historical_event, historical_visits
  from public.crawler_visits
  where origin_table is not null;

  if historical_total <> 1330
    or historical_site <> 975
    or historical_event <> 339
    or historical_visits <> 16 then
    raise exception
      'crawler history cleanup aborted: archive totals are %, %, %, %',
      historical_total, historical_site, historical_event, historical_visits;
  end if;

  select count(*)
  into source_site
  from public.site_visits as source
  join public.crawler_visits as archive
    on archive.origin_table = 'site_visits'
   and archive.origin_id = source.id::text;

  select count(*)
  into source_event
  from public.event_visits as source
  join public.crawler_visits as archive
    on archive.origin_table = 'event_visits'
   and archive.origin_id = source.id::text;

  select count(*)
  into source_visits
  from public.visits as source
  join public.crawler_visits as archive
    on archive.origin_table = 'visits'
   and archive.origin_id = source.id::text;

  if source_site <> 975 or source_event <> 339 or source_visits <> 16 then
    raise exception
      'crawler history cleanup aborted: source matches are %, %, %',
      source_site, source_event, source_visits;
  end if;

  delete from public.site_visits as source
  using public.crawler_visits as archive
  where archive.origin_table = 'site_visits'
    and archive.origin_id = source.id::text;
  get diagnostics deleted_site = row_count;

  delete from public.event_visits as source
  using public.crawler_visits as archive
  where archive.origin_table = 'event_visits'
    and archive.origin_id = source.id::text;
  get diagnostics deleted_event = row_count;

  delete from public.visits as source
  using public.crawler_visits as archive
  where archive.origin_table = 'visits'
    and archive.origin_id = source.id::text;
  get diagnostics deleted_visits = row_count;

  if deleted_site <> 975 or deleted_event <> 339 or deleted_visits <> 16 then
    raise exception
      'crawler history cleanup aborted: deleted rows are %, %, %',
      deleted_site, deleted_event, deleted_visits;
  end if;

  select count(*)
  into remaining_site
  from public.site_visits as source
  join public.crawler_visits as archive
    on archive.origin_table = 'site_visits'
   and archive.origin_id = source.id::text;

  select count(*)
  into remaining_event
  from public.event_visits as source
  join public.crawler_visits as archive
    on archive.origin_table = 'event_visits'
   and archive.origin_id = source.id::text;

  select count(*)
  into remaining_visits
  from public.visits as source
  join public.crawler_visits as archive
    on archive.origin_table = 'visits'
   and archive.origin_id = source.id::text;

  if remaining_site <> 0 or remaining_event <> 0 or remaining_visits <> 0 then
    raise exception
      'crawler history cleanup aborted: source rows remain %, %, %',
      remaining_site, remaining_event, remaining_visits;
  end if;

  select
    count(*),
    count(*) filter (where origin_table = 'site_visits'),
    count(*) filter (where origin_table = 'event_visits'),
    count(*) filter (where origin_table = 'visits')
  into historical_total, historical_site, historical_event, historical_visits
  from public.crawler_visits
  where origin_table is not null;

  if historical_total <> 1330
    or historical_site <> 975
    or historical_event <> 339
    or historical_visits <> 16 then
    raise exception
      'crawler history cleanup aborted: archive verification is %, %, %, %',
      historical_total, historical_site, historical_event, historical_visits;
  end if;
end
$$;

commit;
