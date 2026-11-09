# Elomara: Supabase to Neon migration preparation

This directory prepares the owner's requested **complete** migration. It is not
an application cutover. The currently shipped Android app, OTA channel, Supabase
database, scheduled jobs, storage and signing identity still use Supabase.

## Selected targets and account policy

- Source: Supabase `yvoylicirtdarroqcxoq` (Elomara).
- Target: Neon project `misty-glitter-45861249`, branch `production`, database `neondb`.
- Isolated rehearsal database: `elomara_migration_check` on that Neon branch.
- Managed Better Auth is already enabled and Google now has owner-supplied credentials.
- The owner accepted resetting the single password account. Five existing accounts
  use Google. Preserve their application memberships and permissions; never link
  an existing profile by an unverified email address.

## Files and safety boundaries

- `migrations/001_application_schema.sql` captures the **live** application schema,
  not an old repository baseline: 25 tables, 232 columns, 110 constraints,
  45 functions and 61 RLS policies. It reproduces the source table/function grants.
- Calls to Supabase's `auth.uid()` become `auth.app_user_id()`. Neon's native
  `auth.uid()`, `auth.user_id()` and JWT extension functions are not replaced.
- `auth.users` is a private application-reference table, not a replacement login
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

1. Obtain explicit production-import confirmation after the automatic review
   rejected the original generated role-grant SQL. The malformed role grants were
   corrected and the corrected file passed rehearsal. Do not route around that
   rejection through CI or another SQL transport.
2. Implement and verify identity linking using a verified Neon identity, including
   existing-user recovery and new-user profile provisioning. Importing the six
   `auth.users` references alone does **not** migrate login accounts.
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
