#!/bin/bash
# Rebuild release APK and install on a connected Android device (repo-relative paths).

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/android"

ADB="${ANDROID_HOME:+$ANDROID_HOME/platform-tools/adb}"
ADB="${ADB:-${ANDROID_SDK_ROOT:+$ANDROID_SDK_ROOT/platform-tools/adb}}"
ADB="${ADB:-adb}"

echo "🚀 Rebuilding (release APK)…"
./gradlew clean assembleRelease

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK" ]; then
  echo "❌ APK not found at $APK"
  exit 1
fi

echo "📲 Installing with $ADB …"
"$ADB" install -r "$APK"
echo "✅ Done."
