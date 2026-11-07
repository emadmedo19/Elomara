# Android launcher and APK update identity

The launcher source is `android/branding/launcher-source.jpg`. The asset generator
uses it only for Android launcher resources. Web icons, header logos, and splash
art continue using the existing sources.

## Stable signing

The Android workflow restores one PKCS12 key from the **private** Supabase Storage
bucket `elomara-android-signing`, object `signing-v1.json`, using the existing CI
service-role secret. The bucket has no public/client read policy. The signing
bundle contains the key and its password and must be treated as a secret.

- Never publish this bucket, create a public read policy, upload its contents as a
  GitHub artifact, commit its files, or place signing files in an Actions cache.
- Never delete or replace this object during routine builds. Back it up only to
  another approved private secret store.
- Bootstrap happens only when the workflow creates a new bucket. A missing or
  corrupt key in an existing bucket stops the build; it never silently rotates.
- Temporary key/config files live under `runner.temp`, have restrictive file
  permissions, and are removed at the end of the job. Only certificate
  fingerprints may appear in build logs.
- Both distributed debug APKs and release builds use the stable identity when
  `ELOMARA_SIGNING_CONFIG` is provided. CI refuses to fall back to random signing.

The package remains `app.bunyan.residential`. CI version codes use
`1000 + GITHUB_RUN_NUMBER`, so later main builds increase the version code.
The Gradle `elomaraVersionCode` property is used only to build the lower-version
upgrade-test baseline. Do not distribute that baseline.

## Verification and older installations

CI installs a lower-version APK, writes a test marker into its private app data,
then installs the distributed APK with `adb install -r` and verifies that the
marker survives. Existing Firebase/application instrumentation tests run too.

Older workflow APKs used fresh Android debug keys on ephemeral GitHub runners.
Their private keys were never preserved. Android cannot upgrade an installed
package to a different certificate without the original signing key/valid key
rotation lineage. A one-time reinstall may therefore be needed when moving from
those historical APKs to the stable-key builds. This change guarantees a
consistent identity for future builds; it does not recover those lost keys.
