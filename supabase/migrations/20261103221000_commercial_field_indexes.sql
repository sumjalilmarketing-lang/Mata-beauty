begin;
set local lock_timeout='5s';
create index commercial_appointments_lead on public.commercial_appointments(lead_id)where lead_id is not null;
create index commercial_field_lead on public.commercial_field_events(lead_id)where lead_id is not null;
create index commercial_field_recorded_by on public.commercial_field_events(recorded_by);
create index commercial_reports_acknowledged_by on public.commercial_reports(acknowledged_by)where acknowledged_by is not null;
commit;
