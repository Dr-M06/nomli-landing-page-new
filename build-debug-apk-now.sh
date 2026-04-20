#!/bin/bash
# Local DEBUG APK (no Play keystore). Validates Android/Metro/Gradle before release AAB.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/android" ]; then
  REPO_ROOT="$SCRIPT_DIR"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
cd "$REPO_ROOT"

_avail_kb="$(df -k "$REPO_ROOT" 2>/dev/null | tail -1 | awk '{print $4}')"
if [ -n "$_avail_kb" ] && [ "$_avail_kb" -lt 4194304 ] 2>/dev/null; then
  echo "❌ Low disk space on: $REPO_ROOT (need ~4+ GiB free for debug build). Run: npm run wipe:native"
  exit 1
fi

echo "🐛 Building DEBUG APK (assembleDebug)…"
echo ""

export EXPO_NO_DOTENV="${EXPO_NO_DOTENV:-1}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=16384}"
export CI="${CI:-true}"

echo "🧹 Stopping Gradle + clearing Android/Metro caches (avoids stale paths like oldrepo_ref)…"
if [ -f android/gradlew ]; then
  (cd android && ./gradlew --stop) 2>/dev/null || true
fi
sleep 2
rm -rf android/app/build android/build android/.gradle node_modules/.cache .expo 2>/dev/null || true

echo ""
echo "📦 assembleDebug…"
cd android
./gradlew assembleDebug

APK_PATH="$REPO_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "✅ Debug APK:"
echo "   $APK_PATH"
echo ""
echo "Install on device: adb install -r \"$APK_PATH\""
