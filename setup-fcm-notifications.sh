#!/bin/bash

# FCM Notification Setup Script
# This script helps you set up Firebase Cloud Messaging for push notifications

set -e

echo "🔔 Firebase Cloud Messaging (FCM) Notification Setup"
echo "===================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Please install it: https://supabase.com/docs/guides/cli"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Step 1: Database Migration
echo "📊 Step 1: Database Migration"
echo "------------------------------"
echo "You need to run the FCM support migration in your Supabase SQL Editor."
echo ""
echo "File: utils/add_fcm_support_to_notifications.sql"
echo ""
read -p "Have you run this migration? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  Please run the migration first:${NC}"
    echo "   1. Open Supabase Dashboard → SQL Editor"
    echo "   2. Copy contents of utils/add_fcm_support_to_notifications.sql"
    echo "   3. Run the SQL"
    echo "   4. Come back and run this script again"
    exit 1
fi
echo -e "${GREEN}✓ Database migration completed${NC}"
echo ""

# Step 2: Firebase Server Key
echo "🔑 Step 2: Firebase Server Key"
echo "------------------------------"
echo "You need to get your Firebase Server Key from Firebase Console."
echo ""
echo "Steps:"
echo "  1. Go to: https://console.firebase.google.com"
echo "  2. Select your project"
echo "  3. Go to: Project Settings (gear icon) → Cloud Messaging"
echo "  4. Copy the 'Server key' (under Cloud Messaging API - Legacy)"
echo ""
read -p "Do you have your Firebase Server Key? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  Please get your Firebase Server Key first${NC}"
    exit 1
fi

echo ""
read -p "Enter your Firebase Server Key: " FIREBASE_SERVER_KEY

if [ -z "$FIREBASE_SERVER_KEY" ]; then
    echo -e "${RED}❌ Firebase Server Key cannot be empty${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Firebase Server Key received${NC}"
echo ""

# Step 3: Add to Supabase
echo "☁️  Step 3: Add Secret to Supabase"
echo "------------------------------"
echo "Adding FIREBASE_SERVER_KEY to Supabase Edge Functions..."
echo ""

# Try to set the secret
if supabase secrets set FIREBASE_SERVER_KEY="$FIREBASE_SERVER_KEY" 2>/dev/null; then
    echo -e "${GREEN}✓ Secret added successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Could not add secret automatically${NC}"
    echo "Please add it manually:"
    echo "  1. Go to Supabase Dashboard"
    echo "  2. Settings → Edge Functions → Secrets"
    echo "  3. Add: FIREBASE_SERVER_KEY = your_server_key"
fi
echo ""

# Step 4: Deploy Function
echo "🚀 Step 4: Deploy Notification Processor"
echo "------------------------------"
read -p "Deploy the updated notification processor function? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying process-notifications function..."
    cd supabase/functions
    if supabase functions deploy process-notifications; then
        echo -e "${GREEN}✓ Function deployed successfully${NC}"
    else
        echo -e "${RED}❌ Function deployment failed${NC}"
        echo "Please deploy manually: cd supabase/functions && supabase functions deploy process-notifications"
    fi
    cd ../..
else
    echo -e "${YELLOW}⚠️  Skipped function deployment${NC}"
    echo "Remember to deploy later: cd supabase/functions && supabase functions deploy process-notifications"
fi
echo ""

# Step 5: Verification
echo "✅ Step 5: Verification"
echo "------------------------------"
echo "To verify the setup is working:"
echo ""
echo "1. Check FCM tokens are being saved:"
echo "   SELECT id, username, fcm_token IS NOT NULL as has_fcm"
echo "   FROM profiles WHERE fcm_token IS NOT NULL LIMIT 5;"
echo ""
echo "2. Make a test call between two devices"
echo ""
echo "3. Check notification queue:"
echo "   SELECT id, notification_type, fcm_token IS NOT NULL as has_fcm, status"
echo "   FROM notification_queue WHERE notification_type = 'call'"
echo "   ORDER BY created_at DESC LIMIT 5;"
echo ""
echo "4. Check Edge Function logs in Supabase Dashboard"
echo "   Look for: '✅ FCM notification sent successfully'"
echo ""

# Summary
echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "  1. Test with app OPEN: Should show in-app overlay only"
echo "  2. Test with app CLOSED: Should show push notification"
echo "  3. Monitor logs for any errors"
echo ""
echo "Documentation:"
echo "  - FCM_NOTIFICATION_SETUP.md - Complete setup guide"
echo "  - NOTIFICATION_DUPLICATION_FIX.md - Technical details"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"

