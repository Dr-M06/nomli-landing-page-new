#!/bin/bash

echo "🧹 Removing Unused Code & Dependencies"
echo "======================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Track removals
REMOVED=0

echo "📦 Step 1: Removing unused npm dependencies..."
echo "-------------------------------------------"

# Unused dependencies confirmed
UNUSED_DEPS=(
  "@expo-google-fonts/inter"
  "@expo-google-fonts/roboto"
  "@lottiefiles/dotlottie-react"
  "iceberg-js"
  "lodash.isfunction"
  "lodash.isnil"
)

echo "Removing unused dependencies..."
for dep in "${UNUSED_DEPS[@]}"; do
  echo -e "${YELLOW}Removing:${NC} $dep"
  npm uninstall "$dep" 2>/dev/null && ((REMOVED++)) || echo "  (not found or already removed)"
done

echo ""
echo "📁 Step 2: Removing unused components..."
echo "-------------------------------------------"

# Unused components (confirmed not imported)
UNUSED_COMPONENTS=(
  "components/FollowButtonShowcase.tsx"
  "components/SimpleCameraCapture.tsx"
  "components/OneSignalManager.tsx"
)

for component in "${UNUSED_COMPONENTS[@]}"; do
  if [ -f "$component" ]; then
    echo -e "${YELLOW}Removing:${NC} $component"
    rm -f "$component" && ((REMOVED++))
  fi
done

echo ""
echo "📁 Step 3: Removing admin dashboard UI (if not needed)..."
echo "-------------------------------------------"
echo -e "${YELLOW}⚠️  Admin dashboard UI found (8.3MB)"
echo "   This is a Next.js project not used in the React Native app"
echo "   Remove it? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
  if [ -d "assets/admin-dashboard-ui" ]; then
    echo "Removing admin-dashboard-ui..."
    rm -rf assets/admin-dashboard-ui && ((REMOVED++))
    echo -e "${GREEN}✓ Removed admin-dashboard-ui${NC}"
  fi
else
  echo "Skipping admin-dashboard-ui removal"
fi

echo ""
echo "📄 Step 4: Cleaning up unused logo files..."
echo "-------------------------------------------"

# Check which logos are actually used in code/config
USED_LOGO_PATTERNS=(
  "logosvg-splash"
  "logosvg-premium"
)

# Keep only commonly used logos, remove duplicates
LOGO_FILES_TO_CHECK=(
  "assets/logosvg-clean.svg"
  "assets/logosvg-happy.svg"
  "assets/logosvg-love.svg"
  "assets/logosvg-new.svg"
  "assets/logosvg-splash-v2.svg"
)

echo "Checking logo files..."
for logo in "${LOGO_FILES_TO_CHECK[@]}"; do
  if [ -f "$logo" ]; then
    filename=$(basename "$logo")
    # Check if referenced in code/config
    if ! grep -r "$filename" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" --include="app.config.js" 2>/dev/null | grep -v node_modules | grep -v ".git" | head -1 > /dev/null; then
      echo -e "${YELLOW}Removing unused logo:${NC} $filename"
      rm -f "$logo" && ((REMOVED++))
    fi
  fi
done

echo ""
echo "🧹 Step 5: Cleaning up old backup files..."
echo "-------------------------------------------"

# Remove old backup directories
if [ -d "assets/old-logos-backup" ]; then
  echo "Removing old logo backups..."
  rm -rf assets/old-logos-backup && ((REMOVED++))
fi

echo ""
echo "📊 Summary"
echo "-------------------------------------------"
echo -e "${GREEN}✓ Removed $REMOVED items${NC}"
echo ""
echo "Next steps:"
echo "1. Run: npm install (to update package-lock.json)"
echo "2. Test the app to ensure nothing broke"
echo "3. Commit changes if everything works"
echo ""
echo "✅ Cleanup complete!"
