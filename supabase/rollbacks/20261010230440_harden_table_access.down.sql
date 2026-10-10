-- Rollback for 20261010230440_harden_table_access.sql.
-- Restores the privileges, default privileges and policies that existed before it.
-- Not a migration: run manually (e.g. supabase db query --linked --file ...) only if needed,
-- then remove the version from the migration history with `supabase migration repair --status reverted 20261010230440`.

grant all on table public.check_ins, public.user_settings, public.cl_history, public.threshold_data to anon;
grant truncate, references, trigger on table public.check_ins, public.user_settings, public.cl_history, public.threshold_data to authenticated;

alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon;

alter policy "Users can view own check_ins" on public.check_ins to public using (auth.uid() = user_id);
alter policy "Users can insert own check_ins" on public.check_ins to public with check (auth.uid() = user_id);
alter policy "Users can update own check_ins" on public.check_ins to public using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter policy "Users can delete own check_ins" on public.check_ins to public using (auth.uid() = user_id);

alter policy "Users can view own settings" on public.user_settings to public using (auth.uid() = user_id);
alter policy "Users can insert own settings" on public.user_settings to public with check (auth.uid() = user_id);
alter policy "Users can update own settings" on public.user_settings to public using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter policy "Users can delete own settings" on public.user_settings to public using (auth.uid() = user_id);

alter policy "Users can view own cl_history" on public.cl_history to public using (auth.uid() = user_id);
alter policy "Users can insert own cl_history" on public.cl_history to public with check (auth.uid() = user_id);
alter policy "Users can update own cl_history" on public.cl_history to public using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter policy "Users can delete own cl_history" on public.cl_history to public using (auth.uid() = user_id);

alter policy "Users can view own threshold_data" on public.threshold_data to public using (auth.uid() = user_id);
alter policy "Users can insert own threshold_data" on public.threshold_data to public with check (auth.uid() = user_id);
alter policy "Users can update own threshold_data" on public.threshold_data to public using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter policy "Users can delete own threshold_data" on public.threshold_data to public using (auth.uid() = user_id);
