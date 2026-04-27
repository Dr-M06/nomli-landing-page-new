#!/bin/bash

echo "🔍 Checking for Unused Components"
echo "================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

UNUSED_COUNT=0
USED_COUNT=0

# Get all component files
COMPONENTS=$(find components -name "*.tsx" -o -name "*.ts" | grep -v node_modules | sort)

echo "Analyzing components..."
echo ""

for component_file in $COMPONENTS; do
  # Get component name (filename without extension)
  component_name=$(basename "$component_file" | sed 's/\.[^.]*$//')
  
  # Skip index files and types
  if [[ "$component_name" == "index" ]] || [[ "$component_file" == *.d.ts ]]; then
    continue
  fi
  
  # Check if component is imported
  # Look for imports like: import X from './X' or import X from '../components/X'
  import_count=$(grep -r "from.*['\"]\.\.\/components\/${component_name}" . \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v "$component_file" | wc -l | tr -d ' ')
  
  # Also check for imports with different paths
  import_count2=$(grep -r "from.*['\"]\.\/${component_name}" . \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v "$component_file" | wc -l | tr -d ' ')
  
  # Check for component name in JSX (might be used dynamically)
  jsx_usage=$(grep -r "<${component_name}" . \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v "$component_file" | wc -l | tr -d ' ')
  
  total_usage=$((import_count + import_count2 + jsx_usage))
  
  if [ "$total_usage" -eq 0 ]; then
    echo -e "${RED}✗ UNUSED:${NC} $component_file"
    ((UNUSED_COUNT++))
  else
    echo -e "${GREEN}✓ USED:${NC} $component_file (${total_usage} references)"
    ((USED_COUNT++))
  fi
done

echo ""
echo "================================="
echo "Summary:"
echo -e "${GREEN}Used:${NC} $USED_COUNT components"
echo -e "${RED}Unused:${NC} $UNUSED_COUNT components"
echo ""
echo "⚠️  Note: Some components might be used dynamically or exported from index files"
echo "   Review carefully before deleting!"
