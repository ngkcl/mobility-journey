const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Stub out native-only modules so Metro doesn't crash in Expo Go
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const nativeOnly = [
    'react-native-nitro-modules',
    '@kingstinct/react-native-healthkit',
  ];
  if (nativeOnly.includes(moduleName)) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
