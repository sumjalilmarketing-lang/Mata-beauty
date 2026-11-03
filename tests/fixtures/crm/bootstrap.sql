-- Minimal local PostgreSQL fixture only. Auth claims are simulated, not real JWTs.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth,public to authenticated,anon,service_role;
grant execute on all functions in schema auth to authenticated,anon,service_role;
create table public.profiles(id uuid primary key,role text default 'admin',display_name text,account_status text default 'active',is_suspended boolean default false);
create table public.admin_roles(id uuid primary key default gen_random_uuid(),key text unique,is_active boolean default true);
create table public.admin_permissions(key text primary key,domain text,description text,is_sensitive boolean);
create table public.admin_role_permissions(role_id uuid references public.admin_roles(id),permission_key text references public.admin_permissions(key),primary key(role_id,permission_key));
create table public.admin_user_roles(user_id uuid references public.profiles(id),role_id uuid references public.admin_roles(id),is_active boolean default true,revoked_at timestamptz);
create table public.provider_profiles(profile_id uuid primary key,business_name text,city text,status text);
alter table public.provider_profiles enable row level security;
grant select on public.provider_profiles to authenticated;
insert into public.admin_roles(key) values('commercial'),('super_admin'),('finance'),('support');
insert into public.admin_permissions values('providers.read','providers','test',true),('payments.read','payments','test',true),('support.manage','support','test',true);
insert into public.admin_role_permissions select r.id,p.key from public.admin_roles r join public.admin_permissions p on
  (r.key='commercial' and p.key='providers.read') or (r.key='finance' and p.key='payments.read') or (r.key='support' and p.key='support.manage');
insert into public.profiles(id,display_name) values
 ('11111111-1111-4111-8111-111111111111','Commercial A'),
 ('22222222-2222-4222-8222-222222222222','Commercial B'),
 ('33333333-3333-4333-8333-333333333333','Super Admin'),
 ('44444444-4444-4444-8444-444444444444','Finance'),
 ('55555555-5555-4555-8555-555555555555','Support'),
 ('66666666-6666-4666-8666-666666666666','Client');
update public.profiles set role='client' where id='66666666-6666-4666-8666-666666666666';
insert into public.admin_user_roles(user_id,role_id) select t.id::uuid,r.id from (values
 ('11111111-1111-4111-8111-111111111111','commercial'),('22222222-2222-4222-8222-222222222222','commercial'),
 ('33333333-3333-4333-8333-333333333333','super_admin'),('44444444-4444-4444-8444-444444444444','finance'),('55555555-5555-4555-8555-555555555555','support')) t(id,key) join public.admin_roles r on r.key=t.key;
