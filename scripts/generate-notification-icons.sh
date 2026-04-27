#!/bin/bash

echo "🔔 Generating Notification Icons..."
echo ""

SOURCE_SVG="../assets/logosvg-happy.svg"

if ! command -v rsvg-convert &> /dev/null; then
    echo "❌ Error: rsvg-convert not found"
    exit 1
fi

echo "✅ Using rsvg-convert"
echo ""

# Android notification icons (should be simple, white on transparent)
# We'll use the happy logo but make it suitable for notifications
echo "📱 Generating Android notification icons..."

# Standard notification sizes
rsvg-convert -w 96 -h 96 "$SOURCE_SVG" -o "../assets/images/notification-icon.png"
echo "  ✓ Generated: notification-icon.png (96×96)"

rsvg-convert -w 72 -h 72 "$SOURCE_SVG" -o "../assets/images/notification_icon.png"
echo "  ✓ Generated: notification_icon.png (72×72)"

rsvg-convert -w 96 -h 96 "$SOURCE_SVG" -o "../assets/images/notification_icon_fixed.png"
echo "  ✓ Generated: notification_icon_fixed.png (96×96)"

echo ""
echo "✨ Notification icons complete!"
echo ""
