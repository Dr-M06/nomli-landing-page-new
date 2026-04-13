/**
 * RN 0.76+ has no DevToolsSettingsManager for web; Core/setUpReactDevTools requires this module.
 * No-op implementation — devtools settings persistence is native-only.
 */
const DevToolsSettingsManager = {
  setConsolePatchSettings() {},
  getConsolePatchSettings() {
    return null;
  },
  setProfilingSettings() {},
  getProfilingSettings() {
    return null;
  },
  reload() {},
};

module.exports = DevToolsSettingsManager;
