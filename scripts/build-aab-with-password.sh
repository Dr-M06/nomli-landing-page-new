#!/bin/bash
# Build Android App Bundle (AAB) with password prompting
# This script prompts for keystore passwords and builds the signed AAB

set -e

echo "🔨 Building Android App Bundle (AAB) with Release Keystore"
echo "============================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to android directory
cd "$(dirname "$0")/android" || exit 1

# Check if keystore file exists
KEYSTORE_PATH="../nomli-mingle-release-key.keystore"
if [ ! -f "$KEYSTORE_PATH" ]; then
    echo -e "${RED}❌ Keystore file not found at: $KEYSTORE_PATH${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Keystore file found: $KEYSTORE_PATH${NC}"
echo ""

# Prompt for passwords
echo "Please enter your keystore passwords:"
echo ""

# Prompt for store password
read -sp "Enter keystore store password: " STORE_PASSWORD
echo ""

# Prompt for key password
read -sp "Enter keystore key password: " KEY_PASSWORD
echo ""
echo ""

# Validate passwords are not empty
if [ -z "$STORE_PASSWORD" ] || [ -z "$KEY_PASSWORD" ]; then
    echo -e "${RED}❌ Passwords cannot be empty${NC}"
    exit 1
fi

# Export passwords as environment variables
export MYAPP_RELEASE_STORE_PASSWORD="$STORE_PASSWORD"
export MYAPP_RELEASE_KEY_PASSWORD="$KEY_PASSWORD"
export MYAPP_RELEASE_STORE_FILE="../../nomli-mingle-release-key.keystore"
export MYAPP_RELEASE_KEY_ALIAS="nomli-mingle-key-alias"

echo -e "${YELLOW}📦 Building AAB with version:${NC}"
echo "   Version Code: 101"
echo "   Version Name: 1.0.39"
echo ""

# Clean and build
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
./gradlew clean --no-daemon > /dev/null 2>&1 || true

echo -e "${YELLOW}🔨 Building release bundle...${NC}"
./gradlew bundleRelease --no-daemon

# Check if build was successful
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo ""
    echo "AAB location:"
    echo "  android/app/build/outputs/bundle/release/app-release.aab"
    echo ""
    echo -e "${GREEN}✅ AAB is signed with release keystore${NC}"
else
    echo ""
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
