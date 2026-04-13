#!/bin/bash

# Build Release AAB Script with Password Prompt
# This script builds the release AAB with the correct keystore

set -e

echo "🔨 Building Release AAB..."
echo ""

# Check if passwords are provided as arguments
if [ -n "$1" ] && [ -n "$2" ]; then
    export MYAPP_RELEASE_STORE_PASSWORD="$1"
    export MYAPP_RELEASE_KEY_PASSWORD="$2"
    echo "✅ Using passwords from command line arguments"
elif [ -n "$MYAPP_RELEASE_STORE_PASSWORD" ] && [ -n "$MYAPP_RELEASE_KEY_PASSWORD" ]; then
    echo "✅ Using passwords from environment variables"
else
    echo "⚠️  Keystore passwords not found!"
    echo ""
    echo "Usage:"
    echo "  ./build-release-aab-now.sh <store_password> <key_password>"
    echo ""
    echo "OR set environment variables:"
    echo "  export MYAPP_RELEASE_STORE_PASSWORD=your_store_password"
    echo "  export MYAPP_RELEASE_KEY_PASSWORD=your_key_password"
    echo "  ./build-release-aab-now.sh"
    echo ""
    echo "⚠️  IMPORTANT: Make sure the passwords match your keystore!"
    echo "   Keystore: android/app/nomli-mingle-release-key.keystore"
    echo "   Key Alias: nomli-mingle-key-alias"
    echo ""
    exit 1
fi

# Determine keystore location (check both possible locations)
KEYSTORE_PATH=""
if [ -f "android/app/nomli-mingle-release-key.keystore" ]; then
    KEYSTORE_PATH="android/app/nomli-mingle-release-key.keystore"
elif [ -f "nomli-mingle-release-key.keystore" ]; then
    KEYSTORE_PATH="nomli-mingle-release-key.keystore"
else
    echo "❌ Keystore not found!"
    echo "   Checked locations:"
    echo "   - android/app/nomli-mingle-release-key.keystore"
    echo "   - nomli-mingle-release-key.keystore"
    exit 1
fi

echo "✅ Keystore found: $KEYSTORE_PATH"

# Verify keystore passwords before building
echo "🔐 Verifying keystore passwords..."
if keytool -list -v -keystore "$KEYSTORE_PATH" -alias nomli-mingle-key-alias -storepass "$MYAPP_RELEASE_STORE_PASSWORD" -keypass "$MYAPP_RELEASE_KEY_PASSWORD" > /dev/null 2>&1; then
    echo "✅ Keystore passwords verified successfully"
else
    echo "❌ ERROR: Keystore password verification failed!"
    echo "   Please check that your passwords are correct for:"
    echo "   - Store password: $MYAPP_RELEASE_STORE_PASSWORD"
    echo "   - Key password: $MYAPP_RELEASE_KEY_PASSWORD"
    echo "   - Keystore: $KEYSTORE_PATH"
    echo "   - Key Alias: nomli-mingle-key-alias"
    echo ""
    echo "   To verify manually, run:"
    echo "   keytool -list -v -keystore $KEYSTORE_PATH -alias nomli-mingle-key-alias"
    exit 1
fi

# Get absolute path to keystore before changing directory
KEYSTORE_ABSOLUTE_PATH=$(cd "$(dirname "$KEYSTORE_PATH")" && pwd)/$(basename "$KEYSTORE_PATH")

# Navigate to android directory
cd android
echo ""

# Export with standard names for Gradle
export MYAPP_RELEASE_KEY_ALIAS="${MYAPP_RELEASE_KEY_ALIAS:-nomli-mingle-key-alias}"

# Use absolute path to keystore to avoid path resolution issues
export MYAPP_RELEASE_STORE_FILE="$KEYSTORE_ABSOLUTE_PATH"

echo "🧹 Cleaning previous build..."
./gradlew clean

echo ""
echo "📦 Building Release AAB..."
echo "   Version Code: 100"
echo "   Version Name: 1.0.38"
echo "   Keystore: $KEYSTORE_PATH"
echo "   Key Alias: $MYAPP_RELEASE_KEY_ALIAS"
echo ""

# Build the AAB with explicit Gradle properties
./gradlew bundleRelease \
    -PMYAPP_RELEASE_STORE_FILE="$MYAPP_RELEASE_STORE_FILE" \
    -PMYAPP_RELEASE_STORE_PASSWORD="$MYAPP_RELEASE_STORE_PASSWORD" \
    -PMYAPP_RELEASE_KEY_ALIAS="$MYAPP_RELEASE_KEY_ALIAS" \
    -PMYAPP_RELEASE_KEY_PASSWORD="$MYAPP_RELEASE_KEY_PASSWORD"

echo ""
echo "✅ Build complete!"
echo ""
echo "📱 AAB location:"
echo "   android/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "📄 Deobfuscation (mapping) file (upload in Play Console for crash reports):"
echo "   android/app/build/outputs/mapping/release/mapping.txt"
echo ""
echo "🔍 To verify the signature, run:"
echo "   jarsigner -verify -verbose -certs android/app/build/outputs/bundle/release/app-release.aab"
echo ""
