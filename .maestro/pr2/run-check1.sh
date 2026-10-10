#!/usr/bin/env bash
# Check 1 (PR 2): a save on a stalled connection fails visibly and keeps the
# answers; retrying with rapid taps saves exactly once.
# Needs: local Supabase running, the app signed in on a booted simulator.
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
export PATH="$JAVA_HOME/bin:$HOME/.docker/bin:$PATH"

KONG=supabase_kong_app-migraine
DB=supabase_db_app-migraine
count() { docker exec "$DB" psql -U postgres -tAc "select count(*) from public.check_ins where type = 'checkin'"; }
trap 'docker unpause "$KONG" >/dev/null 2>&1 || true' EXIT

before=$(count)
maestro test check1-fill.yaml
docker pause "$KONG" >/dev/null
maestro test check1-fail.yaml
docker unpause "$KONG" >/dev/null
[ "$(count)" -eq "$before" ] || { echo "FAIL: a row was written while the API was paused"; exit 1; }
maestro test check1-retry.yaml
sleep 2
after=$(count)
[ "$after" -eq $((before + 1)) ] || { echo "FAIL: expected $((before + 1)) check-ins, found $after"; exit 1; }
echo "PASS: failed save kept the form; retry saved exactly one check-in ($before -> $after)"
