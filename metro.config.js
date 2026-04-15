const { getDefaultConfig } = require('@expo/metro-config');
const { withShareExtension } = require('expo-share-extension/metro');
const path = require('path');
const os = require('os');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.maxWorkers = Math.max(1, Math.floor(os.cpus().length / 2));
config.resetCache = false;

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: false,
    },
  }),
};

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: false,
  alias: {
    '@': path.resolve(__dirname, '.'),
    'expo-location': path.resolve(__dirname, 'utils/expoLocationStub.ts'),
  },
  resolverMainFields: ['react-native', 'browser', 'main'],
  platforms: ['ios', 'android', 'native'],
  sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'],
  nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  resolveRequest(context, moduleName, platform) {
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
