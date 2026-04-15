#!/bin/bash
# Script to verify keystore information
# This helps identify the correct alias and verify the keystore is valid

echo "🔐 Keystore Verification Helper"
echo "=================================="
echo ""

KEYSTORE_FILE="nomli-mingle-release-key.keystore"

if [ ! -f "$KEYSTORE_FILE" ]; then
    echo "❌ Keystore file not found: $KEYSTORE_FILE"
    exit 1
fi

echo "📁 Keystore file found: $KEYSTORE_FILE"
echo ""
echo "To verify your keystore, run:"
echo ""
echo "  keytool -list -v -keystore $KEYSTORE_FILE"
echo ""
echo "This will prompt you for the keystore password."
echo "After entering the password, you'll see:"
echo "  - Keystore type"
echo "  - List of aliases (keys) in the keystore"
echo "  - Certificate information"
echo ""
echo "Common aliases to check:"
echo "  - nomli-mingle-key-alias"
echo "  - key0"
echo "  - androiddebugkey"
echo ""
echo "Once you verify the alias, update android/keystore.properties with:"
echo "  - The correct storePassword"
echo "  - The correct keyAlias (if different)"
echo "  - The correct keyPassword"
echo ""
