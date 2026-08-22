create table if not exists public.author_merge_audit (
  id uuid primary key default gen_random_uuid(),

  primary_author_id uuid not null
    references public.authors(id)
    on delete restrict,

  secondary_author_id uuid not null
    references public.authors(id)
    on delete restrict,

  primary_author_snapshot jsonb not null,
  secondary_author_snapshot jsonb not null,

  presence_snapshot jsonb not null default '[]'::jsonb,

  reassigned_presences integer not null default 0
    check (reassigned_presences >= 0),

  created_by uuid default auth.uid()
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  reverted_at timestamptz,
  reverted_by uuid
    references auth.users(id)
    on delete set null,

  check (primary_author_id <> secondary_author_id),

  check (
    (reverted_at is null and reverted_by is null)
    or
    reverted_at is not null
  ),

  check (jsonb_typeof(primary_author_snapshot) = 'object'),
  check (jsonb_typeof(secondary_author_snapshot) = 'object'),
  check (jsonb_typeof(presence_snapshot) = 'array')
);

create index if not exists author_merge_audit_primary_idx
  on public.author_merge_audit (primary_author_id);

create index if not exists author_merge_audit_secondary_idx
  on public.author_merge_audit (secondary_author_id);

create index if not exists author_merge_audit_created_at_idx
  on public.author_merge_audit (created_at desc);

alter table public.author_merge_audit enable row level security;

drop policy if exists "Admins can manage author merge audit"
  on public.author_merge_audit;

create policy "Admins can manage author merge audit"
  on public.author_merge_audit
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke all on table public.author_merge_audit from anon;

grant select, insert, update
  on table public.author_merge_audit
  to authenticated;

comment on table public.author_merge_audit is
  'Journal interne des fusions de fiches auteurs. Conserve les snapshots nécessaires à un contrôle et à un éventuel retour arrière.';

comment on column public.author_merge_audit.presence_snapshot is
  'Tableau JSON contenant l’état exact des présences réaffectées avant la fusion.';

comment on column public.author_merge_audit.reverted_at is
  'Date d’un éventuel retour arrière de cette fusion.';
