begin;

do $$
declare
  candidate_count bigint;
begin
  select count(*)
  into candidate_count
  from (
    select user_agent from public.site_visits
    union all
    select user_agent from public.event_visits
    union all
    select user_agent from public.visits
  ) as sources
  where lower(coalesce(user_agent, '')) like any (array[
    '%meta-webindexer%',
    '%meta-externalagent%',
    '%googlebot%',
    '%adsbot-google%',
    '%ahrefsbot%',
    '%bytespider%',
    '%qwantbot%',
    '%bingbot%',
    '%certsignalbot%',
    '%hubspot crawler%',
    '%applebot%'
  ]);

  if candidate_count <> 1330 then
    raise exception 'crawler history backfill aborted: expected 1330 candidates, found %', candidate_count;
  end if;
end
$$;

with source_rows as (
  select
    'site'::text as visit_kind,
    null::uuid as event_id,
    source.path,
    source.page,
    source.referrer,
    source.user_agent,
    source.created_at,
    'site_visits'::text as origin_table,
    source.id::text as origin_id,
    source.visitor_key
  from public.site_visits as source
  where lower(coalesce(source.user_agent, '')) like any (array[
    '%meta-webindexer%', '%meta-externalagent%', '%googlebot%',
    '%adsbot-google%', '%ahrefsbot%', '%bytespider%', '%qwantbot%',
    '%bingbot%', '%certsignalbot%', '%hubspot crawler%', '%applebot%'
  ])

  union all

  select
    'event'::text as visit_kind,
    source.event_id as event_id,
    source.path as path,
    null::text as page,
    source.referrer as referrer,
    source.user_agent as user_agent,
    source.created_at as created_at,
    'event_visits'::text as origin_table,
    source.id::text as origin_id,
    source.visitor_key as visitor_key
  from public.event_visits as source
  where lower(coalesce(source.user_agent, '')) like any (array[
    '%meta-webindexer%', '%meta-externalagent%', '%googlebot%',
    '%adsbot-google%', '%ahrefsbot%', '%bytespider%', '%qwantbot%',
    '%bingbot%', '%certsignalbot%', '%hubspot crawler%', '%applebot%'
  ])

  union all

  select
    'site'::text as visit_kind,
    null::uuid as event_id,
    source.path as path,
    source.page as page,
    source.referrer as referrer,
    source.user_agent as user_agent,
    source.created_at as created_at,
    'visits'::text as origin_table,
    source.id::text as origin_id,
    null::text as visitor_key
  from public.visits as source
  where lower(coalesce(source.user_agent, '')) like any (array[
    '%meta-webindexer%', '%meta-externalagent%', '%googlebot%',
    '%adsbot-google%', '%ahrefsbot%', '%bytespider%', '%qwantbot%',
    '%bingbot%', '%certsignalbot%', '%hubspot crawler%', '%applebot%'
  ])
), classified as (
  select
    source_rows.*,
    case
      when lower(user_agent) like '%meta-webindexer%' then 'social'
      when lower(user_agent) like '%meta-externalagent%' then 'social'
      when lower(user_agent) like '%googlebot%' then 'search'
      when lower(user_agent) like '%adsbot-google%' then 'search'
      when lower(user_agent) like '%bingbot%' then 'search'
      when lower(user_agent) like '%qwantbot%' then 'search'
      when lower(user_agent) like '%applebot%' then 'search'
      when lower(user_agent) like '%bytespider%' then 'ai'
      when lower(user_agent) like '%ahrefsbot%' then 'seo'
      when lower(user_agent) like '%certsignalbot%' then 'seo'
      when lower(user_agent) like '%hubspot crawler%' then 'seo'
    end as crawler_category,
    case
      when lower(user_agent) like '%meta-webindexer%' then 'Meta'
      when lower(user_agent) like '%meta-externalagent%' then 'Meta'
      when lower(user_agent) like '%googlebot%' then 'Google'
      when lower(user_agent) like '%adsbot-google%' then 'Google'
      when lower(user_agent) like '%bingbot%' then 'Bing'
      when lower(user_agent) like '%qwantbot%' then 'Qwant'
      when lower(user_agent) like '%applebot%' then 'Apple'
      when lower(user_agent) like '%bytespider%' then 'ByteDance'
      when lower(user_agent) like '%ahrefsbot%' then 'Ahrefs'
      when lower(user_agent) like '%certsignalbot%' then 'CertSignal'
      when lower(user_agent) like '%hubspot crawler%' then 'HubSpot'
    end as crawler_family,
    case
      when lower(user_agent) like '%meta-webindexer%' then 'meta-webindexer'
      when lower(user_agent) like '%meta-externalagent%' then 'meta-externalagent'
      when lower(user_agent) like '%googlebot%' then 'googlebot'
      when lower(user_agent) like '%adsbot-google%' then 'adsbot-google'
      when lower(user_agent) like '%bingbot%' then 'bingbot'
      when lower(user_agent) like '%qwantbot%' then 'qwantbot'
      when lower(user_agent) like '%applebot%' then 'applebot'
      when lower(user_agent) like '%bytespider%' then 'bytespider'
      when lower(user_agent) like '%ahrefsbot%' then 'ahrefsbot'
      when lower(user_agent) like '%certsignalbot%' then 'certsignalbot'
      when lower(user_agent) like '%hubspot crawler%' then 'hubspot crawler'
    end as crawler_agent
  from source_rows
)
insert into public.crawler_visits (
  visit_kind,
  event_id,
  path,
  page,
  referrer,
  user_agent,
  created_at,
  crawler_category,
  crawler_family,
  crawler_agent,
  origin_table,
  origin_id,
  visitor_key
)
select
  visit_kind,
  event_id,
  path,
  page,
  referrer,
  user_agent,
  created_at,
  crawler_category,
  crawler_family,
  crawler_agent,
  origin_table,
  origin_id,
  visitor_key
from classified
on conflict (origin_table, origin_id)
where origin_table is not null and origin_id is not null
do nothing;

do $$
declare
  historical_count bigint;
  site_count bigint;
  event_count bigint;
  legacy_count bigint;
begin
  select
    count(*),
    count(*) filter (where origin_table = 'site_visits'),
    count(*) filter (where origin_table = 'event_visits'),
    count(*) filter (where origin_table = 'visits')
  into historical_count, site_count, event_count, legacy_count
  from public.crawler_visits
  where origin_table is not null;

  if historical_count <> 1330
    or site_count <> 975
    or event_count <> 339
    or legacy_count <> 16 then
    raise exception
      'crawler history backfill verification failed: total %, site %, event %, visits %',
      historical_count, site_count, event_count, legacy_count;
  end if;
end
$$;

commit;
