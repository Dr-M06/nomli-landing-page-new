#!/bin/bash

# Manually trigger the notification processor to process pending notifications
# This will help clear the backlog

# Get Supabase URL and key from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if required variables are set
if [ -z "$EXPO_PUBLIC_SUPABASE_URL" ] || [ -z "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "❌ Error: EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY not set"
  echo "Please set these in your .env file"
  exit 1
fi

echo "🚀 Triggering notification processor..."
echo "URL: $EXPO_PUBLIC_SUPABASE_URL/functions/v1/process-notifications"
echo ""

# Call the edge function to process pending notifications
response=$(curl -s -w "\n%{http_code}" -X POST \
  "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/process-notifications" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')

# Extract HTTP status code (last line)
http_code=$(echo "$response" | tail -n1)
# Extract response body (everything except last line)
body=$(echo "$response" | sed '$d')

echo "Response (HTTP $http_code):"
echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
echo ""

if [ "$http_code" -eq 200 ]; then
  echo "✅ Notification processor triggered successfully!"
  echo ""
  echo "Next steps:"
  echo "1. Wait a few seconds for processing to complete"
  echo "2. Run the status check SQL again to see if pending count decreased"
  echo "3. Check Edge Function logs in Supabase Dashboard for any errors"
else
  echo "❌ Failed to trigger processor (HTTP $http_code)"
  echo ""
  echo "Troubleshooting:"
  echo "1. Check if the edge function is deployed:"
  echo "   npx supabase functions deploy process-notifications"
  echo ""
  echo "2. Check Edge Function logs in Supabase Dashboard"
  echo ""
  echo "3. Verify FIREBASE_SERVER_KEY is set in Edge Function secrets"
fi

