import * as fs from "fs";
import * as path from "path";

/**
 * Resolve the package root of `react-native-live-activity-kit` so we can read
 * the canonical Swift sources that get copied into the generated extension.
 *
 * At runtime this module lives at `<pkg>/plugin/build/paths.js`, so the package
 * root is two directories up. We confirm by looking for `package.json` rather
 * than trusting the relative jump blindly — if the layout ever changes (e.g.
 * a bundler flattens `plugin/build`), we fall back to `require.resolve`, which
 * works whenever the package is installed under `node_modules`.
 */
export function getPackageRoot(): string {
  const fromBuildDir = path.resolve(__dirname, "..", "..");
  if (fs.existsSync(path.join(fromBuildDir, "package.json"))) {
    return fromBuildDir;
  }

  try {
    return path.dirname(
      require.resolve("react-native-live-activity-kit/package.json"),
    );
  } catch {
    // Last resort: assume the two-levels-up guess even if package.json was not
    // found (covers monorepo hoisting quirks during local development).
    return fromBuildDir;
  }
}

/**
 * The three Swift files that must be compiled into the widget extension.
 *
 *   - `LiveActivityKitAttributes.swift` lives in `ios/` because it is the
 *     SHARED source of truth also compiled into the app via the pod. The plugin
 *     copies (does not symlink) it so the extension owns its own membership and
 *     EAS's clean checkout has the bytes it needs.
 *   - The two UI files ship under `plugin/swift/` precisely so they are only
 *     ever compiled into the extension (never the app).
 *
 * `package.json#files` includes both `ios` and `plugin/swift`, so all three are
 * present in the published tarball.
 */
export function getExtensionSwiftSources(packageRoot: string): {
  absolutePath: string;
  basename: string;
}[] {
  const sources = [
    path.join(packageRoot, "ios", "LiveActivityKitAttributes.swift"),
    path.join(packageRoot, "plugin", "swift", "LiveActivityKitLiveActivity.swift"),
    path.join(packageRoot, "plugin", "swift", "LiveActivityKitWidgetBundle.swift"),
  ];

  return sources.map((absolutePath) => ({
    absolutePath,
    basename: path.basename(absolutePath),
  }));
}
