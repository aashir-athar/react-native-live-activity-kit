/**
 * Nitro struct types for `react-native-live-activity-kit`.
 *
 * Flat, primitive-friendly shapes that cross the JS <-> native bridge. Nullable
 * fields use optional (`?`) so Nitrogen emits `std::optional` / Swift optionals.
 * `extra` maps are required (`Record<string, string>`) and default to `{}` from
 * JS to keep the native Codable decode simple. The ergonomic public types live
 * in `src/types.ts` + `src/shared/schema.ts`; the wrapper in `src/index.ts`
 * converts between the two.
 */

/** Mutable content state. Mirrors `LiveActivityState` in `src/shared/schema.ts`. */
export interface NativeLiveActivityState {
  title: string;
  subtitle?: string;
  body?: string;
  status?: string;
  progress?: number;
  /** Epoch milliseconds. */
  date?: number;
  imageName?: string;
  tintColorHex?: string;
  leading?: string;
  trailing?: string;
  extra: Record<string, string>;
}

/** Immutable attributes set once at start. */
export interface NativeLiveActivityAttributes {
  name: string;
  extra: Record<string, string>;
}

export interface NativeStartConfig {
  attributes: NativeLiveActivityAttributes;
  state: NativeLiveActivityState;
  /** Epoch milliseconds after which the system marks the activity stale. */
  staleDateMs?: number;
  /** Higher score wins limited Dynamic Island / Smart Stack space. */
  relevanceScore?: number;
}

export interface NativeUpdateConfig {
  state: NativeLiveActivityState;
  staleDateMs?: number;
  relevanceScore?: number;
  /** When all three are set, the system shows an alert with this content. */
  alertTitle?: string;
  alertBody?: string;
  alertSound?: string;
}

export interface NativeEndConfig {
  /** Optional final content state to freeze before dismissal. */
  state?: NativeLiveActivityState;
  /** `'default'` | `'immediate'` | `'after'`. */
  dismissalPolicy: string;
  /** Epoch milliseconds; only used when `dismissalPolicy === 'after'`. */
  dismissalDateMs?: number;
}

export interface NativeStartResult {
  activityId: string;
  /** Per-activity APNs update token (hex), if available synchronously. */
  pushToken?: string;
}

export interface NativeActivityInfo {
  activityId: string;
  /** `'active'` | `'ended'` | `'dismissed'` | `'stale'` | `'unknown'`. */
  state: string;
  pushToken?: string;
}

export interface NativePushTokenEvent {
  activityId: string;
  /** Hex-encoded APNs token. */
  token: string;
}

export interface NativeActivityStateEvent {
  activityId: string;
  /** `'active'` | `'ended'` | `'dismissed'` | `'stale'` | `'unknown'`. */
  state: string;
}
