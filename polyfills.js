/**
 * Polyfills for React Native — load before other app code.
 * Installs DOMException (Hermes) and Web Streams (Supabase real-time, etc.).
 */

// Wrap everything in try-catch to prevent polyfill errors from breaking the app
try {
  // DOMException is a web API; Hermes/RN omit it. web-streams-polyfill, Supabase, and others assume it exists.
  (function installDOMException() {
    const g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : {};
    if (typeof g.DOMException !== 'undefined') return;
    class DOMExceptionPolyfill extends Error {
      constructor(message = '', name = 'Error') {
        super(message);
        this.name = name;
      }
      get [Symbol.toStringTag]() {
        return 'DOMException';
      }
    }
    g.DOMException = DOMExceptionPolyfill;
    if (typeof global !== 'undefined' && global.DOMException !== DOMExceptionPolyfill) {
      global.DOMException = DOMExceptionPolyfill;
    }
  })();

  console.log('[polyfills] Loading Web Streams (Supabase real-time needs ReadableStream).');

  // Get Platform from react-native using require (synchronous)
  // Use a very defensive approach to avoid breaking module resolution
  let Platform = null;
  try {
    const reactNative = require('react-native');
    if (reactNative && reactNative.Platform) {
      Platform = reactNative.Platform;
    }
  } catch (e) {
    // If react-native isn't available yet, we'll skip platform check
    // This can happen during early module loading
    console.log('[polyfills] ⚠️ React Native not available yet, assuming native platform');
  }

  // Default to native if Platform couldn't be determined
  if (!Platform) {
    Platform = { OS: 'ios' }; // Default to iOS for safety
  }

  // Only run on native platforms (web has these APIs natively)
  if (Platform && Platform.OS === 'web') {
    // Web platform already has these APIs
    console.log('[polyfills] ℹ️ Web platform - polyfills not needed');
    module.exports = {};
  } else {
    // Continue with polyfill setup for native platforms

    // Get global object (works in both Node.js and React Native)
    const globalObj = typeof global !== 'undefined' ? global : 
                      typeof globalThis !== 'undefined' ? globalThis :
                      typeof window !== 'undefined' ? window : {};

    /** @deprecated kept for reference; not invoked (EventTarget not required for current stack) */
    function setupEventTarget() {
  if (typeof globalObj.EventTarget !== 'undefined') {
    return; // Already available
  }

  try {
    // Try to use event-target-shim if available (optional dependency)
    let EventTargetClass = null;
    try {
      // Only try to require if it exists - don't break if package isn't installed
      // Use a more defensive require that handles Metro resolution issues
      let eventTargetShim = null;
      try {
        eventTargetShim = require('event-target-shim');
        // Verify we got something valid (not undefined)
        if (eventTargetShim === undefined || eventTargetShim === null) {
          eventTargetShim = null;
        }
      } catch (requireError) {
        // event-target-shim not installed or not available - use manual implementation
        // This is expected and fine
        eventTargetShim = null;
      }
      
      if (eventTargetShim) {
        EventTargetClass = eventTargetShim.EventTarget || 
                         eventTargetShim.default?.EventTarget || 
                         eventTargetShim;
      }
    } catch (e) {
      // event-target-shim not installed or not available - use manual implementation
      // This is expected and fine
    }

    if (!EventTargetClass) {
      // Manual EventTarget implementation
      class EventTarget {
        constructor() {
          this._listeners = new Map();
        }

        addEventListener(type, callback, options) {
          if (!this._listeners.has(type)) {
            this._listeners.set(type, []);
          }
          const listeners = this._listeners.get(type);
          if (!listeners.includes(callback)) {
            listeners.push(callback);
          }
        }

        removeEventListener(type, callback) {
          if (!this._listeners.has(type)) return;
          const listeners = this._listeners.get(type);
          const index = listeners.indexOf(callback);
          if (index > -1) {
            listeners.splice(index, 1);
          }
        }

        dispatchEvent(event) {
          if (!this._listeners.has(event.type)) return true;
          const listeners = this._listeners.get(event.type).slice();
          for (const listener of listeners) {
            try {
              if (typeof listener === 'function') {
                listener.call(this, event);
              } else if (listener && typeof listener.handleEvent === 'function') {
                listener.handleEvent(event);
              }
            } catch (e) {
              // Silently handle listener errors
            }
          }
          return !event.defaultPrevented;
        }
      }
      EventTargetClass = EventTarget;
    }

    // Set on all global objects
    globalObj.EventTarget = EventTargetClass;
    if (typeof globalThis !== 'undefined') globalThis.EventTarget = EventTargetClass;
    if (typeof window !== 'undefined') window.EventTarget = EventTargetClass;

    console.log('[polyfills] ✅ EventTarget installed');
  } catch (error) {
    console.error('[polyfills] ❌ Failed to install EventTarget:', error?.message);
  }
}

    /** Web Streams polyfill (ReadableStream, WritableStream, TransformStream) */
    function setupWebStreams() {
  if (typeof globalObj.ReadableStream !== 'undefined') {
    return; // Already available
  }

  try {
    let streamsPolyfill = null;
    let polyfillModule = null;
    
    // Try different ways to require web-streams-polyfill
    // It might export as default, named exports, or direct properties
    try {
      // Try direct require first
      polyfillModule = require('web-streams-polyfill');
      
      // If that returns undefined or null, try alternative paths
      if (!polyfillModule) {
        // Try requiring the dist file directly
        try {
          polyfillModule = require('web-streams-polyfill/dist/ponyfill.js');
        } catch (e) {
          // Fall through to error handling
        }
      }
    } catch (requireError) {
      // If require fails, check if it's a module resolution issue
      const errorMsg = requireError?.message || String(requireError);
      if (errorMsg.includes('unknown module') || errorMsg.includes('undefined')) {
        console.warn('[polyfills] ⚠️ web-streams-polyfill not found by Metro - this may be a bundler cache issue');
        console.warn('[polyfills] ⚠️ Try: npm start -- --reset-cache');
        console.warn('[polyfills] ⚠️ Error details:', errorMsg);
        // Don't throw - allow the app to continue, polyfills will just be unavailable
        polyfillModule = null;
      } else {
        // Re-throw other errors
        throw requireError;
      }
    }
    
    // Verify we got something valid - exit early if module not available
    if (!polyfillModule) {
      console.warn('[polyfills] ⚠️ web-streams-polyfill module not available - ReadableStream will not be polyfilled');
      // Don't throw - allow the app to continue without polyfills
      // The outer catch will handle this gracefully
      return; // Exit early from setupWebStreams function
    }
    
    // Handle different export patterns
    if (polyfillModule && typeof polyfillModule === 'object') {
      // Check for default export
      if (polyfillModule.default && typeof polyfillModule.default === 'object') {
        streamsPolyfill = polyfillModule.default;
      } 
      // Check for direct exports
      else if (polyfillModule.ReadableStream) {
        streamsPolyfill = polyfillModule;
      }
      // Check if the module itself is the polyfill object
      else {
        streamsPolyfill = polyfillModule;
      }
    } else if (polyfillModule) {
      streamsPolyfill = polyfillModule;
    }
    
    // Final check - make sure we have a valid object
    if (!streamsPolyfill || typeof streamsPolyfill !== 'object') {
      console.warn('[polyfills] ⚠️ web-streams-polyfill did not export a valid object');
      return; // Exit early instead of throwing
    }

    // Set up ReadableStream
    const ReadableStreamClass = streamsPolyfill.ReadableStream || 
                                streamsPolyfill.default?.ReadableStream;
    if (ReadableStreamClass) {
      globalObj.ReadableStream = ReadableStreamClass;
      if (typeof globalThis !== 'undefined') globalThis.ReadableStream = ReadableStreamClass;
      if (typeof window !== 'undefined') window.ReadableStream = ReadableStreamClass;
    }

    // Set up WritableStream
    const WritableStreamClass = streamsPolyfill.WritableStream || 
                                streamsPolyfill.default?.WritableStream;
    if (WritableStreamClass) {
      globalObj.WritableStream = WritableStreamClass;
      if (typeof globalThis !== 'undefined') globalThis.WritableStream = WritableStreamClass;
      if (typeof window !== 'undefined') window.WritableStream = WritableStreamClass;
    }

    // Set up TransformStream
    const TransformStreamClass = streamsPolyfill.TransformStream || 
                                 streamsPolyfill.default?.TransformStream;
    if (TransformStreamClass) {
      globalObj.TransformStream = TransformStreamClass;
      if (typeof globalThis !== 'undefined') globalThis.TransformStream = TransformStreamClass;
      if (typeof window !== 'undefined') window.TransformStream = TransformStreamClass;
    }

    // Verify installation
    if (globalObj.ReadableStream) {
      globalObj.__WEB_STREAMS_POLYFILLED__ = true;
      globalObj.__READABLE_STREAM_AVAILABLE__ = true;
      globalObj.__POLYFILLS_READY__ = true;
      
      // Also set on other global objects
      if (typeof globalThis !== 'undefined') {
        globalThis.__WEB_STREAMS_POLYFILLED__ = true;
        globalThis.__READABLE_STREAM_AVAILABLE__ = true;
      }
      if (typeof window !== 'undefined') {
        window.__WEB_STREAMS_POLYFILLED__ = true;
        window.__READABLE_STREAM_AVAILABLE__ = true;
      }
      
      console.log('[polyfills] ✅ Web Streams installed (ReadableStream available)');
    } else {
      // Log detailed error for debugging
      console.error('[polyfills] ❌ ReadableStream not found in web-streams-polyfill', {
        hasStreamsPolyfill: !!streamsPolyfill,
        streamsPolyfillKeys: streamsPolyfill ? Object.keys(streamsPolyfill).slice(0, 10) : [],
        streamsPolyfillType: typeof streamsPolyfill,
      });
      throw new Error('ReadableStream not found in web-streams-polyfill');
    }
  } catch (error) {
    console.error('[polyfills] ❌ Failed to install Web Streams:', error?.message);
    console.error('[polyfills] ❌ Error details:', {
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    
    // Don't throw - allow app to continue without full streaming support
    // The error will be caught and logged, but won't crash the app startup
    // However, set a minimal stub to prevent "Cannot read property 'ReadableStream' of undefined" errors
    if (!globalObj.ReadableStream) {
      console.warn('[polyfills] ⚠️ Setting minimal ReadableStream stub to prevent crashes');
      // Minimal stub that will prevent crashes but won't work for actual streaming
      globalObj.ReadableStream = class ReadableStreamStub {
        constructor() {
          throw new Error('ReadableStream polyfill failed to load. Please restart Metro with --reset-cache');
        }
      };
      if (typeof globalThis !== 'undefined') globalThis.ReadableStream = globalObj.ReadableStream;
      if (typeof window !== 'undefined') window.ReadableStream = globalObj.ReadableStream;
    }
  }
}

    function setupWebSocket() {
  if (typeof globalObj.WebSocket === 'undefined' || 
      typeof globalObj.EventTarget === 'undefined') {
    return; // WebSocket or EventTarget not available
  }

  try {
    const wsProto = globalObj.WebSocket.prototype;
    const etProto = globalObj.EventTarget.prototype;

    // Check if WebSocket already has EventTarget methods
    if (!wsProto.addEventListener && etProto.addEventListener) {
      wsProto.addEventListener = etProto.addEventListener.bind(wsProto);
      wsProto.removeEventListener = etProto.removeEventListener.bind(wsProto);
      wsProto.dispatchEvent = etProto.dispatchEvent.bind(wsProto);
      console.log('[polyfills] ✅ WebSocket extended with EventTarget methods');
    }
  } catch (error) {
    console.warn('[polyfills] ⚠️ Could not extend WebSocket:', error?.message);
  }
}

    setupWebStreams();

    if (typeof globalObj !== 'undefined') {
      const hasStreams = !!globalObj.ReadableStream;
      if (hasStreams) {
        console.log('[polyfills] ✅ ReadableStream polyfill ready');
        globalObj.__POLYFILLS_INSTALLED__ = true;
      } else {
        console.error('[polyfills] ❌ ReadableStream not installed - Supabase real-time may fail');
      }
    }

    // Export nothing (this file is for side effects only)
    module.exports = {};
  } // End of else block for native platforms
} catch (polyfillError) {
  // If polyfills fail to load, log error but don't break the app
  console.error('[polyfills] ❌ CRITICAL: Polyfill loading failed:', polyfillError?.message);
  console.error('[polyfills] ❌ Stack:', polyfillError?.stack?.split('\n').slice(0, 5).join('\n'));
  // Export empty object to prevent module resolution errors
  module.exports = {};
}
