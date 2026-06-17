/**
 * {@link createLiveActivityPusher} — the typed, zero-dependency APNs sender for
 * iOS Live Activities. Sends `update` / `end` to a per-activity update token and
 * `start` to a push-to-start token (iOS 17.2+), over a single reused HTTP/2
 * session with a cached ES256 provider token.
 *
 * @packageDocumentation
 */

import { Http2Client } from './apns';
import { JwtProvider } from './jwt';
import {
  buildEndPayload,
  buildPushHeaders,
  buildStartPayload,
  buildUpdatePayload,
  liveActivityTopic,
  parseApnsResult,
  serializePayload,
  type ApnsPayload,
} from './payload';
import {
  ApnsError,
  type ApnsPriority,
  type ApnsResult,
  type EndOptions,
  type LiveActivityPusherConfig,
  type StartViaPushOptions,
  type UpdateOptions,
} from './types';

/** Default attributes-type name scaffolded by the config plugin. */
const DEFAULT_ATTRIBUTES_TYPE = 'LiveActivityKitAttributes';
/** Default APNs priority for Live Activity pushes. */
const DEFAULT_PRIORITY: ApnsPriority = 10;

/** Resolve the APNs push host from config (explicit `host` wins). */
function resolveHost(config: LiveActivityPusherConfig): string {
  if (config.host) return config.host;
  return config.production
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';
}

/**
 * A reusable Live Activity push sender bound to one app/environment. Create it
 * once at process start and share it; it keeps the HTTP/2 session and provider
 * token warm. Call {@link LiveActivityPusher.close} on shutdown.
 */
export interface LiveActivityPusher {
  /**
   * Push a content-state update to a running activity's per-activity token.
   * @param token - Hex update token from `activity.pushTokenUpdates`.
   */
  update(token: string, options: UpdateOptions): Promise<ApnsResult>;

  /**
   * End a running activity (optionally with a final state and dismissal date).
   * @param token - Hex update token of the activity to end.
   */
  end(token: string, options?: EndOptions): Promise<ApnsResult>;

  /**
   * Start a new activity via push (iOS 17.2+) using a push-to-start token.
   * `alert` is **required**; throws an {@link ApnsError} `invalid-argument` if
   * omitted.
   * @param pushToStartToken - Hex token from `Activity.pushToStartTokenUpdates`.
   */
  startViaPush(
    pushToStartToken: string,
    options: StartViaPushOptions
  ): Promise<ApnsResult>;

  /**
   * Send a pre-built APNs payload to a token. Escape hatch for advanced cases;
   * still enforces the 4 KB limit and standard headers.
   */
  send(
    token: string,
    payload: ApnsPayload,
    options?: { priority?: ApnsPriority; expiration?: number; apnsId?: string }
  ): Promise<ApnsResult>;

  /** The Live Activity APNs topic in use (`<bundleId>.push-type.liveactivity`). */
  readonly topic: string;

  /** Gracefully close the underlying HTTP/2 session. Idempotent. */
  close(): Promise<void>;
}

/**
 * Validate config and construct a {@link LiveActivityPusher}.
 *
 * @example
 * ```ts
 * import { createLiveActivityPusher } from 'react-native-live-activity-kit/server';
 *
 * const pusher = createLiveActivityPusher({
 *   key: process.env.APNS_KEY!,        // .p8 PEM contents
 *   keyId: process.env.APNS_KEY_ID!,
 *   teamId: process.env.APPLE_TEAM_ID!,
 *   bundleId: 'com.acme.app',
 *   production: true,
 * });
 *
 * await pusher.update(token, { state: { title: 'Out for delivery', progress: 0.8 } });
 * await pusher.close();
 * ```
 *
 * @throws {ApnsError} of kind `'invalid-argument'` when required credentials are
 * missing or the port is unsupported.
 */
export function createLiveActivityPusher(
  config: LiveActivityPusherConfig
): LiveActivityPusher {
  validateConfig(config);

  const topic = liveActivityTopic(config.bundleId);
  const jwt = new JwtProvider({
    key: config.key,
    keyId: config.keyId,
    teamId: config.teamId,
  });
  const client = new Http2Client({
    host: resolveHost(config),
    port: config.port ?? 443,
    connectTimeoutMs: config.connectTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  /** Dispatch a serialized payload to `/3/device/<token>` and parse the result. */
  async function dispatch(
    token: string,
    payload: ApnsPayload,
    priority: ApnsPriority,
    expiration?: number,
    apnsId?: string
  ): Promise<ApnsResult> {
    assertToken(token);
    const { json, byteLength } = serializePayload(payload);
    const headers = buildPushHeaders({
      token,
      topic,
      priority,
      byteLength,
      apnsId,
      expiration,
    });
    headers['authorization'] = `bearer ${jwt.getToken()}`;

    const response = await client.request({
      method: 'POST',
      path: `/3/device/${token}`,
      headers,
      body: json,
    });
    return parseApnsResult(response);
  }

  return {
    topic,

    async update(token, options): Promise<ApnsResult> {
      const payload = buildUpdatePayload({
        state: options.state,
        alert: options.alert,
        staleDate: options.staleDate,
        relevanceScore: options.relevanceScore,
        dismissalDate: options.dismissalDate,
      });
      return dispatch(
        token,
        payload,
        options.priority ?? DEFAULT_PRIORITY,
        options.expiration,
        options.apnsId
      );
    },

    async end(token, options = {}): Promise<ApnsResult> {
      const payload = buildEndPayload({
        state: options.state,
        dismissalDate: options.dismissalDate,
      });
      return dispatch(
        token,
        payload,
        options.priority ?? DEFAULT_PRIORITY,
        options.expiration,
        options.apnsId
      );
    },

    async startViaPush(pushToStartToken, options): Promise<ApnsResult> {
      const payload = buildStartPayload({
        attributesType: options.attributesType ?? DEFAULT_ATTRIBUTES_TYPE,
        attributes: options.attributes,
        state: options.state,
        alert: options.alert,
        staleDate: options.staleDate,
        relevanceScore: options.relevanceScore,
        inputPushToken: options.inputPushToken,
        inputPushChannel: options.inputPushChannel,
      });
      return dispatch(
        pushToStartToken,
        payload,
        options.priority ?? DEFAULT_PRIORITY,
        options.expiration,
        options.apnsId
      );
    },

    async send(token, payload, options = {}): Promise<ApnsResult> {
      return dispatch(
        token,
        payload,
        options.priority ?? DEFAULT_PRIORITY,
        options.expiration,
        options.apnsId
      );
    },

    close(): Promise<void> {
      return client.close();
    },
  };
}

/** Throw on missing/invalid credentials or unsupported port. */
function validateConfig(config: LiveActivityPusherConfig): void {
  const required: Array<keyof LiveActivityPusherConfig> = [
    'key',
    'keyId',
    'teamId',
    'bundleId',
  ];
  for (const field of required) {
    const value = config[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new ApnsError(
        'invalid-argument',
        `createLiveActivityPusher: \`${field}\` is required and must be a non-empty string.`
      );
    }
  }
  if (config.port != null && config.port !== 443 && config.port !== 2197) {
    throw new ApnsError(
      'invalid-argument',
      `createLiveActivityPusher: \`port\` must be 443 or 2197 (got ${config.port}).`
    );
  }
}

/** Throw if a device/push token is not a plausible hex string. */
function assertToken(token: string): void {
  if (typeof token !== 'string' || token.length === 0) {
    throw new ApnsError('invalid-argument', 'A non-empty APNs token is required.');
  }
}
