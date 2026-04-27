#!/bin/bash

# Script to verify Xcode push notification configuration

echo "🔍 Verifying Xcode Push Notification Configuration..."
echo ""

# Check if entitlements file exists
ENTITLEMENTS_FILE="ios/NomliMingle/NomliMingle.entitlements"
if [ -f "$ENTITLEMENTS_FILE" ]; then
    echo "✅ Entitlements file exists: $ENTITLEMENTS_FILE"
    
    # Check if aps-environment is set
    if grep -q "aps-environment" "$ENTITLEMENTS_FILE"; then
        echo "✅ aps-environment found in entitlements"
        grep -A 1 "aps-environment" "$ENTITLEMENTS_FILE" | head -2
    else
        echo "❌ aps-environment NOT found in entitlements!"
    fi
else
    echo "❌ Entitlements file NOT found: $ENTITLEMENTS_FILE"
fi

echo ""
echo "📋 Next Steps:"
echo "1. Open Xcode: open ios/NomliMingle.xcworkspace"
echo "2. Select the project → Target → Signing & Capabilities"
echo "3. Click '+ Capability' and add 'Push Notifications'"
echo "4. Verify 'Background Modes' has 'Remote notifications' enabled"
echo "5. Clean build folder (Cmd + Shift + K)"
echo "6. Rebuild (Cmd + R)"
echo ""
echo "📖 See FIX_XCODE_PUSH_NOTIFICATIONS.md for detailed instructions"

