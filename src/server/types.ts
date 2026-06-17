/**
 * Public types for the Node APNs sender (`react-native-live-activity-kit/server`).
 *
 * This module is **server-only** and has **zero runtime dependencies** beyond the
 * Node standard library. It re-uses the isomorphic content-state schema from
 * {@link ../shared/schema} so a Live Activity payload that type-checks here is the
 * same shape the SwiftUI `ContentState` decodes on device.
 *
 * @packageDocumentation
 */

import type {
  LiveActivityState,
  LiveActivityAttributesData,
  AlertConfig,
} from '../shared/schema';

/**
 * Configuration for {@link createLiveActivityPusher} and
 * {@link createBroadcastChannelManager}.
 *
 * All credentials come from your Apple Developer account:
 * - `key`  — the **PEM contents** of your `AuthKey_XXXXXXXXXX.p8` token-auth key
 *   (the whole `-----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY-----` string).
 * - `keyId` — the 10-character Key ID shown next to the key in the portal.
 * - `teamId` — your 10-character Apple Team ID.
 * - `bundleId` — the app's bundle identifier, e.g. `com.acme.app`. The APNs topic
 *   is derived as `<bundleId>.push-type.liveactivity`.
 */
export interface LiveActivityPusherConfig {
  /** PEM contents of the `.p8` APNs auth key (ES256 / EC P-256 private key). */
  key: string;
  /** 10-character APNs Key ID (the `kid` JWT header). */
  keyId: string;
  /** 10-character Apple Team ID (the `iss` JWT claim). */
  teamId: string;
  /** App bundle identifier; the topic becomes `<bundleId>.push-type.liveactivity`. */
  bundleId: string;
  /**
   * Target the production APNs environment (`api.push.apple.com`) when `true`,
   * otherwise the sandbox (`api.sandbox.push.apple.com`). TestFlight builds use
   * **production**. Defaults to `false` (sandbox).
   */
  production?: boolean;
  /**
   * Override the APNs host. When omitted it is derived from {@link production}.
   * Only set this for proxies / mocking.
   */
  host?: string;
  /**
   * APNs port. Apple accepts `443` (default) and `2197` (useful when `443` is
   * blocked by a firewall). Defaults to `443`.
   */
  port?: 443 | 2197;
  /**
   * Milliseconds to wait for the HTTP/2 session to connect before failing a
   * request. Defaults to `10_000`.
   */
  connectTimeoutMs?: number;
  /**
   * Per-request timeout in milliseconds (after the session is connected).
   * Defaults to `10_000`.
   */
  requestTimeoutMs?: number;
}

/** APNs delivery priority. `10` = immediate, `5` = throttled (frequent updates). */
export type ApnsPriority = 1 | 5 | 10;

/**
 * The hard APNs payload size limit for Live Activity pushes, in bytes (4 KB).
 * Payloads larger than this are rejected by Apple with `413 PayloadTooLarge`;
 * this SDK enforces the limit client-side before sending.
 */
export const MAX_PAYLOAD_BYTES = 4096;

/**
 * Options for {@link LiveActivityPusher.update}.
 */
export interface UpdateOptions {
  /** The new content state. Normalized (camelCase) before sending. */
  state: LiveActivityState;
  /** Optional banner shown when the app is backgrounded. */
  alert?: AlertConfig;
  /** When the activity should be considered out-of-date (`Date` or epoch-ms). */
  staleDate?: Date | number;
  /** Relevance score (higher sorts earlier in the Dynamic Island stack). */
  relevanceScore?: number;
  /** When set, schedules removal; same semantics as `end`'s `dismissalDate`. */
  dismissalDate?: Date | number;
  /** APNs priority. Defaults to `10`. Use `5` for high-frequency updates. */
  priority?: ApnsPriority;
  /** `apns-expiration` (epoch seconds, or `0` for now-or-never). */
  expiration?: number;
  /** Explicit `apns-id`; auto-generated (UUID v4) when omitted. */
  apnsId?: string;
}

/**
 * Options for {@link LiveActivityPusher.end}.
 */
export interface EndOptions {
  /** Optional final content state to render before the activity is removed. */
  state?: LiveActivityState;
  /**
   * Controls UI removal. Omit → stays up to 4 h. Past date → immediate. Future
   * date → kept until then (capped to a 4 h window by iOS).
   */
  dismissalDate?: Date | number;
  /** APNs priority. Defaults to `10`. */
  priority?: ApnsPriority;
  /** `apns-expiration` (epoch seconds). */
  expiration?: number;
  /** Explicit `apns-id`; auto-generated when omitted. */
  apnsId?: string;
}

/**
 * Options for {@link LiveActivityPusher.startViaPush} (iOS 17.2+ push-to-start).
 */
export interface StartViaPushOptions {
  /**
   * Bare struct name of the `ActivityAttributes` type to start. Must match the
   * Swift type name. Defaults to `'LiveActivityKitAttributes'` (the name the
   * config plugin scaffolds).
   */
  attributesType?: string;
  /** Immutable attributes for the new activity (required). */
  attributes: LiveActivityAttributesData;
  /** Initial content state (required). */
  state: LiveActivityState;
  /** Alert banner — **required** by APNs for `start` pushes. */
  alert: AlertConfig;
  /** When the initial state should be considered out-of-date. */
  staleDate?: Date | number;
  /** Initial relevance score. */
  relevanceScore?: number;
  /**
   * iOS 18+: request a per-activity update token for the started activity. When
   * `true`, the started activity emits a `pushTokenUpdates` token you can store.
   */
  inputPushToken?: boolean;
  /** iOS 18+: base64 broadcast channel id to subscribe the started activity to. */
  inputPushChannel?: string;
  /** APNs priority. Defaults to `10`. */
  priority?: ApnsPriority;
  /** `apns-expiration` (epoch seconds). */
  expiration?: number;
  /** Explicit `apns-id`; auto-generated when omitted. */
  apnsId?: string;
}

/**
 * The parsed result of a single APNs request. `success` is `true` for any `2xx`
 * status (200 device push / channel read / list, 201 channel create, 204 channel
 * delete); otherwise inspect {@link ApnsResult.status} and {@link ApnsResult.reason}.
 */
export interface ApnsResult {
  /** `true` when APNs returned a `2xx` status. */
  success: boolean;
  /** The HTTP/2 `:status` pseudo-header. */
  status: number;
  /** The `apns-id` header echoed/assigned by APNs (request correlation id). */
  apnsId?: string;
  /** The `reason` string from the JSON error body, when present. */
  reason?: string;
  /**
   * For `410 Unregistered` responses, the epoch-ms `timestamp` from the body
   * marking when the token became invalid. Stop pushing to this token.
   */
  timestamp?: number;
  /** The `apns-channel-id` header, for broadcast/channel management responses. */
  channelId?: string;
}

/**
 * Known APNs failure `reason` strings (HTTP error bodies). Useful for typed
 * branching; APNs may add new values, so treat this as non-exhaustive.
 *
 * @see The reference table in the project's ActivityKit notes.
 */
export type ApnsReason =
  | 'BadDeviceToken'
  | 'BadTopic'
  | 'TopicDisallowed'
  | 'DeviceTokenNotForTopic'
  | 'InvalidPushType'
  | 'MissingTopic'
  | 'PayloadEmpty'
  | 'PayloadTooLarge'
  | 'ExpiredProviderToken'
  | 'InvalidProviderToken'
  | 'MissingProviderToken'
  | 'Unregistered'
  | 'ExpiredToken'
  | 'TooManyProviderTokenUpdates'
  | 'TooManyRequests'
  | 'InternalServerError'
  | 'ServiceUnavailable'
  | 'Shutdown'
  | (string & {});

/** Discriminates the kind of failure an {@link ApnsError} represents. */
export type ApnsErrorKind =
  /** The payload exceeded {@link MAX_PAYLOAD_BYTES} before sending. */
  | 'payload-too-large'
  /** A required argument was missing or invalid (thrown before any network I/O). */
  | 'invalid-argument'
  /** The HTTP/2 session failed to connect, timed out, or the stream errored. */
  | 'transport'
  /** APNs returned a non-2xx status; inspect {@link ApnsError.status}/`reason`. */
  | 'apns';

/**
 * The single error type thrown by this SDK. Carries a machine-readable
 * {@link ApnsErrorKind}, and, for `'apns'` failures, the HTTP status, reason,
 * and `apns-id` so callers can branch (e.g. purge a token on `Unregistered`).
 */
export class ApnsError extends Error {
  /** Machine-readable category of the failure. */
  readonly kind: ApnsErrorKind;
  /** HTTP status for `'apns'` failures (otherwise `undefined`). */
  readonly status?: number;
  /** APNs `reason` for `'apns'` failures. */
  readonly reason?: ApnsReason;
  /** `apns-id` correlation id, when available. */
  readonly apnsId?: string;
  /** For `410` failures, the epoch-ms the token became invalid. */
  readonly timestamp?: number;

  constructor(
    kind: ApnsErrorKind,
    message: string,
    details?: {
      status?: number;
      reason?: ApnsReason;
      apnsId?: string;
      timestamp?: number;
      cause?: unknown;
    }
  ) {
    super(message, details?.cause != null ? { cause: details.cause } : undefined);
    this.name = 'ApnsError';
    this.kind = kind;
    this.status = details?.status;
    this.reason = details?.reason;
    this.apnsId = details?.apnsId;
    this.timestamp = details?.timestamp;
    // Restore prototype chain for transpilation targets that break `instanceof`.
    Object.setPrototypeOf(this, ApnsError.prototype);
  }

  /** Build an {@link ApnsError} of kind `'apns'` from a failed {@link ApnsResult}. */
  static fromResult(result: ApnsResult): ApnsError {
    return new ApnsError(
      'apns',
      `APNs request failed (status ${result.status}${
        result.reason ? `, reason ${result.reason}` : ''
      }).`,
      {
        status: result.status,
        reason: result.reason,
        apnsId: result.apnsId,
        timestamp: result.timestamp,
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Token registry
// ---------------------------------------------------------------------------

/**
 * A persisted push-to-start token (static per app+attributes type, iOS 17.2+).
 */
export interface PushToStartTokenRecord {
  /** Hex push-to-start token reported by `Activity.pushToStartTokenUpdates`. */
  token: string;
  /** Bare attributes type name this token starts. */
  attributesType: string;
  /** Epoch-ms the record was last written. */
  updatedAt: number;
}

/**
 * A persisted per-activity update token (iOS 16.1+). Rotates over the lifetime
 * of an activity; always push to the most recently stored token.
 */
export interface ActivityTokenRecord {
  /** Your stable identifier for the running activity. */
  activityId: string;
  /** Hex update token reported by `activity.pushTokenUpdates`. */
  token: string;
  /** Bare attributes type name, for diagnostics. */
  attributesType?: string;
  /** Epoch-ms the record was last written. */
  updatedAt: number;
}

/**
 * Storage abstraction for APNs Live Activity tokens. Implement this against your
 * database so the pusher can resolve and rotate tokens. A ready-to-use
 * in-memory reference implementation is exported as
 * {@link InMemoryTokenRegistry} for tests and single-process apps.
 *
 * All methods are async to allow remote stores; the in-memory implementation
 * resolves synchronously.
 */
export interface LiveActivityTokenRegistry {
  // --- push-to-start tokens -------------------------------------------------

  /** Store (or overwrite) the push-to-start token for an attributes type. */
  storePushToStartToken(record: PushToStartTokenRecord): Promise<void>;
  /** Read the current push-to-start token for an attributes type, if any. */
  getPushToStartToken(
    attributesType: string
  ): Promise<PushToStartTokenRecord | undefined>;
  /** Invalidate (remove) the push-to-start token for an attributes type. */
  invalidatePushToStartToken(attributesType: string): Promise<void>;

  // --- per-activity update tokens ------------------------------------------

  /** Store (or rotate) the update token for a running activity. */
  storeActivityToken(record: ActivityTokenRecord): Promise<void>;
  /** Read the current update token for an activity, if any. */
  getActivityToken(activityId: string): Promise<ActivityTokenRecord | undefined>;
  /**
   * Rotate an activity's token in place. Convenience over
   * {@link storeActivityToken}; preserves `attributesType` when omitted.
   */
  rotateActivityToken(activityId: string, token: string): Promise<void>;
  /** Invalidate (remove) the token for a finished/unregistered activity. */
  invalidateActivityToken(activityId: string): Promise<void>;
  /** List all currently-stored activity tokens (e.g. for a fan-out update). */
  listActivityTokens(): Promise<ActivityTokenRecord[]>;
}
