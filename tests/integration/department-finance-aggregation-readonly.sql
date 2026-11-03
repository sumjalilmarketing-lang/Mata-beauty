-- Read-only SQL regression: no role grants, no fixtures persisted, no emails.
with fixture_values(currency,is_test,provider,payment_status,amount,refunded_amount,previously_paid) as (
  select 'XOF',true,'mock','simulated_paid',100,0,false from generate_series(1,151)
  union all values
    ('EUR',false,'paydunya','held',200,0,true),
    ('EUR',false,'paydunya','pending',50,0,false),
    ('EUR',false,'paydunya','failed',99,0,false),
    ('EUR',false,'paydunya','refunded',100,100,true),
    ('EUR',false,'paydunya','disputed',70,0,false),
    ('EUR',false,'paydunya','disputed',80,0,true),
    ('XOF',false,'paydunya','paid_on_site',1000,0,true),
    ('USD',false,'mock','held',500,0,true),
    ('GBP',false,'paydunya','simulated_paid',25,0,true)
), fixtures as (
  select currency,is_test,provider,payment_status::public.payment_status,amount,amount as gross_amount,
    refunded_amount,10 as platform_fee,amount-10 as professional_net_amount,now() as created_at,
    case when previously_paid then now() else null end as paid_at,null::timestamptz as confirmed_at
  from fixture_values
), actual(currency,test_mode,payment_count,online_collected,on_site_collected,refunds_recorded,commissions_recorded,professional_net_recorded,pending_amount) as (
with scoped as (
    select p.*,
      (p.is_test or p.provider='mock' or p.payment_status='simulated_paid') as simulation,
      (p.payment_status in ('simulated_paid','paid','held','available','payout_pending','paid_out','partially_refunded','refunded')
        or (p.payment_status='disputed' and (p.paid_at is not null or p.confirmed_at is not null))) as collected
    from fixtures p
    where (null::timestamptz is null or p.created_at>=null::timestamptz) and (null::timestamptz is null or p.created_at<null::timestamptz)
  )
  select trim(p.currency)::text,p.simulation,count(*),
    coalesce(sum(coalesce(p.gross_amount,p.amount)) filter(where p.collected),0)::bigint,
    coalesce(sum(coalesce(p.gross_amount,p.amount)) filter(where p.payment_status='paid_on_site'),0)::bigint,
    coalesce(sum(p.refunded_amount),0)::bigint,
    coalesce(sum(p.platform_fee) filter(where p.collected or p.payment_status='paid_on_site'),0)::bigint,
    coalesce(sum(p.professional_net_amount) filter(where p.collected or p.payment_status='paid_on_site'),0)::bigint,
    coalesce(sum(coalesce(p.gross_amount,p.amount)) filter(where p.payment_status in ('pending','authorized')),0)::bigint
  from scoped p group by trim(p.currency),p.simulation order by trim(p.currency),p.simulation
)
select
  (select payment_count=151 and online_collected=15100 from actual where currency='XOF' and test_mode) as totals_not_limited_to_100_rows,
  (select payment_count=6 and online_collected=380 and pending_amount=50 and refunds_recorded=100 from actual where currency='EUR' and not test_mode) as real_status_and_refund_totals,
  (select online_collected=0 and on_site_collected=1000 from actual where currency='XOF' and not test_mode) as cash_separate_from_online,
  (select online_collected=500 from actual where currency='USD' and test_mode) as mock_provider_stays_test,
  (select online_collected=25 from actual where currency='GBP' and test_mode) as simulated_status_stays_test,
  (select count(*)=5 from actual) as currencies_and_modes_separate;
