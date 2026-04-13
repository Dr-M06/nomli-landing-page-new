#!/bin/bash

# Configure Render Token Server for live-bootstrap Edge Function
# This script sets the AGORA_TOKEN_SERVER_URL secret in Supabase

set -e

echo "🔧 Configuring Render Token Server for live-bootstrap Edge Function"
echo ""

# Render token server URL (from your Render dashboard)
RENDER_TOKEN_SERVER_URL="https://token-server-60il.onrender.com"

echo "📡 Token Server URL: $RENDER_TOKEN_SERVER_URL"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo "   Install it from: https://supabase.com/docs/guides/cli"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Not logged in to Supabase CLI"
    echo "   Run: supabase login"
    exit 1
fi

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Project not linked to Supabase"
    echo "   Run: supabase link"
    exit 1
fi

echo "✅ Supabase CLI is ready"
echo ""

# Set the secret
echo "🔐 Setting AGORA_TOKEN_SERVER_URL secret..."
supabase secrets set AGORA_TOKEN_SERVER_URL="$RENDER_TOKEN_SERVER_URL"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully set AGORA_TOKEN_SERVER_URL"
    echo ""
    echo "📦 Next step: Deploy the live-bootstrap function"
    echo "   Run: supabase functions deploy live-bootstrap"
    echo ""
    echo "🧪 After deploying, test with:"
    echo "   curl \"https://kankyfankhhwqalvilen.supabase.co/functions/v1/live-bootstrap?streamId=test&role=broadcaster\" \\"
    echo "     -H \"Authorization: Bearer YOUR_ANON_KEY\" \\"
    echo "     -H \"apikey: YOUR_ANON_KEY\""
else
    echo ""
    echo "❌ Failed to set secret. Please check your Supabase CLI configuration."
    exit 1
fi
