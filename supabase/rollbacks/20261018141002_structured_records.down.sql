-- Rollback of 20261018141002_structured_records. Drops the new records and the
-- conversion trigger; check_ins, cl_history and threshold_data are untouched.
-- Records saved through the new functions are lost, so take a backup first.
drop trigger if exists sync_legacy_check_in on public.check_ins;
drop function if exists
  public.save_daily_checkin(uuid, date, text, integer, jsonb),
  public.start_episode(uuid, timestamptz, text, text, text, integer, jsonb),
  public.end_episode(uuid, timestamptz),
  public.update_episode(uuid, timestamptz, text, jsonb),
  public.delete_daily_checkin(uuid),
  public.delete_episode(uuid);
drop table if exists public.daily_checkins, public.episodes;
drop schema if exists private cascade;
delete from supabase_migrations.schema_migrations where version = '20261018141002';
