/**
 * Web stub for RN's NativeSourceCode (TurboModuleRegistry.getEnforcing('SourceCode')).
 * With TurboModuleRegistry mapped to react-native-web, getEnforcing always throws;
 * this module provides scriptURL for getDevServer / asset resolution on web.
 */
const NativeSourceCode = {
  getConstants() {
    if (typeof globalThis !== 'undefined' && globalThis.location?.href) {
      return { scriptURL: globalThis.location.href };
    }
    return { scriptURL: '' };
  },
};

module.exports = NativeSourceCode;
module.exports.default = NativeSourceCode;
