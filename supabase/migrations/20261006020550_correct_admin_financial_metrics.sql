-- Exclude simulation from financial KPIs and include reports under review.
create or replace function public.get_admin_dashboard()
returns jsonb language sql stable security definer set search_path = ''
as $$

  select case when not public.has_admin_permission('users.read') then null else jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_today', (select count(*) from public.profiles where created_at >= current_date),
    'users_week', (select count(*) from public.profiles where created_at >= date_trunc('week', now())),
    'clients_active', (select count(*) from public.profiles where role = 'client' and not is_suspended),
    'providers_active', (select count(*) from public.provider_profiles where status = 'approved'),
    'providers_pending', (select count(*) from public.provider_profiles where status = 'pending_review'),
    'salons_active', (select count(*) from public.businesses where status = 'approved'),
    'bookings_today', (select count(*) from public.bookings where starts_at >= current_date and starts_at < current_date + interval '1 day'),
    'bookings_week', (select count(*) from public.bookings where starts_at >= date_trunc('week', now()) and starts_at < date_trunc('week', now()) + interval '7 days'),
    'bookings_confirmed', (select count(*) from public.bookings where status = 'confirmed'),
    'bookings_cancelled', (select count(*) from public.bookings where status in ('cancelled_by_client','cancelled_by_provider')),
    'gross_revenue', (select coalesce(sum(amount),0) from public.payments where not is_test and provider <> 'mock' and payment_status in ('paid_on_site','paid','held','available','payout_pending','paid_out')),
    'commissions', (select coalesce(sum(c.amount),0) from public.platform_commissions c join public.payments p on p.id=c.payment_id where not p.is_test and p.provider <> 'mock' and p.payment_status in ('paid_on_site','paid','held','available','payout_pending','paid_out')),
    'payments_pending', (select count(*) from public.payments where payment_status = 'pending'),
    'payouts_pending', (select count(*) from public.payouts where status in ('pending','processing')),
    'disputes_open', (select count(*) from public.disputes where status in ('open','investigating')),
    'reports_open', (select count(*) from public.reports where status in ('open','investigating','reviewing')),
    'tickets_open', (select count(*) from public.support_tickets where status in ('open','pending')),
    'average_order', (select coalesce(round(avg(total_amount)),0) from public.bookings)
  ) end;

$$;
