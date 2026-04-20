#!/bin/bash
# Remove Android build outputs and Gradle caches for this repo only (does not touch iOS).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Cleaning Android build artifacts..."
find android -name "*.apk" -type f -delete 2>/dev/null || true
find android -name "*.aab" -type f -delete 2>/dev/null || true
rm -rf \
  android/app/build \
  android/build \
  android/.gradle \
  android/app/outputs \
  android/app/release \
  android/app/debug \
  android/.cxx \
  android/app/.cxx \
  2>/dev/null || true

if [ -d "$ROOT/node_modules" ]; then
  echo "Removing node_modules/*/android/build and .cxx..."
  find "$ROOT/node_modules" -path "*/android/build" -type d -prune -exec rm -rf {} + 2>/dev/null || true
  find "$ROOT/node_modules" -path "*/android/.cxx" -type d -prune -exec rm -rf {} + 2>/dev/null || true
fi

if [ -f android/gradlew ]; then
  echo "Running Gradle clean..."
  (cd android && ./gradlew clean --no-daemon) || echo "⚠️ Gradle clean failed; folders above were still removed. Run: cd android && ./gradlew clean"
else
  echo "No android/gradlew; skipped Gradle clean."
fi

echo "Android cleanup done."
