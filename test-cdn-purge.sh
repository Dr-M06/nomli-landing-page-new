#!/bin/bash

# CDN Cache Purge Test Script
# This script helps verify the CDN cache purge system is working

set -e

echo "🧪 CDN Cache Purge Test Script"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI found${NC}"
echo ""

# Test 1: Check if function is deployed
echo "📋 Test 1: Checking if Edge Function is deployed..."
if supabase functions list | grep -q "purge-cdn-cache"; then
    echo -e "${GREEN}✅ Function 'purge-cdn-cache' is deployed${NC}"
else
    echo -e "${RED}❌ Function 'purge-cdn-cache' not found${NC}"
    echo "Deploy it with: supabase functions deploy purge-cdn-cache"
    exit 1
fi
echo ""

# Test 2: Check if secrets are set
echo "📋 Test 2: Checking if secrets are configured..."
SECRETS=$(supabase secrets list 2>/dev/null || echo "")

if echo "$SECRETS" | grep -q "CLOUDFLARE_ZONE_ID"; then
    echo -e "${GREEN}✅ CLOUDFLARE_ZONE_ID is set${NC}"
else
    echo -e "${RED}❌ CLOUDFLARE_ZONE_ID not found${NC}"
    echo "Set it with: supabase secrets set CLOUDFLARE_ZONE_ID=your_zone_id"
fi

if echo "$SECRETS" | grep -q "CLOUDFLARE_API_TOKEN"; then
    echo -e "${GREEN}✅ CLOUDFLARE_API_TOKEN is set${NC}"
else
    echo -e "${RED}❌ CLOUDFLARE_API_TOKEN not found${NC}"
    echo "Set it with: supabase secrets set CLOUDFLARE_API_TOKEN=your_token"
fi
echo ""

# Test 3: Check CDN domain
echo "📋 Test 3: Checking CDN configuration..."
if [ -f .env ]; then
    if grep -q "EXPO_PUBLIC_USE_CDN=true" .env; then
        echo -e "${GREEN}✅ CDN is enabled${NC}"
        CDN_DOMAIN=$(grep "EXPO_PUBLIC_CDN_DOMAIN" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
        if [ ! -z "$CDN_DOMAIN" ]; then
            echo -e "${GREEN}✅ CDN Domain: $CDN_DOMAIN${NC}"
        else
            echo -e "${YELLOW}⚠️  CDN domain not set${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  CDN is disabled (EXPO_PUBLIC_USE_CDN=false)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
fi
echo ""

# Test 4: Check Edge Function logs (last 5 entries)
echo "📋 Test 4: Checking recent Edge Function logs..."
echo "Fetching last 5 log entries..."
LOGS=$(supabase functions logs purge-cdn-cache --limit 5 2>/dev/null || echo "")
if [ ! -z "$LOGS" ]; then
    echo "$LOGS"
    if echo "$LOGS" | grep -q "success\|purged"; then
        echo -e "${GREEN}✅ Recent successful purge found in logs${NC}"
    else
        echo -e "${YELLOW}⚠️  No recent purge activity found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No logs found (function may not have been called yet)${NC}"
fi
echo ""

# Summary
echo "================================"
echo "📊 Test Summary"
echo "================================"
echo ""
echo "To test the purge function manually:"
echo ""
echo "1. Get a user JWT token from your app"
echo "2. Run:"
echo ""
echo "   curl -X POST \"\${SUPABASE_URL}/functions/v1/purge-cdn-cache\" \\"
echo "     -H \"Authorization: Bearer \${USER_TOKEN}\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"filePath\": \"avatars/test.jpg\"}'"
echo ""
echo "3. Check Cloudflare Dashboard → Caching → Purge Cache"
echo "4. Upload a new avatar in the app and verify purge happens"
echo ""
echo "For detailed testing instructions, see: CDN_TESTING_GUIDE.md"
echo ""

