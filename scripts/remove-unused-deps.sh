#!/bin/bash

echo "🧹 Removing Unused Dependencies"
echo "================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Dependencies to remove (server-side packages not needed in React Native)
# Note: express, cors, fix are already removed from package.json. Add any new unused deps here.
UNUSED_DEPS=(
  # "express"   # already removed
  # "cors"      # already removed
  # "fix"       # already removed
)

echo "📦 Removing unused dependencies..."
echo ""

for dep in "${UNUSED_DEPS[@]}"; do
  echo -e "${YELLOW}Removing:${NC} $dep"
  npm uninstall "$dep" 2>/dev/null && echo -e "${GREEN}✓ Removed $dep${NC}" || echo -e "${RED}✗ Failed to remove $dep (may not be installed)${NC}"
done

echo ""
echo "✅ Done!"
echo ""
echo "💡 Next steps:"
echo "   1. Replace lodash with individual imports"
echo "   2. Lazy load heavy components"
echo "   3. Optimize assets"
echo ""
echo "   See APP_SIZE_REDUCTION_GUIDE.md for details"
