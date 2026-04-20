#!/bin/bash
# Wipe local Android + iOS build outputs and heavy caches (Gradle, Pods, Xcode DerivedData for this app).
# Use when disk is full or you see "No space left on device" / failed .pcm in DerivedData.
set +e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Stop Gradle daemons (release file locks / cache writers)"
if [ -f android/gradlew ]; then
  (cd android && ./gradlew --stop) 2>/dev/null || true
fi

echo "==> Android: project Gradle + app outputs"
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

echo "==> Android: node_modules/*/android/build and .cxx (often many GB)"
if [ -d "$ROOT/node_modules" ]; then
  find "$ROOT/node_modules" -path "*/android/build" -type d -prune -exec rm -rf {} + 2>/dev/null || true
  find "$ROOT/node_modules" -path "*/android/.cxx" -type d -prune -exec rm -rf {} + 2>/dev/null || true
fi

echo "==> iOS: local intermediates + Pods"
rm -rf ios/build ios/DerivedData ios/Pods 2>/dev/null || true
find ios -name "*.ipa" -type f -delete 2>/dev/null || true

echo "==> Xcode DerivedData for NomliMingle (fixes 'No space left on device' on .pcm under DerivedData)"
rm -rf "${HOME}/Library/Developer/Xcode/DerivedData"/NomliMingle-* 2>/dev/null || true

echo "==> Expo / Metro caches in repo"
rm -rf .expo dist web-build .metro-health-check* 2>/dev/null || true
rm -rf node_modules/.cache .cache 2>/dev/null || true

echo "==> Gradle clean (project)"
if [ -f android/gradlew ]; then
  (cd android && ./gradlew clean --no-daemon) 2>/dev/null || true
fi

echo "==> Xcode clean (workspace)"
if [ -d ios/NomliMingle.xcworkspace ]; then
  (cd ios && xcodebuild -workspace NomliMingle.xcworkspace -scheme NomliMingle clean 2>/dev/null) || true
fi

echo "==> CocoaPods (fresh Pods after wipe)"
if [ -f ios/Podfile ] && command -v pod >/dev/null 2>&1 && [ -d node_modules/expo ]; then
  (cd ios && pod install) || echo "⚠️  pod install failed — run: cd ios && pod install"
else
  echo "⏭️  Skipping pod install (need node_modules + CocoaPods). Run: npm install && cd ios && pod install"
fi

echo ""
echo "✅ Native wipe done."
echo "   If disk is still full: empty Trash, macOS Settings → General → Storage, clear other Xcode projects’ DerivedData, Docker prune."
echo "   Reopen: ios/NomliMingle.xcworkspace  |  Android: ./build-release-aab-now.sh or cd android && ./gradlew bundleRelease"
