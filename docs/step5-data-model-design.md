# Step 5 Design: Structured Records, Migration and Reports

Draft, 18 October 2026. Covers Phases 2 and 3 of [the implementation plan](app-migraine-implementation-plan.md) and the report fixes that depend on them. Clinical wording and the dashboard's health indicators stay in Phase 5.

## Decisions

- Existing production data is test data: 55 records from 4 users, none newer than 14 July 2026. It is converted for continuity, with a simple reconciliation. The encrypted backup of 10 October stays the record of the original data.
- Builds already installed (SDK 54) keep working. The database accepts their text-based payload and converts it until the new build is widely installed.
- One daily check-in per user per local day. Saving again for the same day edits that check-in.
- Old slider defaults are kept and marked unverified, not deleted.
- iOS 16.4 minimum (step 4).
- The restore rehearsal of the backup happens before the first step 5 migration reaches production.

## Starting point

Captured from production (aggregates only) and the code at `3cf55f5`.

- `check_ins` stores each record as `questions text[]` (full Spanish wording) and a positional `answers` array. Nine question sets exist: daily check-ins with 3, 5, 9 or 13 questions, and crises with 7 or 8.
- Three measurements changed meaning over time:
  - "¿Qué tan bien dormiste anoche?" (quality, 0–10) became "¿Cuántas horas dormiste anoche?" (hours, 0–12).
  - "¿Cómo ha sido tu consumo de cafeína…?" (0–10) became "¿Cuántas tazas de café tomaste?" (cups, 0–5).
  - Activity impact was once an option (`no`, `si_un_poco`, `si_totalmente`) and is now a 0–10 scale. Medication was once a single option (`no`, `Aspirina`) and is now a list.
- 10 user-days have more than one daily check-in.
- Every reader finds answers by substring of the question text or by position. Known effects:
  - The report's medication field is overwritten by the pain-management answer (`utils/reportData.ts:189`), because that question's wording contains "medicación".
  - The dashboard's duration criterion tests values the current form never produces (`utils/storage.ts:102`), so it never matches.
  - Crisis wording is not recognised by `mapAnswersByQuestion`.
- "Otra / especifique" free text is never saved.
- Saves have no request ID. A request that times out on the client after the server commits is duplicated by the retry.
- Saving a "no headache" check-in closes every open crisis in a separate, unchecked request and uses the check-in time as the end time. Nothing prevents several open crises.
- Dates are UTC instants with no timezone. Day grouping mixes UTC day keys with local month and calendar boundaries.
- The legacy local-data upload uses a device-wide flag, uploads to whoever signs in first, and marks partial failures as complete.
- `cl_history` (34 rows) and `threshold_data` (33 rows) are no longer written by current code; builds older than PR 2 still write them.
- 3 users have records but no profile; 2 have neither.

## Data model

All new objects live in `public`, have RLS enabled, and follow the Phase 1 grants: `anon` gets nothing, `authenticated` gets SELECT through owner policies, and writes go through functions only (below).

### Question catalog

`question_catalog` holds one row per stable question ID:

| Column | Meaning |
| --- | --- |
| `id` | Stable ID, e.g. `headache_24h`, `intensity_max_today`, `sleep_hours`, `sleep_quality`, `caffeine_cups`, `caffeine_intake`, `activity_impact`, `activity_impact_level` |
| `form` | `daily` or `episode` |
| `kind` | `boolean`, `scale`, `options`, `duration`, `datetime`, `yes_no_text` |
| `min`, `max` | Scale bounds |
| `options` | Allowed option values; `exclusive` lists values that cannot be combined |
| `retired` | True for legacy-only questions (`sleep_quality`, `caffeine_intake`, `activity_impact_level`) |

The current app's IDs (`q1_headache`, `crisis_intensity`, …) map one-to-one onto catalog IDs, so the app keeps its definitions and sends catalog IDs. Wording stays in the app; the catalog stores only the structure needed for validation.

`legacy_question_map(text, question_id)` maps each historical full question text to a catalog ID. It is seeded with the texts of the nine production sets and the current app texts.

### Answers

`answers` is a JSON object keyed by question ID. A key is present only if the question was asked. Each value is one of:

```json
{"status": "answered", "value": 7}
{"status": "answered", "value": ["si", "ibuprofeno", "otra_medicacion"], "text": {"otra_medicacion": "naproxeno"}}
{"status": "skipped"}
{"status": "unknown"}
```

- `skipped`: the user chose "Prefiero no responder".
- `unknown`: asked but not understood or not answered (voice timeouts, legacy empty strings).
- Absent key: not asked (conditional questions).
- Optional flags: `"unverified": true` for legacy slider values equal to the old default, `"approximate": true` for voice onset buckets.

Validation (`validate_answers(form, answers)`) checks every key against the catalog: known ID for the form, value type, scale bounds, allowed options, exclusive options, and required questions. It runs inside the write functions. It is not a CHECK constraint, because it reads the catalog table.

### Daily check-ins

`daily_checkins`:

| Column | Notes |
| --- | --- |
| `id` | uuid |
| `user_id` | FK to `auth.users`, cascade delete, indexed |
| `local_date` | The day the check-in describes, in the user's timezone |
| `time_zone` | IANA name from the device, null for converted legacy rows |
| `answers` | As above |
| `form_version` | App form version that produced the answers |
| `source` | `manual`, `legacy_client` or `legacy_import` |
| `client_id` | uuid generated by the app per save attempt |
| `recorded_at`, `updated_at` | Server timestamps |
| `legacy_check_in_id` | Source row in `check_ins`, if converted |
| `needs_review` | True when conversion met unknown wording or a malformed answer |

Constraints: `unique (user_id, local_date)`, `unique (user_id, client_id)`.

### Episodes (crises)

`episodes`:

| Column | Notes |
| --- | --- |
| `id`, `user_id`, `answers`, `form_version`, `client_id`, `recorded_at`, `updated_at`, `legacy_check_in_id`, `needs_review` | As for check-ins |
| `onset_at` | When the pain started, as reported |
| `onset_precision` | `exact`, `approximate` (voice buckets) or `unknown` |
| `ended_at` | When the pain ended, null while ongoing |
| `end_source` | `user` (reported end time) or `legacy_next_checkin` (old automatic close) |
| `time_zone` | As for check-ins |
| `source` | `manual`, `voice`, `legacy_client` or `legacy_import` |

Constraints:
- `unique (user_id, client_id)`.
- `ended_at >= onset_at` when both are set.
- `onset_at <= recorded_at`, with a few minutes' allowance for clock skew.
- At most one ongoing episode per user: a partial unique index on `(user_id) where ended_at is null`.

Daily check-ins and episodes are not linked by a foreign key. A report relates them by date range: an episode covers the local days from onset to end.

### Write functions

Writes go through `security definer` functions with `set search_path = ''`. Each takes the user from `auth.uid()` once, validates, and writes in one transaction. `execute` is granted to `authenticated` only, and table INSERT, UPDATE and DELETE are revoked from `authenticated` on the new tables.

| Function | Behaviour |
| --- | --- |
| `save_daily_checkin(client_id, local_date, time_zone, form_version, answers)` | Upsert on `(user_id, local_date)`. A repeated `client_id` returns the stored row without changes, so a retry after a timeout is harmless. |
| `start_episode(client_id, onset_at, onset_precision, time_zone, source, form_version, answers)` | Inserts an ongoing episode. If one is already ongoing, raises a distinct error so the app can offer to end or continue it. Repeated `client_id` returns the stored row. |
| `end_episode(episode_id, ended_at)` | Sets `ended_at` and `end_source = 'user'` on the caller's ongoing episode. |
| `update_episode(episode_id, answers, onset_at, onset_precision)` | Corrects an episode's answers or onset. |
| `delete_daily_checkin(id)`, `delete_episode(id)` | Delete the caller's own row. |

A "no headache" check-in no longer ends an episode by itself. When one is ongoing, the app asks whether it has ended and when, and then calls `end_episode`.

### Old clients

Builds already installed keep writing to `check_ins` exactly as today. A trigger on `check_ins` converts each change:

- Insert: map texts through `legacy_question_map` and write a `daily_checkins` or `episodes` row with `source = 'legacy_client'` and `legacy_check_in_id` set. A second daily check-in on the same day updates that day's row. A crisis inserted while one is ongoing ends the earlier one at the new crisis's recording time, with `end_source = 'legacy_next_checkin'`.
- Update of `end_date` (the old automatic close): set `ended_at` with `end_source = 'legacy_next_checkin'`.
- Delete: delete the linked row.

The `check_ins` row is kept, so old builds still show their own entries. Records saved by the new app are not visible to old builds; that is acceptable while old and new builds are not used side by side on one account.

Unknown wording never fails the old client's save. The converted row gets `needs_review = true`, and unmapped pairs are kept in `answers` under a `legacy_unmapped` key.

`cl_history` and `threshold_data` stay as they are, as a frozen legacy snapshot. The new app does not read or write them. They are dropped with `check_ins` once old builds are retired.

## Conversion of existing records

One migration converts the 55 existing `check_ins` rows with the same mapping as the trigger:

- Questions map through `legacy_question_map`; all nine production sets are covered.
- Booleans, numbers, arrays and option strings become `answered`. A legacy single medication string becomes a one-item list (`'no'` → `['no']`, `'Aspirina'` → `['si', 'aspirina']`). Empty strings become `unknown`: builds before PR 2 stored untouched answers as `''`, and no store build has the skip option.
- Slider answers equal to the old default (intensity 5, activity impact 5, sleep hours 6, stress 5, alcohol 5, caffeine cups 3) on records saved before the PR 2 build are flagged `unverified`.
- Durations are kept as hours (`<1_hora` → 0, `N_horas` → N); older bucket values (`1-4_horas`, `todo_el_dia`, …) are kept as ranges.
- `time_zone` is null for every converted row. `local_date` is the UTC date and the row is marked as a legacy timezone; reports show this.
- Crisis `end_date` values become `ended_at` with `end_source = 'legacy_next_checkin'`.
- The 10 user-days with more than one daily check-in keep the latest; the others are recorded in a `legacy_conversion_log` table with their original payload.

Afterwards the migration logs counts by type, `needs_review` and `unverified`, and these are checked against the backup's counts. Because the data is test data, nothing beyond this count check is required before release.

## Local-data upload

The AsyncStorage upload from the pre-Supabase app is replaced:
- The completion flag becomes per account and is written only after every record is confirmed.
- The app asks before importing device data into the signed-in account; it never imports automatically.
- Each local record gets a deterministic `client_id` derived from its local ID, so reruns do not duplicate.
- Records are imported through the same `legacy_import` path as the conversion above.

Recommended alternative given the decisions: remove the upload entirely, since any remaining pre-Supabase local data belongs to testers. See open questions.

## App changes

- Check-in, crisis and voice screens send catalog IDs, typed answers, free text, `client_id`, `local_date` and the device timezone through the write functions. The `client_id` is created once per form and reused by retries.
- Opening the check-in for a day that already has one loads it for editing.
- Starting a crisis while one is ongoing offers to end the earlier one (with its end time) or to keep recording into it.
- The diary, report and dashboard read `daily_checkins` and `episodes` by question ID. This fixes the medication overwrite, the never-matching duration criterion, and the unrecognised crisis wording, without changing what the dashboard says.
- Day grouping uses `local_date` for check-ins and the stored timezone for episodes, consistently in the diary, calendar and report.
- Reports show converted legacy data as such (unverified values, unknown timezone).

## Rollout

1. Database migration (additive): catalog, new tables, RLS, functions, `check_ins` trigger, conversion of existing rows. Old builds keep working unchanged.
2. App build using the new functions and tables, shipped with the store builds after the iPhone checks.
3. After adoption: stop accepting old payloads, then drop `check_ins`, `cl_history` and `threshold_data` in a later migration.

Rollback for step 1 is a down migration that drops the new objects; `check_ins` is never modified, so old builds are unaffected either way.

## Tests

- pgTAP:
  - RLS and grants on the new tables.
  - Direct writes are rejected.
  - Validation rejects unknown IDs, out-of-range values, mixed exclusive options and missing required answers.
  - Repeated `client_id` returns one row.
  - The one-per-day and one-ongoing-episode rules hold.
  - `end_episode` ordering is enforced.
  - The trigger converts a fixture for each of the nine production question sets and old-style closes and deletes.
- Jest: question ID mapping, answer encoding, local date and timezone handling, report counts (medication versus pain management, durations).
- Maestro: update the existing flows for the new save path and add flows for editing today's check-in and ending an ongoing crisis.

## Pull requests

1. Database: catalog, tables, functions, trigger, conversion, pgTAP.
2. App writes: check-in, crisis and voice save paths; editing; ending episodes.
3. App reads: diary, report and dashboard by question ID; day grouping.
4. Local-data upload: harden or remove.

## Open questions

- Remove the pre-Supabase local-data upload (recommended) or harden it?
- Should old builds be blocked after a cut-off date, or simply retired once usage stops?
