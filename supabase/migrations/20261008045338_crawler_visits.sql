begin;

create table public.crawler_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  visit_kind text not null
    check (visit_kind in ('site', 'event')),
  path text not null
    check (char_length(trim(path)) > 0),
  page text,
  event_id uuid,
  referrer text,
  user_agent text not null
    check (char_length(trim(user_agent)) > 0),
  crawler_category text not null
    check (crawler_category in ('search', 'social', 'ai', 'seo', 'other')),
  crawler_family text not null
    check (char_length(trim(crawler_family)) > 0),
  crawler_agent text not null
    check (char_length(trim(crawler_agent)) > 0),
  origin_table text,
  origin_id text,
  visitor_key text,
  constraint crawler_visits_kind_event_check
    check (
      (visit_kind = 'site' and event_id is null)
      or (visit_kind = 'event' and event_id is not null)
    ),
  constraint crawler_visits_origin_pair_check
    check (
      (origin_table is null and origin_id is null)
      or (
        origin_table in ('site_visits', 'event_visits', 'visits')
        and char_length(trim(origin_id)) > 0
      )
    )
);

comment on table public.crawler_visits is
  'Télémétrie séparée des crawlers, hors compteurs de visites humaines.';

create index crawler_visits_created_at_idx
  on public.crawler_visits (created_at desc);

create index crawler_visits_family_created_idx
  on public.crawler_visits (crawler_family, created_at desc);

create index crawler_visits_category_created_idx
  on public.crawler_visits (crawler_category, created_at desc);

create unique index crawler_visits_origin_unique_idx
  on public.crawler_visits (origin_table, origin_id)
  where origin_table is not null and origin_id is not null;

alter table public.crawler_visits enable row level security;

revoke all on public.crawler_visits from anon, authenticated;
grant insert on public.crawler_visits to anon, authenticated;
grant select on public.crawler_visits to authenticated;

create policy "Public clients can insert live crawler visits"
on public.crawler_visits
for insert
to anon, authenticated
with check (
  char_length(trim(path)) > 0
  and char_length(trim(user_agent)) > 0
  and origin_table is null
  and origin_id is null
  and visitor_key is null
  and crawler_category in ('search', 'social', 'ai', 'seo', 'other')
  and char_length(trim(crawler_family)) > 0
  and char_length(trim(crawler_agent)) > 0
  and visit_kind in ('site', 'event')
  and (
    (visit_kind = 'site' and event_id is null)
    or (visit_kind = 'event' and event_id is not null)
  )
  and created_at between now() - interval '5 minutes' and now() + interval '1 minute'
);

create policy "Admins can read crawler visits"
on public.crawler_visits
for select
to authenticated
using ((select private.is_admin()));

commit;
;
