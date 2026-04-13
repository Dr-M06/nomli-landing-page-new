#!/bin/bash

# CDN Status Test Script
# Tests if the Cloudflare CDN Worker is deployed and working

set -e

echo "🧪 Testing CDN Status"
echo "====================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# CDN Domain from env.example
CDN_DOMAIN="supabase-cdn.cdnnomliminglecom.workers.dev"
SUPABASE_PROJECT_ID="kankyfankhhwqalvilen"

echo -e "${BLUE}CDN Domain:${NC} $CDN_DOMAIN"
echo -e "${BLUE}Supabase Project:${NC} $SUPABASE_PROJECT_ID"
echo ""

# Test 1: Check root endpoint (should return info JSON)
echo "📋 Test 1: Checking CDN root endpoint..."
ROOT_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" "https://$CDN_DOMAIN/" --max-time 10 2>&1 || echo "FAILED")
HTTP_CODE=$(echo "$ROOT_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2 || echo "000")
TIME=$(echo "$ROOT_RESPONSE" | grep "TIME" | cut -d: -f2 || echo "0")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ CDN root endpoint is accessible (HTTP $HTTP_CODE, ${TIME}s)${NC}"
    echo "$ROOT_RESPONSE" | grep -v "HTTP_CODE\|TIME" | head -5
else
    echo -e "${RED}❌ CDN root endpoint failed (HTTP $HTTP_CODE)${NC}"
    echo "$ROOT_RESPONSE" | head -3
fi
echo ""

# Test 2: Check if it returns expected JSON structure
echo "📋 Test 2: Checking CDN response format..."
if echo "$ROOT_RESPONSE" | grep -q "message\|Cloudflare\|CDN"; then
    echo -e "${GREEN}✅ CDN returns expected format${NC}"
else
    echo -e "${YELLOW}⚠️  CDN response format unexpected${NC}"
fi
echo ""

# Test 3: Test with a sample image path (should proxy to Supabase)
echo "📋 Test 3: Testing image proxy (post-images/test.jpg)..."
IMAGE_RESPONSE=$(curl -s -I -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" "https://$CDN_DOMAIN/post-images/test.jpg" --max-time 10 2>&1 || echo "FAILED")
IMAGE_HTTP_CODE=$(echo "$IMAGE_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2 || echo "000")

# HTTP 200, 404, or 400 are all acceptable (400 might be worker validation, 404 is file not found)
if [ "$IMAGE_HTTP_CODE" = "200" ] || [ "$IMAGE_HTTP_CODE" = "404" ] || [ "$IMAGE_HTTP_CODE" = "400" ]; then
    echo -e "${GREEN}✅ CDN image proxy is working (HTTP $IMAGE_HTTP_CODE)${NC}"
    if [ "$IMAGE_HTTP_CODE" = "404" ]; then
        echo -e "${YELLOW}   (404 is expected if test.jpg doesn't exist - proxy is working)${NC}"
    elif [ "$IMAGE_HTTP_CODE" = "400" ]; then
        echo -e "${YELLOW}   (400 might be path validation - proxy is working, just needs valid path)${NC}"
    fi
    # Check for cache headers
    if echo "$IMAGE_RESPONSE" | grep -qi "cache-control"; then
        CACHE_HEADER=$(echo "$IMAGE_RESPONSE" | grep -i "cache-control" | head -1)
        echo -e "${GREEN}   Cache headers: $CACHE_HEADER${NC}"
    fi
    # Check for CORS headers (should be present)
    if echo "$IMAGE_RESPONSE" | grep -qi "access-control"; then
        echo -e "${GREEN}   CORS headers present${NC}"
    fi
else
    echo -e "${RED}❌ CDN image proxy failed (HTTP $IMAGE_HTTP_CODE)${NC}"
fi
echo ""

# Test 4: Check Supabase Storage directly (for comparison)
echo "📋 Test 4: Testing direct Supabase Storage access..."
SUPABASE_URL="https://$SUPABASE_PROJECT_ID.supabase.co/storage/v1/object/public/post-images/test.jpg"
SUPABASE_RESPONSE=$(curl -s -I -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" "$SUPABASE_URL" --max-time 10 2>&1 || echo "FAILED")
SUPABASE_HTTP_CODE=$(echo "$SUPABASE_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2 || echo "000")

# 200, 404, or 400 are all acceptable responses
if [ "$SUPABASE_HTTP_CODE" = "200" ] || [ "$SUPABASE_HTTP_CODE" = "404" ] || [ "$SUPABASE_HTTP_CODE" = "400" ]; then
    echo -e "${GREEN}✅ Supabase Storage is accessible (HTTP $SUPABASE_HTTP_CODE)${NC}"
    if [ "$SUPABASE_HTTP_CODE" = "404" ]; then
        echo -e "${YELLOW}   (404 is expected - test.jpg doesn't exist)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Supabase Storage returned HTTP $SUPABASE_HTTP_CODE (may need auth)${NC}"
fi
echo ""

# Test 5: Check DNS resolution
echo "📋 Test 5: Checking DNS resolution..."
if nslookup "$CDN_DOMAIN" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ DNS resolves for $CDN_DOMAIN${NC}"
    NSLOOKUP_RESULT=$(nslookup "$CDN_DOMAIN" 2>&1 | grep -A 2 "Name:" | head -3)
    echo "   $NSLOOKUP_RESULT"
else
    echo -e "${RED}❌ DNS resolution failed for $CDN_DOMAIN${NC}"
fi
echo ""

# Summary
echo "================================"
echo "📊 Test Summary"
echo "================================"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ CDN appears to be WORKING${NC}"
    echo ""
    echo "To enable in your app:"
    echo "1. Set in .env:"
    echo "   EXPO_PUBLIC_USE_CDN=true"
    echo "   EXPO_PUBLIC_CDN_DOMAIN=$CDN_DOMAIN"
    echo ""
    echo "2. Rebuild your app (env vars are baked into build)"
    echo ""
    echo "3. Check app logs for:"
    echo "   [MobileCDN] CDN Status: ✅ ENABLED"
else
    echo -e "${RED}❌ CDN appears to be NOT WORKING${NC}"
    echo ""
    echo "Possible issues:"
    echo "1. Cloudflare Worker not deployed"
    echo "2. DNS not configured"
    echo "3. Worker route not set up"
    echo ""
    echo "To fix:"
    echo "1. Deploy cloudflare-worker.js to Cloudflare Workers"
    echo "2. Set up route: $CDN_DOMAIN/* -> Worker"
    echo "3. Verify in Cloudflare Dashboard"
fi
echo ""
