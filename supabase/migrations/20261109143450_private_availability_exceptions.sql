begin;
set local lock_timeout='5s';

-- Confirmed in production metadata on 2026-11-09: this permissive SELECT
-- policy exposed raw absence intervals and their free-text reason to PUBLIC.
-- Public users need free slots, not a professional's private absence record.
-- Preserve the existing owner ALL policy (provider_id=auth.uid()), its write
-- checks, and table grants. Do not introduce an administrative access grant.
-- SECURITY DEFINER slot RPCs still inspect exceptions internally and return
-- only the public free-slot response; their definitions and ACLs are unchanged.
drop policy if exists "exceptions public read" on public.availability_exceptions;

notify pgrst,'reload schema';
commit;
