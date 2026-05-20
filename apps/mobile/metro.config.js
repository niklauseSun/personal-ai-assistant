const path = require("node:path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const sharedPackagePath = path.resolve(__dirname, "../../packages/shared/src");
const sharedPackageEntry = path.join(sharedPackagePath, "index.ts");

const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === "@personal-ai-assistant/shared") {
        return context.resolveRequest(context, sharedPackageEntry, platform);
      }

      return context.resolveRequest(context, moduleName, platform);
    },
    extraNodeModules: {
      "@personal-ai-assistant/shared": sharedPackagePath
    }
  },
  watchFolders: [sharedPackagePath]
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
