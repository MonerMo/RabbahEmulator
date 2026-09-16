const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// The bridge package lives outside this folder (device-lib/rn-bridge) and is linked into
// node_modules by  "@rabbah/mdb-device": "file:../device-lib/rn-bridge".  Metro must:
//   1. watch that folder, or edits there are invisible;
//   2. resolve the bridge's own imports (react, react-native) from THIS node_modules;
//   3. read the bridge's TypeScript source - we never build its lib/ folder.
const bridge = path.resolve(__dirname, '../device-lib/rn-bridge');

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  watchFolders: [bridge],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    unstable_conditionNames: ['rabbah-mdb-device-source', 'react-native'],   // Metro adds require/import itself
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
