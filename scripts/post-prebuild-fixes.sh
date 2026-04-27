#!/bin/bash

echo "🔧 Applying post-prebuild fixes..."

# Fix 1: iOS - Add modular headers for Firebase
if [ -f "ios/Podfile" ]; then
    if ! grep -q "use_modular_headers!" ios/Podfile; then
        echo "  ✅ Adding use_modular_headers! to iOS Podfile"
        sed -i '' '/platform :ios/a\
\
# Fix for Firebase Swift pods\
use_modular_headers!\
' ios/Podfile
    else
        echo "  ✓ iOS Podfile already has use_modular_headers!"
    fi
fi

# Fix 2: Android - Add Notifee local repository
if [ -f "android/build.gradle" ]; then
    if ! grep -q "notifee/react-native/android/libs" android/build.gradle; then
        echo "  ✅ Adding Notifee repository to Android build.gradle"
        sed -i '' '/jsc-android.*dist/a\
\
        // Notifee local AAR library\
        maven {\
            url "$rootDir/../node_modules/@notifee/react-native/android/libs"\
        }\
' android/build.gradle
    else
        echo "  ✓ Android build.gradle already has Notifee repository"
    fi
fi

# Fix 3: Android - Fix Firebase manifest conflicts
if [ -f "android/app/src/main/AndroidManifest.xml" ]; then
    if ! grep -q 'tools:replace="android:value"' android/app/src/main/AndroidManifest.xml; then
        echo "  ✅ Fixing Firebase manifest conflicts"
        sed -i '' 's/android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="default"/android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="default" tools:replace="android:value"/' android/app/src/main/AndroidManifest.xml
        sed -i '' 's/android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color\/notification_icon_color"/android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color\/notification_icon_color" tools:replace="android:resource"/' android/app/src/main/AndroidManifest.xml
    else
        echo "  ✓ Android manifest already has Firebase fixes"
    fi
fi

echo "✨ Post-prebuild fixes applied!"

