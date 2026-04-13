/**
 * Web stub for RN's NativeDevSettings (TurboModuleRegistry.getEnforcing('DevSettings')).
 * The real module is native-only; loading it on web crashes during InitializeCore / HMR / DevSettings.
 */
const noop = () => {};

const NativeDevSettings = {
  reload: noop,
  reloadWithReason: noop,
  onFastRefresh: noop,
  setHotLoadingEnabled: noop,
  setIsDebuggingRemotely: noop,
  setProfilingEnabled: noop,
  toggleElementInspector: noop,
  addMenuItem: noop,
  openDebugger: noop,
  addListener: noop,
  removeListeners: noop,
  setIsShakeToShowDevMenuEnabled: noop,
};

module.exports = NativeDevSettings;
module.exports.default = NativeDevSettings;
