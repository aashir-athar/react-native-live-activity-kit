/**
 * Expo config plugin for `react-native-live-activity-kit`.
 *
 * Scaffolds a PURE-SwiftUI iOS Widget Extension that renders Live Activities.
 * No JavaScript runs inside the extension — the appex links only ActivityKit /
 * WidgetKit / SwiftUI and shares the `LiveActivityKitAttributes` type with the
 * app by bare name. Running JS in a widget appex is what triggers the
 * Hermes-in-appex blank-render bug; this plugin deliberately avoids it by never
 * embedding the React Native runtime in the extension.
 *
 * What it does, each as a discrete `withX` mod so failures are localised:
 *
 *   1. App `Info.plist`     — `NSSupportsLiveActivities` (+ FrequentUpdates).
 *   2. App entitlements     — `aps-environment` (push) + App Group (optional).
 *   3. EAS app-extension    — register the appex under
 *      `extra.eas.build.experimental.ios.appExtensions` so EAS Build provisions
 *      a bundle id and (optional) App Group for the extension. Without this,
 *      EAS-managed credentials don't know the appex exists and signing fails.
 *   4. Widget files         — copy the SwiftUI + shared attributes file and
 *      write the extension `Info.plist` / `.entitlements` (dangerous mod).
 *   5. Xcode target         — add the app-extension `PBXNativeTarget`, embed it,
 *      and depend on it (node-xcode; the fragile part — see
 *      `withWidgetXcodeTarget`).
 *
 * Usage in `app.json` / `app.config.ts`:
 *
 *   ["react-native-live-activity-kit", {
 *     "widgetName": "MyLiveActivity",
 *     "deploymentTarget": "16.2",
 *     "appGroup": "group.com.acme.app",
 *     "frequentUpdates": true,
 *     "enablePush": true
 *   }]
 */

import {
  ConfigPlugin,
  createRunOncePlugin,
  withEntitlementsPlist,
  withInfoPlist,
} from "@expo/config-plugins";

import { withWidgetFiles } from "./withWidgetFiles";
import { withWidgetXcodeTarget } from "./withWidgetXcodeTarget";

const pkg = require("../../package.json") as { name: string; version: string };

export interface Options {
  /** Name of the widget extension target / folder. Default `LiveActivityKitWidget`. */
  widgetName?: string;
  /** iOS deployment target for the extension. Default `16.2`. */
  deploymentTarget?: string;
  /**
   * App Group id. When set, the App Groups entitlement (with this id) is added
   * to BOTH the app and the extension — needed only to share extra data
   * (images / large state), not for Live Activities themselves.
   */
  appGroup?: string;
  /**
   * Add `NSSupportsLiveActivitiesFrequentUpdates` to the app Info.plist.
   * Default `false`.
   */
  frequentUpdates?: boolean;
  /**
   * Ensure the `aps-environment` entitlement (development) on the APP target so
   * push-driven Live Activity updates work. Default `true`.
   */
  enablePush?: boolean;
}

const DEFAULTS: Required<Pick<Options, "widgetName" | "deploymentTarget">> & {
  frequentUpdates: boolean;
  enablePush: boolean;
} = {
  widgetName: "LiveActivityKitWidget",
  deploymentTarget: "16.2",
  frequentUpdates: false,
  enablePush: true,
};

const APP_GROUPS_KEY = "com.apple.security.application-groups";

// ───────────────────────────────────────────────────────────────────────────
// 1. App Info.plist — Live Activity support flags.
// ───────────────────────────────────────────────────────────────────────────

const withLiveActivityInfoPlist: ConfigPlugin<{ frequentUpdates: boolean }> = (
  config,
  { frequentUpdates },
) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    if (frequentUpdates) {
      cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    }
    return cfg;
  });

// ───────────────────────────────────────────────────────────────────────────
// 2. App entitlements — push + App Group (on the app side).
// ───────────────────────────────────────────────────────────────────────────

const withAppEntitlements: ConfigPlugin<{
  enablePush: boolean;
  appGroup?: string;
}> = (config, { enablePush, appGroup }) =>
  withEntitlementsPlist(config, (cfg) => {
    if (enablePush && !cfg.modResults["aps-environment"]) {
      // `development` is correct for dev + TestFlight; EAS rewrites this to
      // `production` for store builds via its credentials flow.
      cfg.modResults["aps-environment"] = "development";
    }

    if (appGroup) {
      const existing = Array.isArray(cfg.modResults[APP_GROUPS_KEY])
        ? (cfg.modResults[APP_GROUPS_KEY] as string[])
        : [];
      if (!existing.includes(appGroup)) {
        cfg.modResults[APP_GROUPS_KEY] = [...existing, appGroup];
      }
    }

    return cfg;
  });

// ───────────────────────────────────────────────────────────────────────────
// 3. EAS app-extension registration (so EAS Build provisions the appex).
// ───────────────────────────────────────────────────────────────────────────

const withEasAppExtension: ConfigPlugin<{
  widgetName: string;
  bundleIdentifier: string;
  appGroup?: string;
}> = (config, { widgetName, bundleIdentifier, appGroup }) => {
  const appExtensions =
    config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? [];

  const entry: Record<string, unknown> = { targetName: widgetName, bundleIdentifier };
  if (appGroup) {
    entry.entitlements = { [APP_GROUPS_KEY]: [appGroup] };
  }

  const existingIndex = appExtensions.findIndex(
    (ext: { targetName?: string }) => ext.targetName === widgetName,
  );
  const nextAppExtensions =
    existingIndex >= 0
      ? appExtensions.map((ext: unknown, i: number) =>
          i === existingIndex ? { ...(ext as object), ...entry } : ext,
        )
      : [...appExtensions, entry];

  config.extra = {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      build: {
        ...config.extra?.eas?.build,
        experimental: {
          ...config.extra?.eas?.build?.experimental,
          ios: {
            ...config.extra?.eas?.build?.experimental?.ios,
            appExtensions: nextAppExtensions,
          },
        },
      },
    },
  };

  return config;
};

// ───────────────────────────────────────────────────────────────────────────
// Entry point.
// ───────────────────────────────────────────────────────────────────────────

const withLiveActivityKit: ConfigPlugin<Options | void> = (config, options) => {
  const opts = { ...DEFAULTS, ...(options ?? {}) };
  const widgetName = opts.widgetName;

  const appBundleId = config.ios?.bundleIdentifier;
  if (!appBundleId) {
    // Without the app bundle id we can't derive the extension's id, and EAS
    // signing would fail anyway. Fail loud and early with an actionable message.
    throw new Error(
      "[react-native-live-activity-kit] `ios.bundleIdentifier` must be set in your app config before this plugin runs " +
        "(it derives the widget extension bundle id from it).",
    );
  }
  const extensionBundleId = `${appBundleId}.${widgetName}`;

  // 1. App Info.plist.
  config = withLiveActivityInfoPlist(config, {
    frequentUpdates: opts.frequentUpdates,
  });

  // 2. App entitlements.
  config = withAppEntitlements(config, {
    enablePush: opts.enablePush,
    appGroup: opts.appGroup,
  });

  // 3. EAS app-extension registration.
  config = withEasAppExtension(config, {
    widgetName,
    bundleIdentifier: extensionBundleId,
    appGroup: opts.appGroup,
  });

  // 4. Write the extension's Swift sources, Info.plist and entitlements.
  config = withWidgetFiles(config, {
    widgetName,
    appGroup: opts.appGroup,
  });

  // 5. Create + embed the Xcode target (must run after the files exist).
  config = withWidgetXcodeTarget(config, {
    widgetName,
    bundleIdentifier: extensionBundleId,
    deploymentTarget: opts.deploymentTarget,
  });

  return config;
};

export default createRunOncePlugin(
  withLiveActivityKit,
  pkg.name,
  pkg.version,
);
