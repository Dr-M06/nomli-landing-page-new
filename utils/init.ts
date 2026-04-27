import { validateAnnouncementReadFunctionality } from './dbValidation';
import { createAnnouncementsTable } from './createAnnouncementsTable';
// Announcement storage removed - using Expo notifications instead
import { setupDatabaseTables } from './setupDatabase';
import { setupCountryChatTables } from './setupCountryChat';
import { setupLiveStreamTables } from './setupLiveStreamTables';
import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


/**
 * Initialize and validate database tables
 */
export async function initDatabase() {
  log('Initializing and validating database tables...');
  
  let databaseTablesInitialized = false;
  let countryChatTablesInitialized = false;
  let liveStreamTablesInitialized = false;
  let announcementTableExists = false;
  let announcementReadFunctional = false;
  let migrationAttempted = false;
  
  try {
    // Critical: run core table setup in parallel for faster startup
    const [dbResult, countryResult, livestreamResult] = await Promise.all([
      setupDatabaseTables().then(() => true).catch((e) => {
        error('Error initializing core database tables - continuing anyway:', e);
        return false;
      }),
      setupCountryChatTables().then(() => true).catch((e) => {
        error('Error initializing country chat tables - continuing anyway:', e);
        return false;
      }),
      setupLiveStreamTables().then(() => true).catch((e) => {
        error('Error initializing livestream tables - continuing anyway:', e);
        return false;
      }),
    ]);
    databaseTablesInitialized = dbResult;
    countryChatTablesInitialized = countryResult;
    liveStreamTablesInitialized = livestreamResult;
    if (dbResult) log('Core database tables initialized successfully');
    if (countryResult) log('Country chat tables initialized successfully');
    if (livestreamResult) log('Livestream tables initialized successfully');

    // Add poll lock column migration
    try {
      const { addPollLockColumn } = await import('./pollService');
      await addPollLockColumn();
      log('Poll lock column migration completed');
    } catch (pollError) {
      error('Error adding poll lock column - continuing anyway:', pollError);
    }
    
    // Fix notification dismissals constraint to include profile_view
    try {
      const { fixNotificationDismissalsConstraint } = await import('./fixNotificationDismissalsConstraint');
      await fixNotificationDismissalsConstraint();
      log('Notification dismissals constraint migration completed');
    } catch (notifError) {
      error('Error fixing notification dismissals constraint - continuing anyway:', notifError);
    }
    
    // Non-critical: run after critical path (kept synchronous for bridge stability)
    try {
      announcementTableExists = await createAnnouncementsTable();
      if (!announcementTableExists) {
        log('Failed to create or verify announcements table - continuing anyway');
      }
    } catch (createError) {
      log('Error creating announcements table - continuing anyway:', createError);
    }
    try {
      announcementReadFunctional = await validateAnnouncementReadFunctionality();
      if (!announcementReadFunctional) {
        log('Announcement read functionality validation failed - continuing anyway');
      }
    } catch (validationError) {
      log('Error validating announcement read functionality - continuing anyway:', validationError);
    }
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        migrationAttempted = true;
      }
    } catch (migrationError) {
      log('Error attempting migration - continuing anyway:', migrationError);
    }

    // Return status
    return {
      databaseTablesInitialized,
      countryChatTablesInitialized,
      liveStreamTablesInitialized,
      announcementTableExists,
      announcementReadFunctional,
      migrationAttempted
    };
  } catch (error) {
    log('Error initializing database - continuing anyway:', error);
    return {
      databaseTablesInitialized: false,
      countryChatTablesInitialized: false,
      liveStreamTablesInitialized: false,
      announcementTableExists: false,
      announcementReadFunctional: false,
      migrationAttempted: false
    };
  }
} 