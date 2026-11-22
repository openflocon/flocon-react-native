// Expo config plugin of Flocon: `"plugins": ["@openflocon/react-native"]` in app.json.
const { withInfoPlist } = require('expo/config-plugins');

const DEFAULT_DESCRIPTION = 'Flocon connects to the Flocon desktop app on your computer to debug this app.';

/**
 * iOS: adds NSLocalNetworkUsageDescription, needed to reach the computer running Flocon from a device, when the app
 * does not have one. Android needs nothing: the INTERNET permission is in every React Native app.
 */
function withFlocon(config, options = {}) {
  return withInfoPlist(config, (c) => {
    if (!c.modResults.NSLocalNetworkUsageDescription) {
      c.modResults.NSLocalNetworkUsageDescription = options.localNetworkUsageDescription || DEFAULT_DESCRIPTION;
    }
    return c;
  });
}

module.exports = withFlocon;
