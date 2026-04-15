#!/bin/bash

echo "🧹 Starting Nomli Mingle cleanup - Removing ALL build artifacts..."

# Function to safely remove files/directories
safe_remove() {
    if [ -e "$1" ]; then
        echo "🗑️ Removing: $1"
        rm -rf "$1"
    fi
}

# Show initial size
echo "📊 Initial project size:"
du -sh . 2>/dev/null | cat

echo ""
echo "🔍 Scanning for build artifacts..."

# Remove APK/AAB files (build artifacts)
echo "📱 Removing Android build artifacts..."
find . -name "*.apk" -type f -delete 2>/dev/null
find . -name "*.aab" -type f -delete 2>/dev/null
safe_remove "android/app/build"
safe_remove "android/build"
safe_remove "android/.gradle"
safe_remove "android/app/release"
safe_remove "android/app/debug"
safe_remove "android/app/outputs"

# Remove iOS build artifacts
echo "🍎 Removing iOS build artifacts..."
find . -name "*.ipa" -type f -delete 2>/dev/null
find . -name "*.app" -type d -delete 2>/dev/null
find . -name "*.xcarchive" -type d -delete 2>/dev/null
safe_remove "ios/build"
safe_remove "ios/DerivedData"
# Fresh Pods fix Xcode “Stale NFS file handle” on bundled fonts (e.g. expo-dev-menu Inter fonts)
safe_remove "ios/Pods"

# Clean Gradle (Android)
if [ -f "android/gradlew" ]; then
    echo "🔧 Running Gradle clean..."
    cd android
    ./gradlew clean 2>/dev/null || echo "⚠️ Gradle clean failed, continuing..."
    cd ..
fi

# Clean Xcode (iOS)
if [ -f "ios/NomliMingle.xcworkspace" ]; then
    echo "🔧 Running Xcode clean..."
    cd ios
    xcodebuild clean -workspace NomliMingle.xcworkspace -scheme NomliMingle 2>/dev/null || echo "⚠️ Xcode clean failed, continuing..."
    cd ..
fi

# Remove Expo build artifacts
echo "⚡ Removing Expo build artifacts..."
safe_remove ".expo"
safe_remove "dist"
safe_remove "web-build"
find . -name "eas-build-*.json" -type f -delete 2>/dev/null
find . -name "eas-build-*.tar.gz" -type f -delete 2>/dev/null

# Remove React Native / Buck artifacts (only at repo root — never crawl node_modules)
echo "⚛️ Removing React Native build artifacts..."
safe_remove ".buckd"
safe_remove "buck-out"

# Clean caches
echo "🧽 Cleaning caches..."
safe_remove "node_modules/.cache"
safe_remove ".cache"
safe_remove ".metro-health-check*"

# Clean npm cache
echo "📦 Cleaning npm cache..."
npm cache clean --force 2>/dev/null || echo "⚠️ npm cache clean failed, continuing..."

# Clean watchman (if installed)
if command -v watchman >/dev/null 2>&1; then
    echo "👁️ Cleaning watchman..."
    watchman watch-del-all 2>/dev/null || echo "⚠️ Watchman clean failed, continuing..."
fi

# Reinstall pods after removing ios/Pods (fixes stale font / NFS issues in Xcode)
if [ -f "ios/Podfile" ] && command -v pod >/dev/null 2>&1; then
    echo ""
    echo "📦 Running pod install..."
    (cd ios && pod install) || echo "⚠️ pod install failed — run: cd ios && pod install"
fi

# Show final size
echo ""
echo "📊 Final project size:"
du -sh . 2>/dev/null | cat

echo ""
echo "✅ Cleanup complete! All build artifacts removed."
echo "💡 Your repository is now clean and ready for Git."
echo ""
echo "🚀 Next steps:"
echo "   1. Android: cd android && ./gradlew assembleDebug (or npm run android)"
echo "   2. iOS: open ios/*.xcworkspace in Xcode and Build (or npm run ios)"
echo "   3. If Xcode still shows 'Stale NFS file handle': quit Xcode, then:"
echo "      rm -rf ~/Library/Developer/Xcode/DerivedData/*"
echo "   4. Run this script anytime: npm run clean-artifacts"
