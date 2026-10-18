-- ============================================================================
-- Step 5: structured records (docs/step5-data-model-design.md)
-- ============================================================================
-- Adds daily_checkins and episodes with answers keyed by stable question IDs,
-- write functions with idempotent saves, a trigger that converts saves from
-- builds that still write public.check_ins, and a one-off conversion of the
-- existing check_ins rows. check_ins, cl_history and threshold_data are not
-- modified. Rollback: supabase/rollbacks/20261018141002_structured_records.down.sql
-- ============================================================================

-- Internal objects live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ============================================================================
-- Question catalog and legacy wording
-- ============================================================================
-- IDs are the app's question IDs. Retired IDs exist only in converted records,
-- for questions whose meaning changed (sleep quality, caffeine intake, activity
-- impact as options).
create table private.question_catalog (
  id text primary key,
  form text not null check (form in ('daily', 'episode')),
  kind text not null check (kind in ('boolean', 'scale', 'duration', 'single', 'multi')),
  min_value integer,
  max_value integer,
  options text[],
  exclusive_options text[] not null default '{}',
  text_options text[] not null default '{}',
  parent_option text,
  child_options text[] not null default '{}',
  min_selected integer not null default 1,
  required boolean not null default false,
  retired boolean not null default false,
  -- Slider position old builds saved when the user did not move the slider.
  legacy_default integer,
  -- Values accepted only in converted records.
  legacy_options text[] not null default '{}',
  check (kind <> 'scale' or (min_value is not null and max_value is not null and min_value < max_value)),
  check (kind not in ('single', 'multi') or options is not null)
);

insert into private.question_catalog
  (id, form, kind, min_value, max_value, options, exclusive_options, text_options, parent_option, child_options, min_selected, required, retired, legacy_default, legacy_options)
values
  ('q1_headache', 'daily', 'boolean', null, null, null, '{}', '{}', null, '{}', 1, true, false, null, '{}'),
  ('q2_1_intensity', 'daily', 'scale', 0, 10, null, '{}', '{}', null, '{}', 1, false, false, 5, '{}'),
  ('q2_2_duration', 'daily', 'duration', null, null, null, '{}', '{}', null, '{}', 1, false, false, null,
    '{1-4_horas,4-12_horas,todo_el_dia,1-24_horas}'),
  ('q3_pain_characteristics', 'daily', 'multi', null, null,
    '{pulsatil,unilateral,agravamiento_actividad,ninguna,otra}', '{ninguna}', '{otra}', null, '{}', 1, false, false, null, '{}'),
  ('q4_symptoms', 'daily', 'multi', null, null,
    '{luz_ruido,nauseas,ninguno}', '{ninguno}', '{}', null, '{}', 1, false, false, null, '{}'),
  ('q5_1_activity_impact', 'daily', 'scale', 0, 10, null, '{}', '{}', null, '{}', 1, false, false, 5, '{}'),
  ('q5_1_activity_impact_level', 'daily', 'single', null, null,
    '{no,si_un_poco,si_totalmente}', '{}', '{}', null, '{}', 1, false, true, null, '{}'),
  ('q5_2_medication', 'daily', 'multi', null, null,
    '{si,ibuprofeno,acetaminofen,aspirina,otra_medicacion,no}', '{no}', '{otra_medicacion}',
    'si', '{ibuprofeno,acetaminofen,aspirina,otra_medicacion}', 1, false, false, null, '{}'),
  ('q6_pain_management', 'daily', 'multi', null, null,
    '{dormir_descansar,aislarme,compresas,relajacion,remedios_caseros,otro,nada_mas}', '{nada_mas}',
    '{remedios_caseros,otro}', null, '{}', 1, false, false, null, '{}'),
  ('q7_triggers', 'daily', 'multi', null, null,
    '{estres,falta_sueno,clima,comida,menstruacion,pantallas,otro,ninguno}', '{ninguno}', '{otro}',
    null, '{}', 1, false, false, null, '{}'),
  ('q_sleep', 'daily', 'scale', 0, 12, null, '{}', '{}', null, '{}', 1, false, false, 6, '{}'),
  ('q_sleep_quality', 'daily', 'scale', 0, 10, null, '{}', '{}', null, '{}', 1, false, true, 5, '{}'),
  ('q_stress', 'daily', 'scale', 0, 10, null, '{}', '{}', null, '{}', 1, false, false, 5, '{}'),
  ('q_alcohol', 'daily', 'scale', 0, 10, null, '{}', '{}', null, '{}', 1, false, false, 5, '{}'),
  ('q_caffeine', 'daily', 'scale', 0, 5, null, '{}', '{}', null, '{}', 1, false, false, 3, '{}'),
  ('q_caffeine_intake', 'daily', 'scale', 0, 10, null, '{}', '{}', null, '{}', 1, false, true, 5, '{}'),
  ('crisis_intensity', 'episode', 'scale', 0, 10, null, '{}', '{}', null, '{}', 1, false, false, 5, '{}'),
  ('crisis_pain_characteristics', 'episode', 'multi', null, null,
    '{pulsatil,unilateral,agravamiento_actividad,ninguna}', '{ninguna}', '{}', null, '{}', 1, false, false, null, '{}'),
  -- An empty list means no aura.
  ('crisis_aura', 'episode', 'multi', null, null,
    '{luces,lineas,manchas,hormigueo,otro_aura}', '{}', '{otro_aura}', null, '{}', 0, false, false, null, '{}'),
  ('crisis_symptoms', 'episode', 'multi', null, null,
    '{luz_ruido,nauseas,ninguno}', '{ninguno}', '{}', null, '{}', 1, false, false, null, '{}'),
  ('crisis_triggers', 'episode', 'multi', null, null,
    '{estres,falta_sueno,clima,comida,menstruacion,pantallas,otro,ninguno}', '{ninguno}', '{otro}',
    null, '{}', 1, false, false, null, '{}'),
  ('crisis_medication', 'episode', 'multi', null, null,
    '{si,ibuprofeno,acetaminofen,aspirina,otra_medicacion,no}', '{no}', '{otra_medicacion}',
    'si', '{ibuprofeno,acetaminofen,aspirina,otra_medicacion}', 1, false, false, null, '{}'),
  ('crisis_healthcare_visit', 'episode', 'single', null, null,
    '{yes,no}', '{}', '{yes}', null, '{}', 1, false, false, null, '{}');

-- Full question texts saved by builds that write check_ins. json_type picks the
-- ID when one wording was used for two answer types. crisis_pain_start is the
-- onset question; it becomes episodes.onset_at, not an answer.
create table private.legacy_question_map (
  form text not null check (form in ('daily', 'episode')),
  question_text text not null,
  json_type text check (json_type in ('boolean', 'number', 'string', 'array')),
  question_id text not null,
  unique nulls not distinct (form, question_text, json_type)
);

insert into private.legacy_question_map (form, question_text, json_type, question_id) values
  ('daily', '¿Has tenido dolor de cabeza en las últimas 24 horas (desde tu último check-in)?', null, 'q1_headache'),
  ('daily', '¿Cuál fue la intensidad máxima del dolor hoy?', null, 'q2_1_intensity'),
  ('daily', '¿Cuántas horas duró el dolor hoy?', null, 'q2_2_duration'),
  ('daily', '¿Cómo sentiste el dolor hoy? (Marca todas las que apliquen)', null, 'q3_pain_characteristics'),
  ('daily', '¿Notaste alguno de estos síntomas junto con el dolor?', null, 'q4_symptoms'),
  ('daily', '¿El dolor te impidió realizar tus actividades normales hoy (trabajo, estudio, casa)?', null, 'q5_1_activity_impact'),
  ('daily', '¿El dolor te impidió realizar tus actividades normales hoy (trabajo, estudio, casa)?', 'string', 'q5_1_activity_impact_level'),
  ('daily', '¿Tomaste alguna medicación para el dolor hoy?', null, 'q5_2_medication'),
  ('daily', 'Además de la medicación (si aplica), ¿qué otras medidas tomaste hoy para intentar aliviar tu dolor de cabeza? (Selecciona todas las que apliquen)', null, 'q6_pain_management'),
  ('daily', '¿Identificas algún desencadenante? (Marca todos los que apliquen)', null, 'q7_triggers'),
  ('daily', '¿Cuántas horas dormiste anoche?', null, 'q_sleep'),
  ('daily', '¿Qué tan bien dormiste anoche?', null, 'q_sleep_quality'),
  ('daily', '¿Qué tan estresado te sientes hoy?', null, 'q_stress'),
  ('daily', '¿Has consumido alcohol?', null, 'q_alcohol'),
  ('daily', '¿Cuántas tazas de café tomaste?', null, 'q_caffeine'),
  ('daily', '¿Cómo ha sido tu consumo de cafeína (café, té, refrescos)?', null, 'q_caffeine_intake'),
  ('episode', '¿Cuándo comenzó el dolor?', null, 'crisis_pain_start'),
  ('episode', '¿Cuál es la intensidad del dolor ahora?', null, 'crisis_intensity'),
  ('episode', '¿Cómo sientes el dolor? (Marca todas las que apliquen)', null, 'crisis_pain_characteristics'),
  ('episode', '¿Tuviste aura antes o durante el dolor? (Luces, líneas, manchas en la visión, hormigueo, etc.)', null, 'crisis_aura'),
  ('episode', '¿Tienes alguno de estos síntomas ahora?', null, 'crisis_symptoms'),
  ('episode', '¿Identificas algún desencadenante? (Marca todos los que apliquen)', null, 'crisis_triggers'),
  ('episode', '¿Has tomado alguna medicación para este dolor?', null, 'crisis_medication'),
  ('episode', '¿Ha usted acudido a algún centro de salud?', null, 'crisis_healthcare_visit');

-- ============================================================================
-- Records
-- ============================================================================
create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The day the check-in describes, in the user's time zone.
  local_date date not null,
  -- IANA name from the device; null for converted records.
  time_zone text,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  -- 0 for converted records.
  form_version integer not null check (form_version >= 0),
  source text not null check (source in ('manual', 'legacy_client', 'legacy_import')),
  needs_review boolean not null default false,
  -- Source row in check_ins for converted records (no FK: check_ins will be dropped).
  legacy_check_in_id uuid,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date),
  check (source <> 'manual' or (time_zone is not null and form_version >= 1))
);

create index daily_checkins_legacy_check_in_id_idx on public.daily_checkins (legacy_check_in_id)
  where legacy_check_in_id is not null;

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- When the pain started, as reported.
  onset_at timestamptz,
  onset_precision text not null check (onset_precision in ('exact', 'approximate', 'unknown')),
  -- When the pain ended; null while the episode is ongoing.
  ended_at timestamptz,
  end_source text check (end_source in ('user', 'legacy_next_checkin')),
  time_zone text,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  form_version integer not null check (form_version >= 0),
  source text not null check (source in ('manual', 'voice', 'legacy_client', 'legacy_import')),
  needs_review boolean not null default false,
  legacy_check_in_id uuid,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episodes_onset_matches_precision check ((onset_at is null) = (onset_precision = 'unknown')),
  constraint episodes_end_matches_source check ((ended_at is null) = (end_source is null)),
  constraint episodes_end_after_onset check (ended_at is null or onset_at is null or ended_at >= onset_at),
  -- Allows for device clock skew.
  constraint episodes_onset_not_after_recording check (onset_at is null or onset_at <= recorded_at + interval '10 minutes'),
  check (source not in ('manual', 'voice') or (time_zone is not null and form_version >= 1))
);

-- At most one ongoing episode per user.
create unique index episodes_one_ongoing_per_user on public.episodes (user_id) where ended_at is null;
create index episodes_user_id_recorded_at_idx on public.episodes (user_id, recorded_at desc);
create index episodes_legacy_check_in_id_idx on public.episodes (legacy_check_in_id)
  where legacy_check_in_id is not null;

create trigger update_daily_checkins_updated_at
  before update on public.daily_checkins
  for each row execute function public.update_updated_at_column();

create trigger update_episodes_updated_at
  before update on public.episodes
  for each row execute function public.update_updated_at_column();

-- Client request IDs already processed, so a retried save returns the stored row.
create table private.write_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  target text not null check (target in ('daily_checkin', 'episode')),
  target_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- Converted records that were replaced or could not be converted.
create table private.legacy_conversion_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_check_in_id uuid,
  reason text not null check (reason in ('superseded_same_day', 'conversion_failed')),
  payload jsonb,
  detail text,
  created_at timestamptz not null default now()
);

create index legacy_conversion_log_user_id_idx on private.legacy_conversion_log (user_id);

-- ============================================================================
-- Access: owners read their records; all writes go through the functions below.
-- ============================================================================
alter table public.daily_checkins enable row level security;
alter table public.episodes enable row level security;
alter table private.question_catalog enable row level security;
alter table private.legacy_question_map enable row level security;
alter table private.write_requests enable row level security;
alter table private.legacy_conversion_log enable row level security;

revoke all on public.daily_checkins, public.episodes from anon, authenticated;
grant select on public.daily_checkins, public.episodes to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

create policy "Users can view own daily_checkins"
  on public.daily_checkins for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view own episodes"
  on public.episodes for select to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- Validation
-- ============================================================================
-- Returns a list of problems; empty when the answers are valid for the form.
-- p_legacy allows retired questions, legacy values and conversion fields.
create function private.answer_problems(
  p_form text,
  p_answers jsonb,
  p_legacy boolean default false,
  p_check_required boolean default true
) returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  problems text[] := '{}'::text[];
  k text;
  v jsonb;
  q private.question_catalog;
  val jsonb;
  sel text[];
  t text;
  num numeric;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return array['answers must be an object'];
  end if;

  for k, v in select key, value from jsonb_each(p_answers) loop
    sel := null;
    if k = 'legacy_unmapped' then
      if not p_legacy then
        problems := problems || 'legacy_unmapped is reserved for converted records'::text;
      end if;
      continue;
    end if;

    select * into q from private.question_catalog c where c.id = k and c.form = p_form;
    if not found then
      problems := problems || format('%s: unknown question for %s', k, p_form);
      continue;
    end if;
    if q.retired and not p_legacy then
      problems := problems || format('%s: retired question', k);
      continue;
    end if;
    if jsonb_typeof(v) <> 'object' then
      problems := problems || format('%s: answer must be an object', k);
      continue;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v) f
      where f not in ('status', 'value', 'text')
        and not (p_legacy and f in ('unverified', 'legacy_raw'))
    ) then
      problems := problems || format('%s: unexpected field', k);
    end if;
    if v ? 'unverified' and v->'unverified' <> 'true'::jsonb then
      problems := problems || format('%s: unverified must be true', k);
    end if;

    if v->>'status' in ('skipped', 'unknown') then
      if v ? 'value' or v ? 'text' then
        problems := problems || format('%s: a %s answer has no value', k, v->>'status');
      end if;
      continue;
    elsif v->>'status' is distinct from 'answered' then
      problems := problems || format('%s: status must be answered, skipped or unknown', k);
      continue;
    end if;
    if v ? 'legacy_raw' then
      problems := problems || format('%s: legacy_raw is only kept on unknown answers', k);
    end if;

    val := v->'value';
    if val is null then
      problems := problems || format('%s: answered without a value', k);
      continue;
    end if;

    case q.kind
      when 'boolean' then
        if jsonb_typeof(val) <> 'boolean' then
          problems := problems || format('%s: must be true or false', k);
        end if;
      when 'scale' then
        num := case when jsonb_typeof(val) = 'number' then (val #>> '{}')::numeric end;
        if num is null or num <> trunc(num) or num < q.min_value or num > q.max_value then
          problems := problems || format('%s: must be a whole number from %s to %s', k, q.min_value, q.max_value);
        end if;
      when 'duration' then
        if jsonb_typeof(val) <> 'string'
          or not ((val #>> '{}') ~ '^(<1_hora|([1-9]|1[0-9]|2[0-4])_horas?)$'
                  or (p_legacy and (val #>> '{}') = any(q.legacy_options))) then
          problems := problems || format('%s: must be <1_hora or 1_horas to 24_horas', k);
        end if;
      when 'single' then
        if jsonb_typeof(val) <> 'string' or not ((val #>> '{}') = any(q.options)) then
          problems := problems || format('%s: must be one of %s', k, array_to_string(q.options, ', '));
        else
          sel := array[val #>> '{}'];
        end if;
      when 'multi' then
        if jsonb_typeof(val) <> 'array'
          or exists (select 1 from jsonb_array_elements(val) e where jsonb_typeof(e) <> 'string') then
          problems := problems || format('%s: must be a list of options', k);
          continue;
        end if;
        sel := array(select jsonb_array_elements_text(val));
        if exists (select 1 from unnest(sel) s where not s = any(q.options)) then
          problems := problems || format('%s: options must be among %s', k, array_to_string(q.options, ', '));
        end if;
        if cardinality(sel) <> (select count(distinct s) from unnest(sel) s) then
          problems := problems || format('%s: repeated option', k);
        end if;
        if cardinality(sel) < q.min_selected then
          problems := problems || format('%s: select at least %s option', k, q.min_selected);
        end if;
        if cardinality(sel) > 1 and sel && q.exclusive_options then
          problems := problems || format('%s: %s cannot be combined with other options', k,
            array_to_string(q.exclusive_options, ', '));
        end if;
        if q.parent_option is not null and sel && q.child_options and not q.parent_option = any(sel) then
          problems := problems || format('%s: %s requires %s', k, array_to_string(q.child_options, ', '), q.parent_option);
        end if;
    end case;

    if v ? 'text' then
      if jsonb_typeof(v->'text') <> 'object' then
        problems := problems || format('%s: text must be an object', k);
      else
        for t in select jsonb_object_keys(v->'text') loop
          if not t = any(q.text_options) or sel is null or not t = any(sel) then
            problems := problems || format('%s: text given for %s, which is not a selected free-text option', k, t);
          elsif jsonb_typeof(v->'text'->t) <> 'string'
            or length(btrim(v->'text'->>t)) = 0 or length(v->'text'->>t) > 500 then
            problems := problems || format('%s: text for %s must be 1 to 500 characters', k, t);
          end if;
        end loop;
      end if;
    end if;
  end loop;

  if p_check_required then
    for q in select * from private.question_catalog c where c.form = p_form and c.required and not p_answers ? c.id loop
      problems := problems || format('%s: required', q.id);
    end loop;
  end if;

  return problems;
end;
$$;

-- ============================================================================
-- Conversion of the check_ins format
-- ============================================================================
-- Returns {"answers": {...}, "needs_review": bool, "onset_raw": <answer or null>}.
-- Anything that cannot be mapped is kept: unknown wording under legacy_unmapped,
-- unconvertible values as unknown answers with legacy_raw.
create function private.convert_legacy_answers(p_form text, p_questions text[], p_answers jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb := '{}'::jsonb;
  unmapped jsonb := '[]'::jsonb;
  review boolean := false;
  onset jsonb;
  raw jsonb;
  qid text;
  q private.question_catalog;
  ans jsonb;
  s text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array'
    or coalesce(cardinality(p_questions), 0) <> jsonb_array_length(p_answers) then
    return jsonb_build_object(
      'answers', jsonb_build_object('legacy_unmapped',
        jsonb_build_array(jsonb_build_object('questions', to_jsonb(p_questions), 'answers', p_answers))),
      'needs_review', true,
      'onset_raw', null);
  end if;

  for i in 1 .. coalesce(cardinality(p_questions), 0) loop
    raw := p_answers->(i - 1);
    qid := null;
    select m.question_id into qid
    from private.legacy_question_map m
    where m.form = p_form and m.question_text = p_questions[i]
      and (m.json_type is null or m.json_type = jsonb_typeof(raw))
    order by m.json_type nulls last
    limit 1;

    if qid is null or result ? qid or (qid = 'crisis_pain_start' and onset is not null) then
      unmapped := unmapped || jsonb_build_array(jsonb_build_object('question', p_questions[i], 'answer', raw));
      review := true;
      continue;
    end if;
    if qid = 'crisis_pain_start' then
      onset := raw;
      continue;
    end if;

    select * into q from private.question_catalog c where c.id = qid;
    ans := null;

    -- Old builds saved untouched answers as '' (or [] for checkboxes).
    if jsonb_typeof(raw) = 'null' or raw = '""'::jsonb or raw = '[]'::jsonb then
      ans := '{"status": "unknown"}';
    elsif q.kind = 'scale' and jsonb_typeof(raw) = 'number' then
      ans := jsonb_build_object('status', 'answered', 'value', raw);
      if (raw #>> '{}')::numeric = q.legacy_default then
        ans := ans || '{"unverified": true}';
      end if;
    elsif q.kind = 'single' and q.text_options <> '{}' and jsonb_typeof(raw) = 'string'
      and not (raw #>> '{}') = any(q.options) then
      -- Health-centre visit answered with free text instead of yes/no.
      ans := jsonb_build_object('status', 'answered', 'value', q.text_options[1],
        'text', jsonb_build_object(q.text_options[1], left(raw #>> '{}', 500)));
    elsif q.kind = 'multi' and q.parent_option is not null and jsonb_typeof(raw) = 'string' then
      -- Medication saved as a single value by early builds.
      s := lower(btrim(raw #>> '{}'));
      if s = any(q.exclusive_options) then
        ans := jsonb_build_object('status', 'answered', 'value', jsonb_build_array(s));
      elsif s = any(q.child_options) then
        ans := jsonb_build_object('status', 'answered', 'value', jsonb_build_array(q.parent_option, s));
      else
        ans := jsonb_build_object('status', 'answered',
          'value', jsonb_build_array(q.parent_option, q.text_options[1]),
          'text', jsonb_build_object(q.text_options[1], left(raw #>> '{}', 500)));
      end if;
    elsif (q.kind = 'boolean' and jsonb_typeof(raw) = 'boolean')
      or (q.kind in ('duration', 'single') and jsonb_typeof(raw) = 'string')
      or (q.kind = 'multi' and jsonb_typeof(raw) = 'array') then
      ans := jsonb_build_object('status', 'answered', 'value', raw);
    end if;

    if ans is null
      or cardinality(private.answer_problems(p_form, jsonb_build_object(qid, ans), true, false)) > 0 then
      ans := jsonb_build_object('status', 'unknown', 'legacy_raw', raw);
      review := true;
    end if;
    result := result || jsonb_build_object(qid, ans);
  end loop;

  if jsonb_array_length(unmapped) > 0 then
    result := result || jsonb_build_object('legacy_unmapped', unmapped);
  end if;
  return jsonb_build_object('answers', result, 'needs_review', review, 'onset_raw', onset);
end;
$$;

-- Converts a legacy onset answer: an ISO time, or a "how long ago" bucket from
-- early builds (approximated by the bucket's midpoint).
-- Returns {"onset_at": ..., "precision": ..., "needs_review": bool}.
create function private.convert_legacy_onset(p_raw jsonb, p_recorded_at timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  s text := case when jsonb_typeof(p_raw) = 'string' then p_raw #>> '{}' end;
  onset timestamptz;
  ago interval;
begin
  if p_raw is null or jsonb_typeof(p_raw) = 'null' or s = '' or s = '>4_horas' then
    return jsonb_build_object('onset_at', null, 'precision', 'unknown', 'needs_review', false);
  end if;
  if s ~ '^\d{4}-\d{2}-\d{2}T' then
    begin
      onset := s::timestamptz;
    exception when others then
      onset := null;
    end;
    if onset is not null and onset <= p_recorded_at + interval '10 minutes' then
      return jsonb_build_object('onset_at', onset, 'precision', 'exact', 'needs_review', false);
    end if;
  else
    ago := case s
      when '<30_min' then interval '15 minutes'
      when '30-60_min' then interval '45 minutes'
      when '1-2_horas' then interval '90 minutes'
      when '2-4_horas' then interval '3 hours'
    end;
    if ago is not null then
      return jsonb_build_object('onset_at', p_recorded_at - ago, 'precision', 'approximate', 'needs_review', false);
    end if;
  end if;
  return jsonb_build_object('onset_at', null, 'precision', 'unknown', 'needs_review', true);
end;
$$;

-- Applies one check_ins row to the new tables.
-- Daily: one row per user and UTC day; the latest recording wins and the one it
-- replaces is logged. Crisis: an ongoing episode is ended at the new crisis's
-- recording time, as the old builds had no way to end it.
create function private.apply_legacy_check_in(p_row public.check_ins, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv jsonb;
  onset jsonb;
  prev public.daily_checkins;
  day date := (p_row.date at time zone 'UTC')::date;
  onset_at timestamptz;
begin
  if p_row.type = 'checkin' then
    conv := private.convert_legacy_answers('daily', p_row.questions, p_row.answers);
    select * into prev from public.daily_checkins d
    where d.user_id = p_row.user_id and d.local_date = day
    for update;
    if found then
      if prev.recorded_at > p_row.date then
        insert into private.legacy_conversion_log (user_id, legacy_check_in_id, reason, payload)
        values (p_row.user_id, p_row.id, 'superseded_same_day', to_jsonb(p_row));
        return;
      end if;
      insert into private.legacy_conversion_log (user_id, legacy_check_in_id, reason, payload)
      values (p_row.user_id, prev.legacy_check_in_id, 'superseded_same_day', to_jsonb(prev));
      update public.daily_checkins set
        time_zone = null,
        answers = conv->'answers',
        form_version = 0,
        source = p_source,
        needs_review = (conv->>'needs_review')::boolean,
        legacy_check_in_id = p_row.id,
        recorded_at = p_row.date
      where id = prev.id;
    else
      insert into public.daily_checkins
        (user_id, local_date, time_zone, answers, form_version, source, needs_review, legacy_check_in_id, recorded_at)
      values
        (p_row.user_id, day, null, conv->'answers', 0, p_source, (conv->>'needs_review')::boolean, p_row.id, p_row.date);
    end if;
  else
    conv := private.convert_legacy_answers('episode', p_row.questions, p_row.answers);
    onset := private.convert_legacy_onset(conv->'onset_raw', p_row.date);
    onset_at := (onset->>'onset_at')::timestamptz;

    update public.episodes e set
      ended_at = greatest(coalesce(e.onset_at, e.recorded_at), p_row.date),
      end_source = 'legacy_next_checkin'
    where e.user_id = p_row.user_id and e.ended_at is null;

    insert into public.episodes
      (user_id, onset_at, onset_precision, ended_at, end_source, time_zone, answers, form_version,
       source, needs_review, legacy_check_in_id, recorded_at)
    values
      (p_row.user_id, onset_at, onset->>'precision',
       case when p_row.end_date is not null then greatest(p_row.end_date, onset_at) end,
       case when p_row.end_date is not null then 'legacy_next_checkin' end,
       null, conv->'answers', 0, p_source,
       (conv->>'needs_review')::boolean or (onset->>'needs_review')::boolean,
       p_row.id, p_row.date);
  end if;
end;
$$;

-- Keeps the new tables in step with builds that still write check_ins. A
-- conversion failure is logged and never fails the old build's save.
create function private.sync_legacy_check_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.daily_checkins where legacy_check_in_id = old.id;
    delete from public.episodes where legacy_check_in_id = old.id;
    return null;
  end if;

  begin
    if tg_op = 'INSERT' then
      perform private.apply_legacy_check_in(new, 'legacy_client');
    elsif new.end_date is not null and old.end_date is null then
      -- Old builds end crises by setting end_date when a no-headache check-in is saved.
      update public.episodes e set
        ended_at = greatest(new.end_date, e.onset_at),
        end_source = 'legacy_next_checkin'
      where e.legacy_check_in_id = new.id and e.ended_at is null;
    end if;
  exception when others then
    insert into private.legacy_conversion_log (user_id, legacy_check_in_id, reason, payload, detail)
    values (new.user_id, new.id, 'conversion_failed', to_jsonb(new), sqlerrm);
  end;
  return null;
end;
$$;

-- ============================================================================
-- Write functions
-- ============================================================================
create function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create function private.check_time_zone(p_time_zone text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_time_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'invalid_time_zone' using errcode = 'P0001', detail = coalesce(p_time_zone, 'null');
  end if;
end;
$$;

-- Records a client request ID. Returns is_new = false and the stored target
-- when the request was already processed.
create function private.claim_request(p_user uuid, p_client_id uuid, p_target text, out is_new boolean, out target_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  stored_target text;
begin
  if p_client_id is null then
    raise exception 'client_id_required' using errcode = 'P0001';
  end if;
  insert into private.write_requests (user_id, client_id, target)
  values (p_user, p_client_id, p_target)
  on conflict do nothing;
  if found then
    is_new := true;
    return;
  end if;
  select w.target, w.target_id into stored_target, target_id
  from private.write_requests w
  where w.user_id = p_user and w.client_id = p_client_id;
  if stored_target <> p_target then
    raise exception 'client_id_reused' using errcode = 'P0001';
  end if;
  is_new := false;
end;
$$;

create function private.raise_invalid_answers(p_problems text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if cardinality(p_problems) > 0 then
    raise exception 'invalid_answers' using errcode = 'P0001', detail = array_to_string(p_problems, '; ');
  end if;
end;
$$;

-- Saves the daily check-in for p_local_date, replacing that day's check-in if
-- one exists. Retrying with the same p_client_id returns the stored row (null if
-- it has since been deleted).
create function public.save_daily_checkin(
  p_client_id uuid,
  p_local_date date,
  p_time_zone text,
  p_form_version integer,
  p_answers jsonb
) returns public.daily_checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  req record;
  r public.daily_checkins;
begin
  req := private.claim_request(uid, p_client_id, 'daily_checkin');
  if not req.is_new then
    select * into r from public.daily_checkins d where d.id = req.target_id and d.user_id = uid;
    return r;
  end if;

  perform private.check_time_zone(p_time_zone);
  if p_local_date is null or p_local_date < date '2000-01-01'
    or p_local_date > (now() at time zone p_time_zone)::date then
    raise exception 'invalid_local_date' using errcode = 'P0001';
  end if;
  if p_form_version is null or p_form_version < 1 then
    raise exception 'invalid_form_version' using errcode = 'P0001';
  end if;
  perform private.raise_invalid_answers(private.answer_problems('daily', p_answers));

  insert into public.daily_checkins (user_id, local_date, time_zone, answers, form_version, source)
  values (uid, p_local_date, p_time_zone, p_answers, p_form_version, 'manual')
  on conflict (user_id, local_date) do update set
    time_zone = excluded.time_zone,
    answers = excluded.answers,
    form_version = excluded.form_version,
    source = excluded.source,
    needs_review = false,
    legacy_check_in_id = null
  returning * into r;

  update private.write_requests w set target_id = r.id
  where w.user_id = uid and w.client_id = p_client_id;
  return r;
end;
$$;

-- Starts an ongoing episode. Raises episode_ongoing (detail: the ongoing
-- episode's ID) if one is already ongoing. Retrying with the same p_client_id
-- returns the stored row.
create function public.start_episode(
  p_client_id uuid,
  p_onset_at timestamptz,
  p_onset_precision text,
  p_time_zone text,
  p_source text,
  p_form_version integer,
  p_answers jsonb
) returns public.episodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  req record;
  r public.episodes;
  violated text;
begin
  req := private.claim_request(uid, p_client_id, 'episode');
  if not req.is_new then
    select * into r from public.episodes e where e.id = req.target_id and e.user_id = uid;
    return r;
  end if;

  perform private.check_time_zone(p_time_zone);
  if p_source is null or p_source not in ('manual', 'voice') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if p_onset_precision is null or p_onset_precision not in ('exact', 'approximate', 'unknown')
    or (p_onset_at is null) <> (p_onset_precision = 'unknown')
    or p_onset_at > now() + interval '10 minutes' then
    raise exception 'invalid_onset' using errcode = 'P0001';
  end if;
  if p_form_version is null or p_form_version < 1 then
    raise exception 'invalid_form_version' using errcode = 'P0001';
  end if;
  perform private.raise_invalid_answers(private.answer_problems('episode', p_answers));

  begin
    insert into public.episodes (user_id, onset_at, onset_precision, time_zone, answers, form_version, source)
    values (uid, p_onset_at, p_onset_precision, p_time_zone, p_answers, p_form_version, p_source)
    returning * into r;
  exception when unique_violation then
    get stacked diagnostics violated = constraint_name;
    if violated = 'episodes_one_ongoing_per_user' then
      raise exception 'episode_ongoing' using errcode = 'P0001',
        detail = (select e.id::text from public.episodes e where e.user_id = uid and e.ended_at is null);
    end if;
    raise;
  end;

  update private.write_requests w set target_id = r.id
  where w.user_id = uid and w.client_id = p_client_id;
  return r;
end;
$$;

-- Ends the caller's ongoing episode. Repeating the call with the same end time
-- returns the row unchanged.
create function public.end_episode(p_episode_id uuid, p_ended_at timestamptz)
returns public.episodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  r public.episodes;
begin
  select * into r from public.episodes e where e.id = p_episode_id and e.user_id = uid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.ended_at is not null then
    if r.ended_at = p_ended_at and r.end_source = 'user' then
      return r;
    end if;
    raise exception 'episode_already_ended' using errcode = 'P0001';
  end if;
  if p_ended_at is null or p_ended_at > now() + interval '10 minutes'
    or (r.onset_at is not null and p_ended_at < r.onset_at) then
    raise exception 'invalid_end_time' using errcode = 'P0001';
  end if;

  update public.episodes e set ended_at = p_ended_at, end_source = 'user'
  where e.id = p_episode_id
  returning * into r;
  return r;
end;
$$;

-- Corrects an episode's onset and answers.
create function public.update_episode(
  p_episode_id uuid,
  p_onset_at timestamptz,
  p_onset_precision text,
  p_answers jsonb
) returns public.episodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  r public.episodes;
begin
  select * into r from public.episodes e where e.id = p_episode_id and e.user_id = uid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_onset_precision is null or p_onset_precision not in ('exact', 'approximate', 'unknown')
    or (p_onset_at is null) <> (p_onset_precision = 'unknown')
    or p_onset_at > r.recorded_at + interval '10 minutes'
    or (r.ended_at is not null and p_onset_at > r.ended_at) then
    raise exception 'invalid_onset' using errcode = 'P0001';
  end if;
  perform private.raise_invalid_answers(private.answer_problems('episode', p_answers));

  update public.episodes e set
    onset_at = p_onset_at,
    onset_precision = p_onset_precision,
    answers = p_answers,
    needs_review = false,
    legacy_check_in_id = null
  where e.id = p_episode_id
  returning * into r;
  return r;
end;
$$;

-- Deletes the caller's record and, for converted records, the check_ins row it
-- came from. Returns false if there was nothing to delete.
create function public.delete_daily_checkin(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  legacy_id uuid;
begin
  delete from public.daily_checkins d where d.id = p_id and d.user_id = uid
  returning d.legacy_check_in_id into legacy_id;
  if not found then
    return false;
  end if;
  delete from public.check_ins c where c.id = legacy_id and c.user_id = uid;
  return true;
end;
$$;

create function public.delete_episode(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  legacy_id uuid;
begin
  delete from public.episodes e where e.id = p_id and e.user_id = uid
  returning e.legacy_check_in_id into legacy_id;
  if not found then
    return false;
  end if;
  delete from public.check_ins c where c.id = legacy_id and c.user_id = uid;
  return true;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
  public.save_daily_checkin(uuid, date, text, integer, jsonb),
  public.start_episode(uuid, timestamptz, text, text, text, integer, jsonb),
  public.end_episode(uuid, timestamptz),
  public.update_episode(uuid, timestamptz, text, jsonb),
  public.delete_daily_checkin(uuid),
  public.delete_episode(uuid)
from public, anon;
grant execute on function
  public.save_daily_checkin(uuid, date, text, integer, jsonb),
  public.start_episode(uuid, timestamptz, text, text, text, integer, jsonb),
  public.end_episode(uuid, timestamptz),
  public.update_episode(uuid, timestamptz, text, jsonb),
  public.delete_daily_checkin(uuid),
  public.delete_episode(uuid)
to authenticated;

-- ============================================================================
-- Convert existing records, then keep converting saves from old builds.
-- ============================================================================
do $$
declare
  c public.check_ins;
begin
  for c in select * from public.check_ins order by date, created_at, id loop
    perform private.apply_legacy_check_in(c, 'legacy_import');
  end loop;
end;
$$;

create trigger sync_legacy_check_in
  after insert or update or delete on public.check_ins
  for each row execute function private.sync_legacy_check_in();
