#!/usr/bin/env bash
# Step 5 (PR 2): saves go through the new write functions.
# 1. A save while the API is unreachable fails visibly; rapid retries store one check-in.
# 2. A save the server stores after the app gave up (15 s timeout) is not duplicated by the retry.
# 3. Opening the check-in again the same day edits it.
# 4. A crisis can be ended; a second crisis asks to end the first; a no-headache check-in asks too.
# 5. Sliders store touched values and "Prefiero no responder" as skipped.
# Needs: local Supabase running, the app signed in as maestro@example.test (login.yaml) on a booted simulator.
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
export PATH="$JAVA_HOME/bin:$HOME/.docker/bin:$PATH"
KONG=supabase_kong_app-migraine
DB=supabase_db_app-migraine
USER_SQL="(select id from auth.users where email = 'maestro@example.test')"
sql() { docker exec -i "$DB" psql -U postgres -tAX -c "$1"; }
reset() {
  sql "delete from public.daily_checkins where user_id = $USER_SQL;
       delete from public.episodes where user_id = $USER_SQL;
       delete from private.write_requests where user_id = $USER_SQL;" >/dev/null
}
daily() { sql "select count(*) from public.daily_checkins where user_id = $USER_SQL"; }
requests() { sql "select count(*) from private.write_requests where user_id = $USER_SQL and target = '$1'"; }
expect() { [ "$2" = "$3" ] || { echo "FAIL: $1 (expected $3, got $2)"; exit 1; }; echo "ok: $1"; }
trap 'docker unpause "$KONG" >/dev/null 2>&1 || true' EXIT

echo "== 1. API unreachable"
reset
maestro test checkin-fill.yaml
docker pause "$KONG" >/dev/null
maestro test ../pr2/check1-fail.yaml
docker unpause "$KONG" >/dev/null
expect "nothing stored while the API was paused" "$(daily)" 0
maestro test ../pr2/check1-retry.yaml
sleep 2
expect "one check-in after rapid retries" "$(daily)" 1
expect "one request ID used" "$(requests daily_checkin)" 1

echo "== 2. Stored after the app timed out"
reset
maestro test checkin-fill.yaml
# The server stores the save but its response never reaches the app: a short lock
# holds the save in the database, the gateway is paused while it waits, and the
# app gives up after 15 s. (The database cancels statements after 8 s, so the
# save itself cannot outlast the app.)
docker exec -i "$DB" psql -U postgres -qX >/dev/null <<'SQL' &
begin;
lock table private.write_requests in exclusive mode;
-- Release 5 s after the app's save starts waiting (within the 8 s statement limit).
do $$
begin
  for i in 1..300 loop
    -- pg_stat_activity is otherwise read once per transaction.
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where pid <> pg_backend_pid() and wait_event_type = 'Lock' and query like '%save_daily_checkin%');
    perform pg_sleep(0.2);
  end loop;
end $$;
select pg_sleep(5);
commit;
SQL
LOCK=$!
(
  for _ in $(seq 1 150); do
    waiting=$(sql "select count(*) from pg_stat_activity where query like '%save_daily_checkin%' and wait_event_type = 'Lock'")
    if [ "$waiting" -gt 0 ]; then docker pause "$KONG" >/dev/null; exit 0; fi
    sleep 0.2
  done
) &
PAUSER=$!
maestro test ../pr2/check1-fail.yaml
wait "$LOCK" "$PAUSER"
docker unpause "$KONG" >/dev/null
sleep 2
expect "the server stored the save the app gave up on" "$(daily)" 1
maestro test checkin-retry-once.yaml
sleep 2
expect "the retry did not add a check-in" "$(daily)" 1
expect "the retry reused the request ID" "$(requests daily_checkin)" 1

echo "== 3. Editing today's check-in"
before=$(sql "select updated_at from public.daily_checkins where user_id = $USER_SQL")
maestro test checkin-edit.yaml
sleep 1
expect "still one check-in" "$(daily)" 1
after=$(sql "select updated_at from public.daily_checkins where user_id = $USER_SQL")
[ "$before" != "$after" ] || { echo "FAIL: the edit did not update the check-in"; exit 1; }
echo "ok: the edit updated today's check-in"

echo "== 4. Crises"
reset
maestro test crisis-fill.yaml
maestro test crisis-save.yaml
expect "one ongoing episode" "$(sql "select count(*) from public.episodes where user_id = $USER_SQL and ended_at is null")" 1
expect "the manual onset is exact" "$(sql "select onset_precision from public.episodes where user_id = $USER_SQL")" exact
maestro test crisis-fill.yaml
maestro test crisis-second.yaml
expect "two episodes" "$(sql "select count(*) from public.episodes where user_id = $USER_SQL")" 2
expect "the first ended by the user" "$(sql "select count(*) from public.episodes where user_id = $USER_SQL and end_source = 'user'")" 1
maestro test checkin-ends-crisis.yaml
expect "no ongoing episode after the check-in prompt" "$(sql "select count(*) from public.episodes where user_id = $USER_SQL and ended_at is null")" 0
expect "the crisis answers are stored by ID" "$(sql "select answers->'crisis_aura'->>'status' || ':' || (answers->'crisis_intensity'->>'status') from public.episodes where user_id = $USER_SQL order by recorded_at limit 1")" "answered:skipped"

echo "== 5. Sliders"
reset
maestro test ../pr2/check5-sliders.yaml
expect "a touched slider is stored, skipped ones are marked skipped" \
  "$(sql "select (answers->'q_sleep'->>'value') || ':' || (answers->'q_stress'->>'status') from public.daily_checkins where user_id = $USER_SQL")" "6:skipped"

echo "PASS: step 5 saves"
