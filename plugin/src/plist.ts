/**
 * Minimal, dependency-free plist (XML) serialiser.
 *
 * The plugin only writes two small, fixed-shape plists (the extension's
 * `Info.plist` and its `.entitlements`), so we render them directly rather than
 * taking a runtime dependency on `@expo/plist` / `plist` (neither is a declared
 * dependency of this package; relying on a hoisted transitive would be fragile
 * under EAS's clean installs). Supported value types: string, boolean, number,
 * array, and nested object — which is everything these two files use.
 */
type PlistValue =
  | string
  | boolean
  | number
  | PlistValue[]
  | { [key: string]: PlistValue };

const DOCTYPE =
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderValue(value: PlistValue, indent: string): string {
  if (typeof value === "string") {
    return `${indent}<string>${escapeXml(value)}</string>`;
  }
  if (typeof value === "boolean") {
    return `${indent}<${value ? "true" : "false"}/>`;
  }
  if (typeof value === "number") {
    const tag = Number.isInteger(value) ? "integer" : "real";
    return `${indent}<${tag}>${value}</${tag}>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}<array/>`;
    }
    const inner = value
      .map((item) => renderValue(item, indent + "\t"))
      .join("\n");
    return `${indent}<array>\n${inner}\n${indent}</array>`;
  }
  // object
  return renderDict(value, indent);
}

function renderDict(
  obj: { [key: string]: PlistValue },
  indent: string,
): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return `${indent}<dict/>`;
  }
  const inner = keys
    .map((key) => {
      const keyLine = `${indent}\t<key>${escapeXml(key)}</key>`;
      const valueLine = renderValue(obj[key], indent + "\t");
      return `${keyLine}\n${valueLine}`;
    })
    .join("\n");
  return `${indent}<dict>\n${inner}\n${indent}</dict>`;
}

export function buildPlist(root: { [key: string]: PlistValue }): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    DOCTYPE,
    '<plist version="1.0">',
    renderDict(root, ""),
    "</plist>",
    "",
  ].join("\n");
}
