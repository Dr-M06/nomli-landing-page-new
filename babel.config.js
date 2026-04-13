module.exports = function(api) {
  // Do not call api.cache(true) here - it calls .forever() and then presets/plugins
  // (e.g. babel-preset-expo) that call api.cache.using() trigger:
  // "Caching has already been configured with .never or .forever()"
  const isProduction = api.env('production') || process.env.NODE_ENV === 'production';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
          },
        },
      ],
      // Remove ALL console statements in production builds
      ...(isProduction
        ? [
            [
              'transform-remove-console',
              {
                // Remove all console.* statements (log, info, debug, warn, error)
                // No exclusions - fully production-ready
              },
            ],
          ]
        : []),
    ],
  };
};

