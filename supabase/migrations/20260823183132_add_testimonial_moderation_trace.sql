alter table public.testimonials
  add column if not exists moderated_at timestamptz null,
  add column if not exists moderated_by uuid null;;
