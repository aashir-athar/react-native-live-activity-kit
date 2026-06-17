/**
 * Public type definitions for `react-native-live-activity-kit` (client side).
 *
 * The content-state shape comes from the isomorphic `src/shared/schema.ts` so it
 * is identical on the client and the `/server` APNs sender.
 */

export type {
  LiveActivityState,
  LiveActivityAttributesData,
  AlertConfig,
  DismissalPolicy,
  ActivityState,
} from './shared/schema';

import type {
  AlertConfig,
  DismissalPolicy,
  LiveActivityAttributesData,
  LiveActivityState,
} from './shared/schema';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for {@link startLiveActivity}. */
export interface StartLiveActivityOptions {
  /** Immutable attributes set once for the activity's lifetime. */
  attributes: LiveActivityAttributesData;
  /** Initial mutable content state. */
  state: LiveActivityState;
  /** When the system should consider the content stale (greys it out). */
  staleDate?: Date | number;
  /** Relevance for limited Dynamic Island / Smart Stack space (higher wins). */
  relevanceScore?: number;
}

/** Options for {@link updateLiveActivity}. */
export interface UpdateLiveActivityOptions {
  /** The new mutable content state. */
  state: LiveActivityState;
  /** Show a banner alert with this content when delivered in the background. */
  alert?: AlertConfig;
  staleDate?: Date | number;
  relevanceScore?: number;
}

/** Options for {@link endLiveActivity} / {@link endAllLiveActivities}. */
export interface EndLiveActivityOptions {
  /** Optional final content state to freeze before the card is dismissed. */
  state?: LiveActivityState;
  /** How the system removes the card. Defaults to `'default'`. */
  dismissalPolicy?: DismissalPolicy;
  /** Removal time; only used when `dismissalPolicy === 'after'`. */
  dismissalDate?: Date | number;
}

// ---------------------------------------------------------------------------
// Handles & results
// ---------------------------------------------------------------------------

/** A handle to a started Live Activity, returned by {@link startLiveActivity}. */
export interface LiveActivity {
  /** Stable ActivityKit id; pass this to update/end. */
  id: string;
  /**
   * Per-activity APNs **update** token (hex), if it was available synchronously.
   * It can also arrive (or rotate) later — subscribe with
   * {@link addPushTokenListener} to catch every value.
   */
  pushToken: string | null;
}

/** Snapshot of one activity, from {@link getActiveLiveActivities}. */
export interface LiveActivityInfo {
  id: string;
  state: import('./shared/schema').ActivityState;
  pushToken: string | null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Returned by every `add*Listener`. Call `.remove()` to unsubscribe. */
export interface Subscription {
  remove(): void;
}

/** Payload for {@link addActivityStateListener}. */
export interface ActivityStateChange {
  id: string;
  state: import('./shared/schema').ActivityState;
}

/** Payload for {@link addPushTokenListener}. */
export interface PushTokenChange {
  id: string;
  /** Hex-encoded APNs update token. */
  token: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Reasons a Live Activity operation can fail. */
export type LiveActivityErrorCode =
  | 'UNSUPPORTED_PLATFORM'
  | 'NOT_ENABLED'
  | 'NOT_FOUND'
  | 'START_FAILED'
  | 'UPDATE_FAILED'
  | 'UNKNOWN';

/** Thrown / rejected by the client when an activity operation fails. */
export class LiveActivityError extends Error {
  readonly code: LiveActivityErrorCode;
  constructor(code: LiveActivityErrorCode, message: string) {
    super(message);
    this.name = 'LiveActivityError';
    this.code = code;
  }
}
