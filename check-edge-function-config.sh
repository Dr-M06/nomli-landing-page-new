#!/bin/bash

# Check Edge Function configuration and logs

set -e

PROJECT_REF="kankyfankhhwqalvilen"

echo "🔍 Checking Edge Function Configuration"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo "   Install it from: https://supabase.com/docs/guides/cli"
    exit 1
fi

echo "📋 Checking Edge Function secrets..."
echo ""

# List secrets
supabase secrets list --project-ref "$PROJECT_REF" 2>/dev/null | grep -E "AGORA|TOKEN" || echo "⚠️  No Agora-related secrets found"

echo ""
echo "📋 Checking recent Edge Function logs..."
echo ""

# Get recent logs
supabase functions logs live-bootstrap --project-ref "$PROJECT_REF" --limit 20 2>/dev/null || echo "⚠️  Could not fetch logs. Make sure you're logged in: supabase login"

echo ""
echo "💡 To fix the Invalid App ID error:"
echo ""
echo "1. Set the Render token server URL:"
echo "   supabase secrets set AGORA_TOKEN_SERVER_URL=https://token-server-60il.onrender.com --project-ref $PROJECT_REF"
echo ""
echo "2. Redeploy the function:"
echo "   supabase functions deploy live-bootstrap --project-ref $PROJECT_REF"
echo ""
