# Production Baseline

Captured 10 October 2026 from project `bnflsokqzaoxmwhzrpwv` (Postgres 17.6.1.063, us-east-2) using read-only Supabase CLI commands. Phase 0 of [the implementation plan](app-migraine-implementation-plan.md).

## Schema and functions

- Migration history: `001`, `002`, `20260218174106` applied remotely and present in Git. `001` and `002` were applied outside the CLI and registered with `migration repair` on 10 October 2026.
- Live tables, columns, constraints, indexes, RLS flags, 16 policies, 3 triggers, and `update_updated_at_column` match those three migrations. No undocumented objects in `public`.
- Table grants: `anon`, `authenticated`, and `service_role` hold all privileges, including TRUNCATE, REFERENCES, and TRIGGER (Supabase defaults; Phase 1 revokes them).
- Edge Function `delete-user`: version 1, `verify_jwt = true`, source identical to `supabase/functions/delete-user/index.ts`.
- Function secrets: only the platform defaults (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`).
- App source contains no service-role key references. EAS environment variables were not inspected.

## Auth

| Setting | Value |
| --- | --- |
| Email confirmation | **Disabled** |
| Signup | Enabled (email); anonymous and SMS disabled |
| Minimum password length | 6, no character requirements |
| Leaked-password protection | **Disabled** (security advisor) |
| Site URL | `http://localhost:3000` |
| Redirect allowlist | `appmigraine://**` |
| JWT expiry | 3600 s |
| Refresh token rotation | Enabled, 10 s reuse interval |
| Secure password change | Disabled |
| Email OTP | 8 digits, 3600 s expiry, 1 email/min |
| TOTP MFA | Enroll and verify enabled (not used by the app) |
| Session timebox / inactivity timeout | Not set |

## API and network

- Exposed schemas: `public`, `graphql_public`. Max rows per request: **1000**.
- SSL enforcement for direct database connections: **disabled**.
- Database network restrictions: none (`0.0.0.0/0`, `::/0`).

## Backups

- `backups list`: **no backups available**. WAL-G enabled; PITR disabled.
- A restore rehearsal is therefore not possible from platform backups. A logical dump is needed before any production data repair.

## Advisors

- Security: 1 warning, `auth_leaked_password_protection`.
- Performance: 16 `auth_rls_initplan` warnings; 3 `unused_index` notices.

## Not captured

- Distributed app versions (App Store Connect / Play Console / EAS).
- Subscription tier (determines leaked-password protection and backup availability).
- EAS environment variables.
