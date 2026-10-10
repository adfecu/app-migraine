# MigraineTrack Implementation and Release Plan

MigraineTrack needs reliable patient records, correctly enforced database access, and health indicators whose wording matches their evidence. Implement the work in the order below. Preserve original records throughout migration and keep new database changes compatible with older installed app versions until the replacement build is adopted.

The plan covers the Expo/React Native platform and native dependencies, Supabase schema and policies, Auth, account deletion, migration, voice recording, diary, reports, and release verification. It does not authorize production changes or record deletion.

## Audit baseline

As of 10 October 2026, the connected project matches the repository reference. The database contains 55 check-ins and crisis records, 34 cumulative-load records, 33 threshold-training points, one settings/profile row, and six Auth users. Three users with records have no profile. Five user/day groups have multiple training points, with a maximum of 12. Multiple training points are consistent with repeated dashboard processing but do not establish their cause.

All four app tables have RLS enabled. Read-only role simulations returned zero records for unauthenticated and unrelated users; a selected owner saw exactly their 48 check-ins and no other-user records. Live grants nevertheless give anon and authenticated unnecessary TRUNCATE, REFERENCES, and TRIGGER privileges. The security advisor reports disabled leaked-password protection. The performance advisor reports 16 auth.uid evaluation warnings.

The live migration history includes a function search_path fix absent from Git. The available connection does not expose full Auth settings, API row limits, or backup configuration. Verify those settings before implementation and release.

## Phase 0 Preserve the baseline and establish a test environment

1. Capture the current Git commit, schema, policies, grants, triggers, Edge Function source, and migration registry. Record the app versions currently distributed.

2. Verify backup availability and perform a restore rehearsal into an isolated environment before any production data repair. Use synthetic health records for development and routine tests.

3. Reconcile live schema with Git. Include the deployed empty search_path on update_updated_at_column, preserve existing migration history, and establish a reproducible baseline. Do not blindly rerun initial CREATE POLICY and CREATE TRIGGER statements.

4. Add local Supabase configuration, schema-derived TypeScript types, and an appropriate test setup. Discover CLI commands from the installed version and create migration files through the CLI.

5. Inventory production Auth confirmation and recovery settings, redirect allowlists, JWT/session lifetimes, API schema exposure and row limits, Edge Function settings, and backup/restore options. Verify no service-role secret reaches the app bundle.

6. Define compatibility rules for old apps before changing table access, payloads, or routes.

**Acceptance:** A fresh test database reproduces the intended schema; a restore is demonstrated; Git explains every deployed schema change; no production records have been modified.

## Phase 0A Upgrade Expo and validate native dependencies

**Verified baseline:** package.json declares Expo ~54.0.34, React Native 0.81.5, React 19.1.0, and Expo Router ~6.0.23. app.json already enables the New Architecture; eas.json already includes development-client and preview build profiles. Recheck the latest stable SDK when implementation begins. As of 10 October 2026, target stable SDK 57; SDK 58 is beta.

Keep the platform upgrade in a dedicated change set after capturing a reproducible SDK 54 baseline. Urgent access-control and false-save fixes can proceed independently on that baseline. Keep intermediate SDK builds internal, and validate all later app changes on the upgraded platform before release.

1. Establish the toolchain and device support matrix. Pin the package manager and supported Node, EAS CLI, Android, and Xcode/build-image versions; commit the lockfile. SDK 56 raises the minimum iOS version to 16.4 and requires Xcode 26.4. Assess affected users and document the support decision before release. Check SDK 57 guidance if building with Xcode 27/iOS 27: scene lifecycle support requires additional configuration. Preserve bundle identifiers, application scheme, signing, and existing app-update identity.

2. Upgrade one SDK at a time: 54 → 55 → 56 → 57. At each step, read its release notes, use npx expo install expo@^<SDK>.0.0 --fix, run npx expo-doctor@latest, type-check, resolve relevant warnings, and build fresh native development clients. Align React, React Native, Expo modules, Router, Reanimated, Worklets, screens, and safe-area dependencies as a compatible set. Reconcile the forced safe-area override; do not preserve an SDK 54 pin that conflicts with the target. Update the test tooling to match the upgraded React version.

3. Resolve concrete configuration and navigation migrations. SDK 55 removes newArchEnabled and edgeToEdgeEnabled configuration fields; the app already uses the New Architecture, so remove obsolete flags and test Android insets, keyboard, modals, and back behavior. SDK 56 forks Router's React Navigation dependencies: inventory direct @react-navigation/* imports, migrate Router-integrated usage using the official guide/codemod where applicable, and verify themes, focus effects, protected routes, and recovery links. Confirm explicit icon dependencies and review splash/config-plugin settings. Reconcile the explicit react-native-reanimated/plugin entry with target SDK guidance; babel-preset-expo configures the required plugin automatically.

4. Verify every native integration in development and release builds. Confirm an SDK-compatible expo-speech-recognition release and config plugin with its maintainer guidance; test Spanish recognition, denied/revoked microphone and speech permissions, cancellation, and unavailable recognition services. Test notifications, date/time controls, sliders, PDF printing/sharing, speech playback, calendar UI, and animation behavior. Use a patched SDK 57 release that includes the documented Hermes memory/startup fixes; measure cold start and memory because this app imports Reanimated/Worklets.

5. Confirm how native projects are maintained before regeneration. If ios/android are generated through Continuous Native Generation, regenerate them from reviewed configuration/plugins. If manually maintained, preserve customizations and apply the native upgrade helper instead. SDK 57 prebuild cleans native directories by default. Produce new iOS and Android preview/release binaries; an SDK/native-code upgrade requires new binaries. Repository configuration currently shows no expo-updates dependency or runtime policy. If EAS Update is introduced or external configuration is found, define compatible runtime versions and staged channels before publishing updates.

6. Run existing-user upgrade tests against isolated Supabase data. Install the SDK 54 build, create a session and local records/drafts, upgrade in place, and verify login retention or explicit recoverable reauthentication, record preservation, account switching, recovery deep links, token refresh, app background/resume, offline retry, notification behavior, and reports. Also test clean installs on the oldest supported and current OS versions. Keep database changes backward compatible while older app builds remain installed; monitor adoption before retiring legacy fields or APIs.

**Acceptance:** Reproducible iOS and Android development/preview/release builds; resolved dependency and configuration checks; passing native feature and existing-user upgrade tests; documented OS support; preserved account and record ownership; no new data loss, duplicate writes, or auth/routing regressions.

## Phase 1 Harden database access and account security

1. Revoke TRUNCATE, REFERENCES, and TRIGGER from anon and authenticated on app tables and inspect default privileges so new tables do not regain them. Remove anon CRUD access where no unauthenticated app workflow needs it.

2. Retain authenticated CRUD access and ownership restrictions. Rewrite all 16 policies to target authenticated explicitly and use (select auth.uid()) in USING and WITH CHECK. Preserve both checks on updates.

3. Keep privileged functions out of the public API unless required. Preserve the current trigger function as SECURITY INVOKER with a fixed search_path. Check schema/function EXECUTE privileges and exposed schemas.

4. Enable leaked-password protection if supported by the subscription. Align app password feedback with server rules and document any plan limitation.

5. Harden delete-user: accept only the intended HTTP method, verify the authenticated user, validate required environment settings, pin its dependency, return useful but sanitized errors, and define session revocation behavior.

6. Keep delete-user JWT verification enabled unless current signing-key compatibility requires a documented alternative with equivalent in-function verification. Verify the actual configuration.

7. Run security and performance advisors again. Evaluate unused indexes against real query plans; do not remove them solely because the project has little traffic.

**Acceptance:** Synthetic users cannot read, insert, update, reassign, or delete another user's records; unauthenticated access is denied; unnecessary privileges are absent; legitimate app CRUD and account deletion still work.

## Phase 2 Make records structured and operations atomic

1. Introduce a versioned record format with stable question IDs, typed answers, local reporting date, timezone, timestamps, and provenance. Preserve legacy question text and raw answers for faithful conversion.

2. Separate daily observations from attack episodes. Link check-ins to episodes where known. Model actual onset, ongoing status, and user-reported end time separately from recording time.

3. Convert legacy entries deterministically using explicit known mappings. Flag unknown wording and incomplete answers for review instead of substituting normal values.

4. Add database validation for answer shape and required fields, positive thresholds, nonnegative loads, and valid temporal relationships. Decide the daily check-in uniqueness rule explicitly; use idempotency keys for retries and rapid taps.

5. Store a source record ID and algorithm version for every derived/training value. Enforce uniqueness appropriate to that source. Mark derived values stale or rebuild them after record edits/deletions.

6. Use transactional database operations for saving a check-in and closing linked episodes, and for recalculating derived values. Capture the user once per operation and enforce ownership inside the transaction.

7. Maintain compatibility with old payloads during rollout. Use additive schema changes and a controlled conversion layer; remove legacy fields only after old-client support ends.

**Acceptance:** Retries create one logical record; concurrent saves cannot produce partial state; malformed data is rejected; edits/deletions correctly affect derived data; both supported old clients and the new app can save.

## Phase 3 Repair migration and reconcile existing data

1. Replace the device-global migration flag with an account-specific migration version and a manifest of successfully transferred source records.

2. Establish legacy-data ownership before upload. If ownership cannot be determined, require the user to choose whether to import the local records into the current account. Do not import automatically into whoever signs in first.

3. Preserve source identifiers and make each batch idempotent. Retry failed records independently. Existing remote records must not skip remaining local records.

4. Mark migration complete only after every required batch and settings operation is confirmed. Report migrated, skipped, unresolved, and failed counts separately.

5. Keep recoverable local data until remote completeness is verified. Encrypt any retained health backup, define its retention, and clear it as part of the account-deletion workflow.

6. Reconcile the three users with records but no profile through a completion prompt. Do not invent demographic values or treat historical missing profiles as evidence of a specific failure.

7. Preserve the 33 training points as a versioned legacy snapshot. Because they lack source linkage, do not automatically classify repeated values as duplicates. Rebuild new derived values from trusted records, or start fresh calibration when reconstruction is impossible.

8. Record unresolved conversions and timezones explicitly. Never guess all historical users' timezone from the current user's location.

**Acceptance:** Simulated interruption, partial batch failure, rerun, existing remote data, and account switching preserve completeness without duplication or cross-account transfer. Reconciled totals and exceptions are reviewable before any destructive cleanup.

## Phase 4 Make authentication and persistence truthful

1. Fix routing so password recovery remains reachable during a recovery session. Handle cold and warm deep links, expired links, and the configured recovery token/code flow.

2. Have signup return session state. With confirmation required, show the verification flow; start onboarding only after authentication. Route users with incomplete profiles into onboarding.

3. Propagate sign-out, session initialization, profile-save, and account-deletion errors. Reset account-specific caches, initialization flags, alert cooldowns, and drafts on logout/account changes.

4. Move native session persistence to a platform-secure storage design. Account for token size and migration from existing sessions. Remove the inaccurate local-encryption claim until the implementation supports it.

5. Tie native token refresh to foreground/background state according to current Supabase guidance.

6. Replace fallback values on network failures with explicit loading, empty, unavailable, and failed states. Preserve the last successful data with its timestamp instead of presenting it as current.

7. Add account-scoped draft recovery and an encrypted offline write queue with idempotency keys. Prevent queued data from being submitted under another account; define sign-out/deletion handling for unsynced records.

8. Guard submissions while saving. Expose retry actions and confirm success only after persistence. Mark local queued records as pending synchronization.

9. Page history queries with stable ordering and query reports by their date range. Avoid repeated whole-history queries and unnecessary user-validation calls inside one operation.

10. On account deletion, verify remote success, clear relevant local health data and tokens, cancel reminders, and invalidate cached state. Do not erase an unsynced draft on a failed deletion.

**Acceptance:** Recovery and signup work with both confirmation settings; offline recording survives restart; retries do not duplicate; account switching never transfers drafts; all failed saves remain visible as failures; synthetic histories beyond the API row limit remain complete.

## Phase 5 Correct medical indicators and episode handling

1. Fix the dashboard's mixed-record evaluation. A crisis entry must never become score zero because it lacks daily check-in wording. Show current attack status separately from latest daily observation.

2. Replace the UI's migraine probability/risk language with a descriptive symptom summary until a qualified clinical reviewer approves a supported interpretation. A weighted 0–100 symptom score is not a calibrated probability.

3. Correct questionnaire/evaluator mismatches, particularly sensitivity to light versus sound. Preserve unknown answers and medication/treatment context. Avoid treating a short treated attack or incomplete report as evidence against migraine.

4. Remove specific 12–48-hour predictions and safe/danger promises until the model has validation supporting them. Do not fix the unreachable default threshold merely by lowering 75 to a convenient number.

5. Make all evaluators pure: reading or focusing a screen must not write model data. Process each dated source record once, with explicit missing-day handling and versioned calculations.

6. Define any future cumulative-load model with consistent input ranges, caffeine baseline/withdrawal handling, threshold bounds, minimum calibration data, and evaluation against held-out outcomes. Keep it experimental until clinically reviewed.

7. Add clinician-reviewed guidance for urgent warning signs and prolonged or changing attacks. A generic high-migraine popup must not stand in for urgency guidance.

8. Stop prefilled sliders from becoming reported health measurements without user confirmation. Distinguish skipped, unknown, absent, and measured values.

9. Allow users to close an attack with an actual end time; do not equate a later check-in timestamp with the physiological end of the headache.

**Acceptance:** Severe crisis examples cannot yield reassuring default results; incomplete data stays incomplete; screen navigation leaves training data unchanged; user-facing health claims have explicit clinical approval and evidence appropriate to their strength.

## Phase 6 Repair voice recording diary and reports

1. Change voice recognition failures to unknown or retry/manual fallback. Never fabricate intensity 5, onset now, no symptoms, or no medication.

2. Parse whole words and negation correctly. Confirm ambiguous interpretations and provide a short spoken review with correction commands before saving.

3. Offer voice and manual choices, accessible progress, cancellation, resumable drafts, and proper speech/microphone cleanup. Test noisy rooms, interruptions, and permission refusal. Do not retain full transcripts without a defined need and retention rule.

4. Announce a successful save only after confirmation. When offline, explicitly describe pending synchronization.

5. Use a documented timezone and local-date convention in the diary and reports. Include original offsets and uncertainty for converted historical data.

6. Count reported headache days separately from distinct attacks. Handle multi-day attacks without double-counting daily check-ins; distinguish inferred ongoing days from user-confirmed days.

7. Show observed-day coverage and missing days in reports. Do not silently treat unrecorded days as headache-free or classify a sparse dataset as episodic/chronic.

8. Include onset/end uncertainty, medication usage, symptoms, and report period boundaries consistently in the PDF. Escape user-provided text in generated HTML and verify multilingual rendering.

9. Connect educational cards to reviewed working resources, or clearly show that content is unavailable. Remove placeholder cards that appear functional.

**Acceptance:** Voice tests cover negation, ambiguity, timeout, save failure, and interruption; diary and PDF agree across timezone boundaries and multi-day attacks; sparse reporting is visibly incomplete; PDFs render and share correctly on both platforms.

## Phase 7 Verify release and operate the app

1. Add meaningful unit tests for question mapping, pure evaluation, date handling, episode/report counts, migration manifests, and voice parsing.

2. Add database tests for RLS, grants, constraints, idempotency, atomic writes, and cascade deletion using synthetic users. Test malformed payloads and ownership reassignment.

3. Add integration tests for offline restart, timeout, partial writes, recovery links, signup confirmation, account switching, legacy upgrade, and deletion. Run device checks on iOS and Android.

4. Add CI for type checks, linting, critical tests, and creating a fresh database from migrations. Include generated-type drift checks and sanitized error monitoring.

5. Define data retention, draft/backup handling, export and deletion behavior, and user-facing privacy information. Keep health content, tokens, emails, and full voice transcripts out of routine logs.

6. Roll out additive database changes first, then a tested app build, then controlled backfills. Keep legacy compatibility until adoption is sufficient.

7. Reconcile row counts, conversion exceptions, ownership checks, and advisor findings after rollout. Monitor save failures, migration completion, recovery failures, and sync backlog with non-sensitive metrics.

8. Roll back app code or disable new indicators if necessary; preserve new patient records. Do not use a database restore as a routine rollback after users have submitted new data.

**Release gate:** No false save confirmations or failed-read reassurance; no cross-account transfer; complete migration retries; passing access-control tests; complete paginated histories; clinically approved health wording; successful device and restore checks; reproducible upgraded native builds and passing existing-user app-update tests on supported iOS/Android versions.

## Implementation sequence and review boundaries

| Change set | Contents | Dependency |
| --- | --- | --- |
| 1 | Reproducible baseline, deployed migration reconciliation, generated types, test setup | None |
| 1A | Incremental Expo 54 → 57 upgrade, compatible native dependencies, new binaries, existing-user upgrade tests | Reproducible SDK 54 baseline; required before final device validation |
| 2 | Least-privilege grants, RLS optimization, advisor remediation, deletion hardening | Baseline |
| 3 | Truthful errors, recovery/signup routing, profile completion, account-state cleanup | Baseline |
| 4 | Versioned records, constraints, source linkage, transactional/idempotent operations | Baseline and access tests |
| 5 | Resumable migration and legacy reconciliation | Versioned records |
| 6 | Secure sessions, offline drafts/queue, paginated reads | Authentication and idempotent operations |
| 7 | Pure evaluation, honest health wording, corrected episode and report semantics | Versioned records and clinical review |
| 8 | Reliable voice/manual recording, reviewed educational resources, device checks | Persistence and record semantics |
| 9 | Staged rollout, monitored backfill, release validation, operating documentation | All applicable release gates |

Database and app changes should be reviewed together when they depend on each other. Production data repair must have a concrete reconciliation report, backup, and rollback strategy before it runs. Clinical review is a separate dependency for health claims; engineering fixes and descriptive tracking can proceed while that review is pending.

## Source locations

- [Repository](https://github.com/adfecu/app-migraine)

- [Storage and database operations](https://github.com/adfecu/app-migraine/blob/master/utils/supabaseStorage.ts)

- [Local migration](https://github.com/adfecu/app-migraine/blob/master/utils/migrateToSupabase.ts)

- [Evaluation logic](https://github.com/adfecu/app-migraine/blob/master/utils/storage.ts)

- [Authentication](https://github.com/adfecu/app-migraine/blob/master/contexts/AuthContext.tsx)

- [Database migrations](https://github.com/adfecu/app-migraine/tree/master/supabase/migrations)

- [Supabase access policies](https://supabase.com/docs/guides/database/postgres/row-level-security)

- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview)

- [Password protection remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

- [Expo SDK upgrade workflow](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)

- [SDK 55 configuration and architecture changes](https://expo.dev/changelog/sdk-55)

- [SDK 56 Router migration, toolchain, and iOS support changes](https://expo.dev/changelog/sdk-56)

- [SDK 57 release, regression fixes, and Xcode 27 guidance](https://expo.dev/changelog/sdk-57)

- [SDK 58 beta status](https://expo.dev/changelog/sdk-58-beta)

- [Reanimated installation and Babel configuration](https://docs.expo.dev/versions/latest/sdk/reanimated/)

- [Speech-recognition maintainer guidance](https://github.com/jamsch/expo-speech-recognition)

- [EAS Update runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/)

The plan is complete when the release gates are satisfied and remaining clinical or platform limitations are visible in the product and operating documentation.

