#!/bin/bash
# Analyze unused code and assets. Does not delete anything — review output first.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Dead code & asset checks"
echo "========================"
echo ""

echo "1) Unused npm dependencies (many RN/Expo packages are false positives — verify manually):"
echo "   ${GREEN}npx --yes depcheck${NC}"
echo ""

echo "2) Repo-wide analysis script (if configured):"
if grep -q '"analyze"' package.json 2>/dev/null; then
  echo "   ${GREEN}npm run analyze${NC}"
else
  echo "   ${YELLOW}(no analyze script in package.json)${NC}"
fi
echo ""

echo "3) Admin dashboard bundle (remove only if you do not deploy it separately):"
if [ -d "assets/admin-dashboard-ui" ]; then
  echo -e "${YELLOW}⚠${NC}  assets/admin-dashboard-ui exists ($(du -sh assets/admin-dashboard-ui 2>/dev/null | cut -f1))"
else
  echo "   (not present)"
fi
echo ""

echo "4) Sound assets — filenames referenced in source:"
SOUNDS_DIR="assets/sounds"
if [ -d "$SOUNDS_DIR" ]; then
  for sound in "$SOUNDS_DIR"/*.mp3; do
    [ -f "$sound" ] || continue
    filename=$(basename "$sound")
    if grep -r "$filename" . \
      --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
      2>/dev/null | grep -v node_modules | grep -v ".git" | head -1 >/dev/null; then
      echo -e "${GREEN}✓${NC} $filename — referenced"
    else
      echo -e "${RED}✗${NC} $filename — no reference found"
    fi
  done
else
  echo "   (no $SOUNDS_DIR)"
fi
echo ""

echo "5) Logo SVGs — filenames referenced in source or JSON:"
LOGO_DIR="assets"
if [ -d "$LOGO_DIR" ]; then
  for logo in "$LOGO_DIR"/logosvg*.svg; do
    [ -f "$logo" ] || continue
    filename=$(basename "$logo")
    if grep -r "$filename" . \
      --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" \
      2>/dev/null | grep -v node_modules | grep -v ".git" | head -1 >/dev/null; then
      echo -e "${GREEN}✓${NC} $filename — referenced"
    else
      echo -e "${YELLOW}?${NC} $filename — not found (may still be used by native splash tooling)"
    fi
  done
fi
echo ""

echo "Done. Remove files or run npm uninstall only after confirming usage."
echo "For bundle-size analysis: npm run analyze:bundle (if defined)."
