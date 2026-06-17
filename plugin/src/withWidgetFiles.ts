import { ConfigPlugin, withDangerousMod } from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

import { getExtensionSwiftSources, getPackageRoot } from "./paths";
import { buildPlist } from "./plist";

export interface WidgetFilesOptions {
  widgetName: string;
  /** App-group id to embed in the extension entitlements, or `undefined`. */
  appGroup?: string;
}

/**
 * Copy the canonical SwiftUI sources into `ios/<widgetName>/` and write the
 * extension's `Info.plist` + `<widgetName>.entitlements`.
 *
 * Uses `withDangerousMod('ios', ...)` because we're writing real files to the
 * prebuilt `ios/` directory (the `xcode` mod only edits the pbxproj, it can't
 * create the Swift files the Sources phase references). The mod runs BEFORE the
 * xcodeproj mod is committed — Expo orders `dangerous` mods ahead of the typed
 * `xcodeproj` mod within a platform — so by the time the target's Sources phase
 * is wired up, the files already exist on disk.
 *
 * Everything here is idempotent: copying overwrites with identical bytes and
 * `mkdir` is recursive, so re-running `expo prebuild` is a no-op in effect.
 */
export const withWidgetFiles: ConfigPlugin<WidgetFilesOptions> = (
  config,
  { widgetName, appGroup },
) =>
  withDangerousMod(config, [
    "ios",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot; // <root>/ios
      const targetDir = path.join(platformRoot, widgetName);
      fs.mkdirSync(targetDir, { recursive: true });

      // 1. Copy the three Swift sources from the installed package.
      const packageRoot = getPackageRoot();
      for (const source of getExtensionSwiftSources(packageRoot)) {
        if (!fs.existsSync(source.absolutePath)) {
          throw new Error(
            `[react-native-live-activity-kit] Expected Swift source not found: ${source.absolutePath}. ` +
              `The package may be installed incompletely (check that 'ios' and 'plugin/swift' are present).`,
          );
        }
        fs.copyFileSync(
          source.absolutePath,
          path.join(targetDir, source.basename),
        );
      }

      // 2. Write the extension Info.plist. We set the keys explicitly (rather
      //    than relying solely on GENERATE_INFOPLIST_FILE) so the NSExtension
      //    point is guaranteed correct — a wrong/absent NSExtensionPointIdentifier
      //    is the classic "extension builds but never renders" failure.
      const infoPlist = buildPlist({
        CFBundleDevelopmentRegion: "$(DEVELOPMENT_LANGUAGE)",
        CFBundleDisplayName: widgetName,
        CFBundleExecutable: "$(EXECUTABLE_NAME)",
        CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
        CFBundleInfoDictionaryVersion: "6.0",
        CFBundleName: "$(PRODUCT_NAME)",
        CFBundlePackageType: "$(PRODUCT_BUNDLE_PACKAGE_TYPE)",
        CFBundleShortVersionString: "$(MARKETING_VERSION)",
        CFBundleVersion: "$(CURRENT_PROJECT_VERSION)",
        NSExtension: {
          NSExtensionPointIdentifier: "com.apple.widgetkit-extension",
        },
      });
      fs.writeFileSync(path.join(targetDir, "Info.plist"), infoPlist);

      // 3. Write the extension entitlements. App Groups only when requested;
      //    Live Activities themselves do not require an app group, so the file
      //    is an empty <dict/> otherwise (the build setting still references it).
      const entitlements = appGroup
        ? buildPlist({
            "com.apple.security.application-groups": [appGroup],
          })
        : buildPlist({});
      fs.writeFileSync(
        path.join(targetDir, `${widgetName}.entitlements`),
        entitlements,
      );

      // Surface where things landed; helps when debugging an EAS prebuild log.
      void projectRoot;

      return cfg;
    },
  ]);
