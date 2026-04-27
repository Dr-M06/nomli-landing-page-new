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

# Default: keep android/.gradle + Metro/.expo caches. Full wipe: NOMLI_AAB_DEEP_CLEAN=1
if [ "${NOMLI_AAB_DEEP_CLEAN:-0}" = "1" ] || [ "${RELEASE_AAB_DEEP_CLEAN:-0}" = "1" ]; then
  _apk_deep_clean=1
else
  _apk_deep_clean=0
fi

_nomli_nproc() {
  local n
  n="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
  if [ "$n" -gt 8 ] 2>/dev/null; then n=8; fi
  if [ "$n" -lt 1 ] 2>/dev/null; then n=4; fi
  printf '%s' "$n"
}

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
if [ -z "${EXPO_METRO_MAX_WORKERS:-}" ]; then
  _mw="$(_nomli_nproc)"
  if [ "$_mw" -gt 6 ] 2>/dev/null; then _mw=6; fi
  export EXPO_METRO_MAX_WORKERS="$_mw"
fi

if [ "$_apk_deep_clean" = "1" ]; then
  echo "🧹 Deep clean: stop Gradle → wipe outputs, .gradle, Metro/.expo caches…"
  if [ -f android/gradlew ]; then
    (cd android && ./gradlew --stop) 2>/dev/null || true
  fi
  sleep 2
  rm -rf android/app/build android/build android/.gradle ios/build ios/DerivedData node_modules/.cache .expo 2>/dev/null || true
else
  echo "⚡ Fast prep: Android/iOS output dirs only (keeps .gradle + caches). Deep: NOMLI_AAB_DEEP_CLEAN=1"
  rm -rf android/app/build android/build ios/build ios/DerivedData 2>/dev/null || true
fi

echo ""
echo "📦 assembleDebug…"
cd android
_gw="${GRADLE_MAX_WORKERS:-$(_nomli_nproc)}"
./gradlew assembleDebug --max-workers="$_gw"

APK_PATH="$REPO_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "✅ Debug APK:"
echo "   $APK_PATH"
echo ""
echo "Install on device: adb install -r \"$APK_PATH\""
