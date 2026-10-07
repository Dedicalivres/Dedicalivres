alter table public.site_visits add column if not exists visitor_key text;
alter table public.event_visits add column if not exists visitor_key text;

revoke all privileges on table public.admin_users from anon;

revoke all privileges on table public.newsletter_subscribers from anon;
grant insert (email, region, country_code) on table public.newsletter_subscribers to anon;

revoke select on table public.testimonials from anon;
grant select (
  id, pseudo, message, event_title, image_url, validated, rejected, created_at
) on table public.testimonials to anon;

revoke insert on table public.testimonials from anon;
grant insert (
  id, pseudo, email, message, event_title, image_url, validated, rejected
) on table public.testimonials to anon;

revoke select on table public.event_authors_presence from anon;
grant select (
  id, event_id, pseudo, website, validated, created_at, author_id, author_slug,
  publication_mode, author_profile_url, author_profile_url_type,
  book_or_publisher_url, book_or_publisher_url_type, publisher_name,
  rejected, author_portrait_url, author_identity_key, participant_type,
  organization_name, presence_verified
) on table public.event_authors_presence to anon;

revoke select on table public.authors from anon;
grant select (
  id, pseudo, slug, website, bio, avatar_url, validated, created_at, updated_at
) on table public.authors to anon;

grant insert (visitor_key) on table public.site_visits to anon, authenticated;
grant insert (visitor_key) on table public.event_visits to anon, authenticated;;
