-- Structured records: access, validation, idempotent writes, episode rules, and
-- conversion of saves from builds that write check_ins.
-- Run with `supabase test db`. Everything happens in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');

-- ============================================================================
-- Access
-- ============================================================================
select table_privs_are('public', 'daily_checkins', 'anon', array[]::text[], 'anon has no privileges on daily_checkins');
select table_privs_are('public', 'daily_checkins', 'authenticated', array['SELECT'], 'authenticated can only read daily_checkins');
select table_privs_are('public', 'episodes', 'anon', array[]::text[], 'anon has no privileges on episodes');
select table_privs_are('public', 'episodes', 'authenticated', array['SELECT'], 'authenticated can only read episodes');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated cannot use the private schema');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use the private schema');
select function_privs_are('public', 'save_daily_checkin', array['uuid', 'date', 'text', 'integer', 'jsonb'], 'anon', array[]::text[], 'anon cannot save check-ins');
select function_privs_are('public', 'save_daily_checkin', array['uuid', 'date', 'text', 'integer', 'jsonb'], 'authenticated', array['EXECUTE'], 'authenticated can save check-ins');
select function_privs_are('public', 'start_episode', array['uuid', 'timestamp with time zone', 'text', 'text', 'text', 'integer', 'jsonb'], 'anon', array[]::text[], 'anon cannot start episodes');
select function_privs_are('public', 'delete_episode', array['uuid'], 'anon', array[]::text[], 'anon cannot delete episodes');

-- ============================================================================
-- Conversion of check_ins saves (one fixture per production question set)
-- ============================================================================
create temp table fixture (name text primary key, id uuid, expected jsonb, review boolean);
grant all on fixture to authenticated;

create function pg_temp.legacy(p_name text, p_type text, p_date timestamptz, p_questions text[], p_answers jsonb, p_expected jsonb, p_review boolean)
returns void language plpgsql as $$
declare new_id uuid;
begin
  insert into public.check_ins (user_id, date, type, answers, questions)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_date, p_type, p_answers, p_questions)
  returning id into new_id;
  insert into fixture values (p_name, new_id, p_expected, p_review);
end $$;

-- 9 questions, December 2025: options for activity impact, single medication value, sleep quality.
select pg_temp.legacy('c4b64a', 'checkin', '2025-12-11 20:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Cuál fue la intensidad máxima del dolor hoy?', '¿Cuántas horas duró el dolor hoy?', '¿Cómo sentiste el dolor hoy? (Marca todas las que apliquen)', '¿Notaste alguno de estos síntomas junto con el dolor?', '¿El dolor te impidió realizar tus actividades normales hoy (trabajo, estudio, casa)?', '¿Tomaste alguna medicación para el dolor hoy?', '¿Qué tan bien dormiste anoche?', '¿Qué tan estresado te sientes hoy?'],
  '[true, 7, "4-12_horas", ["pulsatil", "unilateral"], ["luz_ruido"], "si_un_poco", "Aspirina", 5, 8]',
  '{"q1_headache": {"status": "answered", "value": true}, "q2_1_intensity": {"status": "answered", "value": 7}, "q2_2_duration": {"status": "answered", "value": "4-12_horas"}, "q3_pain_characteristics": {"status": "answered", "value": ["pulsatil", "unilateral"]}, "q4_symptoms": {"status": "answered", "value": ["luz_ruido"]}, "q5_1_activity_impact_level": {"status": "answered", "value": "si_un_poco"}, "q5_2_medication": {"status": "answered", "value": ["si", "aspirina"]}, "q_sleep_quality": {"status": "answered", "value": 5, "unverified": true}, "q_stress": {"status": "answered", "value": 8}}',
  false);

-- 3 questions, December 2025.
select pg_temp.legacy('d3e4bf', 'checkin', '2025-12-12 20:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Qué tan bien dormiste anoche?', '¿Qué tan estresado te sientes hoy?'],
  '[false, 6, 3]',
  '{"q1_headache": {"status": "answered", "value": false}, "q_sleep_quality": {"status": "answered", "value": 6}, "q_stress": {"status": "answered", "value": 3}}',
  false);

-- 13 questions, January 2026: sleep quality and caffeine intake.
select pg_temp.legacy('06f34e', 'checkin', '2026-01-12 20:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Cuál fue la intensidad máxima del dolor hoy?', '¿Cuántas horas duró el dolor hoy?', '¿Cómo sentiste el dolor hoy? (Marca todas las que apliquen)', '¿Notaste alguno de estos síntomas junto con el dolor?', '¿El dolor te impidió realizar tus actividades normales hoy (trabajo, estudio, casa)?', '¿Tomaste alguna medicación para el dolor hoy?', 'Además de la medicación (si aplica), ¿qué otras medidas tomaste hoy para intentar aliviar tu dolor de cabeza? (Selecciona todas las que apliquen)', '¿Identificas algún desencadenante? (Marca todos los que apliquen)', '¿Qué tan bien dormiste anoche?', '¿Qué tan estresado te sientes hoy?', '¿Has consumido alcohol?', '¿Cómo ha sido tu consumo de cafeína (café, té, refrescos)?'],
  '[true, 8, "5_horas", ["pulsatil"], ["nauseas"], 9, ["si", "ibuprofeno"], ["dormir_descansar"], ["estres"], 6, 4, 0, 5]',
  '{"q1_headache": {"status": "answered", "value": true}, "q2_1_intensity": {"status": "answered", "value": 8}, "q2_2_duration": {"status": "answered", "value": "5_horas"}, "q3_pain_characteristics": {"status": "answered", "value": ["pulsatil"]}, "q4_symptoms": {"status": "answered", "value": ["nauseas"]}, "q5_1_activity_impact": {"status": "answered", "value": 9}, "q5_2_medication": {"status": "answered", "value": ["si", "ibuprofeno"]}, "q6_pain_management": {"status": "answered", "value": ["dormir_descansar"]}, "q7_triggers": {"status": "answered", "value": ["estres"]}, "q_sleep_quality": {"status": "answered", "value": 6}, "q_stress": {"status": "answered", "value": 4}, "q_alcohol": {"status": "answered", "value": 0}, "q_caffeine_intake": {"status": "answered", "value": 5, "unverified": true}}',
  false);

-- 5 questions, January 2026.
select pg_temp.legacy('d21f30', 'checkin', '2026-01-13 20:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Qué tan bien dormiste anoche?', '¿Qué tan estresado te sientes hoy?', '¿Has consumido alcohol?', '¿Cómo ha sido tu consumo de cafeína (café, té, refrescos)?'],
  '[false, 7, 3, 0, 2]',
  '{"q1_headache": {"status": "answered", "value": false}, "q_sleep_quality": {"status": "answered", "value": 7}, "q_stress": {"status": "answered", "value": 3}, "q_alcohol": {"status": "answered", "value": 0}, "q_caffeine_intake": {"status": "answered", "value": 2}}',
  false);

-- 5 questions, February 2026: sleep hours with caffeine intake.
select pg_temp.legacy('6e9749', 'checkin', '2026-02-04 20:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Cuántas horas dormiste anoche?', '¿Qué tan estresado te sientes hoy?', '¿Has consumido alcohol?', '¿Cómo ha sido tu consumo de cafeína (café, té, refrescos)?'],
  '[false, 8, 2, 0, 4]',
  '{"q1_headache": {"status": "answered", "value": false}, "q_sleep": {"status": "answered", "value": 8}, "q_stress": {"status": "answered", "value": 2}, "q_alcohol": {"status": "answered", "value": 0}, "q_caffeine_intake": {"status": "answered", "value": 4}}',
  false);

-- 5 questions, current no-headache set; an untouched slider saved as ''.
select pg_temp.legacy('607f6b', 'checkin', '2026-02-18 20:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Cuántas horas dormiste anoche?', '¿Qué tan estresado te sientes hoy?', '¿Has consumido alcohol?', '¿Cuántas tazas de café tomaste?'],
  '[false, 7, "", 0, 3]',
  '{"q1_headache": {"status": "answered", "value": false}, "q_sleep": {"status": "answered", "value": 7}, "q_stress": {"status": "unknown"}, "q_alcohol": {"status": "answered", "value": 0}, "q_caffeine": {"status": "answered", "value": 3, "unverified": true}}',
  false);

-- 13 questions, current headache set.
select pg_temp.legacy('f15e89', 'checkin', '2026-03-24 20:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Cuál fue la intensidad máxima del dolor hoy?', '¿Cuántas horas duró el dolor hoy?', '¿Cómo sentiste el dolor hoy? (Marca todas las que apliquen)', '¿Notaste alguno de estos síntomas junto con el dolor?', '¿El dolor te impidió realizar tus actividades normales hoy (trabajo, estudio, casa)?', '¿Tomaste alguna medicación para el dolor hoy?', 'Además de la medicación (si aplica), ¿qué otras medidas tomaste hoy para intentar aliviar tu dolor de cabeza? (Selecciona todas las que apliquen)', '¿Identificas algún desencadenante? (Marca todos los que apliquen)', '¿Cuántas horas dormiste anoche?', '¿Qué tan estresado te sientes hoy?', '¿Has consumido alcohol?', '¿Cuántas tazas de café tomaste?'],
  '[true, 4, "<1_hora", ["otra"], ["ninguno"], 10, ["si", "otra_medicacion"], ["nada_mas"], ["ninguno"], 6, 10, 5, 1]',
  '{"q1_headache": {"status": "answered", "value": true}, "q2_1_intensity": {"status": "answered", "value": 4}, "q2_2_duration": {"status": "answered", "value": "<1_hora"}, "q3_pain_characteristics": {"status": "answered", "value": ["otra"]}, "q4_symptoms": {"status": "answered", "value": ["ninguno"]}, "q5_1_activity_impact": {"status": "answered", "value": 10}, "q5_2_medication": {"status": "answered", "value": ["si", "otra_medicacion"]}, "q6_pain_management": {"status": "answered", "value": ["nada_mas"]}, "q7_triggers": {"status": "answered", "value": ["ninguno"]}, "q_sleep": {"status": "answered", "value": 6, "unverified": true}, "q_stress": {"status": "answered", "value": 10}, "q_alcohol": {"status": "answered", "value": 5, "unverified": true}, "q_caffeine": {"status": "answered", "value": 1}}',
  false);

-- 7-question crisis, December 2025: onset bucket, yes/no aura.
select pg_temp.legacy('368565', 'crisis', '2025-12-12 10:00+00',
  array['¿Cuándo comenzó el dolor?', '¿Cuál es la intensidad del dolor ahora?', '¿Cómo sientes el dolor? (Marca todas las que apliquen)', '¿Tuviste aura antes o durante el dolor? (Luces, líneas, manchas en la visión, hormigueo, etc.)', '¿Tienes alguno de estos síntomas ahora?', '¿Identificas algún desencadenante? (Marca todos los que apliquen)', '¿Has tomado alguna medicación para este dolor?'],
  '["<30_min", 8, ["pulsatil"], true, ["nauseas"], ["clima"], "no"]',
  '{"crisis_intensity": {"status": "answered", "value": 8}, "crisis_pain_characteristics": {"status": "answered", "value": ["pulsatil"]}, "crisis_aura": {"status": "unknown", "legacy_raw": true}, "crisis_symptoms": {"status": "answered", "value": ["nauseas"]}, "crisis_triggers": {"status": "answered", "value": ["clima"]}, "crisis_medication": {"status": "answered", "value": ["no"]}}',
  true);

-- 8-question crisis, current set; health-centre visit answered with text.
select pg_temp.legacy('b462c4', 'crisis', '2026-01-12 10:00+00',
  array['¿Cuándo comenzó el dolor?', '¿Cuál es la intensidad del dolor ahora?', '¿Cómo sientes el dolor? (Marca todas las que apliquen)', '¿Tuviste aura antes o durante el dolor? (Luces, líneas, manchas en la visión, hormigueo, etc.)', '¿Tienes alguno de estos síntomas ahora?', '¿Identificas algún desencadenante? (Marca todos los que apliquen)', '¿Has tomado alguna medicación para este dolor?', '¿Ha usted acudido a algún centro de salud?'],
  '["2026-01-12T07:30:00.000Z", 10, ["unilateral"], ["luces"], ["luz_ruido"], ["estres"], ["si", "acetaminofen"], "Urgencias"]',
  '{"crisis_intensity": {"status": "answered", "value": 10}, "crisis_pain_characteristics": {"status": "answered", "value": ["unilateral"]}, "crisis_aura": {"status": "answered", "value": ["luces"]}, "crisis_symptoms": {"status": "answered", "value": ["luz_ruido"]}, "crisis_triggers": {"status": "answered", "value": ["estres"]}, "crisis_medication": {"status": "answered", "value": ["si", "acetaminofen"]}, "crisis_healthcare_visit": {"status": "answered", "value": "yes", "text": {"yes": "Urgencias"}}}',
  false);

select is(
  (select count(*) from fixture f
   where f.expected is distinct from coalesce(
     (select d.answers from public.daily_checkins d where d.legacy_check_in_id = f.id),
     (select e.answers from public.episodes e where e.legacy_check_in_id = f.id))),
  0::bigint, 'every production question set converts to the expected answers');
select is((select d.answers from public.daily_checkins d join fixture f on f.id = d.legacy_check_in_id where f.name = 'c4b64a'), (select expected from fixture where name = 'c4b64a'), 'c4b64a: options, single medication value and sleep quality convert');
select is((select d.answers from public.daily_checkins d join fixture f on f.id = d.legacy_check_in_id where f.name = 'f15e89'), (select expected from fixture where name = 'f15e89'), 'f15e89: current headache set converts, old defaults flagged unverified');
select is((select e.answers from public.episodes e join fixture f on f.id = e.legacy_check_in_id where f.name = 'b462c4'), (select expected from fixture where name = 'b462c4'), 'b462c4: free-text health-centre visit becomes yes with text');
select is(
  (select count(*) from fixture f
   where f.review is distinct from coalesce(
     (select d.needs_review from public.daily_checkins d where d.legacy_check_in_id = f.id),
     (select e.needs_review from public.episodes e where e.legacy_check_in_id = f.id))),
  0::bigint, 'only the record with an unconvertible answer needs review');
select is((select array_agg(distinct source) from public.daily_checkins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), array['legacy_client'], 'saves through check_ins are marked legacy_client');
select is((select local_date from public.daily_checkins d join fixture f on f.id = d.legacy_check_in_id where f.name = 'd3e4bf'), date '2025-12-12', 'converted check-ins use the UTC date');
select is((select time_zone from public.daily_checkins d join fixture f on f.id = d.legacy_check_in_id where f.name = 'd3e4bf'), null, 'converted check-ins have no time zone');

select results_eq(
  $$select e.onset_at, e.onset_precision from public.episodes e join fixture f on f.id = e.legacy_check_in_id where f.name = '368565'$$,
  $$values ('2025-12-12 09:45+00'::timestamptz, 'approximate'::text)$$,
  'an onset bucket becomes an approximate onset');
select results_eq(
  $$select e.onset_at, e.onset_precision from public.episodes e join fixture f on f.id = e.legacy_check_in_id where f.name = 'b462c4'$$,
  $$values ('2026-01-12 07:30+00'::timestamptz, 'exact'::text)$$,
  'an ISO onset is kept exactly');
select results_eq(
  $$select e.ended_at, e.end_source from public.episodes e join fixture f on f.id = e.legacy_check_in_id where f.name = '368565'$$,
  $$values ('2026-01-12 10:00+00'::timestamptz, 'legacy_next_checkin'::text)$$,
  'a new crisis from an old build ends the ongoing one at its recording time');
select is((select count(*) from public.episodes where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and ended_at is null), 1::bigint, 'the latest crisis is ongoing');

update public.check_ins set end_date = '2026-01-13 08:00+00' where id = (select id from fixture where name = 'b462c4');
select results_eq(
  $$select e.ended_at, e.end_source from public.episodes e join fixture f on f.id = e.legacy_check_in_id where f.name = 'b462c4'$$,
  $$values ('2026-01-13 08:00+00'::timestamptz, 'legacy_next_checkin'::text)$$,
  'an old build''s automatic close ends the episode');

-- A second check-in on the same day replaces the first; the first is logged.
select pg_temp.legacy('same-day', 'checkin', '2026-03-24 22:00+00',
  array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?'], '[false]',
  '{"q1_headache": {"status": "answered", "value": false}}', false);
select is((select count(*) from public.daily_checkins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = '2026-03-24'), 1::bigint, 'one daily check-in per day');
select is((select answers from public.daily_checkins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = '2026-03-24'), (select expected from fixture where name = 'same-day'), 'the later same-day check-in wins');
select is((select count(*) from private.legacy_conversion_log where legacy_check_in_id = (select id from fixture where name = 'f15e89') and reason = 'superseded_same_day'), 1::bigint, 'the replaced check-in is logged');

-- Unknown wording and malformed rows are kept and flagged, never rejected.
select lives_ok($$insert into public.check_ins (user_id, date, type, answers, questions) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-01 20:00+00', 'checkin', '[false, 3]', array['¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', '¿Pregunta nueva?'])$$, 'a save with unknown wording succeeds');
select is((select answers->'legacy_unmapped' from public.daily_checkins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = '2026-04-01'), '[{"question": "¿Pregunta nueva?", "answer": 3}]'::jsonb, 'unknown wording is kept under legacy_unmapped');
select is((select needs_review from public.daily_checkins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = '2026-04-01'), true, 'unknown wording marks the record for review');
select lives_ok($$insert into public.check_ins (user_id, date, type, answers, questions) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-02 20:00+00', 'checkin', '{"not": "an array"}', array['x'])$$, 'a malformed save succeeds');
select is((select needs_review from public.daily_checkins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = '2026-04-02'), true, 'a malformed save is kept for review');

delete from public.check_ins where id = (select id from fixture where name = 'd3e4bf');
select is((select count(*) from public.daily_checkins where local_date = '2025-12-12' and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'deleting a check_ins row deletes its converted record');

-- ============================================================================
-- Write functions, signed in as user A
-- ============================================================================
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

create temp table saved (name text primary key, id uuid);

insert into saved select 'day1', id from public.save_daily_checkin(
  '00000000-0000-4000-8000-000000000001', date '2026-05-01', 'Europe/Madrid', 1,
  '{"q1_headache": {"status": "answered", "value": true}, "q2_1_intensity": {"status": "answered", "value": 6}, "q2_2_duration": {"status": "answered", "value": "3_horas"}, "q5_2_medication": {"status": "answered", "value": ["si", "otra_medicacion"], "text": {"otra_medicacion": "naproxeno"}}, "q_stress": {"status": "skipped"}}');
select isnt((select id from saved where name = 'day1'), null, 'a valid check-in is saved');
select is((select id from public.save_daily_checkin('00000000-0000-4000-8000-000000000001', date '2026-05-01', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": false}}')), (select id from saved where name = 'day1'), 'a retried save returns the stored row');
select is((select answers->'q1_headache'->'value' from public.daily_checkins where id = (select id from saved where name = 'day1')), 'true'::jsonb, 'a retried save does not change the stored answers');
select is((select id from public.save_daily_checkin('00000000-0000-4000-8000-000000000002', date '2026-05-01', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": false}}')), (select id from saved where name = 'day1'), 'saving the same day again edits that day''s check-in');
select is((select answers from public.daily_checkins where id = (select id from saved where name = 'day1')), '{"q1_headache": {"status": "answered", "value": false}}'::jsonb, 'the edit replaces the answers');

select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q_made_up": {"status": "answered", "value": 1}}')$$, 'P0001', 'invalid_answers', 'unknown question IDs are rejected');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q_caffeine": {"status": "answered", "value": 6}}')$$, 'P0001', 'invalid_answers', 'out-of-range values are rejected');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q2_1_intensity": {"status": "answered", "value": 4.5}}')$$, 'P0001', 'invalid_answers', 'fractional scale values are rejected');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q4_symptoms": {"status": "answered", "value": ["nauseas", "ninguno"]}}')$$, 'P0001', 'invalid_answers', 'exclusive options cannot be combined');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q5_2_medication": {"status": "answered", "value": ["ibuprofeno"]}}')$$, 'P0001', 'invalid_answers', 'a medication requires si');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q7_triggers": {"status": "answered", "value": ["estres"], "text": {"otro": "ruido"}}}')$$, 'P0001', 'invalid_answers', 'text for an unselected option is rejected');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q_sleep_quality": {"status": "answered", "value": 5}}')$$, 'P0001', 'invalid_answers', 'retired questions are rejected');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q_stress": {"status": "answered", "value": 5}}')$$, 'P0001', 'invalid_answers', 'the headache question is required');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "skipped", "value": true}}')$$, 'P0001', 'invalid_answers', 'a skipped answer cannot carry a value');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}, "q_stress": {"status": "answered", "value": 5, "unverified": true}}')$$, 'P0001', 'invalid_answers', 'the app cannot mark answers unverified');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-02', 'Mars/Olympus', 1, '{"q1_headache": {"status": "answered", "value": true}}')$$, 'P0001', 'invalid_time_zone', 'unknown time zones are rejected');
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), (now() at time zone 'Pacific/Kiritimati')::date + 1, 'Pacific/Kiritimati', 1, '{"q1_headache": {"status": "answered", "value": true}}')$$, 'P0001', 'invalid_local_date', 'future days are rejected');
select throws_ok($$select public.save_daily_checkin(null, date '2026-05-02', 'Europe/Madrid', 1, '{"q1_headache": {"status": "answered", "value": true}}')$$, 'P0001', 'client_id_required', 'a client request ID is required');
select throws_ok($$insert into public.daily_checkins (user_id, local_date, time_zone, answers, form_version, source) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-05-03', 'UTC', '{}', 1, 'manual')$$, '42501', null, 'direct inserts are rejected');
select throws_ok($$update public.daily_checkins set needs_review = true$$, '42501', null, 'direct updates are rejected');

-- Episodes. The converted crises above have all ended.
insert into saved select 'ep1', id from public.start_episode(
  '00000000-0000-4000-8000-000000000003', now() - interval '1 hour', 'exact', 'Europe/Madrid', 'voice', 1,
  '{"crisis_intensity": {"status": "answered", "value": 7}, "crisis_aura": {"status": "answered", "value": []}, "crisis_medication": {"status": "unknown"}}');
select isnt((select id from saved where name = 'ep1'), null, 'an episode is started');
select is((select id from public.start_episode('00000000-0000-4000-8000-000000000003', now(), 'exact', 'Europe/Madrid', 'voice', 1, '{}')), (select id from saved where name = 'ep1'), 'a retried start returns the stored episode');
select throws_ok($$select public.start_episode(gen_random_uuid(), now() - interval '1 hour', 'exact', 'Europe/Madrid', 'manual', 1, '{"crisis_intensity": {"status": "answered", "value": 7}}')$$, 'P0001', 'episode_ongoing', 'a second ongoing episode is rejected');
select throws_ok($$select public.start_episode(gen_random_uuid(), null, 'exact', 'Europe/Madrid', 'manual', 1, '{}')$$, 'P0001', 'invalid_onset', 'an exact onset needs a time');
select throws_ok($$select public.start_episode('00000000-0000-4000-8000-000000000001', now(), 'exact', 'Europe/Madrid', 'manual', 1, '{}')$$, 'P0001', 'client_id_reused', 'a check-in request ID cannot start an episode');
select throws_ok(format('select public.end_episode(%L, now() - interval ''2 hours'')', (select id from saved where name = 'ep1')), 'P0001', 'invalid_end_time', 'an episode cannot end before it started');
select lives_ok(format('select public.end_episode(%L, %L)', (select id from saved where name = 'ep1'), date_trunc('second', now())), 'an episode is ended with the reported time');
select lives_ok(format('select public.end_episode(%L, %L)', (select id from saved where name = 'ep1'), date_trunc('second', now())), 'repeating the same end is harmless');
select throws_ok(format('select public.end_episode(%L, now())', (select id from saved where name = 'ep1')), 'P0001', 'episode_already_ended', 'an ended episode cannot be ended at another time');
select lives_ok(format($$select public.update_episode(%L, now() - interval '30 minutes', 'approximate', '{"crisis_intensity": {"status": "answered", "value": 8}}')$$, (select id from saved where name = 'ep1')), 'an episode can be corrected');
select is((select answers from public.episodes where id = (select id from saved where name = 'ep1')), '{"crisis_intensity": {"status": "answered", "value": 8}}'::jsonb, 'the correction replaces the answers');

-- Deleting a converted record also deletes its check_ins row.
select is(public.delete_daily_checkin((select id from public.daily_checkins where local_date = '2026-01-13')), true, 'a converted check-in can be deleted');
select is((select count(*) from public.check_ins where id = (select id from fixture where name = 'd21f30')), 0::bigint, 'its check_ins row is deleted too');
select is(public.delete_episode((select id from saved where name = 'ep1')), true, 'an episode can be deleted');
select is(public.delete_episode((select id from saved where name = 'ep1')), false, 'deleting it again reports nothing deleted');

-- ============================================================================
-- Another user
-- ============================================================================
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*) from public.daily_checkins) + (select count(*) from public.episodes), 0::bigint, 'another user sees none of A''s records');
select throws_ok(format('select public.end_episode(%L, now())', (select id from saved where name = 'ep1')), 'P0001', 'not_found', 'another user cannot end A''s episode');
select is(public.delete_daily_checkin((select id from saved where name = 'day1')), false, 'another user cannot delete A''s check-in');
select is((select id from public.save_daily_checkin('00000000-0000-4000-8000-000000000001', date '2026-05-01', 'UTC', 1, '{"q1_headache": {"status": "answered", "value": true}}')) <> (select id from saved where name = 'day1'), true, 'request IDs are scoped per user');

reset role;
set local role anon;
select throws_ok($$select public.save_daily_checkin(gen_random_uuid(), date '2026-05-01', 'UTC', 1, '{}')$$, '42501', null, 'anon cannot call the write functions');
reset role;

-- ============================================================================
-- Account deletion removes everything
-- ============================================================================
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select count(*) from public.daily_checkins where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  + (select count(*) from public.episodes where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  + (select count(*) from private.write_requests where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  + (select count(*) from private.legacy_conversion_log where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0::bigint, 'deleting the account deletes its records, request IDs and conversion log');

select * from finish();
rollback;
