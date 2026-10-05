-- Request headers contain the worker credential. pg_net's queue and response
-- tables must never be readable or mutable by application roles.
revoke all on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all sequences in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
