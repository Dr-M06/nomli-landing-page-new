#!/bin/bash

# Cleanup Test Files and Redundant Markdown Files
# This script removes test files and markdown documentation that are no longer needed

echo "🧹 Starting cleanup of test files and redundant markdown files..."

# 1. Remove test SQL files
echo "🗄️  Removing test SQL files..."
rm -f utils/get_fcm_token_for_testing.sql
rm -f utils/test_call_notification_trigger.sql

# 2. Remove test JS file that doesn't exist but is referenced (cleanup package.json reference)
echo "📝 Note: test-call-notifications.js is referenced in package.json but file doesn't exist"

# 3. Remove redundant markdown files - Keep only essential ones
echo "📚 Removing redundant markdown documentation..."

# Keep these essential files:
# - README.md
# - CHANGELOG.md
# - IOS_APP_REVIEW_NOTES.md
# - IOS_APP_REVIEW_NOTES_SHORT.md
# - APP_STORE_CONNECT_CHECKLIST.md
# - APP_VALUATION_ASSESSMENT.md
# - SECURITY_AUDIT_REPORT.md
# - SECURITY_SUMMARY.md
# - CLEANUP_SUMMARY.md

# Remove old implementation/setup docs that are no longer relevant
rm -f 24H_MEDIA_IMPLEMENTATION.md
rm -f INTEGRATE_MEDIA_INTO_CHAT.md
rm -f MEDIA_STORAGE_SETUP.md
rm -f PREMIUM_MEDIA_QUICK_START.md
rm -f VOICE_NOTE_24H_IMPLEMENTATION.md
rm -f WHATSAPP_STYLE_CACHING.md
rm -f CHANGELOG_24H_MEDIA.md

# Remove old setup/configuration docs
rm -f CONTENT_MODERATION_SETUP.md
rm -f EMAIL_NOTIFICATIONS_SETUP.md
rm -f EVENT_JOIN_NOTIFICATIONS_SETUP.md
rm -f FCM_NOTIFICATION_SETUP.md
rm -f FIREBASE_CONFIG_PLACEMENT.md
rm -f FLUTTERWAVE_SETUP.md
rm -f FLUTTERWAVE_TEST_CARDS.md
rm -f LIVESTREAM_NOTIFICATIONS_SETUP.md
rm -f LOCATION_DISCLOSURE_IMPLEMENTATION.md
rm -f LOCATION_DISCLOSURE_UPDATE.md
rm -f LOCATION_PERMISSION_ON_DEMAND.md
rm -f NOTIFEE_SETUP_COMPLETE.md
rm -f NOTIFICATION_PROCESSOR_NOT_RUNNING.md
rm -f NOTIFICATION_PROCESSOR_SETUP.md
rm -f REALTIME_NOTIFICATIONS_SETUP.md
rm -f REPORT_USER_SETUP.md
rm -f SOCIAL_NOTIFICATIONS_SETUP.md
rm -f SUPABASE_SETUP_GUIDE.md
rm -f ENVIRONMENT_SETUP.md

# Remove old build instructions (keep only essential ones)
rm -f BUILD_APK_ANDROID_STUDIO.md
rm -f BUILD_IOS_EAS_RELEASE.md
rm -f BUILD_IOS_INSTRUCTIONS.md
rm -f BUILD_IOS_RELEASE.md
rm -f BUILD_IOS_WITH_EXPO.md
rm -f BUILD_LOCAL_GRADLE_XCODE.md
rm -f BUILD_PRODUCTION_IOS.md
rm -f BUILD_IN_XCODE.md
rm -f IOS_BUILD_SETUP_COMPLETE.md
rm -f XCODE_26_MODULE_FIX.md

# Remove old feature documentation
rm -f BACKGROUND_CALLS_IMPLEMENTATION.md
rm -f BACKGROUND_CALLS_QUICK_START.md
rm -f BACKGROUND_CALL_UI_IMPLEMENTATION.md
rm -f BLOCKING_CONTENT_FILTERING.md
rm -f BLOCKING_SYSTEM_IMPLEMENTATION.md
rm -f BLOCKING_SYSTEM_REQUIREMENTS.md
rm -f CALLKIT_SETUP.md
rm -f CALL_RINGTONE_SETUP.md
rm -f ENHANCED_LIVE_OVERLAY_README.md
rm -f EXPO_NOTIFICATIONS_README.md
rm -f FOLLOWERS_SYSTEM_README.md
rm -f IMPLEMENT_RATE_LIMITING.md
rm -f LOGO_REBRAND_GUIDE.md
rm -f MAKE_CALLBACK_PUBLIC.md
rm -f PRIVACY_MESSAGING_UPDATE.md
rm -f PUSH_NOTIFICATION_CONFLICT_FIX.md
rm -f REMOVE_OLD_7DAY_FUNCTION.md
rm -f TWO_WAY_BLOCKING_IMPLEMENTATION.md
rm -f UX_FLOW_VISUAL_GUIDE.md

# Remove old troubleshooting/debug docs
rm -f APPLE_LOCATION_TRACKING_FIX.md
rm -f APPLE_REQUIREMENTS_SUMMARY.md
rm -f APP_STORE_PRIVACY_NOTES.md
rm -f APP_STORE_REJECTION_FIXES.md
rm -f AUTH_SESSION_BEHAVIOR.md
rm -f debug-fcm-skipping.md
rm -f EXCLUDE_IPAD_INSTRUCTIONS.md
rm -f IOS_APP_STORE_AUDIT.md
rm -f IOS_APP_STORE_DEPLOYMENT.md
rm -f PUSH_TO_GITHUB.md
rm -f QUICK_CHECK_RPC.md
rm -f QUICK_REFERENCE.md
rm -f SECURITY_UPDATE_SUMMARY.md
rm -f STRATEGIC_ANALYSIS.md
rm -f SUMMARY_AND_NEXT_STEPS.md
rm -f SYSTEM_ARCHITECTURE.md
rm -f TRIGGER_WORKING_FCM_MISSING.md
rm -f verify-fcm-key-setup.md

# Remove old release notes (keep only latest)
rm -f PLAY_STORE_RELEASE_NOTES_v1.0.8.md
rm -f PLAY_STORE_RELEASE_TEXT.md
rm -f RELEASE_NOTES_v1.0.7.md
rm -f RELEASE_NOTES_v1.0.8.md
rm -f RELEASE_NOTES_v1.0.14.md
rm -f RELEASE_NOTES_v1.0.15.md
# Keep RELEASE_NOTES_v1.0.19.md (latest)

echo "✅ Cleanup complete!"
echo ""
echo "📊 Summary:"
echo "  - Removed test SQL files"
echo "  - Removed redundant markdown documentation (~60+ files)"
echo ""
echo "📝 Essential files kept:"
echo "  - README.md"
echo "  - CHANGELOG.md"
echo "  - IOS_APP_REVIEW_NOTES.md"
echo "  - IOS_APP_REVIEW_NOTES_SHORT.md"
echo "  - APP_STORE_CONNECT_CHECKLIST.md"
echo "  - APP_VALUATION_ASSESSMENT.md"
echo "  - SECURITY_AUDIT_REPORT.md"
echo "  - SECURITY_SUMMARY.md"
echo "  - CLEANUP_SUMMARY.md"
echo "  - RELEASE_NOTES_v1.0.19.md (latest)"

