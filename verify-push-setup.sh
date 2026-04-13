#!/bin/bash
echo "🔍 Verifying Push Notifications setup..."
echo ""

# Check entitlements
if [ -f "ios/NomliMingle/NomliMingle.entitlements" ]; then
  echo "✅ Entitlements file exists"
  if grep -q "aps-environment" "ios/NomliMingle/NomliMingle.entitlements"; then
    echo "✅ aps-environment is set"
  else
    echo "❌ aps-environment is missing"
  fi
else
  echo "❌ Entitlements file missing"
fi

echo ""
echo "📋 To complete setup:"
echo "1. Open: open ios/NomliMingle.xcworkspace"
echo "2. Add Push Notifications capability in Xcode"
echo "3. Clean build folder (Cmd + Shift + K)"
echo "4. Rebuild (Cmd + R)"
