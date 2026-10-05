-- Restore only the editorial selection dependency used by the existing admin UI.
create table if not exists public.launch_feed_selection (
  post_id uuid primary key references public.posts(id) on delete cascade,
  label text not null default 'Sélection lancement' check (char_length(label) between 2 and 80),
  content_origin text not null default 'provider' check (content_origin in ('provider','editorial','demo')),
  disclosure text,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_active boolean not null default true,
  selected_by uuid not null references public.profiles(id) on delete restrict,
  selected_at timestamptz not null default now(),
  check (content_origin = 'provider' or char_length(trim(coalesce(disclosure,''))) >= 8)
);

alter table public.launch_feed_selection enable row level security;
revoke all on public.launch_feed_selection from anon, authenticated;
grant select on public.launch_feed_selection to anon, authenticated;
grant insert, update, delete on public.launch_feed_selection to authenticated;
grant all on public.launch_feed_selection to service_role;

drop policy if exists "launch feed public read" on public.launch_feed_selection;
create policy "launch feed public read" on public.launch_feed_selection
  for select to anon, authenticated
  using (is_active and exists (
    select 1 from public.posts post
    where post.id = post_id and post.status = 'published'
  ));

drop policy if exists "launch feed content manage" on public.launch_feed_selection;
create policy "launch feed content manage" on public.launch_feed_selection
  for all to authenticated
  using (public.has_admin_permission('content.manage'))
  with check (public.has_admin_permission('content.manage'));
