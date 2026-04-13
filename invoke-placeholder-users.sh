#!/bin/bash

# Invoke the create-placeholder-users Edge Function
# Get your service role key from: Supabase Dashboard → Settings → API → service_role key

SUPABASE_URL="https://kankyfankhhwqalvilen.supabase.co"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-YOUR_SERVICE_ROLE_KEY_HERE}"

if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
  echo "❌ Please set SUPABASE_SERVICE_ROLE_KEY environment variable or edit this script"
  echo ""
  echo "Get your service role key from:"
  echo "Supabase Dashboard → Settings → API → service_role key"
  exit 1
fi

echo "🚀 Invoking create-placeholder-users function..."
echo ""

curl -X POST "${SUPABASE_URL}/functions/v1/create-placeholder-users" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "✅ Done! Check the output above for results."

