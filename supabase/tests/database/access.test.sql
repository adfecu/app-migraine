-- Access control for the app tables: grants, policy roles, ownership, and defaults.
-- Run with `supabase test db`. Everything happens in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- Two users with data, inserted as postgres (bypasses RLS)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.test');
insert into public.check_ins (user_id, date, type, answers, questions) values
  ('11111111-1111-4111-8111-111111111111', now(), 'checkin', '[false]', '{q}'),
  ('11111111-1111-4111-8111-111111111111', now(), 'crisis', '[5]', '{q}'),
  ('22222222-2222-4222-8222-222222222222', now(), 'checkin', '[true]', '{q}');
insert into public.user_settings (user_id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.cl_history (user_id, date, cl_value) values ('11111111-1111-4111-8111-111111111111', current_date, 1), ('22222222-2222-4222-8222-222222222222', current_date, 2);
insert into public.threshold_data (user_id, cl_value) values ('11111111-1111-4111-8111-111111111111', 1), ('22222222-2222-4222-8222-222222222222', 2);

-- Grants and policy roles
select table_privs_are('public', 'check_ins', 'anon', array[]::text[], 'anon has no privileges on check_ins');
select table_privs_are('public', 'check_ins', 'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has only CRUD on check_ins');
select table_privs_are('public', 'user_settings', 'anon', array[]::text[], 'anon has no privileges on user_settings');
select table_privs_are('public', 'user_settings', 'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has only CRUD on user_settings');
select table_privs_are('public', 'cl_history', 'anon', array[]::text[], 'anon has no privileges on cl_history');
select table_privs_are('public', 'cl_history', 'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has only CRUD on cl_history');
select table_privs_are('public', 'threshold_data', 'anon', array[]::text[], 'anon has no privileges on threshold_data');
select table_privs_are('public', 'threshold_data', 'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated has only CRUD on threshold_data');
select policy_roles_are('public', 'check_ins', 'Users can view own check_ins', array['authenticated'], 'check_ins: view policy applies to authenticated only');
select policy_roles_are('public', 'check_ins', 'Users can insert own check_ins', array['authenticated'], 'check_ins: insert policy applies to authenticated only');
select policy_roles_are('public', 'check_ins', 'Users can update own check_ins', array['authenticated'], 'check_ins: update policy applies to authenticated only');
select policy_roles_are('public', 'check_ins', 'Users can delete own check_ins', array['authenticated'], 'check_ins: delete policy applies to authenticated only');
select policy_roles_are('public', 'user_settings', 'Users can view own settings', array['authenticated'], 'user_settings: view policy applies to authenticated only');
select policy_roles_are('public', 'user_settings', 'Users can insert own settings', array['authenticated'], 'user_settings: insert policy applies to authenticated only');
select policy_roles_are('public', 'user_settings', 'Users can update own settings', array['authenticated'], 'user_settings: update policy applies to authenticated only');
select policy_roles_are('public', 'user_settings', 'Users can delete own settings', array['authenticated'], 'user_settings: delete policy applies to authenticated only');
select policy_roles_are('public', 'cl_history', 'Users can view own cl_history', array['authenticated'], 'cl_history: view policy applies to authenticated only');
select policy_roles_are('public', 'cl_history', 'Users can insert own cl_history', array['authenticated'], 'cl_history: insert policy applies to authenticated only');
select policy_roles_are('public', 'cl_history', 'Users can update own cl_history', array['authenticated'], 'cl_history: update policy applies to authenticated only');
select policy_roles_are('public', 'cl_history', 'Users can delete own cl_history', array['authenticated'], 'cl_history: delete policy applies to authenticated only');
select policy_roles_are('public', 'threshold_data', 'Users can view own threshold_data', array['authenticated'], 'threshold_data: view policy applies to authenticated only');
select policy_roles_are('public', 'threshold_data', 'Users can insert own threshold_data', array['authenticated'], 'threshold_data: insert policy applies to authenticated only');
select policy_roles_are('public', 'threshold_data', 'Users can update own threshold_data', array['authenticated'], 'threshold_data: update policy applies to authenticated only');
select policy_roles_are('public', 'threshold_data', 'Users can delete own threshold_data', array['authenticated'], 'threshold_data: delete policy applies to authenticated only');

-- Signed in as the owner
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select results_eq('select count(*) from public.check_ins', array[2::bigint], 'owner sees only own check-ins');
select results_eq('select count(*) from public.check_ins where user_id <> (select auth.uid())', array[0::bigint], 'owner sees no other user''s check-ins');
select results_eq('select count(*) from public.user_settings', array[1::bigint], 'owner sees only own settings');
select lives_ok($$insert into public.check_ins (user_id, date, type, answers, questions) values ('11111111-1111-4111-8111-111111111111', now(), 'checkin', '[]', '{}')$$, 'owner can insert own check-in');
select throws_ok($$insert into public.check_ins (user_id, date, type, answers, questions) values ('22222222-2222-4222-8222-222222222222', now(), 'checkin', '[]', '{}')$$, '42501', null, 'owner cannot insert a check-in for another user');
select lives_ok($$update public.check_ins set answers = '[1]' where user_id = '22222222-2222-4222-8222-222222222222'$$, 'updating another user''s check-ins is silently filtered');
select throws_ok($$update public.check_ins set user_id = '22222222-2222-4222-8222-222222222222' where user_id = '11111111-1111-4111-8111-111111111111'$$, '42501', null, 'owner cannot reassign a check-in to another user');
select lives_ok($$delete from public.check_ins where user_id = '22222222-2222-4222-8222-222222222222'$$, 'deleting another user''s check-ins is silently filtered');
select lives_ok($$delete from public.cl_history where user_id = '22222222-2222-4222-8222-222222222222'$$, 'deleting another user''s load history is silently filtered');
select throws_ok('truncate public.threshold_data', '42501', null, 'authenticated cannot truncate');
reset role;

-- Back as postgres: the other user's data survived the owner's attempts
select results_eq($$select answers::text from public.check_ins where user_id = '22222222-2222-4222-8222-222222222222'$$, array['[true]'], 'other user''s check-in is unchanged and still present');
select results_eq($$select count(*) from public.cl_history where user_id = '22222222-2222-4222-8222-222222222222'$$, array[1::bigint], 'other user''s load history is still present');

-- Signed in as a user with no records
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select results_eq('select count(*) from public.check_ins', array[0::bigint], 'unrelated user sees no check_ins');
select results_eq('select count(*) from public.user_settings', array[0::bigint], 'unrelated user sees no user_settings');
select results_eq('select count(*) from public.cl_history', array[0::bigint], 'unrelated user sees no cl_history');
select results_eq('select count(*) from public.threshold_data', array[0::bigint], 'unrelated user sees no threshold_data');
reset role;

-- Signed out
set local role anon;
select throws_ok('select * from public.check_ins', '42501', null, 'anon cannot read check_ins');
select throws_ok('select * from public.user_settings', '42501', null, 'anon cannot read user_settings');
select throws_ok('select * from public.cl_history', '42501', null, 'anon cannot read cl_history');
select throws_ok('select * from public.threshold_data', '42501', null, 'anon cannot read threshold_data');
select throws_ok($$insert into public.check_ins (user_id, date, type, answers, questions) values ('11111111-1111-4111-8111-111111111111', now(), 'checkin', '[]', '{}')$$, '42501', null, 'anon cannot insert check-ins');
reset role;

-- Default privileges for tables created later
create table public.access_default_probe (id int);
select table_privs_are('public', 'access_default_probe', 'anon', array[]::text[], 'new tables grant anon nothing');
select ok(not has_table_privilege('authenticated', 'public.access_default_probe', 'TRUNCATE'), 'new tables do not grant authenticated TRUNCATE');

select * from finish();
rollback;
