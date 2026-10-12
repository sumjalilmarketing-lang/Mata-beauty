begin;

-- Depends on the conversation/media foundation migration. Devis are commercial
-- documents, never payment records. No production PSP is enabled by this change.
create schema if not exists quote_private;
revoke all on schema quote_private from public, anon, authenticated;

create table public.conversation_quotes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(profile_id) on delete restrict,
  client_id uuid not null references public.client_profiles(profile_id) on delete restrict,
  provider_service_id uuid not null references public.provider_services(id) on delete restrict,
  service_title text not null,
  description text not null check(char_length(description) between 1 and 1000),
  conditions text not null default '' check(char_length(conditions)<=2000),
  base_amount integer not null check(base_amount between 0 and 100000000),
  options_amount integer not null default 0 check(options_amount>=0),
  total_amount integer not null check(total_amount between 0 and 100000000),
  currency text not null check(currency='XOF'),
  base_duration_minutes integer not null check(base_duration_minutes between 15 and 720),
  duration_minutes integer not null check(duration_minutes between 15 and 720),
  selected_option_ids uuid[] not null default '{}',
  option_snapshot jsonb not null default '[]',
  location_modes text[] not null default array['salon'],
  fixed_travel_fee_amount integer not null default 0 check(fixed_travel_fee_amount>=0),
  valid_until timestamptz not null,
  status text not null default 'draft' check(status in ('draft','sent','accepted','declined','expired','cancelled')),
  version integer not null default 1 check(version>0),
  client_nonce uuid not null,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(client_id<>provider_id),
  check(total_amount=base_amount+options_amount),
  unique(provider_id,client_nonce)
);
create index conversation_quotes_thread_idx on public.conversation_quotes(conversation_id,created_at);
create table public.conversation_quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.conversation_quotes(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  version integer not null,
  created_at timestamptz not null default now(),
  unique(quote_id,version)
);
alter table public.bookings add column conversation_quote_id uuid references public.conversation_quotes(id) on delete restrict;
create unique index bookings_conversation_quote_unique_idx on public.bookings(conversation_quote_id) where conversation_quote_id is not null;

alter table public.conversation_quotes enable row level security;
alter table public.conversation_quote_events enable row level security;
revoke all on public.conversation_quotes,public.conversation_quote_events from anon,authenticated;
grant select on public.conversation_quotes,public.conversation_quote_events to authenticated;
grant all on public.conversation_quotes,public.conversation_quote_events to service_role;
create policy "quote parties read" on public.conversation_quotes for select to authenticated
using(auth.uid() in (client_id,provider_id) and public.is_conversation_member(conversation_id)
  and (status<>'draft' or provider_id=auth.uid()));
create policy "quote parties read history" on public.conversation_quote_events for select to authenticated
using(exists(select 1 from public.conversation_quotes q where q.id=quote_id));

create function quote_private.require_access(q public.conversation_quotes,side text default 'either')
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not messaging_private.active_account(auth.uid())
    or not public.is_conversation_member(q.conversation_id)
    or (side='provider' and auth.uid() is distinct from q.provider_id)
    or (side='client' and auth.uid() is distinct from q.client_id)
    or (side='either' and auth.uid() not in (q.client_id,q.provider_id))
    or q.id is null then raise exception 'Devis inaccessible' using errcode='42501'; end if;
  if q.status='draft' and auth.uid() is distinct from q.provider_id then
    raise exception 'Devis inaccessible' using errcode='42501'; end if;
end $$;

create function quote_private.require_service(target_service uuid)
returns public.provider_services language plpgsql stable security definer set search_path='' as $$
declare s public.provider_services%rowtype;
begin
  select ps.* into s from public.provider_services ps
  join public.provider_profiles p on p.profile_id=ps.provider_id
  join public.profiles account on account.id=p.profile_id
  where ps.id=target_service and ps.is_active and ps.archived_at is null
    and coalesce(to_jsonb(ps)->>'status','published')='published'
    and p.status='approved' and messaging_private.active_account(p.profile_id)
    and account.country_code='SN' and ps.currency='XOF';
  if s.id is null then raise exception 'Prestation ou marché indisponible'; end if;
  if s.business_id is not null and not exists(select 1 from public.businesses b
    where b.id=s.business_id and b.is_active and b.archived_at is null and b.status='approved') then
    raise exception 'Salon indisponible'; end if;
  return s;
end $$;

create function quote_private.required_options(target_service uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]';
begin
  -- Older isolated QA schemas have no optional catalog module.
  if to_regclass('public.service_options') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''name'',coalesce(to_jsonb(o)->>''name'',to_jsonb(o)->>''title'',''Option obligatoire''),''price_amount'',price_amount,''duration_minutes'',duration_minutes) order by id),''[]''::jsonb) from public.service_options o where provider_service_id=$1 and is_active and is_required'
      into result using target_service;
  end if;
  return result;
end $$;

create function quote_private.document(q public.conversation_quotes)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(q)||jsonb_build_object('booking_id',(select b.id from public.bookings b where b.conversation_quote_id=q.id),
    'provider_name',(select coalesce(nullif(p.business_name,''),a.display_name) from public.provider_profiles p join public.profiles a on a.id=p.profile_id where p.profile_id=q.provider_id));
$$;

create function quote_private.record_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous text;
begin
  if tg_op='UPDATE' then previous:=old.status; end if;
  insert into public.conversation_quote_events(quote_id,actor_id,from_status,to_status,version)
  values(new.id,auth.uid(),previous,new.status,new.version);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'quote.'||case when tg_op='INSERT' then 'created' when new.status=previous then 'updated' else new.status end,
    'conversation_quote',new.id,jsonb_build_object('status',new.status,'version',new.version,'total_amount',new.total_amount,'currency',new.currency));
  if tg_op='UPDATE' and new.status is distinct from old.status and new.status in ('accepted','declined','cancelled') then
    insert into public.notifications(profile_id,kind,title,body,data)
    values(case when new.status='cancelled' then new.client_id else new.provider_id end,'quote_'||new.status,
      case new.status when 'accepted' then 'Devis accepté' when 'declined' then 'Devis refusé' else 'Devis annulé' end,
      'Consultez la conversation pour retrouver le devis.',
      jsonb_build_object('conversation_id',new.conversation_id,'quote_id',new.id,'quote_version',new.version,
        'href',case when new.status='cancelled' then '/app/messages?conversation=' else '/pro/messages?conversation=' end||new.conversation_id::text));
  end if;
  return new;
end $$;
create trigger conversation_quotes_recorded after insert or update on public.conversation_quotes
for each row execute function quote_private.record_event();

create function quote_private.expire(target_quote uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.conversation_quotes q set status='expired',version=version+1,updated_at=now()
  where q.id=target_quote and q.status in ('sent','accepted') and q.valid_until<=now()
    and not exists(select 1 from public.bookings b where b.conversation_quote_id=q.id);
end $$;

create function public.list_conversation_quotes(target_conversation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare parties jsonb; q record; result jsonb;
begin
  parties:=messaging_private.conversation_parties(target_conversation_id);
  if not messaging_private.active_account(auth.uid()) or not public.is_conversation_member(target_conversation_id)
    or auth.uid() not in ((parties->>'client_id')::uuid,(parties->>'provider_id')::uuid) then
    raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  for q in select id from public.conversation_quotes where conversation_id=target_conversation_id
    and status in ('sent','accepted') and valid_until<=now() loop perform quote_private.expire(q.id); end loop;
  select coalesce(jsonb_agg(quote_private.document(v) order by v.created_at),'[]') into result
    from public.conversation_quotes v where v.conversation_id=target_conversation_id
    and (v.status<>'draft' or v.provider_id=auth.uid());
  return result;
end $$;

create function public.get_conversation_quote(target_quote_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype;
begin
  select * into q from public.conversation_quotes where id=target_quote_id;
  perform quote_private.require_access(q);
  perform quote_private.expire(q.id);
  select * into q from public.conversation_quotes where id=target_quote_id;
  return quote_private.document(q);
end $$;

create function public.save_conversation_quote(
 target_conversation_id uuid,target_provider_service_id uuid,target_description text,
 target_base_amount integer,target_base_duration_minutes integer,target_valid_until timestamptz,
 target_conditions text default '',target_quote_id uuid default null,target_expected_version integer default null,
 target_client_nonce uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype; s public.provider_services%rowtype; parties jsonb;
 opts jsonb; option_amount integer; option_duration integer; option_ids uuid[]; service_data jsonb;
begin
  parties:=messaging_private.conversation_parties(target_conversation_id);
  if not messaging_private.active_account(auth.uid()) or not public.is_conversation_member(target_conversation_id)
    or auth.uid() is distinct from (parties->>'provider_id')::uuid
    or not messaging_private.active_account((parties->>'client_id')::uuid) then
    raise exception 'Création de devis interdite' using errcode='42501'; end if;
  s:=quote_private.require_service(target_provider_service_id); service_data:=to_jsonb(s);
  if s.provider_id is distinct from auth.uid() then raise exception 'Prestation étrangère' using errcode='42501'; end if;
  if target_base_amount is null or target_base_amount not between 0 and 100000000
    or target_base_duration_minutes is null or target_base_duration_minutes not between 15 and 720
    or target_valid_until is null or target_valid_until<=now() or target_valid_until>now()+interval '90 days'
    or nullif(trim(target_description),'') is null or char_length(target_description)>1000
    or char_length(coalesce(target_conditions,''))>2000 or target_client_nonce is null then
    raise exception 'Devis invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||target_client_nonce::text,8111));
  if target_quote_id is null then
    select * into q from public.conversation_quotes where provider_id=auth.uid() and client_nonce=target_client_nonce;
    if found then
      if q.conversation_id<>target_conversation_id or q.provider_service_id<>target_provider_service_id
        or q.base_amount<>target_base_amount or q.base_duration_minutes<>target_base_duration_minutes
        or q.description<>trim(target_description) or q.conditions<>coalesce(target_conditions,'') or q.valid_until<>target_valid_until then
        raise exception 'Clé de demande déjà utilisée pour un autre devis'; end if;
      return quote_private.document(q);
    end if;
    if (select count(*) from public.conversation_quotes where provider_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then
      raise exception 'Trop de devis, veuillez réessayer plus tard' using errcode='P0001'; end if;
  else
    select * into q from public.conversation_quotes where id=target_quote_id for update;
    perform quote_private.require_access(q,'provider');
    if q.status<>'draft' or q.version is distinct from target_expected_version
      or q.conversation_id<>target_conversation_id then raise exception 'Devis envoyé ou modifié, rechargez la conversation'; end if;
  end if;
  opts:=quote_private.required_options(s.id);
  select coalesce(sum((o->>'price_amount')::integer),0),coalesce(sum((o->>'duration_minutes')::integer),0),
    coalesce(array_agg((o->>'id')::uuid),'{}') into option_amount,option_duration,option_ids from jsonb_array_elements(opts)o;
  if target_base_amount::bigint+option_amount>100000000 or target_base_duration_minutes+option_duration>720 then
    raise exception 'Total ou durée du devis trop élevé'; end if;
  if q.id is null then
    insert into public.conversation_quotes(conversation_id,provider_id,client_id,provider_service_id,service_title,description,conditions,
      base_amount,options_amount,total_amount,currency,base_duration_minutes,duration_minutes,selected_option_ids,option_snapshot,
      location_modes,fixed_travel_fee_amount,valid_until,client_nonce)
    values(target_conversation_id,auth.uid(),(parties->>'client_id')::uuid,s.id,s.title,trim(target_description),coalesce(target_conditions,''),
      target_base_amount,option_amount,target_base_amount+option_amount,s.currency,target_base_duration_minutes,target_base_duration_minutes+option_duration,
      option_ids,opts,case when service_data ? 'location_modes' then array(select jsonb_array_elements_text(service_data->'location_modes')) else array['salon'] end,
      coalesce((service_data->>'travel_fee_amount')::integer,0),target_valid_until,target_client_nonce) returning * into q;
  else
    update public.conversation_quotes set provider_service_id=s.id,service_title=s.title,description=trim(target_description),conditions=coalesce(target_conditions,''),
      base_amount=target_base_amount,options_amount=option_amount,total_amount=target_base_amount+option_amount,currency=s.currency,
      base_duration_minutes=target_base_duration_minutes,duration_minutes=target_base_duration_minutes+option_duration,
      selected_option_ids=option_ids,option_snapshot=opts,location_modes=case when service_data ? 'location_modes' then array(select jsonb_array_elements_text(service_data->'location_modes')) else array['salon'] end,
      fixed_travel_fee_amount=coalesce((service_data->>'travel_fee_amount')::integer,0),valid_until=target_valid_until,version=version+1,updated_at=now()
    where id=q.id returning * into q;
  end if;
  return quote_private.document(q);
end $$;

create function public.send_conversation_quote(target_quote_id uuid,target_expected_version integer,target_client_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype;
begin
  select * into q from public.conversation_quotes where id=target_quote_id for update;
  perform quote_private.require_access(q,'provider');
  perform quote_private.expire(q.id);
  select * into q from public.conversation_quotes where id=target_quote_id;
  if q.status='sent' then return quote_private.document(q); end if;
  if q.status<>'draft' or q.version is distinct from target_expected_version or q.valid_until<=now() or target_client_nonce is null then
    raise exception 'Devis non envoyable ou expiré'; end if;
  perform quote_private.require_service(q.provider_service_id);
  if quote_private.required_options(q.provider_service_id) is distinct from q.option_snapshot then
    raise exception 'Les options obligatoires ont changé, actualisez le brouillon'; end if;
  if not messaging_private.active_account(q.client_id) then raise exception 'Destinataire indisponible'; end if;
  update public.conversation_quotes set status='sent',version=version+1,sent_at=now(),updated_at=now() where id=q.id returning * into q;
  perform set_config('app.message_enriched','true',true);
  insert into public.messages(conversation_id,sender_id,body,message_type,metadata,client_nonce)
  values(q.conversation_id,q.provider_id,'Devis · '||q.service_title,'quote',jsonb_build_object('quote_id',q.id),target_client_nonce);
  return quote_private.document(q);
end $$;

create function public.respond_to_conversation_quote(target_quote_id uuid,target_decision text,target_expected_version integer,target_client_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype; decision text;
begin
  if target_decision not in ('accept','decline') or target_client_nonce is null then raise exception 'Décision invalide'; end if;
  decision:=case target_decision when 'accept' then 'accepted' else 'declined' end;
  select * into q from public.conversation_quotes where id=target_quote_id for update;
  perform quote_private.require_access(q,'client');
  perform quote_private.expire(q.id);
  select * into q from public.conversation_quotes where id=target_quote_id;
  if q.status='expired' then return quote_private.document(q); end if;
  if q.status=decision then return quote_private.document(q); end if;
  if q.status<>'sent' or q.version is distinct from target_expected_version then raise exception 'Devis déjà traité ou modifié'; end if;
  if q.valid_until<=now() then
    perform quote_private.expire(q.id);
    select * into q from public.conversation_quotes where id=q.id;
    return quote_private.document(q);
  end if;
  perform quote_private.require_service(q.provider_service_id);
  update public.conversation_quotes set status=decision,version=version+1,decided_at=now(),updated_at=now() where id=q.id returning * into q;
  return quote_private.document(q);
end $$;

create function public.cancel_conversation_quote(target_quote_id uuid,target_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype;
begin
  select * into q from public.conversation_quotes where id=target_quote_id for update;
  perform quote_private.require_access(q,'provider');
  if q.status='cancelled' then return quote_private.document(q); end if;
  if q.status not in ('draft','sent','accepted') or q.version is distinct from target_expected_version
    or exists(select 1 from public.bookings b where b.conversation_quote_id=q.id) then
    raise exception 'Devis déjà traité ou réservé'; end if;
  update public.conversation_quotes set status='cancelled',version=version+1,updated_at=now() where id=q.id returning * into q;
  return quote_private.document(q);
end $$;

-- Reuse the independent availability engine with an explicit, server-owned
-- duration. The existing catalogue RPC remains byte-for-byte unchanged.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('booking_private.independent_slots(uuid,uuid,date,integer)'::regprocedure);
  if position('ps.duration_minutes' in definition)=0 then raise exception 'Moteur de disponibilités inattendu'; end if;
  definition:=replace(definition,'FUNCTION booking_private.independent_slots(', 'FUNCTION quote_private.independent_slots(');
  definition:=replace(definition,'target_provider_service_id uuid, from_date','target_provider_service_id uuid, target_duration integer, from_date');
  definition:=replace(definition,'ps.duration_minutes','target_duration as duration_minutes');
  definition:=replace(definition,'tstzrange(booking.starts_at, booking.ends_at, ''[)'')',
    'tstzrange(booking.starts_at, coalesce(booking.resource_busy_until,booking.ends_at), ''[)'')');
  execute definition;
end $$;

create function quote_private.slots(q public.conversation_quotes,target_day date)
returns table(slot_start timestamptz,collaborator_id uuid,display_name text,title text,avatar_url text,specialties text[])
language plpgsql stable security definer set search_path='' as $$
declare s public.provider_services%rowtype; enabled boolean;
begin
  s:=quote_private.require_service(q.provider_service_id);
  select b.team_booking_enabled into enabled from public.businesses b where b.id=s.business_id;
  if coalesce(enabled,false) then
    return query select distinct candidate.starts,c.id,c.display_name,c.title,c.avatar_url,c.specialties
    from public.collaborators c join public.collaborator_services cs on cs.collaborator_id=c.id and cs.provider_service_id=s.id
    cross join lateral booking_private.employee_windows(c.id,target_day) w
    cross join lateral generate_series(w.window_start,w.window_end-make_interval(mins=>q.duration_minutes+c.buffer_minutes),make_interval(mins=>w.interval_minutes)) candidate(starts)
    where booking_private.can_assign(s.id,c.id,candidate.starts,candidate.starts+make_interval(mins=>q.duration_minutes))
    order by candidate.starts,c.id limit 4000;
  else
    return query select i.slot_start,null::uuid,null::text,null::text,null::text,'{}'::text[]
      from quote_private.independent_slots(s.provider_id,s.id,q.duration_minutes,target_day,1)i;
  end if;
end $$;

create function public.get_conversation_quote_availability(target_quote_id uuid,target_day date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype; enabled boolean; slots jsonb;
begin
  select * into q from public.conversation_quotes where id=target_quote_id;
  perform quote_private.require_access(q);
  perform quote_private.expire(q.id);
  select * into q from public.conversation_quotes where id=target_quote_id;
  if q.status<>'accepted' or q.valid_until<=now() or target_day<current_date or target_day>current_date+365 then
    return jsonb_build_object('quote',quote_private.document(q),'teamEnabled',false,'slots','[]'::jsonb); end if;
  select b.team_booking_enabled into enabled from public.provider_services s join public.businesses b on b.id=s.business_id where s.id=q.provider_service_id;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into slots from quote_private.slots(q,target_day)s;
  return jsonb_build_object('quote',quote_private.document(q),'teamEnabled',coalesce(enabled,false),'slots',slots);
end $$;

-- Returns canonical persisted fields, including validated home-travel fees.
create function quote_private.prepare_booking(candidate public.bookings) returns public.bookings
language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype; s public.provider_services%rowtype;
  provider_location public.provider_profiles%rowtype; business_location public.businesses%rowtype;
  sd jsonb; pl jsonb; bl jsonb; canonical jsonb; modes text[];
  origin_lat double precision; origin_lng double precision; max_radius numeric; free_radius numeric;
  fee_per_km integer; distance double precision; distance_fee integer:=0; fixed_fee integer:=0;
begin
  select * into q from public.conversation_quotes where id=candidate.conversation_quote_id for update;
  perform quote_private.require_access(q,'client');
  if q.status<>'accepted' or q.valid_until<=now() then raise exception 'Devis non accepté ou expiré'; end if;
  if exists(select 1 from public.bookings b where b.conversation_quote_id=q.id) then raise exception 'Devis déjà réservé' using errcode='23505'; end if;
  perform 1 from public.provider_services where id=q.provider_service_id for share;
  s:=quote_private.require_service(q.provider_service_id); sd:=to_jsonb(s);
  if s.provider_id is distinct from q.provider_id or s.currency is distinct from q.currency then raise exception 'Professionnel ou devise du devis modifié'; end if;
  if candidate.provider_service_id is distinct from q.provider_service_id or candidate.client_id is distinct from q.client_id then
    raise exception 'Référence contractuelle invalide' using errcode='42501'; end if;
  if candidate.starts_at is null or candidate.starts_at<=now() or candidate.starts_at>now()+interval '1 year' then raise exception 'Date de réservation invalide'; end if;
  if (to_jsonb(candidate)->>'promotion_id') is not null then raise exception 'Une promotion ne se cumule pas avec un devis'; end if;
  if quote_private.required_options(s.id) is distinct from q.option_snapshot then
    raise exception 'Les options obligatoires ont changé. Demandez un nouveau devis.'; end if;
  if not exists(select 1 from quote_private.slots(q,(candidate.starts_at at time zone 'Africa/Dakar')::date) sl
    where sl.slot_start=candidate.starts_at and (candidate.collaborator_id is null or sl.collaborator_id=candidate.collaborator_id)) then
    raise exception 'Créneau indisponible' using errcode='23P01'; end if;
  modes:=case when sd ? 'location_modes' then array(select jsonb_array_elements_text(sd->'location_modes')) else array['salon'] end;
  if candidate.location_mode is null or candidate.location_mode not in ('salon','client_address')
    or not candidate.location_mode=any(modes) or not candidate.location_mode=any(q.location_modes) then raise exception 'Lieu indisponible'; end if;
  select * into provider_location from public.provider_profiles where profile_id=q.provider_id;
  if s.business_id is not null then select * into business_location from public.businesses where id=s.business_id; end if;
  pl:=to_jsonb(provider_location); bl:=to_jsonb(business_location);
  origin_lat:=coalesce((bl->>'latitude')::double precision,(pl->>'latitude')::double precision);
  origin_lng:=coalesce((bl->>'longitude')::double precision,(pl->>'longitude')::double precision);
  canonical:=jsonb_build_object('client_id',q.client_id,'provider_id',q.provider_id,'business_id',s.business_id,
    'provider_service_id',q.provider_service_id,'ends_at',candidate.starts_at+make_interval(mins=>q.duration_minutes),
    'base_amount',q.base_amount,'options_amount',q.options_amount,'discount_amount',0,
    'deposit_amount',least(coalesce((sd->>'deposit_amount')::integer,0),q.total_amount),
    'total_amount',q.total_amount,'currency',q.currency,'status','pending','selected_option_ids',to_jsonb(q.selected_option_ids),'promotion_id',null,
    'conversation_id',q.conversation_id);
  if candidate.location_mode='client_address' then
    if nullif(trim(candidate.appointment_address),'') is null
      or nullif(to_jsonb(candidate)->>'appointment_latitude','') is null or nullif(to_jsonb(candidate)->>'appointment_longitude','') is null then raise exception 'Adresse géolocalisée requise'; end if;
    if (to_jsonb(candidate)->>'appointment_latitude')::double precision not between -90 and 90
      or (to_jsonb(candidate)->>'appointment_longitude')::double precision not between -180 and 180 then raise exception 'Coordonnées client invalides'; end if;
    if origin_lat is null or origin_lng is null then raise exception 'Localisation professionnelle indisponible'; end if;
    max_radius:=coalesce((sd->>'home_service_radius_km')::numeric,(bl->>'service_radius_km')::numeric,(pl->>'travel_radius_km')::numeric,0);
    if max_radius<=0 then raise exception 'Prestation à domicile indisponible'; end if;
    distance:=public.distance_km(origin_lat,origin_lng,(to_jsonb(candidate)->>'appointment_latitude')::double precision,(to_jsonb(candidate)->>'appointment_longitude')::double precision);
    if distance>max_radius then raise exception 'Adresse hors rayon de déplacement'; end if;
    free_radius:=coalesce((sd->>'free_travel_radius_km')::numeric,(bl->>'free_travel_radius_km')::numeric,(pl->>'free_travel_radius_km')::numeric,0);
    fee_per_km:=coalesce((sd->>'travel_fee_per_km_amount')::integer,(bl->>'travel_fee_per_km_amount')::integer,(pl->>'travel_fee_per_km_amount')::integer,0);
    distance_fee:=(ceil(greatest(0,distance-free_radius))*fee_per_km)::integer;
    fixed_fee:=q.fixed_travel_fee_amount;
    canonical:=canonical||jsonb_build_object('travel_distance_km',round(distance::numeric,2),'distance_travel_fee_amount',distance_fee,
      'base_amount',q.base_amount+fixed_fee,'total_amount',q.total_amount+fixed_fee+distance_fee);
  else
    canonical:=canonical||jsonb_build_object('appointment_address',coalesce(bl->>'address',pl->>'base_address'),
      'appointment_latitude',origin_lat,'appointment_longitude',origin_lng,'appointment_place_id',coalesce(bl->>'location_place_id',pl->>'location_place_id'),
      'travel_distance_km',null,'distance_travel_fee_amount',0);
  end if;
  return jsonb_populate_record(candidate,canonical);
end $$;

-- Only the new quote branch is injected; ordinary service bookings retain the
-- exact current catalogue, options, promotion and geographic contract.
do $$ declare definition text; marker text:='begin'; location integer; begin
  definition:=pg_get_functiondef('public.enforce_booking_contract()'::regprocedure);
  location:=position(marker in definition);
  if location=0 or position('conversation_quote_id' in definition)>0 then raise exception 'Contrat réservation inattendu'; end if;
  definition:=overlay(definition placing E'begin\n  if new.conversation_quote_id is not null then return quote_private.prepare_booking(new); end if;' from location for length(marker));
  execute definition;
end $$;

create function quote_private.protect_reference() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.conversation_quote_id is distinct from old.conversation_quote_id then raise exception 'Référence de devis immuable'; end if;
  return new;
end $$;
create trigger bookings_quote_reference_immutable before update of conversation_quote_id on public.bookings
for each row execute function quote_private.protect_reference();

create function public.preview_conversation_quote_booking(target_quote_id uuid,target_starts_at timestamptz,
 target_collaborator_id uuid default null,target_location_mode text default 'salon',
 target_address text default null,target_latitude double precision default null,target_longitude double precision default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype; candidate public.bookings%rowtype;
begin
  select * into q from public.conversation_quotes where id=target_quote_id;
  perform quote_private.require_access(q,'client');
  candidate:=jsonb_populate_record(null::public.bookings,jsonb_build_object('client_id',q.client_id,'provider_id',q.provider_id,
    'provider_service_id',q.provider_service_id,'starts_at',target_starts_at,'location_mode',target_location_mode,
    'appointment_address',target_address,'appointment_latitude',target_latitude,'appointment_longitude',target_longitude,
    'collaborator_id',target_collaborator_id,'conversation_quote_id',q.id));
  candidate:=quote_private.prepare_booking(candidate);
  return jsonb_build_object('quote',quote_private.document(q),'booking',to_jsonb(candidate),'payment_status','not_initiated');
end $$;

create function public.book_conversation_quote(target_quote_id uuid,target_starts_at timestamptz,
 target_collaborator_id uuid default null,target_location_mode text default 'salon',
 target_address text default null,target_latitude double precision default null,target_longitude double precision default null,
 target_client_nonce uuid default null,target_expected_total integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.conversation_quotes%rowtype; b public.bookings%rowtype; candidate public.bookings%rowtype; payload jsonb; columns_sql text; values_sql text;
begin
  select * into q from public.conversation_quotes where id=target_quote_id;
  perform quote_private.require_access(q,'client');
  if target_client_nonce is null then raise exception 'Clé de demande requise'; end if;
  perform pg_advisory_xact_lock(hashtextextended(q.provider_id::text,8108));
  select * into q from public.conversation_quotes where id=target_quote_id for update;
  select * into b from public.bookings where conversation_quote_id=q.id;
  if found then return jsonb_build_object('booking',to_jsonb(b),'quote',quote_private.document(q),'idempotent',true,'payment_status','not_initiated'); end if;
  payload:=jsonb_build_object('id',gen_random_uuid(),'client_id',q.client_id,'provider_id',q.provider_id,'provider_service_id',q.provider_service_id,
    'starts_at',target_starts_at,'ends_at',target_starts_at+make_interval(mins=>q.duration_minutes),'status','pending','location_mode',target_location_mode,
    'appointment_address',target_address,'appointment_latitude',target_latitude,'appointment_longitude',target_longitude,
    'total_amount',0,'currency',q.currency,'collaborator_id',target_collaborator_id,'conversation_quote_id',q.id);
  candidate:=jsonb_populate_record(null::public.bookings,payload);
  candidate:=quote_private.prepare_booking(candidate);
  if target_expected_total is distinct from candidate.total_amount then
    raise exception 'Le récapitulatif a changé. Vérifiez le montant avant de confirmer.'; end if;
  payload:=payload||jsonb_build_object('conversation_id',q.conversation_id);
  -- Schema-derived identifiers only; all values remain bound JSON parameters.
  -- Omitting absent optional columns supports older isolated QA schemas while
  -- preserving latitude/longitude and every default on production bookings.
  select string_agg(format('%I',key),',' order by key),string_agg(format('x.%I',key),',' order by key)
  into columns_sql,values_sql from jsonb_object_keys(payload) key join pg_attribute a
    on a.attrelid='public.bookings'::regclass and a.attname=key and a.attnum>0 and not a.attisdropped;
  execute format('insert into public.bookings (%s) select %s from jsonb_populate_record(null::public.bookings,$1) x returning *',columns_sql,values_sql)
    into b using payload;
  if b.total_amount is distinct from target_expected_total then
    raise exception 'Le récapitulatif a changé. Vérifiez le montant avant de confirmer.'; end if;
  return jsonb_build_object('booking',to_jsonb(b),'quote',quote_private.document(q),'idempotent',false,'payment_status','not_initiated');
end $$;

-- An enriched flag alone is not authorization: the card must reference this
-- sender's sent document in this exact conversation, and may appear only once.
create function quote_private.validate_message_reference() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.message_type='quote' and not exists(select 1 from public.conversation_quotes q
    where q.id::text=new.metadata->>'quote_id' and q.conversation_id=new.conversation_id
      and q.provider_id=new.sender_id and auth.uid()=q.provider_id and q.status='sent'
      and messaging_private.active_account(auth.uid())) then
    raise exception 'Référence de devis interdite' using errcode='42501'; end if;
  return new;
end $$;
create trigger messages_validate_quote before insert on public.messages
for each row execute function quote_private.validate_message_reference();
create unique index messages_quote_card_unique_idx on public.messages((metadata->>'quote_id')) where message_type='quote';

-- Keep assigned staff in the same pre-booking thread instead of creating a
-- second thread when a quote becomes an appointment.
do $$ declare definition text; begin
  if to_regprocedure('public.sync_booking_staff_conversation_member()') is null then
    -- Older isolated QA has no assigned-staff synchronization trigger. Do not
    -- invent it here; production keeps its existing trigger and exact contract.
    return;
  end if;
  definition:=pg_get_functiondef('public.sync_booking_staff_conversation_member()'::regprocedure);
  if position('select id into target_conversation from public.conversations where booking_id=new.id;' in definition)=0 then
    raise exception 'Synchronisation des participants inattendue'; end if;
  definition:=replace(definition,'select id into target_conversation from public.conversations where booking_id=new.id;',
    'select coalesce(new.conversation_id,(select id from public.conversations where booking_id=new.id)) into target_conversation;');
  execute definition;
end $$;

revoke all on all functions in schema quote_private from public,anon,authenticated;
revoke all on function public.list_conversation_quotes(uuid),public.get_conversation_quote(uuid),
 public.save_conversation_quote(uuid,uuid,text,integer,integer,timestamptz,text,uuid,integer,uuid),
 public.send_conversation_quote(uuid,integer,uuid),public.respond_to_conversation_quote(uuid,text,integer,uuid),
 public.cancel_conversation_quote(uuid,integer),public.get_conversation_quote_availability(uuid,date),
 public.preview_conversation_quote_booking(uuid,timestamptz,uuid,text,text,double precision,double precision),
 public.book_conversation_quote(uuid,timestamptz,uuid,text,text,double precision,double precision,uuid,integer) from public,anon;
grant execute on function public.list_conversation_quotes(uuid),public.get_conversation_quote(uuid),
 public.save_conversation_quote(uuid,uuid,text,integer,integer,timestamptz,text,uuid,integer,uuid),
 public.send_conversation_quote(uuid,integer,uuid),public.respond_to_conversation_quote(uuid,text,integer,uuid),
 public.cancel_conversation_quote(uuid,integer),public.get_conversation_quote_availability(uuid,date),
 public.preview_conversation_quote_booking(uuid,timestamptz,uuid,text,text,double precision,double precision),
 public.book_conversation_quote(uuid,timestamptz,uuid,text,text,double precision,double precision,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;

