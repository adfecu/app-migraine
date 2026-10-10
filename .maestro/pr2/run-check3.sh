#!/usr/bin/env bash
# Check 3 (PR 2): a password recovery link opens the reset form, both while the
# app is running (warm) and when it is closed (cold).
# Uses a dedicated local user, so the signed-in test account's password is untouched.
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
export PATH="$JAVA_HOME/bin:$PATH"

API=http://127.0.0.1:54321
# Standard local Supabase service key (local stack only, not a secret).
SR=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
APP=com.twooceansinhealth.appmigraine
EMAIL=e2e-recovery@example.test

curl -s -o /dev/null -X POST "$API/auth/v1/admin/users" -H "apikey: $SR" -H "Authorization: Bearer $SR" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"Inicio12!\",\"email_confirm\":true}"

# The app-facing redirect of a fresh recovery link (what the email link resolves to).
recovery_redirect() {
  local link
  link=$(curl -s -X POST "$API/auth/v1/admin/generate_link" -H "apikey: $SR" -H "Authorization: Bearer $SR" \
    -H 'Content-Type: application/json' \
    -d "{\"type\":\"recovery\",\"email\":\"$EMAIL\",\"redirect_to\":\"appmigraine://reset-password\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["action_link"])')
  curl -s -o /dev/null -D - "$link" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r'
}

echo "== warm start"
# Start from a freshly launched app on the dashboard, then deliver the link.
maestro test relaunch.yaml
xcrun simctl openurl booted "$(recovery_redirect)"
maestro test check3-reset.yaml

echo "== cold start"
xcrun simctl terminate booted "$APP" || true
sleep 1
xcrun simctl openurl booted "$(recovery_redirect)"
maestro test check3-reset.yaml

echo "PASS: recovery link opened the reset form on warm and cold start"
