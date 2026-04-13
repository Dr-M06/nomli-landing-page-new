/**
 * Disable console.log/info/warn/debug in production.
 * Must be imported after 'react-native' (so __DEV__ is set) and before 'expo-router/entry'.
 * console.error is left so production crashes can still be inspected when needed.
 */
if (typeof __DEV__ !== 'undefined' && !__DEV__) {
  const noop = () => {};
  if (typeof global !== 'undefined' && global.console) {
    global.console.log = noop;
    global.console.info = noop;
    global.console.warn = noop;
    global.console.debug = noop;
  }
}
