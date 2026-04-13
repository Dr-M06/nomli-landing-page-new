/**
 * Web Platform shim: react-native-web's Platform has no `constants`, but RN core
 * (e.g. ReactNativeVersionCheck) reads Platform.constants.reactNativeVersion.
 */
'use strict';

const rnWebPlatform = require('react-native-web/dist/cjs/exports/Platform').default;
const { version } = require('../node_modules/react-native/Libraries/Core/ReactNativeVersion');

const Platform = {
  ...rnWebPlatform,
  constants: {
    reactNativeVersion: {
      major: version.major,
      minor: version.minor,
      patch: version.patch,
      prerelease: version.prerelease,
    },
  },
};

module.exports = Platform;
module.exports.default = Platform;
