#!/bin/bash

# Cleanup Redundant Files Script
# This script removes redundant artifacts and unused files

echo "🧹 Starting cleanup of redundant files..."

# 1. Remove backup files
echo "📦 Removing backup files..."
rm -f components/VideoPostItem_backup.tsx
rm -f components/VideoPostItem_backup_full.tsx

# 2. Remove old SQL debug/fix files from root (keep only migrations in supabase/)
echo "🗄️  Removing old SQL debug/fix files from root..."
rm -f CHECK_*.sql
rm -f FIX_*.sql
rm -f DIAGNOSE_*.sql
rm -f TEST_*.sql
rm -f CLEAN_*.sql
rm -f ENABLE_*.sql
rm -f CREATE_*.sql
rm -f MANUAL_*.sql
rm -f force-retry-*.sql
rm -f cleanup-*.sql
rm -f check-*.sql
rm -f fix-*.sql
rm -f test-*.sql
rm -f simple-test-*.sql
rm -f debug-*.sql
rm -f find-*.sql
rm -f analyze-*.sql
rm -f quick-test-*.sh

# 3. Remove old test/debug JS files
echo "🧪 Removing old test/debug JS files..."
rm -f test-*.js
rm -f check-*.js
rm -f diagnose-*.js
rm -f fix-*.js
rm -f debug-*.js
rm -f get-*.js
rm -f quick-test-*.js

# 4. Remove old build scripts (keep essential ones)
echo "🔨 Removing duplicate/old build scripts..."
rm -f build-ios-release.sh
rm -f build-release-xcode.sh
rm -f test-device-build.sh
rm -f test-ios-release.sh
rm -f clean-gradle-builds.sh
rm -f fix-xcode-build.sh
rm -f fix-icons.sh
rm -f fix-keychain.sh
rm -f create-xcconfig-files.sh
rm -f install-cocoapods-old-ruby.sh
rm -f install-cocoapods.sh
rm -f install-git-hooks.sh
rm -f install-java.sh
rm -f generate-assets.js
rm -f fix-ios-icon-size.js
rm -f fix-ios-icon-size-v2.js
rm -f fix-database-schema.js
rm -f fix-app-id-trigger-direct.sql
rm -f fix-profiles-trigger-app-id.sql
rm -f fix-notification-delivery.ts
rm -f fix-push-notifications.js
rm -f fix-sender-notification.sql
rm -f fix-xcode-push-capability.js
rm -f fix-pending-notifications.sql
rm -f fix-notification-trigger-copy-tokens.sql
rm -f check-supabase.js
rm -f check-push-system.js
rm -f check-rpc-exists.js
rm -f diagnose-push-from-app.js
rm -f diagnose-push-notifications.js
rm -f get-push-token.js
rm -f test-expo-push-manually.js
rm -f add-push-capability-to-xcode.js

# 5. Remove redundant markdown documentation files
echo "📝 Removing redundant markdown documentation..."

# Old fix/troubleshooting docs
rm -f AGORA_ERROR_*.md
rm -f DEBUG_*.md
rm -f DIAGNOSE_*.md
rm -f FIX_*.md
rm -f BUILD_FIXES.md
rm -f ANDROID_BUILD_FIX.md
rm -f ANDROID_MANIFEST_FIX.md
rm -f IOS_BUILD_FIX.md
rm -f XCODE_BUILD_FIXED.md
rm -f REBUILD_*.md
rm -f VIDEO_THUMBNAIL_FIX*.md
rm -f COMPLETE_DUPLICATE_FIX.md
rm -f FIX_DUPLICATE_*.md
rm -f PUSH_NOTIFICATION_FIX*.md
rm -f NOTIFICATION_FIX*.md
rm -f SIGNUP_*.md
rm -f LOGOUT_NAVIGATION_FIX.md
rm -f BLOCKING_BUG_FIX.md
rm -f BLOCKING_MESSAGE_FIX.md
rm -f BLOCKING_CACHE_ISSUE_SOLUTION.md
rm -f FIX_BLOCKED_USERS_LOOP.md
rm -f FIX_VIEWER_AUDIO_SUBSCRIPTION.md
rm -f FIX_LIVESTREAM_MIC_ISSUE.md
rm -f FIX_RESEND_EMAIL_DOMAIN.md
rm -f FLUTTERWAVE_REDIRECT_URL_FIX.md
rm -f QUICK_FIX_*.md
rm -f SUBSCRIPTION_ERROR_FIX.md
rm -f FIX_STORYBOARD_ERROR.md
rm -f FIX_COCOAPODS_MISSING.md
rm -f FIX_XCODE_*.md
rm -f FIX_CONSTRAINT_ERROR*.md
rm -f FIX_DUPLICATE_*.md
rm -f FIX_TRIGGER_*.md
rm -f FIX_PUSH_TOKEN_NOT_SAVING.md
rm -f FIX_MISSING_FCM_*.md
rm -f FIX_NOTIFICATION_*.md
rm -f FIX_PENDING_NOTIFICATION*.md
rm -f FIX_MESSAGE_*.md
rm -f FIX_RLS_POLICY.sql
rm -f FIX_GUEST_*.md
rm -f FIX_PRIVACY_COLUMNS.md
rm -f FIX_BACKGROUND_NOTIFICATIONS.md
rm -f FIX_EDGE_FUNCTION_FAILURE.md
rm -f FIX_CALLKIT_NOTIFICATION_CONFLICT.md
rm -f FIX_IOS_PUSH_NOTIFICATIONS*.md
rm -f FIX_FCM_NOTIFICATIONS.md
rm -f FIX_NOTIFICATION_TRIGGER.md
rm -f FIX_NOTIFICATIONS.md
rm -f FIX_NOTIFICATION_ISSUES.md
rm -f FIX_MESSAGE_NOTIFICATIONS_APP_CODE.md
rm -f FIX_DUPLICATE_EVENT_JOIN_ERROR.md
rm -f FIX_MULTIPLE_TRIGGERS.sql

# Old setup/deployment docs (keep essential ones)
rm -f ADD_FIREBASE_SERVER_KEY*.md
rm -f APNS_ERROR_EXPLAINED.md
rm -f ANALYZE_NOTIFICATION_STATUS.md
rm -f CHECK_*.md
rm -f COMPARE_OLD_VS_NEW_*.md
rm -f DEPLOY_*.md
rm -f DEPLOYMENT_COMPLETE.md
rm -f ENABLE_*.md
rm -f GET_*.md
rm -f HOW_TO_*.md
rm -f INSTALL_*.md
rm -f MANUAL_SETUP_STEPS.md
rm -f NEXT_STEPS_AFTER_DEPLOYMENT.md
rm -f QUICK_DEPLOY_INSTRUCTIONS.md
rm -f QUICK_START.md
rm -f RESTORE_*.md
rm -f SETUP_*.md
rm -f UPDATE_EDGE_FUNCTION_*.md
rm -f VERIFY_EDGE_FUNCTION_LOGS.md

# Old feature update docs (small updates)
rm -f EVENTS_*.md
rm -f THEME_*.md
rm -f DARK_GLASS_UI_UPDATE.md
rm -f WHEEL_POSITION_UPDATE.md
rm -f QUADRANT_TEXT_POSITIONING.md
rm -f POST_INPUT_SIZE_INCREASE.md
rm -f ONBOARDING_*.md
rm -f OPTIMIZE_*.md
rm -f MIC_INDICATOR_FEATURE.md
rm -f FOUR_HOST_LAYOUT.md
rm -f LIVESTREAM_FRAME_IMPROVEMENTS.md
rm -f LIVESTREAM_UI_POLISH_SUMMARY.md
rm -f DISCOVER_LOCATION_BLOCKER_REDESIGN.md
rm -f BLOCKED_USERS_REDESIGN.md
rm -f GEN_Z_DESIGN_UPDATE.md
rm -f SLEEK_DESIGN_GUIDE.md
rm -f COMPRESSION_IMPLEMENTED.md
rm -f MEDIA_COMPRESSION_UPGRADE.md
rm -f PREMIUM_MEDIA_UPGRADE.md
rm -f PHOTO_WORKING_NOW.md
rm -f PHOTO_FEATURE_STATUS.md
rm -f TEST_PHOTO_UPLOAD_NOW.md

# Old test/troubleshooting docs
rm -f TEST_*.md
rm -f PUSH_NOTIFICATION_TESTING.md
rm -f PUSH_NOTIFICATION_DIAGNOSTIC_RESULTS.md
rm -f EMAIL_TESTING_README.md
rm -f TROUBLESHOOT_*.md
rm -f NOTIFICATION_TROUBLESHOOTING.md
rm -f NOTIFICATION_DIAGNOSTIC_GUIDE.md
rm -f NOTIFICATION_AUDIT_GUIDE.md
rm -f LIVESTREAM_NOTIFICATION_TROUBLESHOOTING.md
rm -f DIAGNOSE_PENDING_NOTIFICATION.md
rm -f DIAGNOSE_DUPLICATES.md

# Old summary/comparison docs
rm -f FINAL_SUMMARY.md
rm -f FINAL_BUILD_STATUS.md
rm -f BUILD_SUMMARY.md
rm -f IMPLEMENTATION_SUMMARY.md
rm -f MEDIA_IMPLEMENTATION_SUMMARY.md
rm -f CLEANUP_REPORT.md
rm -f MD_FILES_ANALYSIS.md
rm -f REBUILD_COMPLETE_SUMMARY.md
rm -f COMPLETE_DUPLICATE_FIX.md

# Old verification/check docs
rm -f BLOCKING_VERIFICATION_GUIDE.md
rm -f GUEST_AUDIO_VERIFICATION.md
rm -f GUEST_VIDEO_DIAGNOSTIC.md
rm -f GUEST_VIDEO_NOT_SHOWING_FIX.md
rm -f GUEST_SPLIT_SCREEN_TEST.md
rm -f GUEST_SYSTEM_FIXED.md
rm -f DIAGNOSE_GUEST_NOT_SHOWING.md
rm -f HOW_GUEST_SYSTEM_WORKS.md
rm -f GUEST_VIDEO_LAYOUT_FIX.md
rm -f GUEST_SYSTEM_UI_GUIDE.md

# Old process/status docs
rm -f PROCESS_PENDING_PAYMENTS.md
rm -f DEBUG_WALLET_UPDATE.md
rm -f DEBUG_TOKEN_*.md
rm -f DEBUG_BLOCKING_ISSUE.md
rm -f DEBUG_PHOTO_SENDING.md

# Keep essential docs but remove old ones
# Keep: README.md, CHANGELOG.md, IOS_APP_REVIEW_NOTES.md, APP_STORE_CONNECT_CHECKLIST.md, etc.

# 6. Remove old TypeScript test files (keep ones that are actually used)
echo "📄 Removing unused TypeScript test files..."
# Keep testContentModeration.ts and testFollowersCounts.ts as they're used
rm -f utils/testLockscreenNotifications.ts
rm -f utils/testNotifications.ts
rm -f utils/testPrivateReactions.ts
rm -f utils/testPushDelivery.ts
rm -f utils/testNotificationSystem.ts

# 7. Remove old shell scripts
rm -f TEST_CLEANUP_NOW.sh
rm -f FINAL_CLEANUP_COMMANDS.sh
rm -f DEPLOY_COMMANDS.sh

# 8. Remove old directories if empty
echo "📁 Checking for empty directories..."
find . -type d -empty -delete 2>/dev/null || true

echo "✅ Cleanup complete!"
echo ""
echo "📊 Summary:"
echo "  - Removed backup files"
echo "  - Removed old SQL debug/fix files"
echo "  - Removed old test/debug JS files"
echo "  - Removed duplicate build scripts"
echo "  - Removed redundant markdown documentation"
echo "  - Removed unused TypeScript test files"
echo ""
echo "💡 Note: Essential files like README.md, CHANGELOG.md, and active documentation have been preserved."

