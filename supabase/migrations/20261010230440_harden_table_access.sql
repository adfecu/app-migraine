-- ============================================================================
-- Harden table access (implementation plan, Phase 1)
-- ============================================================================
-- The app reads and writes these tables only for a signed-in user, so:
--   * anon loses all table privileges;
--   * authenticated keeps SELECT/INSERT/UPDATE/DELETE but loses TRUNCATE,
--     REFERENCES and TRIGGER, which no client needs;
--   * future tables and sequences created by postgres in public no
--     longer grant those privileges by default;
--   * the 16 ownership policies apply to authenticated only and evaluate
--     auth.uid() once per statement instead of once per row.
-- Ownership rules are unchanged. Rollback: supabase/rollbacks/20261010230440_harden_table_access.down.sql
-- ============================================================================

-- Table privileges
revoke all on table public.check_ins, public.user_settings, public.cl_history, public.threshold_data from anon;
revoke truncate, references, trigger on table public.check_ins, public.user_settings, public.cl_history, public.threshold_data from authenticated;

-- Defaults for objects created later by postgres (the role migrations run as)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- Policies: check_ins
alter policy "Users can view own check_ins" on public.check_ins
  to authenticated
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own check_ins" on public.check_ins
  to authenticated
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own check_ins" on public.check_ins
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own check_ins" on public.check_ins
  to authenticated
  using ((select auth.uid()) = user_id);

-- Policies: user_settings
alter policy "Users can view own settings" on public.user_settings
  to authenticated
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own settings" on public.user_settings
  to authenticated
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own settings" on public.user_settings
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own settings" on public.user_settings
  to authenticated
  using ((select auth.uid()) = user_id);

-- Policies: cl_history
alter policy "Users can view own cl_history" on public.cl_history
  to authenticated
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own cl_history" on public.cl_history
  to authenticated
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own cl_history" on public.cl_history
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own cl_history" on public.cl_history
  to authenticated
  using ((select auth.uid()) = user_id);

-- Policies: threshold_data
alter policy "Users can view own threshold_data" on public.threshold_data
  to authenticated
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own threshold_data" on public.threshold_data
  to authenticated
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own threshold_data" on public.threshold_data
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own threshold_data" on public.threshold_data
  to authenticated
  using ((select auth.uid()) = user_id);
