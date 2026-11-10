# Elomara: Supabase to Neon migration preparation

This directory prepares the owner's requested **complete** migration. It is not
an application cutover. The currently shipped Android app, OTA channel, Supabase
database, scheduled jobs, storage and signing identity still use Supabase.

## Selected targets and account policy

- Source: Supabase `yvoylicirtdarroqcxoq` (Elomara).
- Target: Neon project `misty-glitter-45861249`, branch `production`, database `neondb`.
- Current isolated rehearsal database: `elomara_migration_check_v2` on that Neon branch.
- Managed Better Auth is already enabled and Google now has owner-supplied credentials.
- The owner accepted resetting the single password account. Five existing accounts
  use Google. Preserve their application memberships and permissions; never link
  an existing profile by an unverified email address.

## Files and safety boundaries

- `migrations/001_application_schema.sql` captures the **live** application schema,
  not an old repository baseline: 25 tables, 232 columns, 110 constraints,
  45 functions and 61 RLS policies. It reproduces the source table/function grants.
- Calls to Supabase's `auth.uid()` become `app_auth.user_id()`. Neon's native
  `auth.uid()`, `auth.user_id()` and JWT extension functions are not replaced.
- `app_auth.users` is a private application-reference table, not a replacement login
  server. `private.auth_identity_map` must map verified Neon users to preserved
  application UUIDs before any client cutover. Both tables deny public access.
- `002_application_triggers.sql` installs the existing 11 notification triggers
  **after** loading data, so the import does not replay notifications. The profile
  provisioning trigger is also installed after importing existing users/profiles.
- Passwords, password hashes, sessions, refresh tokens, OAuth tokens, service keys,
  private signing material, and application rows are never checked into Git.
- The import script refuses a populated target, rolls back failed imports, checks
  all restored row values, and checks the source again before committing. It stops
  if source writes or column drift make the snapshot inconsistent.
- Production import requires an explicitly reviewed target name through
  `NEON_IMPORT_APPROVED_DATABASE`. No workflow in this change sets that variable
  or runs a production import.

## Verification performed on 2026-11-09

The corrected schema ran successfully in `elomara_migration_check`. A consistent
source snapshot copied 270 application rows across all 25 tables and six private
user references. Comparing every restored row with that exact snapshot found
zero mismatches. A later source checksum changed in `app_settings` while source
scheduled jobs continued running; the importer explicitly detects this condition
and refuses to treat a moving source as a stable cutover snapshot.

All six existing identities were exercised with the `authenticated` database
role and synthetic test subjects mapped to their application UUIDs. The two
administrators and two approved owners saw one building each and no foreign
apartments. The two pending users saw no buildings. Financial-summary RPCs
executed successfully for both administrators and both owners. A rollback-only
suspension fixture denied the administrator all building access. No real user
session or password was used to perform these database-role checks.

Unit tests cover financial-value corruption, missing/duplicate rows, column drift,
SQL identifiers and the production approval gate. App TypeScript/build checks
remain required. The GitHub preflight verifies the stored Neon, Supabase, Firebase
and Gemini credentials without sending notifications or generating AI content.
It does not prove Google sign-in, Firebase delivery permission, or Android flows.
The GitHub credential preflight passed for all four services:
https://github.com/emadmedo19/Elomara/actions/runs/42683445618 .

## Local tooling

The tooling is separate from the Android application's dependency graph:

```sh
npm ci --prefix neon
npm test --prefix neon
```

Provide `TARGET_DATABASE_URL` only to server-side tooling using a direct connection.
Do not expose it with a `VITE_` prefix. On an empty target, after review:

```sh
npm run import --prefix neon
```

`node neon/scripts/verify-rls.mjs` is deliberately restricted to the rehearsal
database; its fixtures roll back. For a new rehearsal database only, create the
test `auth.user_id()` helper before import. Production instead uses the genuine
Data API JWT helper:

```sql
CREATE SCHEMA auth;
CREATE FUNCTION auth.user_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
$$;
```

## Still required for the complete migration

1. Production database copy is complete following the owner's explicit approval.
   A protected `auth` schema permission error rolled back the first transaction;
   the corrected version uses `app_auth`, passed a fresh rehearsal, and copied all
   25 tables / 270 application rows plus six user references to `neondb`. Every
   restored row matched the exact source snapshot. This is still a snapshot,
   not a live application cutover.
2. Verified identity linking is installed in `003_verified_identity_link.sql`.
   Rehearsal proved unverified emails cannot link, and a verified email resolves
   to the existing application UUID and building permissions. Actual native
   sign-in and existing-user recovery still require candidate APK verification.
   Importing the six application references does **not** migrate credentials.
3. Add native Android Neon session handling. The official Neon Capacitor guide
   requires native auth plus an HTTPS callback/App Link or bounce handler:
   https://neon.com/guides/capgo-capacitor-neon . A browser-only SDK replacement
   would break native session handling. A new APK is required.
4. Port the active AI/push handlers, job authentication and schedules to Neon
   Functions; retain per-building authorization and generic financial push text.
   Live Supabase AI functions are not present in the current repo and must be
   retrieved/reviewed rather than assumed absent.
5. Copy public OTA objects and the **existing** private Android signing object to
   Neon storage, verify bytes/certificate fingerprints, then update CI and OTA
   endpoints. Never generate a replacement signing key for installed apps.
6. Verify admin/resident permissions, financial operations, sign-in/recovery,
   session restoration, notifications, APK upgrade and OTA behavior on a candidate
   APK. A native plugin must not be delivered to old APKs through OTA alone.
7. Reconcile writes since the rehearsal, coordinate the actual cutover and old
   scheduled-job shutdown, and verify the installed app before retiring Supabase.

Do not interpret the preflight or schema rehearsal as completing these steps.


## Native candidate rollout

`Deploy Neon backend` copies storage (byte checks, no source deletion), deploys the
active chat/push handlers, registers the HTTPS mobile callback origin and checks
unauthenticated access. `Build Neon Android candidate` runs only from main after
that deployment succeeds and uses the exact source SHA from the deployment.
The candidate uses native Neon auth, maps verified users to preserved application
UUIDs, and obtains fresh Data API JWTs from native session storage. Browser storage
is not used for the session token. Live membership/inbox refresh uses a five-second
poll while visible and still applies the database policies on every query.

Candidate writes and notification sends are blocked in the client, and candidate
OTA checks are disabled so a legacy bundle cannot replace the native Neon build.
The normal main APK/legacy OTA still use the current provider. Candidate status is
not a production cutover: final source-write reconciliation, device confirmation,
Neon OTA publication and the scheduled-job handover still remain.

The candidate restores the original signing object from private Neon storage and
runs the same certificate/upgrade tests. CI version codes now use epoch seconds
so the separate candidate/main workflow counters cannot produce a downgrade.

Account and building deletion is defined in `migrations/004_account_and_building_deletion.sql`.
Installing this migration creates RPC functions only; it never deletes existing rows.
`delete_account_with_successor` requires a typed confirmation and atomically promotes
an approved resident of the same building before deleting a manager's application
identity, native Neon Auth account, OAuth credentials, and sessions. Shared ledgers
remain, with nullable author references cleared. The imported shadow-only deletion
RPC is revoked from clients.

`clear_building_data` validates the caller's active manager membership and the
selected building name. `reset` clears operational/financial records and balances,
retaining apartments, memberships, and collection configuration. `delete` additionally
removes the building, apartments, configuration, and join/invite data; it detaches
members while preserving their accounts. Both operations are transactional and
remove generated inbox/delivery rows before commit.

Regression fixtures: run `TARGET_DATABASE_URL=... node neon/scripts/verify-deletion-safety.mjs`
only against `elomara_migration_check_v2`. The runner enforces that database name
and rolls back the migration and all fixture changes, even after successful checks.
It never tests by deleting real members or buildings. Native-user FK cascades must
also be checked against the managed production schema before applying the migration.

Registered-member permissions are defined in `migrations/005_building_member_roles.sql`.
`set_building_member_role` accepts only `resident` or `manager`, checks active manager
membership and same-building scope, and locks the building before changing roles.
It cannot demote the last active manager. A profile trigger remembers owner/tenant
status across all promotion paths, including account-deletion successors, so removing
management restores the resident's membership without altering apartment or ledger data.
Installing the migration adds the nullable role-history column and functions/triggers;
it does not promote or demote existing members. Test with
`TARGET_DATABASE_URL=... node neon/scripts/verify-member-roles.mjs` in the rehearsal
DB only; all fixtures and schema changes roll back.


Exceptional receivables are defined in `migrations/006_exceptional_receivables.sql`.
`payments.is_assessment` marks an amount due, not a receipt. Such rows are excluded
from cash income, receipts and monthly-payment reminders. Actual exceptional receipts
reference that row through `exceptional_charge_id`; `record_exceptional_payment`
locks the assessment, checks active building-manager permission and the remaining
amount, and inserts the receipt and treasury increase in one transaction. Monthly
advance credits remain separate from unpaid exceptional assessments.

The one-time correction preserves the original automatic ledger rows and reclassifies
only rows whose original collection transaction, author, title and automatic method
match. It reverses their previous treasury increase once and leaves genuine receipts
unchanged. Repeat application does not debit the balance again. The legacy Supabase
adapter received the equivalent schema/functions; it had no exceptional rows to repair.

Run `TARGET_DATABASE_URL=... node neon/scripts/verify-exceptional-receivables.mjs`
against the rehearsal database only. It checks historical correction, repeat safety,
partial/edit/delete receipt flows, rounding, resident visibility and foreign-manager
rejection, then rolls back all fixtures and schema changes. Production correction was
verified separately: 14 preserved assessments totaling 28,000, no actual receipts and
zero cash balance. Browser verification used synthetic data on a 390×844 viewport;
no test payments or notifications were published to actual users.


Deletion of an exceptional collection is defined in
`migrations/007_delete_exceptional_collection.sql`. Each assessment now has an explicit
`exceptional_collection_id`; existing rows are linked only when their original
transaction/author/apartment/description identifies one collection unambiguously.
`delete_exceptional_collection` requires an active authorized building manager and
an exact title confirmation. It locks the assessments, marks their remaining debt
cancelled, and removes the collection from the visible log using `deleted_at` and
`deleted_by`. Receipt rows and treasury balance are never deleted or changed by this
action. Correcting a historical receipt does not recreate cancelled debt, and no new
receipt can be recorded against a deleted collection. Paid amounts remain in income.
Deleted collections cannot be used to resend collection notifications.

Run `TARGET_DATABASE_URL=... node neon/scripts/verify-exceptional-deletion.mjs`
in the rehearsal database only. The transaction checks migration/backfill, unpaid,
partial and full cancellation, repeated deletion, wrong confirmation, unrelated
collections with identical names, manager/resident/suspended/foreign-member access,
and later receipt correction/deletion. All fixtures roll back. Browser checks use
synthetic data at 390×844 in light/dark modes and cover cancellation/back navigation,
confirmation, request failure/retry and refreshed financial data. The production
migration links existing assessments only; it does not call the deletion action.


Recreating a manager building after deletion uses `create_manager_building` from
`migrations/008_create_manager_building.sql`. It accepts the current form's details,
locks the verified profile, requires an approved active unassigned manager, inserts
the complete building and attaches that manager in one transaction. The new treasury
starts at zero; migration 009 creates the requested apartment records in the same transaction. A second
concurrent/subsequent create for that profile is rejected. RLS still denies direct
building inserts, and existing pending-user onboarding is unchanged. The form awaits
confirmed creation/update, retains fields on errors and displays the error locally.
Successful creation refreshes the manager's verified profile and building data.

Run `TARGET_DATABASE_URL=... node neon/scripts/verify-building-recreation.mjs`
against the rehearsal database only. It tests delete/recreate, field persistence,
read access and manager linkage, zero cash, generated apartment counts and blank defaults, duplicate and
invalid saves, and resident/pending/suspended-role rejection. Everything rolls back.
The production migration installs the action only; no test or real building is created.
Browser tests use the actual App and modal with synthetic API responses in light
and dark modes: failed creation retains all entered fields and displays its error;
retry opens the new dashboard, refreshes membership and never attempts a direct
building insert. A membership update arriving before the creation response is also
accepted for that same manager/new building. Existing-building update failure/retry
keeps its draft and closes only after confirmed persistence.


After confirmed building creation, AuthProvider owns a bounded membership handoff:
reads that started before creation are invalidated; concurrent background reads cannot
restore a pending profile; only a server-confirmed active manager profile matching
the saved building ends the handoff. A failed/slow check shows a saved-building retry
screen rather than another creation form. Signing out or changing identity cancels
the transition; later role revocation still applies normally. Native Data API requests
bypass HTTP caches. Both initial onboarding and manager recreation use this handoff,
without reloading the WebView or sending another create request.

Regression: with Python Playwright and Chromium installed, run `npm run build`, then
`node tests/browser/build-membership-fixture.mjs /tmp/elomara-membership-ui`.
Serve **only that synthetic output directory** on loopback:
`python -m http.server 5188 --bind 127.0.0.1 --directory /tmp/elomara-membership-ui`.
Run `python tests/browser/test-membership-handoff.py`. It exercises the actual
AuthProvider and App with synthetic API responses: stale/late pending profiles,
initial onboarding, terminal failures/retry, unresponsive reads, identity changes and
role revocation. The fixture makes no live account, building or notification writes.


Owner-requested automatic apartments (2026-11-10) supersede the earlier descriptive
unit-count behavior. `migrations/009_generate_building_apartments.sql` calls an
owner-only private initializer from both authorized creation actions. It numbers
units 1..N, distributes them evenly over floors (the lower floors receive any extra
units), and leaves resident/contact/fee/paid fields blank or zero. Building creation,
profile linkage and apartment generation commit atomically. Repeated initialization
is a no-op once any apartment exists, preserving custom unit data and manual deletions;
editing a building's descriptive count does not generate or delete existing units.
The current empty 14-unit building was initialized once as explicitly requested.

The recreation runner also checks 14/4, 14/14, 2/5, 0/3 and 1/1 distributions,
sequential numbering, repeat safety, existing custom records, blank financial defaults
and unchanged opening balance. The browser fixture's `autounits` scenario verifies
that generated records render immediately in the existing Collections screen.
