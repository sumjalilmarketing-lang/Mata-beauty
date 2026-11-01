-- Réconciliation d'instances dont l'historique contient la migration workflow
-- mais dont l'enum n'a pas reçu toutes les valeurs attendues.
alter type public.payment_status add value if not exists 'authorized';
alter type public.payment_status add value if not exists 'paid';
alter type public.payment_status add value if not exists 'cancelled';
