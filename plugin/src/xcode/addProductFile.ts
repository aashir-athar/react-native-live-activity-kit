import { XcodeProject } from "@expo/config-plugins";

/**
 * Register the `<targetName>.appex` product as a PBXFileReference so the new
 * target has something to produce and the app's "Embed Foundation Extensions"
 * copy-files phase has something to embed.
 *
 * `node-xcode`'s `addProductFile` returns an object carrying both `uuid`
 * (build-file) and `fileRef` (file-reference) ids that the later phases need.
 */
export function addProductFile(
  xcodeProject: XcodeProject,
  { targetName, groupName }: { targetName: string; groupName: string },
): { uuid: string; fileRef: string; target: string; basename: string; group: string } {
  const options = {
    basename: `${targetName}.appex`,
    group: groupName,
    explicitFileType: "wrapper.app-extension",
    settings: {
      ATTRIBUTES: ["RemoveHeadersOnCopy"],
    },
    includeInIndex: 0,
    path: `${targetName}.appex`,
    sourceTree: "BUILT_PRODUCTS_DIR",
  };

  // The `xcode` typings are loose here; the runtime object has the extra
  // `uuid`/`fileRef`/`target`/`basename`/`group` fields we read downstream.
  return xcodeProject.addProductFile(targetName, options) as unknown as {
    uuid: string;
    fileRef: string;
    target: string;
    basename: string;
    group: string;
  };
}
