import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, refreshAuthSession } from '../utils/supabase';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/Endpoints';
import { getUserFriendlyError, logError } from '../utils/errorHandler';
import { disableBiometricAuth } from '../utils/biometricAuth';
import NetInfo from '@react-native-community/netinfo';
import { customNotifications } from '../utils/customNotifications';
import { initializeOnlineStatusManager, cleanupOnlineStatusManager } from '../utils/onlineStatusManager';
import { locationService } from '../utils/locationService';
import { expoPushNotifications } from '../utils/expoPushNotifications';

// No mock user or fallback in live apps

export default function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  
  // Track last token refresh time and user ID to throttle updates
  const lastTokenRefreshTimeRef = useRef(0);
  const lastSessionUserIdRef = useRef<string | undefined>(undefined);
  // Track if we're intentionally signing out to prevent refresh attempts
  const isIntentionalSignOutRef = useRef(false);
  // Track if initial load has completed to prevent repeated "initial load" updates
  const initialLoadCompletedRef = useRef(false);
  // Track last SIGNED_OUT event time to throttle duplicate events
  const lastSignedOutTimeRef = useRef(0);
  const signedOutEventCountRef = useRef(0);
  // Track if INITIAL_SESSION has been handled to prevent multiple restorations
  const initialSessionHandledRef = useRef(false);
  const isRestoringSessionRef = useRef(false);
  // Track if sign-out is for TOTP flow (don't navigate to signin in this case)
  const isTOTPSignOutRef = useRef(false);

  // Monitor network connectivity (with throttling to prevent loops)
  useEffect(() => {
    let lastStatus: boolean | null = null;
    let throttleTimeout: NodeJS.Timeout | null = null;
    
    const unsubscribe = NetInfo.addEventListener(state => {
      // Only update if the status actually changed
      if (state.isConnected !== lastStatus) {
        // Throttle updates to once per 500ms to prevent rapid fire
        if (throttleTimeout) {
          clearTimeout(throttleTimeout);
        }
        
        throttleTimeout = setTimeout(() => {
          lastStatus = state.isConnected;
          setNetworkStatus(state.isConnected);
          // Reduced logging - only when status changes
          if (__DEV__) {
            console.log('Network status changed:', state.isConnected);
          }
        }, 500);
      }
    });
    
    // Initial network check
    NetInfo.fetch().then(state => {
      lastStatus = state.isConnected;
      setNetworkStatus(state.isConnected);
    });
    
    return () => {
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Check if Supabase is properly configured
    const hasValidConfig = SUPABASE_URL && SUPABASE_ANON_KEY && 
                          SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '' &&
                          !SUPABASE_URL.includes('placeholder');

    if (!hasValidConfig) {
      console.error('Supabase not configured properly!');
      // Only log configuration status in development
      if (__DEV__) {
        console.error('SUPABASE_URL status:', SUPABASE_URL ? 'Present' : 'Missing');
        console.error('SUPABASE_ANON_KEY status:', SUPABASE_ANON_KEY ? 'Present' : 'Missing');
      }
      setError('App configuration error. Please contact support.');
      setLoading(false);
      setIsLoaded(true);
      return;
    }

    const initAuth = async () => {
      // Prevent multiple concurrent initializations
      if (isInitializing) {
        console.log('[Auth] Initialization already in progress, skipping...');
        return;
      }
      
      setIsInitializing(true);
      try {
        // Check network status first
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          console.log('No network connection detected - using offline mode');
          // Try to get session from storage
          const storedSession = await getStoredSession();
          if (storedSession) {
            console.log('Using stored session in offline mode');
            setSession(storedSession);
          } else {
            console.log('No stored session available in offline mode');
            // Don't use fallback in live app
          }
          setLoading(false);
          setIsLoaded(true);
          setIsInitializing(false);
          return;
        }
        
        // Try to refresh the session if we don't have one in state
        // refreshAuthSession will check for stored session before attempting refresh
        if (!session) {
          // Check network before attempting refresh
          const netInfoBeforeRefresh = await NetInfo.fetch();
          if (netInfoBeforeRefresh.isConnected) {
            const refreshed = await refreshAuthSession();
            if (refreshed) {
              console.log('Successfully refreshed auth session');
            } else {
              // refreshAuthSession returns false if no session exists or refresh failed
              // This is expected - we'll get the session below
              console.log('No session to refresh or refresh failed, will get current session');
            }
          } else {
            console.log('Offline detected - skipping session refresh, using stored session');
          }
        }
        
        // Get the session (whether it was refreshed or not)
        let sessionData;
        let sessionError;
        
        try {
          // Check network before getSession
          const netInfoBeforeGetSession = await NetInfo.fetch();
          if (!netInfoBeforeGetSession.isConnected) {
            console.log('Offline detected during getSession - using stored session');
            const storedSession = await getStoredSession();
            if (storedSession) {
              console.log('Using stored session in offline mode');
              setSession(storedSession);
              setLoading(false);
              setIsLoaded(true);
              setIsInitializing(false);
              return;
            } else {
              // No stored session - but don't log out, just show error
              console.log('No stored session available in offline mode - keeping user logged in if session exists');
              setLoading(false);
              setIsLoaded(true);
              setIsInitializing(false);
              return;
            }
          }
          
          const { data, error } = await supabase.auth.getSession();
          sessionData = data;
          sessionError = error;
        } catch (networkError: any) {
          // Network error during getSession
          console.log('Network error during getSession - trying offline mode');
          const storedSession = await getStoredSession();
          if (storedSession) {
            console.log('Using stored session after network error');
            setSession(storedSession);
            setLoading(false);
            setIsLoaded(true);
            setIsInitializing(false);
            return;
          } else {
            // Keep existing session if available, don't clear it
            console.log('No stored session but keeping existing session if available');
            sessionError = networkError;
          }
        }
        
        if (sessionError) {
          logError('Auth:GetSession', sessionError);
          
          // Check if it's a network error
          if (sessionError.message?.includes('Network request failed') || sessionError.message?.includes('network')) {
            console.log('Network error detected - trying offline mode');
            // Try to get session from storage
            const storedSession = await getStoredSession();
            if (storedSession) {
              console.log('Using stored session in offline mode');
              setSession(storedSession);
              setLoading(false);
              setIsLoaded(true);
              setIsInitializing(false);
              return;
            } else if (session) {
              // Keep existing session - don't clear it on network error
              console.log('Network error but keeping existing session');
              setLoading(false);
              setIsLoaded(true);
              setIsInitializing(false);
              return;
            } else {
              setError('Network connection required for first login');
            }
          } else {
            // Only set error if we don't have a session - don't log out if session exists
            if (!session) {
              setError('Please sign in again');
            } else {
              console.log('Auth error but session exists - keeping user logged in');
            }
          }
          
          // Don't clear session on error - keep existing session
          setLoading(false);
          setIsLoaded(true);
        } else {
          setSession(sessionData.session);
          setLoading(false);
          setIsLoaded(true);
        }
      } catch (err: any) {
        logError('Auth:GetSession', err);
        
        // Check if it's a network error - try to restore from storage
        if (err?.message?.includes('Network request failed') || err?.message?.includes('network') || err?.code === 'NETWORK_ERROR') {
          console.log('Network error in catch block - trying offline mode');
          const storedSession = await getStoredSession();
          if (storedSession) {
            console.log('Using stored session after network error in catch block');
            setSession(storedSession);
            setLoading(false);
            setIsLoaded(true);
            setIsInitializing(false);
            return;
          } else if (session) {
            // Keep existing session - don't clear it on network error
            console.log('Network error but keeping existing session');
            setLoading(false);
            setIsLoaded(true);
            setIsInitializing(false);
            return;
          }
        }
        
        // Only set error if we don't have a session - preserve existing session
        if (!session) {
          setError('Failed to initialize authentication');
        } else {
          console.log('Auth error but session exists - keeping user logged in');
        }
        setLoading(false);
        setIsLoaded(true);
      } finally {
        setIsInitializing(false);
      }
    };
    
    // Helper function to get stored session
    // CRITICAL: During SIGNED_OUT events, be more lenient to prevent false logouts
    const getStoredSession = async (isSignedOutEvent = false): Promise<Session | null> => {
      try {
        // Try SecureStore first for sensitive auth data
        let sessionStr = null;
        try {
          sessionStr = await SecureStore.getItemAsync('supabase.auth.session');
        } catch (secureError) {
          console.log('SecureStore get failed, falling back to AsyncStorage', secureError);
          // Fall back to AsyncStorage
          sessionStr = await AsyncStorage.getItem('supabase.auth.session');
        }

        if (sessionStr) {
          const sessionData = JSON.parse(sessionStr);
          const expiresAt = sessionData?.expires_at;

          // Check if session is still valid
          // IMPORTANT: When offline OR during SIGNED_OUT events, be more lenient with expiration
          const now = Math.floor(Date.now() / 1000);
          const netInfo = await NetInfo.fetch();
          const isOffline = !netInfo.isConnected;
          
          // During SIGNED_OUT events, be very lenient - accept sessions up to 30 days old
          // This prevents false logouts when Supabase fires SIGNED_OUT events but session is still valid
          const gracePeriod = isSignedOutEvent ? (30 * 24 * 60 * 60) : (isOffline ? (7 * 24 * 60 * 60) : 0);
          
          if (expiresAt) {
            const isValid = expiresAt > now;
            const isWithinGracePeriod = gracePeriod > 0 && (expiresAt > now - gracePeriod);
            
            if (isValid || isWithinGracePeriod) {
              if (isWithinGracePeriod && !isValid) {
                console.log(`[Auth] Using expired session (grace period: ${isSignedOutEvent ? 'SIGNED_OUT event' : 'offline'})`);
              }
              return sessionData as Session;
            }
          } else {
            // No expiration date - use it if offline or during SIGNED_OUT events
            if (isOffline || isSignedOutEvent) {
              console.log(`[Auth] Using session without expiration date (${isSignedOutEvent ? 'SIGNED_OUT event' : 'offline'})`);
              return sessionData as Session;
            }
          }
        }
        return null;
      } catch (err) {
        console.error('Error getting stored session:', err);
        return null;
      }
    };
    
    // Initialize auth
    initAuth();

    // Listen for auth changes
    let subscription;
    let isHandlingStateChange = false; // Prevent concurrent state changes
    
    try {
      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        // Prevent concurrent handling of auth state changes
        if (isHandlingStateChange || isInitializing) {
          console.log('[Auth] Skipping concurrent auth state change:', _event, 'isInitializing:', isInitializing);
          return;
        }
        
        // Throttle TOKEN_REFRESHED events - only process once per 60 seconds
        // Supabase auto-refreshes tokens periodically, but we don't need to update state that frequently
        // Increased from 10s to 60s to reduce aggressive refresh behavior
        if (_event === 'TOKEN_REFRESHED') {
          const now = Date.now();
          const timeSinceLastRefresh = now - lastTokenRefreshTimeRef.current;
          
          // If we just refreshed less than 60 seconds ago, skip this one completely
          // This prevents excessive state updates and logging when Supabase auto-refreshes tokens
          if (timeSinceLastRefresh < 60000 && session?.user?.id === lastSessionUserIdRef.current) {
            // Silently skip throttled events - no processing, no logging, no state updates
            return;
          }
          
          // Only update refs if we're actually processing this refresh
          lastTokenRefreshTimeRef.current = now;
          lastSessionUserIdRef.current = session?.user?.id;
        }
        
        // CRITICAL: Throttle SIGNED_OUT events aggressively to prevent rate limiting
        // The logs show many SIGNED_OUT events firing rapidly (40+ events), causing rate limits
        if (_event === 'SIGNED_OUT') {
          const now = Date.now();
          const timeSinceLastSignedOut = now - lastSignedOutTimeRef.current;
          
          // CRITICAL: Check stored session FIRST before any processing
          // This prevents logout loops when many SIGNED_OUT events fire
          // Do this synchronously if possible to prevent delays
          try {
            const quickStoredCheck = await getStoredSession(true);
            if (quickStoredCheck && quickStoredCheck.user?.id) {
              console.log('[Auth] ✅ Found stored session - ignoring SIGNED_OUT event to prevent logout loop');
              setSession(quickStoredCheck);
              signedOutEventCountRef.current = 0;
              isHandlingStateChange = false;
              return; // Exit early - don't process SIGNED_OUT if we have a valid stored session
            }
          } catch (storageError) {
            // If storage check fails, continue with throttling logic
            console.warn('[Auth] Error checking stored session during throttling:', storageError);
          }
          
          // If we just processed a SIGNED_OUT event less than 15 seconds ago, skip this one
          // Increased from 5s to 15s to be much more aggressive about throttling
          if (timeSinceLastSignedOut < 15000) {
            signedOutEventCountRef.current += 1;
            // Only log every 5th event to reduce log spam
            if (signedOutEventCountRef.current % 5 === 0) {
              console.log(`[Auth] ⚠️ Skipping duplicate SIGNED_OUT event (${signedOutEventCountRef.current} total, ${Math.round(timeSinceLastSignedOut/1000)}s ago) - throttling to prevent rate limiting`);
            }
            isHandlingStateChange = false;
            return; // Exit early - don't process duplicate events
          }
          
          // Reset counter if enough time has passed (60 seconds - increased from 30s)
          if (timeSinceLastSignedOut > 60000) {
            signedOutEventCountRef.current = 0;
          }
          
          // If we've seen too many SIGNED_OUT events recently, skip to prevent rate limiting
          // Reduced threshold from 3 to 1 to be very aggressive - skip after just 1 event
          if (signedOutEventCountRef.current > 1) {
            console.log('[Auth] ⚠️ Too many SIGNED_OUT events detected - skipping to prevent rate limiting');
            isHandlingStateChange = false;
            return; // Exit early - don't process if too many events
          }
          
          lastSignedOutTimeRef.current = now;
          signedOutEventCountRef.current += 1;
        }
        
        isHandlingStateChange = true;
        // Only log important auth events, not TOKEN_REFRESHED (too frequent)
        if (_event !== 'TOKEN_REFRESHED') {
          console.log('[Auth] Auth state changed:', _event, 'Session:', !!session, 'Session user:', session?.user?.id);
        }
        
        try {
          // On sign-in, make sure to store the session and refresh token
          if (_event === 'SIGNED_IN' && session) {
            console.log('[Auth] User signed in via auth state change, ensuring session is saved');
            
            // Initialize systems for the user
            if (session.user?.id) {
            // Check if user is suspended (non-blocking, show alert)
            // Defer import to prevent blocking auth flow - use longer delay to prevent state update loops
            setTimeout(async () => {
              try {
                const suspensionModule = await import('../components/SuspendedUserAlert');
                if (suspensionModule?.checkAndShowSuspensionAlert && typeof suspensionModule.checkAndShowSuspensionAlert === 'function') {
                  suspensionModule.checkAndShowSuspensionAlert(session.user.id).catch((suspensionError) => {
                    console.error('[Auth] Error checking suspension:', suspensionError);
                    // Don't block login if suspension check fails
                  });
                } else {
                  console.warn('[Auth] checkAndShowSuspensionAlert not available, skipping suspension check');
                }
              } catch (importError: any) {
                // If it's a module resolution error, log but don't block
                if (importError?.message?.includes('unknown module') || importError?.message?.includes('Cannot find module')) {
                  console.warn('[Auth] SuspendedUserAlert module not available (may need Metro cache clear) - skipping suspension check');
                } else {
                  console.error('[Auth] Error importing SuspendedUserAlert:', importError);
                }
                // Don't block login if import fails
              }
            }, 2000); // Defer by 2s to ensure auth flow completes and state stabilizes
              
              // Initialize and set Expo push token when a user logs in (non-blocking)
              console.log('[Auth] Initializing push notifications (state change):', session.user.id);
              customNotifications.initialize().then(async (initSuccess) => {
                if (initSuccess) {
                  console.log('[Auth] Push notifications initialized, saving token...');
                  const saveSuccess = await customNotifications.saveTokenToProfile(session.user.id);
                  console.log('[Auth] Push token set result:', saveSuccess);
                } else {
                  console.log('[Auth] Push notification initialization failed');
                }
              }).catch((pushError) => {
                console.error('[Auth] Error with push token:', pushError);
              });
              
              // Initialize online status manager (non-blocking)
              initializeOnlineStatusManager(session.user.id).then(() => {
                console.log('[Auth] Online status manager initialized for user:', session.user.id);
              }).catch((statusError) => {
                console.error('[Auth] Error initializing online status manager:', statusError);
              });
              
              // Set user for location service but DON'T start detection automatically
              // Location detection will only start when user explicitly enables location features
              // This prevents automatic location permission requests on app start (Apple requirement)
              try {
                locationService.setUser(session.user);
                console.log('[Auth] Location service user set (detection disabled until user enables location):', session.user.id);
              } catch (locationError) {
                console.error('[Auth] Error setting location service user:', locationError);
              }
            }
            
            // Update state immediately for sign-in
            // CRITICAL: Set session first, then update loading states to prevent race conditions
            // Also explicitly save session to storage to ensure it persists
            // Reset INITIAL_SESSION flag when we get a real SIGNED_IN event
            initialSessionHandledRef.current = false;
            isRestoringSessionRef.current = false;
            
            try {
              const sessionStr = JSON.stringify(session);
              // Try SecureStore first, fallback to AsyncStorage
              try {
                await SecureStore.setItemAsync('supabase.auth.session', sessionStr);
                console.log('[Auth] Session saved to SecureStore');
              } catch (secureError) {
                await AsyncStorage.setItem('supabase.auth.session', sessionStr);
                console.log('[Auth] Session saved to AsyncStorage (SecureStore failed)');
              }
            } catch (storageError) {
              console.error('[Auth] Error saving session to storage:', storageError);
              // Continue anyway - Supabase might have saved it
            }
            
            setSession(session);
            lastSessionUserIdRef.current = session.user?.id;
            initialLoadCompletedRef.current = true; // Mark initial load as completed
            // Use setTimeout to ensure state updates happen in correct order
            setTimeout(() => {
              setError(null);
              setLoading(false);
              setIsLoaded(true);
            }, 100);
            return;
          }
          
          // On sign-out, ensure we handle it properly
          if (_event === 'SIGNED_OUT') {
            // CRITICAL: Skip if already handling to avoid duplicate processing
            // This prevents multiple SIGNED_OUT handlers from running simultaneously
            if (isHandlingStateChange) {
              // Silently skip duplicate events - don't log to reduce noise
              return;
            }
            
            // CRITICAL: Double-check stored session before processing SIGNED_OUT
            // This is a second check after throttling to ensure we don't logout unnecessarily
            const doubleCheckStoredSession = await getStoredSession(true);
            if (doubleCheckStoredSession && doubleCheckStoredSession.user?.id) {
              console.log('[Auth] ✅ Double-check: Found stored session - preventing SIGNED_OUT processing');
              setSession(doubleCheckStoredSession);
              signedOutEventCountRef.current = 0;
              isHandlingStateChange = false;
              return; // Exit early - don't process SIGNED_OUT if we have a valid stored session
            }
            
            // If this is an intentional sign out, don't try to refresh - just proceed with cleanup
            if (isIntentionalSignOutRef.current) {
              console.log('[Auth] Intentional sign out detected');
              
              // Check if this is a TOTP sign-out (don't navigate, let TOTP flow handle it)
              if (isTOTPSignOutRef.current) {
                console.log('[Auth] TOTP sign-out detected - skipping navigation, TOTP flow will handle routing');
                isIntentionalSignOutRef.current = false;
                isTOTPSignOutRef.current = false;
                // Still cleanup but don't navigate
                setSession(null);
                setError(null);
                setLoading(false);
                setIsLoaded(true);
                isHandlingStateChange = false;
                return; // Exit early - TOTP flow will handle navigation
              }
              
              console.log('[Auth] Intentional sign out - proceeding with cleanup');
              isIntentionalSignOutRef.current = false; // Reset flag
              // Continue to cleanup below
            } else {
              // Only log non-intentional sign outs (might indicate a problem)
              if (__DEV__) {
                console.log('[Auth] ⚠️ SIGNED_OUT event received (unintentional)');
              }
            
            console.log('[Auth] Current session user:', session?.user?.id);
            console.log('[Auth] Before SIGNED_OUT cleanup - loading:', loading, 'isLoaded:', isLoaded);

            // CRITICAL: Check stored session FIRST (before any network calls)
            // This prevents logout when leaving livestream or during network errors
            // Network errors from livestream cleanup can trigger SIGNED_OUT, but we should keep the session
            // Also prevents rate limiting by avoiding unnecessary refresh attempts
            // Pass isSignedOutEvent=true to be more lenient with expiration during SIGNED_OUT events
            console.log('[Auth] 🔍 Checking stored session before processing SIGNED_OUT...');
            const storedSessionCheck = await getStoredSession(true);
            if (storedSessionCheck && storedSessionCheck.user?.id) {
              console.log('[Auth] ✅ Stored session exists - preventing logout, keeping user logged in');
              console.log('[Auth] Stored session user:', storedSessionCheck.user.id);
              console.log('[Auth] This may be a false SIGNED_OUT event (e.g., from livestream cleanup or rate limiting)');
              setSession(storedSessionCheck);
              signedOutEventCountRef.current = 0; // Reset counter when we restore session
              isHandlingStateChange = false;
              return;
            } else {
              console.log('[Auth] ⚠️ No stored session found - storedSessionCheck:', storedSessionCheck ? 'exists but no user.id' : 'null');
            }

            // IMPORTANT: Check network status - don't log out if offline (network error might trigger SIGNED_OUT)
            const netInfo = await NetInfo.fetch();
            if (!netInfo.isConnected) {
              console.log('[Auth] ⚠️ Offline detected - preventing logout, keeping user session');
              console.log('[Auth] User will remain logged in with cached session');
              
              // Try to restore session from storage
              // Pass isSignedOutEvent=true to be more lenient
              const storedSession = await getStoredSession(true);
              if (storedSession) {
                console.log('[Auth] ✅ Restored session from storage in offline mode');
                setSession(storedSession);
              } else if (session) {
                // Keep existing session if available
                console.log('[Auth] ✅ Keeping existing session in offline mode');
                setSession(session);
              }
              
              isHandlingStateChange = false;
              // Keep the existing session - don't log out
              return;
            }
            
            // IMPORTANT: Try to refresh session before logging out - might be a temporary token issue
            // But only if online (don't try network calls when offline)
            // CRITICAL: Skip refresh if we've hit rate limits to prevent further rate limiting
            if (netInfo.isConnected && signedOutEventCountRef.current < 2) {
              console.log('[Auth] Attempting to refresh session before logout...');
              try {
                const refreshResult = await refreshAuthSession();
                if (refreshResult) {
                  console.log('[Auth] ✅ Session refreshed successfully - preventing logout');
                  const refreshedSession = await supabase.auth.getSession();
                  if (refreshedSession?.data?.session) {
                    console.log('[Auth] ✅ Valid refreshed session exists - ignoring SIGNED_OUT');
                    setSession(refreshedSession.data.session);
                    signedOutEventCountRef.current = 0; // Reset counter on success
                    isHandlingStateChange = false;
                    return;
                  }
                }
              } catch (refreshError: any) {
                // Check if it's a rate limit error - if so, skip further refresh attempts
                if (refreshError?.message?.includes('rate limit') || refreshError?.message?.includes('Rate limit')) {
                  console.log('[Auth] ⚠️ Rate limit detected - skipping further refresh attempts, using stored session');
                  signedOutEventCountRef.current = 10; // Set high to prevent more attempts
                  // Try stored session as fallback
                  const rateLimitStoredSession = await getStoredSession(true);
                  if (rateLimitStoredSession && rateLimitStoredSession.user?.id) {
                    console.log('[Auth] ✅ Found stored session after rate limit - restoring to prevent logout');
                    setSession(rateLimitStoredSession);
                    isHandlingStateChange = false;
                    return;
                  }
                } else {
                  console.log('[Auth] Session refresh attempt failed:', refreshError);
                }
              }
              
              // Check current session from network (only if online)
              try {
                const currentSession = await supabase.auth.getSession();
                if (currentSession?.data?.session?.user?.id) {
                  console.log('[Auth] ✅ Valid session still exists for user:', currentSession.data.session.user.id);
                  console.log('[Auth] Ignoring SIGNED_OUT event - user still authenticated');
                  setSession(currentSession.data.session); // Update session state
                  isHandlingStateChange = false;
                  return;
                }
              } catch (networkError) {
                // Network error checking session - use stored session if available
                console.log('[Auth] Network error checking session - using stored session');
                const fallbackSession = await getStoredSession(true);
                if (fallbackSession) {
                  setSession(fallbackSession);
                  isHandlingStateChange = false;
                  return;
                }
              }
            } else {
              // Offline or rate limited - keep existing session (don't try network calls)
              // Also check stored session as fallback
              if (session) {
                console.log('[Auth] ✅ Offline/rate-limited - keeping existing session');
                setSession(session);
                isHandlingStateChange = false;
                return;
              } else {
                // No session but offline/rate-limited - try stored session
                const offlineStoredSession = await getStoredSession(true);
                if (offlineStoredSession && offlineStoredSession.user?.id) {
                  console.log('[Auth] ✅ Found stored session when offline/rate-limited - restoring');
                  setSession(offlineStoredSession);
                  isHandlingStateChange = false;
                  return;
                }
              }
            }
            
            // Final check: If we still have an existing session, keep it (don't log out)
            if (session) {
              console.log('[Auth] ✅ Final check: Keeping existing session - preventing logout');
              setSession(session);
              isHandlingStateChange = false;
              return;
            }
            
            // Last resort: Check stored session one more time
            const finalStoredCheck = await getStoredSession(true);
            if (finalStoredCheck && finalStoredCheck.user?.id) {
              console.log('[Auth] ✅ Last resort: Found stored session - preventing logout');
              setSession(finalStoredCheck);
              isHandlingStateChange = false;
              return;
            }
            
            console.log('[Auth] ❌ No valid session found after all checks - proceeding with sign out');
            }
            
            // Cleanup systems (non-blocking)
            if (session?.user?.id) {
              cleanupOnlineStatusManager(session.user.id).then(() => {
                console.log('[Auth] Online status manager cleaned up for user:', session.user.id);
              }).catch((cleanupError) => {
                console.error('[Auth] Error cleaning up online status manager:', cleanupError);
              });
              
              try {
                locationService.stopDetection();
                console.log('[Auth] Location service stopped');
              } catch (locationError) {
                console.error('[Auth] Error stopping location service:', locationError);
              }
            }
            
            setSession(null);
            setError(null);
            setLoading(false);
            setIsLoaded(true);
            
            // Reset flag before navigation to allow other state changes
            isHandlingStateChange = false;
            
            // IMPORTANT: Trigger navigation to signin screen SYNCHRONOUSLY
            console.log('[Auth] 🔄 User logged out - navigating to signin NOW');
            
            // Use dynamic import but execute immediately
            (async () => {
              try {
                const { router } = await import('expo-router');
                console.log('[Auth] ✅ Router loaded, executing replace to /auth/signin');
                router.replace('/auth/signin');
                console.log('[Auth] ✅ Navigation executed');
              } catch (navError) {
                console.error('[Auth] ❌ Error navigating to signin:', navError);
              }
            })();
            
            console.log('[Auth] After SIGNED_OUT cleanup - should be loading: false, isLoaded: true');
            return;
          }
          
          // On token refresh, only update if session actually changed or we're still loading
          // CRITICAL: Most token refreshes should be silently ignored to prevent excessive updates
          if (_event === 'TOKEN_REFRESHED' && session) {
            // Only update state if:
            // 1. User ID changed (different user) - rare but important case
            // 2. Truly initial load (first time, before any session was set) - only once
            // For routine token refreshes (same user, already loaded), Supabase handles it internally
            // and we don't need to update React state to prevent unnecessary re-renders
            const userIdChanged = session.user?.id !== lastSessionUserIdRef.current;
            const isTrulyInitialLoad = !initialLoadCompletedRef.current && (!lastSessionUserIdRef.current || loading || !isLoaded);
            
            // CRITICAL: Only update state if absolutely necessary
            // Most token refreshes should be completely ignored (already throttled above)
            if (userIdChanged || isTrulyInitialLoad) {
              // Only log if user ID changed (important) - no logging for routine refreshes
              if (__DEV__ && userIdChanged) {
                console.log('[Auth] Token refreshed - user changed (updating state)');
              }
              
              // Update state only if user changed or truly first load
              if (userIdChanged || isTrulyInitialLoad) {
                setSession(session);
                setError(null);
                setLoading(false);
                setIsLoaded(true);
                lastSessionUserIdRef.current = session.user?.id;
                
                // Mark initial load as completed after first successful refresh
                if (isTrulyInitialLoad) {
                  initialLoadCompletedRef.current = true;
                }
              }
            }
            // Silently skip all other token refreshes - no logging, no state updates
            // This prevents excessive re-renders and log spam
            isHandlingStateChange = false;
            return;
          }
          
          // If session expired or token refresh failed, try to refresh it
          if (_event === 'TOKEN_REFRESHED' && !session) {
            console.log('[Auth] Token refresh failed or session expired, attempting manual refresh');
            const refreshResult = await refreshAuthSession();
            if (refreshResult) {
              // Refresh succeeded, get the new session
              const { data: { session: newSession } } = await supabase.auth.getSession();
              if (newSession) {
                console.log('[Auth] ✅ Session refreshed successfully after token refresh failure');
                setSession(newSession);
                setError(null);
                setLoading(false);
                setIsLoaded(true);
                return;
              }
            } else {
              // Refresh failed - check if we have a stored session
              const { data: { session: storedSession } } = await supabase.auth.getSession();
              if (storedSession) {
                console.log('[Auth] ⚠️ Refresh failed but stored session exists - using stored session');
                setSession(storedSession);
                setError(null);
                setLoading(false);
                setIsLoaded(true);
                return;
              }
              console.log('[Auth] ❌ No session available after refresh failure');
            }
            return;
          }
          
          // Default case - update session state
          // CRITICAL: For INITIAL_SESSION with no session, check stored session first
          // Prevent multiple INITIAL_SESSION handlers from running simultaneously
          if (_event === 'INITIAL_SESSION' && !session) {
            // If we've already handled INITIAL_SESSION or are currently restoring, skip
            if (initialSessionHandledRef.current || isRestoringSessionRef.current) {
              console.log('[Auth] INITIAL_SESSION already handled or restoration in progress, skipping...');
              return;
            }
            
            // Mark that we're handling INITIAL_SESSION
            initialSessionHandledRef.current = true;
            isRestoringSessionRef.current = true;
            
            console.log('[Auth] INITIAL_SESSION with no session - checking stored session...');
            const storedSession = await getStoredSession(false); // Use normal check for INITIAL_SESSION
            if (storedSession && storedSession.user?.id) {
              console.log('[Auth] ✅ Found stored session - restoring user session');
              console.log('[Auth] Stored session user ID:', storedSession.user.id);
              // Only save if session is different from what we already have
              // Don't re-save unnecessarily as it might trigger more events
              try {
                const sessionStr = JSON.stringify(storedSession);
                // Check if it's different from what's already stored
                let needsSave = true;
                try {
                  const existingSecure = await SecureStore.getItemAsync('supabase.auth.session');
                  const existingAsync = await AsyncStorage.getItem('supabase.auth.session');
                  const existing = existingSecure || existingAsync;
                  if (existing === sessionStr) {
                    needsSave = false;
                    console.log('[Auth] Session already in storage, skipping re-save');
                  }
                } catch {
                  // If we can't check, proceed with save
                }
                
                if (needsSave) {
                  try {
                    await SecureStore.setItemAsync('supabase.auth.session', sessionStr);
                  } catch {
                    await AsyncStorage.setItem('supabase.auth.session', sessionStr);
                  }
                  console.log('[Auth] Restored session re-saved to storage');
                }
              } catch (saveError) {
                console.error('[Auth] Error re-saving restored session:', saveError);
              }
              
              // Set session state once
              setSession(storedSession);
              setLoading(false);
              setIsLoaded(true);
              isRestoringSessionRef.current = false;
              return;
            } else {
              console.log('[Auth] ⚠️ No stored session found - storedSession:', storedSession ? `exists but no user.id (user: ${storedSession.user})` : 'null');
              // Check what's actually in storage for debugging (only once)
              try {
                const secureCheck = await SecureStore.getItemAsync('supabase.auth.session');
                const asyncCheck = await AsyncStorage.getItem('supabase.auth.session');
                console.log('[Auth] Storage check - SecureStore:', secureCheck ? 'has data' : 'empty', 'AsyncStorage:', asyncCheck ? 'has data' : 'empty');
              } catch (debugError) {
                console.log('[Auth] Error checking storage:', debugError);
              }
              isRestoringSessionRef.current = false;
            }
          }
          
          console.log('[Auth] Setting session and updating loading state');
          setSession(session);
          setLoading(false);
          setIsLoaded(true);
        } finally {
          isHandlingStateChange = false;
        }
      });
      subscription = data.subscription;
    } catch (err) {
      logError('Auth:StateChange', err);
      setError('Please restart the app and try again');
      setLoading(false);
      setIsLoaded(true);
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Add a timeout for auth loading - only show error if we haven't loaded and no session exists
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading && !session && !isLoaded) {
        console.log('[Auth] Auth loading timeout - no session found');
        setError('Please check your connection and try again');
        setLoading(false);
        setIsLoaded(true);
      }
    }, 15000); // Increased to 15 seconds to prevent conflicts with TabLayout
    
    return () => clearTimeout(timer);
  }, [loading, session, isLoaded]);

  const signUp = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    setIsLoaded(false); // Reset to allow proper loading flow
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        logError('Auth:SignUp', error);
        setError(getUserFriendlyError(error));
        setLoading(false);
        setIsLoaded(true);
        return false;
      }

      if (data.user && !data.session) {
        // User needs to confirm email
        setError('Please check your email and click the confirmation link to complete your account setup.');
        setLoading(false);
        setIsLoaded(true);
        return false;
      }

      // Set session and update loading states immediately
      console.log('[Auth] SignUp successful, setting session:', !!data.session);
      setSession(data.session);
      setLoading(false);
      setIsLoaded(true);
      console.log('[Auth] SignUp complete - session set, loading:', false, 'isLoaded:', true);
      return true;
    } catch (err) {
      logError('Auth:SignUp', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
      setIsLoaded(true);
      return false;
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn called, setting loading to true');
    setLoading(true);
    setError(null);
    setIsLoaded(false); // Reset to allow proper loading flow
    
    // Check network connectivity first
    try {
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.error('[Auth] No network connection');
        setError('No internet connection. Please check your network and try again.');
        setLoading(false);
        return false;
      }
    } catch (netError) {
      console.warn('[Auth] Network check failed, proceeding anyway:', netError);
    }
    
    const maxRetries = 2;
    const timeoutMs = 15000; // 15 second timeout
    let timeoutOccurred = false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Auth] Sign in attempt ${attempt}/${maxRetries}`);
        
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            timeoutOccurred = true;
            reject(new Error('Login request timed out. Please check your connection and try again.'));
          }, timeoutMs);
        });
        
        // Create sign in promise
        const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });
        
        // Race between sign in and timeout
        const { data, error } = await Promise.race([signInPromise, timeoutPromise]);

      if (error) {
          console.error(`[Auth] Sign in error (attempt ${attempt}):`, error);
          
          // If it's a network error and we have retries left, retry
          if (attempt < maxRetries && (
            error.message?.includes('Network request failed') ||
            error.message?.includes('timeout') ||
            error.message?.includes('fetch') ||
            error.message?.includes('network')
          )) {
            console.log(`[Auth] Network error detected, retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // Check if account was deleted when we get "Invalid login credentials"
          if (error.message?.includes('Invalid login credentials') || error.message?.includes('Invalid login')) {
            console.log('[Auth] Checking if account was deleted for email:', email.toLowerCase().trim());
            
            try {
              // Check deleted_accounts table to see if this email was deleted
              const { data: deletedAccount, error: deletedCheckError } = await supabase
                .from('deleted_accounts')
                .select('email, deleted_at')
                .eq('email', email.toLowerCase().trim())
                .maybeSingle();
              
              console.log('[Auth] Deleted account check result:', { 
                found: !!deletedAccount, 
                error: deletedCheckError?.message,
                data: deletedAccount 
              });
              
              if (deletedAccount && !deletedCheckError) {
                console.log('[Auth] ✓ Account was deleted on:', deletedAccount.deleted_at);
                setError('This account has been deleted. If you believe this is an error, please contact support.');
                setLoading(false);
                return false;
              } else if (deletedCheckError) {
                console.warn('[Auth] Error querying deleted_accounts table:', deletedCheckError.message);
                // If table doesn't exist, continue with normal error handling
              } else {
                console.log('[Auth] Account not found in deleted_accounts table');
              }
            } catch (checkError) {
              console.warn('[Auth] Exception checking if account was deleted:', checkError);
              // Continue with normal error handling if check fails
            }
          }
          
          // Otherwise, show the error
        logError('Auth:SignIn', error);
        setError(getUserFriendlyError(error));
          setLoading(false);
        return false;
      }

      console.log('[Auth] Sign in successful, checking for MFA requirement');
      
      // Check if MFA/TOTP is required BEFORE setting the session
      // If TOTP is required, we'll sign out and wait for TOTP verification before setting session
      // We need to check the profiles table to see if TOTP is enabled for this user
      let requiresMFA = false;
      let mfaFactors: any[] = [];
      
      if (data.session && data.user) {
        try {
          // Check TOTP status directly from profiles table using the user ID from sign-in response
          const { checkTOTPEnabled } = await import('../utils/totpService');
          const isTOTPEnabled = await checkTOTPEnabled(data.user.id);
          
          console.log('[Auth] TOTP check result:', { userId: data.user.id, isTOTPEnabled });
          
          if (isTOTPEnabled) {
            // Check if this device/session is trusted (TOTP verified recently)
            const trustedDeviceKey = `totp_trusted_${data.user.id}`;
            let isTrustedDevice = false;
            
            try {
              const trustedData = await SecureStore.getItemAsync(trustedDeviceKey);
              if (trustedData) {
                const { sessionId, timestamp } = JSON.parse(trustedData);
                const daysSinceVerification = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
                
                // Trust device for 30 days, or if same session ID, or if marked as 'totp_verified' (just verified)
                if (daysSinceVerification < 30 || 
                    sessionId === data.session.access_token || 
                    sessionId === 'totp_verified' ||
                    sessionId === 'biometric_auth') {
                  isTrustedDevice = true;
                  console.log('[Auth] Device is trusted, skipping TOTP verification', { 
                    daysSinceVerification: daysSinceVerification.toFixed(2),
                    sessionIdMatch: sessionId === data.session.access_token,
                    sessionIdType: sessionId
                  });
                } else {
                  // Trust expired, remove it
                  await SecureStore.deleteItemAsync(trustedDeviceKey);
                  console.log('[Auth] Trust expired, will require TOTP');
                }
              }
            } catch (trustError) {
              console.warn('[Auth] Error checking trusted device:', trustError);
              // If we can't check, require TOTP for security
            }
            
            if (!isTrustedDevice) {
              requiresMFA = true;
              mfaFactors = [{
                id: data.user.id,
                type: 'totp',
                friendly_name: 'Authenticator App',
                status: 'verified',
              }];
              
              console.log('[Auth] MFA required, will prompt for TOTP code');
              // Don't set session yet - wait for MFA verification
              // Sign out the session since TOTP is required
              // Set flags BEFORE signing out to prevent duplicate handling and navigation
              isIntentionalSignOutRef.current = true;
              isTOTPSignOutRef.current = true; // Mark as TOTP sign-out to skip navigation
              try {
                // Local-only sign out: do not revoke other device/app sessions.
                await supabase.auth.signOut({ scope: 'local' });
                console.log('[Auth] Signed out for TOTP verification (will skip navigation)');
              } catch (signOutError) {
                console.error('[Auth] Error signing out for TOTP:', signOutError);
                // Reset flags on error
                isTOTPSignOutRef.current = false;
              }
              // Don't reset flags immediately - let the SIGNED_OUT handler reset them
              
              // Return special indicator that MFA is needed with password for re-auth
              setLoading(false);
              return { 
                requiresMFA: true, 
                mfaFactors,
                userId: data.user.id,
                email: data.user.email,
                password: password // Store password temporarily for re-auth after TOTP
              } as any;
            } else {
              console.log('[Auth] Device is trusted, proceeding without TOTP verification');
            }
          }
        } catch (mfaError) {
          console.error('[Auth] Error checking MFA requirement:', mfaError);
          // Continue with normal flow if MFA check fails
        }
      }
      
      console.log('[Auth] Sign in completed, setting session');
      
      // CRITICAL: Set session immediately after successful sign-in (and TOTP check passed)
      // This ensures the session is available before any redirect checks happen
      if (data.session) {
        // Explicitly ensure session is saved to storage (both SecureStore and AsyncStorage for redundancy)
        try {
          const sessionStr = JSON.stringify(data.session);
          // Try SecureStore first for better security
          try {
            await SecureStore.setItemAsync('supabase.auth.session', sessionStr);
            console.log('[Auth] Session explicitly saved to SecureStore');
          } catch (secureError) {
            // Fallback to AsyncStorage if SecureStore fails
            await AsyncStorage.setItem('supabase.auth.session', sessionStr);
            console.log('[Auth] Session explicitly saved to AsyncStorage (SecureStore failed)');
          }
          // Also save to AsyncStorage as backup (Supabase uses AsyncStorage by default)
          await AsyncStorage.setItem('supabase.auth.session', sessionStr);
        } catch (storageError) {
          console.error('[Auth] Error saving session to storage:', storageError);
          // Continue anyway - Supabase might have saved it
        }
        
        // Set session state immediately to prevent race conditions with redirect logic
        console.log('[Auth] Setting session immediately after sign-in to prevent auto-logout');
        setSession(data.session);
        setError(null);
        setLoading(false);
        setIsLoaded(true);
        lastSessionUserIdRef.current = data.user?.id;
        initialLoadCompletedRef.current = true;
      }
      
      // Check if user is suspended (non-blocking, show alert)
      if (data.user?.id) {
          // Check suspension status (deferred to prevent blocking auth)
          setTimeout(async () => {
            try {
              const suspensionModule = await import('../components/SuspendedUserAlert');
              if (suspensionModule?.checkAndShowSuspensionAlert && typeof suspensionModule.checkAndShowSuspensionAlert === 'function') {
                suspensionModule.checkAndShowSuspensionAlert(data.user.id).catch((suspensionError) => {
                  console.error('[Auth] Error checking suspension:', suspensionError);
                  // Don't block login if suspension check fails
                });
              } else {
                console.warn('[Auth] checkAndShowSuspensionAlert not available, skipping suspension check');
              }
            } catch (importError: any) {
              // If it's a module resolution error, log but don't block
              if (importError?.message?.includes('unknown module') || importError?.message?.includes('Cannot find module')) {
                console.warn('[Auth] SuspendedUserAlert module not available (may need Metro cache clear) - skipping suspension check');
              } else {
                console.error('[Auth] Error importing SuspendedUserAlert:', importError);
              }
              // Don't block login if import fails
            }
          }, 2000); // Defer by 2s to ensure auth flow completes and state stabilizes
        
        // Initialize and set Expo push token when a user signs in (non-blocking)
        console.log('[Auth] Initializing push notifications:', data.user.id);
        // Run push notification setup in background to avoid blocking login
        customNotifications.initialize().then(async (initSuccess) => {
          if (initSuccess) {
            console.log('[Auth] Push notifications initialized, saving token...');
            const saveSuccess = await customNotifications.saveTokenToProfile(data.user.id);
            console.log('[Auth] Push token set result:', saveSuccess);
          } else {
            console.log('[Auth] Push notification initialization failed');
          }
        }).catch((pushError) => {
          console.error('[Auth] Error with push token:', pushError);
        });
      }

      console.log('[Auth] Sign in completed successfully');
        setLoading(false);
      return true;
      } catch (err: any) {
        console.error(`[Auth] Sign in exception (attempt ${attempt}):`, err);
        
        // If it's a timeout or network error and we have retries left, retry
        if (attempt < maxRetries && (
          err?.message?.includes('timeout') ||
          err?.message?.includes('Network') ||
          err?.message?.includes('network') ||
          err?.message?.includes('fetch')
        )) {
          console.log(`[Auth] Network/timeout error, retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // Otherwise, show error
      logError('Auth:SignIn', err);
        const errorMessage = err?.message || 'An unexpected error occurred. Please check your connection and try again.';
        setError(errorMessage);
        setLoading(false);
      return false;
      }
    }
    
    // If we get here, all retries failed
    // DISABLED: Slow network detection - adaptive quality handles slow connections silently
    // Users in Nigeria/Africa find this annoying - other apps don't complain about internet
    // No need to show pop-ups about slow internet - the app adapts quality automatically
    if (hadTimeoutError) {
      // Slow network detection disabled - adaptive quality system handles slow connections silently
      // No need to annoy users with pop-ups about their internet connection
    }
    setError('Unable to sign in. Please check your connection and try again.');
    setLoading(false);
    return false;
  };

  const signOut = async () => {
    console.log('[Auth] signOut called, setting loading to true');
    setLoading(true);
    setError(null);
    setIsLoaded(false); // Reset to allow proper cleanup flow
    try {
      console.log('[Auth] Starting sign out process');
      
      // Clean up online status manager first to prevent interference
      try {
        console.log('[Auth] Cleaning up online status manager...');
        const { cleanupOnlineStatusManager } = await import('../utils/onlineStatusManager');
        await cleanupOnlineStatusManager(session?.user?.id);
        console.log('[Auth] Online status manager cleaned up');
      } catch (cleanupError) {
        console.error('[Auth] Error cleaning up online status manager:', cleanupError);
      }
      
      // Remove Expo push token before signing out
      if (session?.user?.id) {
        try {
          console.log('[Auth] Removing Expo push token...');
          await expoPushNotifications.removeTokenFromProfile(session.user.id);
          console.log('[Auth] Expo push token removed successfully');
        } catch (pushError) {
          console.error('[Auth] Error removing Expo push token:', pushError);
        }
      }
      
      // Get current user ID before clearing session
      const currentUserId = session?.user?.id;
      
      // Clear trusted device token when user signs out (will require TOTP on next login)
      if (currentUserId) {
        try {
          const trustedDeviceKey = `totp_trusted_${currentUserId}`;
          await SecureStore.deleteItemAsync(trustedDeviceKey);
          console.log('[Auth] Cleared trusted device token - TOTP will be required on next login');
        } catch (trustError) {
          console.warn('[Auth] Error clearing trusted device token:', trustError);
        }
      }
      
      // Set flag to indicate this is an intentional sign out FIRST
      // This prevents the SIGNED_OUT event handler from trying to refresh the session
      isIntentionalSignOutRef.current = true;
      console.log('[Auth] Set intentional sign out flag');

      console.log('[Auth] Calling supabase.auth.signOut()...');
      // Local-only sign out keeps other logged-in devices/sister apps active.
      const { error } = await supabase.auth.signOut({ scope: 'local' });

      // Clear session storage after signOut to ensure it's fully cleared
      try {
        console.log('[Auth] Clearing Supabase session storage...');
        // Clear Supabase's session storage keys
        const allKeys = await AsyncStorage.getAllKeys();
        const supabaseKeys = allKeys.filter(key => 
          key.includes('supabase.auth') || 
          key.includes('sb-') ||
          key.startsWith('@supabase')
        );
        if (supabaseKeys.length > 0) {
          await AsyncStorage.multiRemove(supabaseKeys);
          console.log('[Auth] Cleared Supabase session keys:', supabaseKeys.length);
        }
      } catch (storageError) {
        console.error('[Auth] Error clearing Supabase storage:', storageError);
      }
      
      // Clear any cached authentication data
      try {
        console.log('[Auth] Clearing cached data...');
        await AsyncStorage.multiRemove([
          'recently_logged_out',
          'biometric_disabled_temporarily',
          'user_last_location',
          'push_token'
        ]);
        console.log('[Auth] Cleared cached data');
      } catch (cacheError) {
        console.error('[Auth] Error clearing cached data:', cacheError);
      }

      if (error) {
        console.error('[Auth] Sign out error:', error);
        logError('Auth:SignOut', error);
        setError(getUserFriendlyError(error));
        return false;
      }

      // Clear session state immediately
      console.log('[Auth] Clearing session state...');
      setSession(null);
      setError(null);
      setLoading(false);
      setIsLoaded(true);
      // Reset intentional sign out flag after a short delay to ensure cleanup completes
      setTimeout(() => {
        isIntentionalSignOutRef.current = false;
      }, 1000);
      console.log('[Auth] Sign out successful');

      // Add a failsafe to ensure loading state is reset after a short delay
      setTimeout(() => {
        console.log('[Auth] Failsafe: Ensuring loading state is reset after signOut');
        setLoading(false);
        setIsLoaded(true);
      }, 500);

      return true;
    } catch (err) {
      console.error('[Auth] Sign out exception:', err);
      logError('Auth:SignOut', err);
      setError('An unexpected error occurred. Please try again.');
      return false;
    } finally {
      console.log('[Auth] Setting loading to false in finally block');
      setLoading(false);
      // Ensure isLoaded is set to true after logout
      setIsLoaded(true);
    }
  };

  // Add a method to explicitly refresh the token
  const refreshToken = async () => {
    try {
      console.log('Attempting to refresh token...');
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        console.log('Token refresh successful');
        // Get the updated session
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        return true;
      } else {
        console.log('Token refresh failed');
        return false;
      }
    } catch (error) {
      logError('Auth:RefreshToken', error);
      return false;
    }
  };

  // Add method to clear error manually
  const clearError = () => {
    setError(null);
  };

  // Debug authentication state (removed excessive logging that was causing re-renders)
  const finalUser = session?.user ?? null;

  // Stabilize the return object to prevent unnecessary re-renders
  // Only recreate the object when meaningful values change
  // The throttling above prevents session from updating too frequently
  return useMemo(() => ({
    session,
    user: finalUser,
    loading,
    isLoaded,
    error,
    signUp,
    signIn,
    signOut,
    refreshToken,
    clearError,
  }), [session, finalUser?.id, loading, isLoaded, error]);
}