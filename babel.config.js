module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must run first so React Compiler sees original source shape.
      'babel-plugin-react-compiler',
      [
        'module-resolver',
        {
          alias: {
            '@stores': './src/stores',
            '@': './src',
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      // Worklets plugin must be listed last
      'react-native-worklets/plugin',
    ],
  };
};
