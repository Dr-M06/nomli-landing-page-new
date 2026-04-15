#!/bin/bash

# Deploy Live Bootstrap Edge Function
# This script deploys the updated live-bootstrap function to Supabase

set -e

echo "🚀 Deploying Live Bootstrap Edge Function"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI found${NC}"
echo ""

# Check if logged in
echo "📋 Step 1: Checking Supabase login status..."
if supabase projects list &>/dev/null; then
    echo -e "${GREEN}✅ Already logged in to Supabase${NC}"
else
    echo -e "${YELLOW}⚠️  Not logged in to Supabase${NC}"
    echo ""
    echo "Please run: ${BLUE}supabase login${NC}"
    echo "This will open a browser for authentication."
    echo ""
    read -p "Press Enter after you've logged in, or Ctrl+C to cancel..."
fi

echo ""

# Check if project is linked
echo "📋 Step 2: Checking project link..."
if [ -f ".supabase/config.toml" ]; then
    echo -e "${GREEN}✅ Project appears to be linked${NC}"
else
    echo -e "${YELLOW}⚠️  Project not linked${NC}"
    echo ""
    echo "Please link your project: ${BLUE}supabase link --project-ref your-project-ref${NC}"
    echo "You can find your project ref in the Supabase Dashboard URL:"
    echo "  https://supabase.com/dashboard/project/YOUR_PROJECT_REF"
    echo ""
    read -p "Press Enter after you've linked the project, or Ctrl+C to cancel..."
fi

echo ""

# Verify secrets are set
echo "📋 Step 3: Verifying required secrets..."
echo ""
echo "The following secrets should be set in Supabase Dashboard:"
echo "  - ${BLUE}AGORA_APP_ID${NC} (required for direct token generation)"
echo "  - ${BLUE}AGORA_APP_CERTIFICATE${NC} (required for direct token generation)"
echo "  - ${BLUE}AGORA_TOKEN_SERVER_URL${NC} (optional, fallback if credentials not available)"
echo ""
echo "To set secrets, run:"
echo "  ${BLUE}supabase secrets set AGORA_APP_ID=your_app_id${NC}"
echo "  ${BLUE}supabase secrets set AGORA_APP_CERTIFICATE=your_certificate${NC}"
echo ""
read -p "Press Enter to continue with deployment, or Ctrl+C to set secrets first..."

echo ""

# Deploy the function
echo "📋 Step 4: Deploying live-bootstrap function..."
echo ""
cd supabase/functions/live-bootstrap

if supabase functions deploy live-bootstrap; then
    echo ""
    echo -e "${GREEN}✅ Function deployed successfully!${NC}"
    echo ""
    echo "The updated live-bootstrap function is now live with:"
    echo "  - ✅ Anonymous viewer support"
    echo "  - ✅ Direct token generation (if AGORA_APP_ID/CERTIFICATE are set)"
    echo "  - ✅ Token server fallback"
    echo ""
    echo "Test it by calling:"
    echo "  ${BLUE}GET /functions/v1/live-bootstrap?streamId=xxx&role=audience${NC}"
else
    echo ""
    echo -e "${RED}❌ Function deployment failed${NC}"
    echo ""
    echo "Common issues:"
    echo "  1. Not logged in: Run ${BLUE}supabase login${NC}"
    echo "  2. Project not linked: Run ${BLUE}supabase link --project-ref your-ref${NC}"
    echo "  3. Network issues: Check your internet connection"
    echo ""
    exit 1
fi

cd ../../..

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
