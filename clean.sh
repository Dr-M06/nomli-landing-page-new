#!/bin/bash

echo "🧹 Cleaning all build artifacts and caches..."

# Clean iOS
echo "📱 Cleaning iOS artifacts..."
rm -rf ios/Pods
rm -rf ios/build
rm -rf ios/DerivedData
rm -rf ios/*.xcworkspace/xcuserdata
rm -rf ios/*.xcodeproj/xcuserdata
rm -rf ios/*.xcodeproj/project.xcworkspace/xcuserdata

# Clean Android
echo "🤖 Cleaning Android artifacts..."
rm -rf android/build
rm -rf android/app/build
rm -rf android/.gradle
rm -rf android/local.properties

# Clean Node modules and caches
echo "📦 Cleaning Node modules..."
rm -rf node_modules
rm -rf package-lock.json
rm -rf yarn.lock

# Clean Expo/Metro cache
echo "⚡ Cleaning Expo/Metro cache..."
rm -rf .expo
rm -rf .expo-shared
npx expo start --clear || true

# Clean watchman
echo "👀 Cleaning Watchman cache..."
watchman watch-del-all 2>/dev/null || true

# Clean temporary files
echo "🗑️  Cleaning temporary files..."
find . -type d -name ".DS_Store" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name ".DS_Store" -delete 2>/dev/null || true
rm -rf .tmp
rm -rf tmp

# Clean TypeScript cache
echo "📝 Cleaning TypeScript cache..."
rm -rf .tsbuildinfo

echo "✅ Cleanup complete!"
echo ""
echo "Next steps:"
echo "1. Run: npm install (or yarn install)"
echo "2. Run: cd ios && pod install (for iOS)"
echo "3. Run: npx expo prebuild --clean (if using bare workflow)"

