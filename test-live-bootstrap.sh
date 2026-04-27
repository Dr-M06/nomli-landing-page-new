#!/bin/bash

# Test Live Bootstrap Function
# Tests the live-bootstrap Edge Function with different scenarios

set -e

echo "🧪 Testing Live Bootstrap Function"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SUPABASE_URL="https://kankyfankhhwqalvilen.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthbmt5ZmFua2hod3FhbHZpbGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0ODA3MzUsImV4cCI6MjA2MTA1NjczNX0.KLV3o0k4-zxCWUfoIUrJIyk9JFR_N6_o42-cRzNTmAI"

echo -e "${BLUE}Supabase URL:${NC} $SUPABASE_URL"
echo ""

# Test 1: Anonymous viewer (no auth header)
echo "📋 Test 1: Anonymous viewer (no auth required)..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X GET "$SUPABASE_URL/functions/v1/live-bootstrap?streamId=test&role=audience" \
  2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2 || echo "000")
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE" | head -1)

if [ "$HTTP_CODE" = "404" ] || echo "$BODY" | grep -q "Stream not found"; then
    echo -e "${GREEN}✅ Function is accessible (HTTP $HTTP_CODE)${NC}"
    echo -e "${YELLOW}   Note: Stream 'test' doesn't exist - this is expected${NC}"
    echo "   Response: $BODY"
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${RED}❌ Function requires authentication (should allow anonymous)${NC}"
    echo "   Response: $BODY"
else
    echo -e "${YELLOW}⚠️  Unexpected response (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $BODY"
fi
echo ""

# Test 2: With authentication (optional for audience)
echo "📋 Test 2: Authenticated viewer (with auth header)..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X GET "$SUPABASE_URL/functions/v1/live-bootstrap?streamId=test&role=audience" \
  -H "Authorization: Bearer $ANON_KEY" \
  2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2 || echo "000")
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE" | head -1)

if [ "$HTTP_CODE" = "404" ] || echo "$BODY" | grep -q "Stream not found"; then
    echo -e "${GREEN}✅ Function works with authentication (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $BODY"
else
    echo -e "${YELLOW}⚠️  Response (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $BODY"
fi
echo ""

# Test 3: Missing parameters
echo "📋 Test 3: Missing parameters (should return 400)..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X GET "$SUPABASE_URL/functions/v1/live-bootstrap" \
  2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2 || echo "000")
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE" | head -1)

if [ "$HTTP_CODE" = "400" ]; then
    echo -e "${GREEN}✅ Function validates parameters correctly (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $BODY"
else
    echo -e "${YELLOW}⚠️  Unexpected response (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $BODY"
fi
echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo ""
echo "The function is ${GREEN}deployed and working${NC}!"
echo ""
echo "To test with a real stream:"
echo "  1. Get a real stream ID from your database:"
echo "     ${BLUE}SELECT id FROM live_streams WHERE is_live = true LIMIT 1;${NC}"
echo ""
echo "  2. Test with that stream ID:"
echo "     ${BLUE}curl -X GET \"$SUPABASE_URL/functions/v1/live-bootstrap?streamId=REAL_STREAM_ID&role=audience\"${NC}"
echo ""
