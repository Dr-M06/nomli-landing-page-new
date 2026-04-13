const { getDefaultConfig } = require('@expo/metro-config');
const { withShareExtension } = require('expo-share-extension/metro');
const path = require('path');
const os = require('os');

const config = getDefaultConfig(__dirname);
/** Must keep a reference; context.resolveRequest can point at this same custom resolver → infinite hang. */
const defaultResolveRequest = config.resolver.resolveRequest;

config.maxWorkers = Math.max(1, Math.floor(os.cpus().length / 2));
config.resetCache = false;

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      // inlineRequires + large barrel imports (e.g. lucide-react-native) breaks Metro
      // (undefined icon components, require("undefined"), importedDefault errors).
      inlineRequires: false,
    },
  }),
};

const googleAdsWebStub = path.resolve(__dirname, '.web-stubs/react-native-google-mobile-ads.js');
/** Extends react-native-web Platform with `constants` (see `.web-stubs/Platform.web.js`). */
const platformWebStub = path.resolve(__dirname, '.web-stubs/Platform.web.js');
const rnLibrariesRoot = path.normalize(
  path.join(__dirname, 'node_modules', 'react-native', 'Libraries'),
);
const rnWebImage = path.resolve(
  __dirname,
  'node_modules/react-native-web/dist/cjs/exports/Image/index.js',
);
const rnWebNativeModules = path.resolve(
  __dirname,
  'node_modules/react-native-web/dist/cjs/exports/NativeModules/index.js',
);
const rnWebTurboModuleRegistry = path.resolve(
  __dirname,
  'node_modules/react-native-web/dist/cjs/vendor/react-native/TurboModule/TurboModuleRegistry.js',
);
const nativeDevSettingsWebStub = path.resolve(__dirname, '.web-stubs/NativeDevSettings.web.js');
const nativeSourceCodeWebStub = path.resolve(__dirname, '.web-stubs/NativeSourceCode.web.js');
const nativeWebSocketModuleWebStub = path.resolve(
  __dirname,
  '.web-stubs/NativeWebSocketModule.web.js',
);

/**
 * RN 0.76 has no `.web.js` for many `Libraries/*` modules. Web/SSR bundles (e.g. expo-router render)
 * still resolve them — map to react-native-web or local stubs. Native (ios/android) is unchanged.
 */
function resolveReactNativeLibraryWebStub(context, moduleName, platform) {
  if (platform !== 'web' || !context.originModulePath || !moduleName.startsWith('.')) {
    return null;
  }
  const resolved = path.normalize(path.join(path.dirname(context.originModulePath), moduleName));
  if (!resolved.startsWith(rnLibrariesRoot)) {
    return null;
  }
  const stubs = new Map([
    [path.normalize(path.join(rnLibrariesRoot, 'Utilities', 'Platform')), platformWebStub],
    [
      path.normalize(path.join(rnLibrariesRoot, 'StyleSheet', 'PlatformColorValueTypes')),
      path.resolve(__dirname, '.web-stubs/PlatformColorValueTypes.js'),
    ],
    [
      path.normalize(path.join(rnLibrariesRoot, 'NativeComponent', 'BaseViewConfig')),
      path.resolve(__dirname, '.web-stubs/BaseViewConfig.js'),
    ],
    [
      path.normalize(
        path.join(
          rnLibrariesRoot,
          'Components',
          'AccessibilityInfo',
          'legacySendAccessibilityEvent',
        ),
      ),
      path.resolve(__dirname, '.web-stubs/legacySendAccessibilityEvent.web.js'),
    ],
    [
      path.normalize(path.join(rnLibrariesRoot, 'Alert', 'RCTAlertManager')),
      path.resolve(__dirname, '.web-stubs/RCTAlertManager.web.js'),
    ],
    [
      path.normalize(
        path.join(rnLibrariesRoot, 'DevToolsSettings', 'DevToolsSettingsManager'),
      ),
      path.resolve(__dirname, '.web-stubs/DevToolsSettingsManager.web.js'),
    ],
    [path.normalize(path.join(rnLibrariesRoot, 'Image', 'Image')), rnWebImage],
    // DEV web: InitializeCore → LogBox → TurboModuleRegistry → BatchedBridge/NativeModules (needs native bridge).
    [path.normalize(path.join(rnLibrariesRoot, 'BatchedBridge', 'NativeModules')), rnWebNativeModules],
    [
      path.normalize(path.join(rnLibrariesRoot, 'TurboModule', 'TurboModuleRegistry')),
      rnWebTurboModuleRegistry,
    ],
    [
      path.normalize(path.join(rnLibrariesRoot, 'NativeModules', 'specs', 'NativeDevSettings')),
      nativeDevSettingsWebStub,
    ],
    [
      path.normalize(path.join(rnLibrariesRoot, 'NativeModules', 'specs', 'NativeSourceCode')),
      nativeSourceCodeWebStub,
    ],
    [
      path.normalize(path.join(rnLibrariesRoot, 'WebSocket', 'NativeWebSocketModule')),
      nativeWebSocketModuleWebStub,
    ],
  ]);
  const hit = stubs.get(resolved);
  return hit ? { type: 'sourceFile', filePath: hit } : null;
}

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: false,
  alias: {
    '@': path.resolve(__dirname, '.'),
    // Package removed from node_modules; stub avoids GPS/native module.
    'expo-location': path.resolve(__dirname, 'utils/expoLocationStub.ts'),
  },
  resolverMainFields: ['react-native', 'browser', 'main'],
  platforms: ['ios', 'android', 'web', 'native'],
  sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'],
  nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  resolveRequest(context, moduleName, platform) {
    if (
      platform === 'web' &&
      (moduleName === 'react-native-google-mobile-ads' ||
        moduleName.startsWith('react-native-google-mobile-ads/'))
    ) {
      return { type: 'sourceFile', filePath: googleAdsWebStub };
    }
    const rnStub = resolveReactNativeLibraryWebStub(context, moduleName, platform);
    if (rnStub) {
      return rnStub;
    }
    if (typeof defaultResolveRequest === 'function') {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return require('metro-resolver').resolve(context, moduleName, platform);
  },
};

const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : (config.resolver.blockList ? [config.resolver.blockList] : []);

config.resolver.blockList = [
  ...existingBlockList,
  /node_modules\.__old__.*\/.*/,
];

config.projectRoot = path.resolve(__dirname);

module.exports = withShareExtension(config);
