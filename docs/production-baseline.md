# Production Baseline

Project is on the Supabase Free tier: no platform backups or leaked-password protection.

Captured 10 October 2026 from project `bnflsokqzaoxmwhzrpwv` (Postgres 17.6.1.063, us-east-2) using read-only Supabase CLI commands. Changes applied the same day are marked "changed"; `supabase/config.toml` mirrors the production Auth, API, database, pooler and storage settings (`supabase config diff` is empty). Phase 0 of [the implementation plan](app-migraine-implementation-plan.md).

## Schema and functions

- Migration history: `001`, `002`, `20260218174106`, `20261010230440` applied remotely and present in Git. `001` and `002` were applied outside the CLI and registered with `migration repair` on 10 October 2026; `20261010230440_harden_table_access` was applied with `db push` the same day (changed).
- Live tables, columns, constraints, indexes, RLS flags, 16 policies, 3 triggers, and `update_updated_at_column` match the migrations. No undocumented objects in `public`.
- Table grants (changed): `anon` has none; `authenticated` has SELECT, INSERT, UPDATE, DELETE; `service_role` keeps all privileges. Before Phase 1, `anon` and `authenticated` also held every privilege, including TRUNCATE, REFERENCES, and TRIGGER.
- Default privileges for tables and sequences created by `postgres` in `public` (changed): no grants to `anon`; no TRUNCATE, REFERENCES, or TRIGGER for `authenticated`. Defaults for functions are unchanged (PUBLIC can execute new functions; there are no callable functions).
- Policies (changed): the 16 ownership policies apply to `authenticated` only and use `(select auth.uid()) = user_id`; rules are otherwise unchanged. Rollback: `supabase/rollbacks/20261010230440_harden_table_access.down.sql`. Access is covered by `supabase/tests/database/access.test.sql`.
- Role simulation after Phase 1: `anon` gets `permission denied` on every table; an unrelated signed-in user sees no rows; the sampled owner sees only their own rows (48 check-ins, 29 load rows, 33 training points, 1 profile), as before.
- Edge Function `delete-user` (changed): version 2, `verify_jwt = true`, source identical to `supabase/functions/delete-user/index.ts`. Accepts POST only (version 1 deleted the account on any method), pins `supabase-js` 2.93.1, and returns sanitized errors.
- Function secrets: only the platform defaults (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`).
- App source contains no service-role key references.
- EAS environment variables: `development`, `preview`, and `production` all set `EXPO_PUBLIC_SUPABASE_URL` to this project and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to its active publishable key (matched by fingerprint). Each is defined at project and account (shared) scope with identical values. No service-role key is defined.

## Auth

| Setting | Value |
| --- | --- |
| Email confirmation | **Disabled** (kept off by decision) |
| Signup | Enabled (email); anonymous and SMS disabled |
| Minimum password length | 8, no character requirements (changed from 6; the app additionally requires 2 digits and a symbol) |
| Leaked-password protection | **Disabled** (security advisor); requires Pro, project is on Free |
| Site URL | `appmigraine://` (changed from `http://localhost:3000`) |
| Redirect allowlist | `appmigraine://**` |
| JWT expiry | 3600 s |
| Refresh token rotation | Enabled, 10 s reuse interval |
| Secure password change | Enabled (changed) |
| Email OTP | 8 digits, 3600 s expiry, 1 email/min |
| TOTP MFA | Enroll and verify enabled (not used by the app) |
| Session timebox / inactivity timeout | Not set |

## API and network

- Exposed schemas: `public`, `graphql_public`. Max rows per request: **1000**.
- SSL enforcement for direct database connections: enabled (changed from disabled).
- Database network restrictions: none (`0.0.0.0/0`, `::/0`). Only the Supabase CLI connects directly; the app uses the HTTP APIs.

## Backups

- `backups list`: **no backups available**. WAL-G enabled; PITR disabled.
- Logical backup taken 10 October 2026 18:14 UTC with `scripts/db_backup.py`: auth users and identities plus all app tables (6/6/1/55/34/33 rows), AES-256 encrypted with a passphrase held by the project owner, stored outside the repo. Restore not yet rehearsed.

## Advisors

- Security: 1 warning, `auth_leaked_password_protection` (requires Pro).
- Performance: 3 `unused_index` notices, kept until real query plans justify removal. The 16 `auth_rls_initplan` warnings were resolved by `20261010230440` (changed).

## Not captured

- Distributed app versions (App Store Connect / Play Console / EAS).
