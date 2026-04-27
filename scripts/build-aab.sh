#!/bin/bash
# Build Android App Bundle (AAB) with proper signing
# This script builds a signed AAB for release

set -e

echo "🔨 Building Android App Bundle (AAB)"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to android directory
cd "$(dirname "$0")/android" || exit 1

# Check if keystore.properties exists
if [ ! -f "keystore.properties" ]; then
    echo -e "${YELLOW}⚠️  keystore.properties not found${NC}"
    echo "Checking for keystore file..."
    
    # Check if keystore file exists
    if [ ! -f "../nomli-mingle-release-key.keystore" ]; then
        echo -e "${RED}❌ Keystore file not found at: ../nomli-mingle-release-key.keystore${NC}"
        echo ""
        echo "Please ensure:"
        echo "1. The keystore file exists at: nomli-mingle-release-key.keystore (project root)"
        echo "2. OR create android/keystore.properties with:"
        echo "   storeFile=../../nomli-mingle-release-key.keystore"
        echo "   storePassword=YOUR_STORE_PASSWORD"
        echo "   keyAlias=nomli-mingle-key-alias"
        echo "   keyPassword=YOUR_KEY_PASSWORD"
        exit 1
    else
        echo -e "${GREEN}✅ Keystore file found${NC}"
        echo -e "${YELLOW}⚠️  Using fallback configuration from gradle.properties${NC}"
        echo "Make sure gradle.properties has correct keystore credentials"
    fi
else
    echo -e "${GREEN}✅ keystore.properties found${NC}"
fi

# Check if keystore file exists (relative to android directory)
KEYSTORE_PATH="../nomli-mingle-release-key.keystore"
if [ -f "$KEYSTORE_PATH" ]; then
    echo -e "${GREEN}✅ Keystore file exists: $KEYSTORE_PATH${NC}"
else
    echo -e "${YELLOW}⚠️  Keystore file not found at: $KEYSTORE_PATH${NC}"
    echo "Make sure the path in keystore.properties or gradle.properties is correct"
fi

echo ""
echo "📦 Current version info:"
echo "   Version Code: 89"
echo "   Version Name: 1.0.31"
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
./gradlew clean

# Build the AAB
echo ""
echo "🔨 Building release AAB..."
./gradlew bundleRelease

# Check if AAB was created
AAB_PATH="app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB_PATH" ]; then
    AAB_SIZE=$(du -h "$AAB_PATH" | cut -f1)
    echo ""
    echo -e "${GREEN}✅ AAB built successfully!${NC}"
    echo "   Location: $AAB_PATH"
    echo "   Size: $AAB_SIZE"
    echo ""
    echo "📤 Next steps:"
    echo "   1. Upload to Google Play Console"
    echo "   2. Or test locally with: bundletool"
    echo ""
    echo "To install and test locally:"
    echo "   bundletool build-apks --bundle=$AAB_PATH --output=app.apks --mode=universal"
    echo "   bundletool install-apks --apks=app.apks"
else
    echo -e "${RED}❌ AAB not found at expected location: $AAB_PATH${NC}"
    exit 1
fi
