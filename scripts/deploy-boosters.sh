#!/bin/bash
set -e

echo "🚀 Deploying view boosters..."

# Check if logged in
if ! supabase projects list &>/dev/null 2>&1; then
  echo "⚠️  Not logged in. Please run: supabase login"
  exit 1
fi

# Deploy functions
echo "📦 Deploying viral-view-booster..."
supabase functions deploy viral-view-booster

echo "📦 Deploying boost-engagement..."
supabase functions deploy boost-engagement

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Go to Supabase Dashboard → Edge Functions → Cron Jobs"
echo "2. Add cron for viral-view-booster: */15 * * * *"
echo "3. Add cron for boost-engagement: 0 */4 * * *"
