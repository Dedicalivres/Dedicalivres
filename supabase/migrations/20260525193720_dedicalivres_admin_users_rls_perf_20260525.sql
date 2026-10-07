drop policy if exists "Admin users can read themselves" on public.admin_users;
create policy "Admin users can read themselves"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);;
