#!/bin/bash

echo "🧹 Dead Code & Unused Assets Cleanup Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track what we're removing
REMOVED_FILES=0
REMOVED_DEPS=0

echo "📦 Step 1: Analyzing unused dependencies..."
echo "-------------------------------------------"

# Check for unused dependencies
UNUSED_DEPS=(
  "@expo-google-fonts/inter"
  "@expo-google-fonts/roboto"
  "@lottiefiles/dotlottie-react"
  "iceberg-js"
  "express"
  "cors"
  "fix"
  "lodash.isfunction"
  "lodash.isnil"
)

echo "Potentially unused dependencies to check:"
for dep in "${UNUSED_DEPS[@]}"; do
  if grep -r "from.*['\"]${dep}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v "package.json" | grep -v "package-lock.json" | head -1 > /dev/null; then
    echo -e "${GREEN}✓${NC} $dep - USED"
  else
    echo -e "${RED}✗${NC} $dep - NOT FOUND IN CODE"
  fi
done

echo ""
echo "📁 Step 2: Checking for unused admin dashboard UI..."
echo "-------------------------------------------"

if [ -d "assets/admin-dashboard-ui" ]; then
  echo -e "${YELLOW}⚠️  Found admin-dashboard-ui directory (Next.js project)"
  echo "   This appears to be a separate Next.js project not used in the React Native app"
  echo "   Size: $(du -sh assets/admin-dashboard-ui 2>/dev/null | cut -f1)"
  echo "   Consider removing if not needed"
fi

echo ""
echo "🎵 Step 3: Checking sound files..."
echo "-------------------------------------------"

SOUNDS_DIR="assets/sounds"
if [ -d "$SOUNDS_DIR" ]; then
  echo "Sound files found:"
  for sound in "$SOUNDS_DIR"/*.mp3; do
    if [ -f "$sound" ]; then
      filename=$(basename "$sound")
      if grep -r "$filename" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | grep -v node_modules | grep -v ".git" | head -1 > /dev/null; then
        echo -e "${GREEN}✓${NC} $filename - USED"
      else
        echo -e "${RED}✗${NC} $filename - NOT FOUND IN CODE"
      fi
    fi
  done
fi

echo ""
echo "🖼️  Step 4: Checking for unused image assets..."
echo "-------------------------------------------"

# Check for duplicate/unused logo files
LOGO_FILES=(
  "assets/logosvg-clean.svg"
  "assets/logosvg-happy.svg"
  "assets/logosvg-love.svg"
  "assets/logosvg-new.svg"
  "assets/logosvg-premium.svg"
  "assets/logosvg-splash-clean.svg"
  "assets/logosvg-splash-premium.svg"
  "assets/logosvg-splash-v2.svg"
  "assets/logosvg-splash.svg"
)

echo "Logo files to check:"
for logo in "${LOGO_FILES[@]}"; do
  if [ -f "$logo" ]; then
    filename=$(basename "$logo")
    if grep -r "$filename" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" 2>/dev/null | grep -v node_modules | grep -v ".git" | head -1 > /dev/null; then
      echo -e "${GREEN}✓${NC} $filename - USED"
    else
      echo -e "${YELLOW}?${NC} $filename - NOT FOUND (might be referenced in config)"
    fi
  fi
done

echo ""
echo "📄 Step 5: Checking for unused components..."
echo "-------------------------------------------"

# Components that might be unused
POTENTIALLY_UNUSED_COMPONENTS=(
  "DiscoSoundBubbles"
  "FollowButtonShowcase"
  "SimpleLocationDisclosureModal"
  "SimpleCameraCapture"
  "SimpleAvatar"
  "OneSignalManager"
)

echo "Potentially unused components:"
for component in "${POTENTIALLY_UNUSED_COMPONENTS[@]}"; do
  # Count imports of this component
  count=$(grep -r "from.*['\"]\.\.\/components\/${component}" . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v ".git" | wc -l | tr -d ' ')
  if [ "$count" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} $component - USED ($count imports)"
  else
    echo -e "${RED}✗${NC} $component - NOT IMPORTED"
  fi
done

echo ""
echo "📊 Step 6: Summary and Recommendations"
echo "-------------------------------------------"
echo ""
echo "To remove unused dependencies, run:"
echo "  npm uninstall @expo-google-fonts/inter @expo-google-fonts/roboto @lottiefiles/dotlottie-react iceberg-js express cors fix lodash.isfunction lodash.isnil"
echo ""
echo "To remove admin dashboard UI (if not needed):"
echo "  rm -rf assets/admin-dashboard-ui"
echo ""
echo "⚠️  IMPORTANT: Review the results above before removing anything!"
echo "   Some files might be referenced in config files or build scripts."
echo ""
echo "✅ Analysis complete!"
