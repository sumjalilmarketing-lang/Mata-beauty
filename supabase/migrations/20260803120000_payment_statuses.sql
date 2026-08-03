-- Les valeurs enum sont livrées séparément : PostgreSQL exige leur validation
-- avant qu'une migration suivante puisse les utiliser dans un index.
alter type public.payment_status add value if not exists 'held';
alter type public.payment_status add value if not exists 'available';
alter type public.payment_status add value if not exists 'payout_pending';
alter type public.payment_status add value if not exists 'paid_out';
alter type public.payment_status add value if not exists 'partially_refunded';
alter type public.payment_status add value if not exists 'disputed';
