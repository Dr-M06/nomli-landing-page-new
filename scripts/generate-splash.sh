#!/bin/bash

echo "🎨 Generating Splash Screen from Happy Logo..."
echo ""

SOURCE_SVG="../assets/logosvg-splash.svg"

# Check if rsvg-convert is available
if ! command -v rsvg-convert &> /dev/null; then
    echo "❌ Error: rsvg-convert not found. Please install librsvg:"
    echo "  brew install librsvg"
    exit 1
fi

echo "✅ Using rsvg-convert"
echo ""

# Splash screen size (1284x2778 for iPhone 14 Pro Max)
# We'll center the logo on a dark background
echo "📱 Generating splash screen..."

# Generate splash at 1284x2778 (will be centered)
rsvg-convert -w 1284 -h 2778 "$SOURCE_SVG" -o "../assets/images/splash.png"

if [ $? -eq 0 ]; then
    echo "  ✓ Generated: ../assets/images/splash.png (1284×2778)"
else
    echo "  ✗ Failed to generate splash screen"
    exit 1
fi

echo ""
echo "✨ Splash screen generation complete!"
echo ""
