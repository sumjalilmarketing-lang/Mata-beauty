-- Dashboard access follows the existing UI: operational totals require all
-- contributing scopes. Restricted social metrics are null, never a false zero.
create or replace function public.get_admin_dashboard()
returns jsonb language sql stable security definer set search_path = '' as $$
select case when not (
  public.has_admin_permission('users.read')
  and public.has_admin_permission('payments.read')
  and public.has_admin_permission('bookings.read')
  and public.has_admin_permission('reports.manage')
  and public.has_admin_permission('support.manage')
) then null else jsonb_build_object(
 'users_total',(select count(*) from public.profiles),
 'users_today',(select count(*) from public.profiles where created_at>=current_date),
 'users_week',(select count(*) from public.profiles where created_at>=date_trunc('week',now())),
 'clients_active',(select count(*) from public.profiles where role='client' and not is_suspended),
 'providers_active',(select count(*) from public.provider_profiles where status='approved'),
 'providers_pending',(select count(*) from public.provider_profiles where status='pending_review'),
 'salons_active',(select count(*) from public.businesses where status='approved'),
 'bookings_today',(select count(*) from public.bookings where starts_at>=current_date and starts_at<current_date+interval '1 day'),
 'bookings_week',(select count(*) from public.bookings where starts_at>=date_trunc('week',now()) and starts_at<date_trunc('week',now())+interval '7 days'),
 'bookings_confirmed',(select count(*) from public.bookings where status='confirmed'),
 'bookings_cancelled',(select count(*) from public.bookings where status in ('cancelled_by_client','cancelled_by_provider')),
 'gross_revenue',(select coalesce(sum(amount),0) from public.payments where not is_test and provider<>'mock' and payment_status in ('paid_on_site','paid','held','available','payout_pending','paid_out')),
 'commissions',(select coalesce(sum(c.amount),0) from public.platform_commissions c join public.payments p on p.id=c.payment_id where not p.is_test and p.provider<>'mock' and p.payment_status in ('paid_on_site','paid','held','available','payout_pending','paid_out')),
 'payments_pending',(select count(*) from public.payments where payment_status='pending'),
 'payouts_pending',(select count(*) from public.payouts where status in ('pending','processing')),
 'disputes_open',(select count(*) from public.disputes where status in ('open','investigating')),
 'reports_open',(select count(*) from public.reports where status in ('open','investigating','reviewing')),
 'tickets_open',(select count(*) from public.support_tickets where status in ('open','pending')),
 'average_order',(select coalesce(round(avg(total_amount)),0) from public.bookings)
) end;
$$;

create or replace function public.get_social_admin_dashboard()
returns jsonb language sql stable security definer set search_path = '' as $$
select case when public.has_admin_permission('content.manage') or public.has_admin_permission('reports.manage') then jsonb_build_object(
 'posts_today',(select count(*) from public.posts where created_at>=current_date),
 'published',(select count(*) from public.posts where status='published'),
 'pending',(select count(*) from public.posts where status in ('draft','scheduled')),
 'reported',(select count(distinct post_id) from public.reports where post_id is not null and status in ('open','reviewing')),
 'views',(select coalesce(sum(view_count),0) from public.posts),
 'likes',(select coalesce(sum(like_count),0) from public.posts),
 'comments',(select coalesce(sum(comment_count),0) from public.posts),
 'shares',(select coalesce(sum(share_count),0) from public.posts),
 'booking_clicks',(select count(*) from public.post_booking_clicks),
 'bookings',case when public.has_admin_permission('bookings.read') then (select count(*) from public.bookings where source_post_id is not null) else null end,
 'gross_amount',case when public.has_admin_permission('payments.read') then (select coalesce(sum(total_amount),0) from public.bookings where source_post_id is not null and status not in ('declined','cancelled_by_client','cancelled_by_provider')) else null end
) else '{}'::jsonb end;
$$;
