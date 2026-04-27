#!/bin/bash

# Watch app logs for push token related messages

echo "🔍 Watching for push token logs..."
echo "===================================="
echo ""
echo "Make sure your app is running and restart it if needed."
echo "Press Ctrl+C to stop watching."
echo ""

~/Library/Android/sdk/platform-tools/adb logcat | grep -E "CustomNotifications|ExpoNotificationManager|Push token|RPC|expo_push_token" --line-buffered

