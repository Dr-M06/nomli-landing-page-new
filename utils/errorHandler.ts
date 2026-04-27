/**
 * Error handling utility functions
 * Ensures that backend errors are properly logged but never shown to users
 */

import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * Safely logs an error without exposing sensitive details to the console
 * @param context - Where the error occurred
 * @param error - The error object
 * @param userMessage - Optional message for user display
 */
export const logError = (context: string, error: any, userMessage?: string) => {
  // Only log detailed errors in development
  if (__DEV__) {
    console.log(`[${context}] Error occurred:`, error);
    
    // Log stack trace in dev mode only
    if (error && error.stack) {
      console.log(`[${context}] Stack trace:`, error.stack);
    }
  } else {
    // In production, log minimal non-sensitive information
    const errorType = error && error.name ? error.name : typeof error;
    console.log(`[${context}] Error of type ${errorType} occurred`);
    
    // Here you could add remote logging service integration
    // e.g., Sentry, Firebase Crashlytics, etc.
    // remoteLoggingService.captureException(error);
  }
};

// Original console.error function
const originalConsoleError = console.error;

// List of error messages to silence (not show in UI or console)
const silencedErrors = [
  'Error joining country chat',
  '[JoinCountryChat]',
  'PrivacyError',
  'This user has disabled direct messages',
  'Error subscribing to private messages',
  'Subscription timed out',
  'Subscription closed',
  'CHANNEL_ERROR',
  'subscription.subscribe',
  // Bunny.net errors - these are expected fallbacks, don't show error modals
  '[BunnyNet]',
  'Bunny.net upload failed',
  'Upload failed',
  '401 Unauthorized',
  'BunnyNetProxy',
];

// Setup error interceptor
export const setupErrorInterceptor = () => {
  // Override console.error to filter out specific errors
  console.error = (...args) => {
    // Check if this is an error we want to silence
    const errorString = args.join(' ');
    
    if (silencedErrors.some(silencedError => errorString.includes(silencedError))) {
      // For silenced errors, log them as debug messages instead
      if (__DEV__) {
        console.log('[Silenced Error]', ...args);
      }
      return;
    }
    
    // For all other errors, use the original console.error
    // Ensure we call it properly to avoid React rendering issues
    try {
      // Check if this is a recursive call to prevent infinite loops
      if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('errorHandler.ts')) {
        // Skip logging to prevent recursive errors
        return;
      }
      
      // Safely call originalConsoleError with proper error handling
      if (typeof originalConsoleError === 'function') {
        // Try using apply first (more reliable for multiple arguments)
        try {
          originalConsoleError.apply(console, args);
        } catch (applyError) {
          // If apply fails, try direct call with spread operator
          try {
            originalConsoleError(...args);
          } catch (spreadError) {
            // If both fail, try calling with just the first argument as a string
            const errorString = args.map(arg => {
              if (typeof arg === 'string') return arg;
              if (arg && typeof arg === 'object') {
                try {
                  return JSON.stringify(arg);
                } catch {
                  return String(arg);
                }
              }
              return String(arg);
            }).join(' ');
            originalConsoleError(errorString);
          }
        }
      }
    } catch (error) {
      // Ultimate fallback - just return to prevent infinite recursion
      // Don't log this error as it could cause infinite loops
      return;
    }
  };
};

/**
 * Map backend errors to user-friendly messages
 * @param error - The backend error object or message
 * @returns A user-friendly error message
 */
export const getUserFriendlyError = (error: any): string => {
  if (!error) return 'An unexpected error occurred';
  
  let errorMessage = '';
  let errorCode = '';
  
  // Extract error code if available
  if (error.code) {
    errorCode = error.code.toString();
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    errorMessage = error;
  } 
  // Handle error objects with message property
  else if (error.message && typeof error.message === 'string') {
    errorMessage = error.message;
  } 
  // Handle Supabase error objects
  else if (error.error_description && typeof error.error_description === 'string') {
    errorMessage = error.error_description;
  }
  // Handle unknown error format
  else {
    return 'An unexpected error occurred';
  }

  // Remove backend error codes like PGRST116
  errorMessage = errorMessage.replace(/\b[A-Z]+[0-9]+\b/g, '');
  
  // Handle specific error codes
  if (errorCode) {
    switch (errorCode) {
      case 'PGRST116':
        return 'The requested information could not be found';
      case '23505':
        return 'This information already exists';
      case '23503':
        return 'This operation cannot be completed because the data is referenced elsewhere';
      case '42P01':
        return 'There was a problem accessing the database';
      case '42501':
      case '42503':
        return 'You do not have permission to perform this action';
      case '23502':
        return 'Required information is missing';
      // Add more specific error codes as needed
    }
  }
  
  // Map common backend error messages to user-friendly messages
  if (errorMessage.includes('Invalid login credentials')) {
    return 'Invalid email or password';
  } else if (errorMessage.includes('Email not confirmed')) {
    return 'Email not confirmed';
  } else if (errorMessage.includes('Too many requests') || errorMessage.includes('rate limit')) {
    return 'Too many attempts. Please try again later';
  } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
    return 'Network error. Please check your connection';
  } else if (errorMessage.includes('JSON object') || errorMessage.includes('rows returned')) {
    return 'Unable to retrieve data. Please try again';
  } else if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
    return 'The requested information could not be found';
  } else if (errorMessage.includes('permission') || errorMessage.includes('not allowed')) {
    return 'You do not have permission to perform this action';
  } else if (errorMessage.includes('timeout')) {
    return 'Request timed out. Please try again';
  } else if (errorMessage.includes('duplicate') || errorMessage.includes('already exists') || 
             errorMessage.includes('unique constraint') || errorMessage.includes('User already registered')) {
    return 'This information already exists';
  } else if (errorMessage.includes('constraint') || errorMessage.includes('violates')) {
    return 'Unable to complete this action due to data constraints';
  } else if (errorMessage.includes('invalid email')) {
    return 'Please enter a valid email address';
  } else if (errorMessage.includes('password') && errorMessage.includes('strong')) {
    return 'Please use a stronger password';
  }
  
  // Default user-friendly message
  return 'An error occurred. Please try again';
};

/**
 * Show a toast error message to the user
 * @param title - Toast title
 * @param error - Error object or message
 */
export const showErrorToast = (title: string, error: any) => {
  // Get user-friendly error message
  const userFriendlyMessage = getUserFriendlyError(error);
  
  // Log the error (safely)
  logError('Toast', error, userFriendlyMessage);
  
  // Show toast with user-friendly message
  Toast.show({
    type: 'error',
    text1: title,
    text2: userFriendlyMessage,
    position: 'top',
    visibilityTime: 4000,
    autoHide: true,
    topOffset: 50,
  });
};

/**
 * Wrapper function to handle API errors
 * @param context - Where the error occurred
 * @param apiCall - The async API function to call
 * @param errorTitle - Title for error toast
 * @returns The result of the API call or null if error
 */
export const handleApiCall = async <T>(
  context: string,
  apiCall: () => Promise<T>,
  errorTitle = 'Error'
): Promise<T | null> => {
  try {
    return await apiCall();
  } catch (error) {
    showErrorToast(errorTitle, error);
    logError(context, error);
    return null;
  }
};

// User-friendly error handler
export const handleError = (error: any, context: string = 'App') => {
  // Don't handle privacy errors - let them be caught by the UI
  if (error?.name === 'PrivacyError') {
    console.log('[Error Handler] Ignoring PrivacyError - letting UI handle it');
    return;
  }
  
  // Convert error to string
  const errorMessage = typeof error === 'string' 
    ? error 
    : error?.message || 'An unknown error occurred';
  
  // Check if this is an error we want to silence
  if (silencedErrors.some(silencedError => errorMessage.includes(silencedError))) {
    // For silenced errors, just log them in dev mode
    if (__DEV__) {
      console.log(`[Silenced Error: ${context}]`, errorMessage);
    }
    return;
  }
  
  // Log the error to console
  originalConsoleError(`[${context} Error]`, error);
  
  // Return user-friendly error message
  return getUserFriendlyError(errorMessage);
};

// Initialize error handling
export const initErrorHandling = () => {
  setupErrorInterceptor();
  
  // Set up global error handler if not in development
  if (!__DEV__) {
    // Handle global errors differently based on platform
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.onerror = (message, source, lineno, colno, error) => {
        // Don't handle privacy errors globally - let them be caught by the UI
        if (error?.name === 'PrivacyError') {
          console.log('[Web Error Handler] Ignoring PrivacyError - letting UI handle it');
          return false; // Let the error propagate to be caught by try-catch
        }
        handleError(error || message, 'Global');
        return true; // Prevent default error handling
      };
    } else {
      // For React Native
      const ErrorUtils = global.ErrorUtils;
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        // Don't handle privacy errors globally - let them be caught by the UI
        if (error?.name === 'PrivacyError') {
          console.log('[Global Error Handler] Ignoring PrivacyError - letting UI handle it');
          return;
        }
        handleError(error, isFatal ? 'Fatal' : 'Global');
      });
    }
  }
}; 