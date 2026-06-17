import { ConfigPlugin, withXcodeProject } from "@expo/config-plugins";

import { getExtensionSwiftSources, getPackageRoot } from "./paths";
import { addBuildPhases } from "./xcode/addBuildPhases";
import { addPbxGroup } from "./xcode/addPbxGroup";
import { addProductFile } from "./xcode/addProductFile";
import { addTargetDependency } from "./xcode/addTargetDependency";
import { addToPbxNativeTargetSection } from "./xcode/addToPbxNativeTargetSection";
import { addToPbxProjectSection } from "./xcode/addToPbxProjectSection";
import { addXCConfigurationList } from "./xcode/addXCConfigurationList";

export interface WidgetXcodeTargetOptions {
  widgetName: string;
  /** `<appBundleId>.<widgetName>` — computed by the entrypoint. */
  bundleIdentifier: string;
  deploymentTarget: string;
}

/**
 * Add the widget-extension `PBXNativeTarget` to the Xcode project.
 *
 * ⚠️ Adding an app-extension target via node-xcode is inherently fragile: the
 * pbxproj is a hand-rolled object graph and the `xcode` package exposes only a
 * thin, partially-typed wrapper. This implementation deliberately follows the
 * exact call sequence proven by `software-mansion-labs/expo-live-activity`
 * (which scaffolded an identical Live Activity extension target) rather than
 * inventing one:
 *
 *   1. addXCConfigurationList   — Debug/Release build settings
 *   2. addProductFile           — the `.appex` product reference
 *   3. addToPbxNativeTargetSection — the target itself (app-extension type)
 *   4. addToPbxProjectSection   — register target + TargetAttributes
 *   5. addTargetDependency      — app target depends on the extension
 *   6. addBuildPhases           — Sources/Frameworks/Resources + app's Embed phase
 *   7. addPbxGroup              — navigator group for the files
 *
 * Idempotency: if a target named `<widgetName>` already exists (re-running
 * `expo prebuild`, or prebuild over a committed `ios/`), we bail out early so
 * the steps above never duplicate the target, product, or phases.
 */
export const withWidgetXcodeTarget: ConfigPlugin<WidgetXcodeTargetOptions> = (
  config,
  { widgetName, bundleIdentifier, deploymentTarget },
) =>
  withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;

    // ── Idempotency guard ──────────────────────────────────────────────
    // `pbxTargetByName` returns the target if one with this name exists.
    const existingTarget = (
      xcodeProject as unknown as {
        pbxTargetByName(name: string): unknown;
      }
    ).pbxTargetByName(widgetName);
    if (existingTarget) {
      return cfg;
    }

    const targetUuid = xcodeProject.generateUuid();
    // "Embed Foundation Extensions" is the canonical group/phase name Xcode
    // itself uses for embedded app extensions; reusing it keeps the project
    // looking native and lets the copy-files phase land in the right place.
    const groupName = "Embed Foundation Extensions";
    const marketingVersion = cfg.version ?? "1.0";
    const currentProjectVersion = cfg.ios?.buildNumber || "1";

    // The Swift sources written by `withWidgetFiles` (referenced by basename;
    // the PBXGroup is rooted at `ios/<widgetName>/`).
    const swiftBasenames = getExtensionSwiftSources(getPackageRoot()).map(
      (s) => s.basename,
    );

    const xCConfigurationList = addXCConfigurationList(xcodeProject, {
      targetName: widgetName,
      currentProjectVersion,
      bundleIdentifier,
      deploymentTarget,
      marketingVersion,
    });

    const productFile = addProductFile(xcodeProject, {
      targetName: widgetName,
      groupName,
    });

    const target = addToPbxNativeTargetSection(xcodeProject, {
      targetName: widgetName,
      targetUuid,
      productFile,
      xCConfigurationList,
    });

    addToPbxProjectSection(xcodeProject, target);

    addTargetDependency(xcodeProject, target);

    addBuildPhases(xcodeProject, {
      targetUuid,
      groupName,
      productFile,
      swiftFiles: swiftBasenames,
    });

    addPbxGroup(xcodeProject, {
      targetName: widgetName,
      // List the on-disk files so they appear under the navigator group.
      files: [...swiftBasenames, "Info.plist", `${widgetName}.entitlements`],
    });

    return cfg;
  });
