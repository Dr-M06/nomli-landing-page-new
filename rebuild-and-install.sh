#!/bin/bash

# Rebuild and Install App on Real Device
# This script rebuilds the app with the fix and installs it on your device

set -e  # Exit on error

echo "🚀 Rebuilding app with push notification fix..."
echo ""

# Navigate to android directory
cd /Users/nomli/Downloads/nomli-mingle-ios/android

# Clean old build
echo "🧹 Cleaning old build..."
./gradlew clean

# Build release APK
echo "📦 Building release APK..."
./gradlew assembleRelease

echo ""
echo "✅ Build complete!"
echo ""

# Check if device is connected
echo "📱 Checking for connected devices..."
DEVICES=$(~/Library/Android/sdk/platform-tools/adb devices | grep -v "List" | grep "device" | wc -l)

if [ "$DEVICES" -eq 0 ]; then
    echo "❌ No devices connected!"
    echo ""
    echo "Please:"
    echo "1. Connect your Android device via USB"
    echo "2. Enable USB debugging on the device"
    echo "3. Run this script again"
    echo ""
    echo "APK location:"
    echo "  /Users/nomli/Downloads/nomli-mingle-ios/android/app/build/outputs/apk/release/app-release.apk"
    exit 1
fi

echo "✅ Device(s) connected:"
~/Library/Android/sdk/platform-tools/adb devices
echo ""

# Install on device
echo "📲 Installing on device..."
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk

echo ""
echo "🎉 Installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Open the app on your device"
echo "2. Log in with your account"
echo "3. Wait 15-20 seconds for initialization"
echo "4. Check Supabase for the real push token:"
echo ""
echo "   SELECT expo_push_token FROM profiles WHERE id = 'f54363ba-1ad7-4149-9749-2dfaef1ff6fe';"
echo ""
echo "5. Test with: node test-push.js \"YOUR_REAL_TOKEN\""
echo ""

