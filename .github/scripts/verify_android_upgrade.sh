#!/usr/bin/env bash
set -euo pipefail
baseline_apk="$1"
current_apk="$2"
package='app.bunyan.residential'
# This runs on a fresh CI emulator, never on a user's phone.
adb install "$baseline_apk"
adb shell run-as "$package" mkdir -p files
printf 'elomara-data-preserved' | adb shell run-as "$package" tee files/elomara-upgrade-probe >/dev/null
adb install -r "$current_apk"
actual="$(adb shell run-as "$package" cat files/elomara-upgrade-probe | tr -d '\r')"
if [ "$actual" != 'elomara-data-preserved' ]; then
  echo 'APK upgrade lost application data' >&2
  exit 1
fi
adb shell run-as "$package" rm files/elomara-upgrade-probe
echo 'PASS: higher-version APK installed over the previous version; app data preserved.'
