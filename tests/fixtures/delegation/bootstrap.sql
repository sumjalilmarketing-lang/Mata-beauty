-- Synthetic parent schema for local PostgreSQL tests; no live Auth or records.
alter table public.profiles add column first_name text,add column last_name text,add column updated_at timestamptz default now(),add column phone text,add column avatar_url text,add column terms_accepted_at timestamptz,add column privacy_accepted_at timestamptz;
alter table public.admin_roles add column name text,add column description text,add column is_system boolean default true;
alter table public.admin_user_roles add column assigned_by uuid,add column requires_mfa boolean default true,add column assigned_at timestamptz default now(),add unique(user_id,role_id);
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,encrypted_password text default 'local-password',invited_at timestamptz);
insert into auth.users(id,email,email_confirmed_at)select id,replace(id::text,'-','')||'@example.test',now()from public.profiles;
alter table public.provider_profiles add column bio text,add column base_address text,add column years_experience integer,add column languages text[],add column cancellation_policy text,add column onboarding_progress integer default 0,add column verified_at timestamptz,add column average_rating numeric default 0,add column review_count integer default 0,add column updated_at timestamptz default now();
create table public.professional_onboarding(provider_id uuid primary key,status text,submitted_at timestamptz,rejection_reason text,assigned_agent uuid,updated_at timestamptz);
create table public.provider_documents(id uuid primary key default gen_random_uuid(),provider_id uuid,kind text,status text,storage_path text,created_at timestamptz default now(),rejection_reason text,reviewed_by uuid,reviewed_at timestamptz);
create table public.document_reviews(id uuid primary key default gen_random_uuid(),document_id uuid,reviewer_id uuid,decision text,reason text);
create table public.account_roles(profile_id uuid,role text,primary key(profile_id,role));
create table public.businesses(id uuid primary key default gen_random_uuid(),owner_id uuid);
create table public.payments(id uuid primary key default gen_random_uuid(),amount integer,gross_amount integer,currency text,payment_status text,is_test boolean default true,provider text default 'mock',created_at timestamptz default now());
create table public.support_tickets(id uuid primary key default gen_random_uuid(),requester_id uuid,assigned_to uuid,subject text,priority text default 'normal',status text default 'open',created_at timestamptz default now(),updated_at timestamptz default now());
create table public.support_messages(id uuid primary key default gen_random_uuid(),ticket_id uuid,sender_id uuid,body text,is_internal boolean default false,created_at timestamptz default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid,action text,entity_type text,entity_id uuid,before_data jsonb,after_data jsonb,ip_hash text,created_at timestamptz default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),profile_id uuid,kind text,title text,body text,data jsonb);
create schema storage;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
create function storage.foldername(text)returns text[]language sql immutable as $$select(string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
grant usage on schema storage to authenticated;
grant execute on function storage.foldername(text)to authenticated;
grant select on storage.objects,public.professional_onboarding,public.provider_documents,public.businesses,public.payments,public.support_tickets,public.support_messages to authenticated;
grant all on public.provider_documents to service_role;
alter table storage.objects enable row level security;
alter table public.professional_onboarding enable row level security;
alter table public.provider_documents enable row level security;
alter table public.businesses enable row level security;
alter table public.payments enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
create policy payment_scope on public.payments for select to authenticated using(public.has_admin_permission('payments.read'));
insert into public.admin_permissions(key)values('roles.manage'),('documents.review'),('providers.verify'),('payments.refund'),('commissions.manage'),('payouts.manage'),('bookings.read')on conflict do nothing;
insert into public.admin_role_permissions select id,'documents.review'from public.admin_roles where key='commercial';
CREATE OR REPLACE FUNCTION public.is_admin()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 select not public.admin_mfa_required()and exists(select 1 from public.profiles p join public.admin_user_roles membership on membership.user_id=p.id join public.admin_roles role on role.id=membership.role_id where p.id=auth.uid()and p.role='admin'and not p.is_suspended and membership.is_active and membership.revoked_at is null and role.is_active);$$;

create table public.social_post_media(post_id uuid,bucket_id text,storage_path text,thumbnail_path text);
create function public.is_public_social_post(uuid)returns boolean language sql stable as $$select false$$;
grant select on public.social_post_media to authenticated;
create policy historical_admin_media on storage.objects for select to authenticated using(bucket_id='provider-social-media'and public.is_admin());

create table public.payouts(id uuid primary key default gen_random_uuid());
create table public.payout_batches(id uuid primary key default gen_random_uuid());
alter table public.payouts enable row level security;
alter table public.payout_batches enable row level security;
grant select on public.payouts,public.payout_batches to authenticated;
