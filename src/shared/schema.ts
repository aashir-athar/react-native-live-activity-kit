/**
 * Shared, isomorphic content-state schema for `react-native-live-activity-kit`.
 *
 * This file is the **single source of truth** for the shape of a Live Activity's
 * mutable content state. It is imported by BOTH the client (`src/index.ts`) and
 * the Node server SDK (`src/server`), and it is mirrored field-for-field by the
 * SwiftUI `ContentState` struct that the config plugin scaffolds into the widget
 * extension. Because the same keys flow across JS → APNs JSON → Swift `Codable`,
 * a payload that type-checks is guaranteed to decode into the rendered Activity.
 *
 * It MUST stay free of any React Native or Node imports so it can be consumed
 * from a phone app and a backend alike.
 *
 * @packageDocumentation
 */

/**
 * The mutable content state of a Live Activity. Every field except {@link title}
 * is optional. The keys here are exactly the keys sent in the APNs
 * `aps.content-state` object and decoded by the SwiftUI template.
 */
export interface LiveActivityState {
  /** Primary headline (Lock Screen + expanded Dynamic Island). */
  title: string;
  /** Secondary line under the title. */
  subtitle?: string;
  /** Longer descriptive text shown on the Lock Screen. */
  body?: string;
  /** Short status label, e.g. `"On the way"`. */
  status?: string;
  /** Progress in `[0, 1]`; the template renders a progress bar when set. */
  progress?: number;
  /** Epoch **milliseconds** the template uses for a live timer / countdown. */
  date?: number;
  /** SF Symbol name rendered as the glyph (e.g. `"bicycle"`). */
  imageName?: string;
  /** Accent color as `#RRGGBB` / `#AARRGGBB`. */
  tintColorHex?: string;
  /** Compact Dynamic Island leading text. */
  leading?: string;
  /** Compact Dynamic Island trailing text. */
  trailing?: string;
  /** Custom string key/values the SwiftUI template may render. */
  extra?: Record<string, string>;
}

/**
 * Immutable attributes set once when the activity starts. These never change for
 * the lifetime of the activity (ActivityKit `ActivityAttributes`).
 */
export interface LiveActivityAttributesData {
  /** Logical name of the activity, e.g. `"Order #1234"`. */
  name: string;
  /** Custom immutable string key/values. */
  extra?: Record<string, string>;
}

/** How the system should remove the activity from the UI when it ends. */
export type DismissalPolicy = 'default' | 'immediate' | 'after';

/** Optional banner shown when an update arrives while the app is backgrounded. */
export interface AlertConfig {
  /** Alert title. */
  title: string;
  /** Alert body. */
  body: string;
  /** Optional sound name; omit for the default sound. */
  sound?: string;
}

/**
 * Lifecycle state of an activity, mirrored from ActivityKit `ActivityState`
 * (`active` / `pending` / `stale` / `ended` / `dismissed`). `unknown` is used
 * when the native value is unrecognised or off-iOS.
 */
export type ActivityState =
  | 'active'
  | 'pending'
  | 'stale'
  | 'ended'
  | 'dismissed'
  | 'unknown';

// ---------------------------------------------------------------------------
// Isomorphic helpers (used by both client and server)
// ---------------------------------------------------------------------------

/** Clamp a finite number into `[min, max]`; non-finite returns `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Validate and normalize a {@link LiveActivityState} into a plain object safe to
 * cross the bridge / serialize to APNs. Throws on a missing/empty `title`,
 * clamps `progress` to `[0, 1]`, drops `undefined` fields, and coerces `extra`
 * values to strings. The returned object only contains defined keys.
 */
export function normalizeState(state: LiveActivityState): LiveActivityState {
  if (state == null || typeof state.title !== 'string' || state.title.length === 0) {
    throw new Error(
      'react-native-live-activity-kit: a Live Activity content state requires a non-empty `title`.'
    );
  }
  const out: LiveActivityState = { title: state.title };
  if (state.subtitle != null) out.subtitle = String(state.subtitle);
  if (state.body != null) out.body = String(state.body);
  if (state.status != null) out.status = String(state.status);
  if (state.progress != null) out.progress = clamp(state.progress, 0, 1);
  if (state.date != null) out.date = Math.round(Number(state.date));
  if (state.imageName != null) out.imageName = String(state.imageName);
  if (state.tintColorHex != null) out.tintColorHex = String(state.tintColorHex);
  if (state.leading != null) out.leading = String(state.leading);
  if (state.trailing != null) out.trailing = String(state.trailing);
  if (state.extra != null) out.extra = sanitizeStringMap(state.extra);
  return out;
}

/** Coerce a record's values to strings, dropping non-string-coercible entries. */
export function sanitizeStringMap(
  map: Record<string, string> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!map) return out;
  for (const [key, value] of Object.entries(map)) {
    if (value == null) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * Accept a `Date`, epoch-ms `number`, or `undefined` and return epoch
 * milliseconds (or `undefined`). Shared so the client and server interpret
 * `staleDate` / `dismissalDate` identically.
 */
export function toEpochMs(value: Date | number | undefined): number | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  return undefined;
}
