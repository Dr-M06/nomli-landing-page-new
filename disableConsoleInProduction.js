/**
 * Console noise control (runs before expo-router entry).
 *
 * Production: console.log / info / warn / debug are no-ops. console.error stays (and Babel may strip logs in release).
 * Development (default): same quiet behavior so Metro/Xcode match production-style output.
 * Development verbose: set EXPO_PUBLIC_VERBOSE_LOGS=true (or 1 / yes) in .env and restart Metro.
 */
function isVerboseDevLoggingEnabled() {
  try {
    const v = process.env.EXPO_PUBLIC_VERBOSE_LOGS;
    return v === 'true' || v === '1' || v === 'yes';
  } catch {
    return false;
  }
}

if (typeof global !== 'undefined' && global.console) {
  const noop = () => {};
  const production = typeof __DEV__ !== 'undefined' && !__DEV__;
  const devQuiet =
    typeof __DEV__ !== 'undefined' && __DEV__ && !isVerboseDevLoggingEnabled();

  if (production || devQuiet) {
    global.console.log = noop;
    global.console.info = noop;
    global.console.warn = noop;
    global.console.debug = noop;
  }
}
