/// <reference types="node" />
/**
 * iOS 18 broadcast channels for Live Activities.
 *
 * Channels let many devices subscribe to a single broadcast push — ideal for
 * "everyone watching this game" style updates. There are two endpoints:
 *
 * - **Channel management** (`api-manage-broadcast(.sandbox).push.apple.com`,
 *   ports `2196`/`2195`): create / read / delete / list channels. Creating a
 *   channel returns a base64 `apns-channel-id`.
 * - **Broadcast send** (the regular push host `api.push.apple.com:443`):
 *   `POST /4/broadcasts/apps/<bundleId>` with an `apns-channel-id` header and
 *   **no** `apns-topic`. Carries the same `update`/`end` envelope (you cannot
 *   `start` an activity via broadcast).
 *
 * @packageDocumentation
 */

import { Http2Client } from './apns';
import { JwtProvider } from './jwt';
import {
  buildEndPayload,
  buildPushHeaders,
  buildUpdatePayload,
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
  type UpdateOptions,
} from './types';

/** Default APNs priority for broadcast pushes. */
const DEFAULT_PRIORITY: ApnsPriority = 10;

/** Resolve the channel-management host from config. */
function resolveManageHost(config: LiveActivityPusherConfig): string {
  return config.production
    ? 'api-manage-broadcast.push.apple.com'
    : 'api-manage-broadcast.sandbox.push.apple.com';
}

/** Resolve the broadcast-send host (same as the device push host). */
function resolveSendHost(config: LiveActivityPusherConfig): string {
  if (config.host) return config.host;
  return config.production
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';
}

/** Result of {@link BroadcastChannelManager.createChannel}. */
export interface CreateChannelResult {
  /** Base64 channel id assigned by APNs (the `apns-channel-id` header). */
  channelId: string;
  /** Raw parsed APNs result (status, apns-id, etc.). */
  raw: ApnsResult;
}

/** Result of {@link BroadcastChannelManager.listChannels}. */
export interface ListChannelsResult {
  /** Base64 channel ids returned by APNs. */
  channels: string[];
  /** Raw parsed APNs result. */
  raw: ApnsResult;
}

/**
 * Manage broadcast channels and send broadcast pushes (iOS 18+).
 *
 * Create one per app/environment and share it; it keeps two reused HTTP/2
 * sessions warm (management + send). Call {@link BroadcastChannelManager.close}
 * on shutdown.
 */
export interface BroadcastChannelManager {
  /**
   * Create a new broadcast channel. Returns the base64 `apns-channel-id` to
   * store and hand to clients (as `input-push-channel`) and to
   * {@link broadcast}. Up to 10,000 channels per app/environment.
   */
  createChannel(options?: {
    /** `message-storage-policy` (`0` no storage, `1` store; default `1`). */
    messageStoragePolicy?: 0 | 1;
  }): Promise<CreateChannelResult>;

  /** Read a channel's metadata; resolves to the parsed APNs result. */
  readChannel(channelId: string): Promise<ApnsResult>;

  /** Delete a channel. Resolves to the parsed APNs result (`204` on success). */
  deleteChannel(channelId: string): Promise<ApnsResult>;

  /** List all channel ids for the app. */
  listChannels(): Promise<ListChannelsResult>;

  /** Broadcast a content-state `update` to all subscribers of a channel. */
  broadcastUpdate(
    channelId: string,
    options: UpdateOptions
  ): Promise<ApnsResult>;

  /** Broadcast an `end` to all subscribers of a channel. */
  broadcastEnd(channelId: string, options?: EndOptions): Promise<ApnsResult>;

  /**
   * Broadcast a pre-built `update`/`end` payload to a channel. Escape hatch;
   * enforces the 4 KB limit and standard headers.
   */
  broadcast(
    channelId: string,
    payload: ApnsPayload,
    options?: { priority?: ApnsPriority; expiration?: number; apnsId?: string }
  ): Promise<ApnsResult>;

  /** Gracefully close both underlying HTTP/2 sessions. Idempotent. */
  close(): Promise<void>;
}

/**
 * Construct a {@link BroadcastChannelManager}.
 *
 * @throws {ApnsError} `'invalid-argument'` when required credentials are missing.
 */
export function createBroadcastChannelManager(
  config: LiveActivityPusherConfig
): BroadcastChannelManager {
  for (const field of ['key', 'keyId', 'teamId', 'bundleId'] as const) {
    if (typeof config[field] !== 'string' || config[field]!.length === 0) {
      throw new ApnsError(
        'invalid-argument',
        `createBroadcastChannelManager: \`${field}\` is required and must be a non-empty string.`
      );
    }
  }

  const bundleId = config.bundleId;
  const jwt = new JwtProvider({
    key: config.key,
    keyId: config.keyId,
    teamId: config.teamId,
  });

  // Two long-lived sessions: management (port 2196/2195) and send (push host).
  const manageClient = new Http2Client({
    host: resolveManageHost(config),
    port: config.production ? 2196 : 2195,
    connectTimeoutMs: config.connectTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  const sendClient = new Http2Client({
    host: resolveSendHost(config),
    port: config.port ?? 443,
    connectTimeoutMs: config.connectTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  /** Authorization header value with the (cached) provider token. */
  function authHeader(): string {
    return `bearer ${jwt.getToken()}`;
  }

  /** Broadcast a serialized payload to `/4/broadcasts/apps/<bundleId>`. */
  async function broadcast(
    channelId: string,
    payload: ApnsPayload,
    priority: ApnsPriority,
    expiration?: number,
    apnsId?: string
  ): Promise<ApnsResult> {
    assertChannelId(channelId);
    const { json, byteLength } = serializePayload(payload);
    const headers = buildPushHeaders({
      token: '', // unused: channel-based, no /3/device path
      topic: '', // broadcasts MUST NOT send apns-topic
      priority,
      byteLength,
      apnsId,
      expiration,
      channelId,
    });
    headers['authorization'] = authHeader();

    const response = await sendClient.request({
      method: 'POST',
      path: `/4/broadcasts/apps/${bundleId}`,
      headers,
      body: json,
    });
    return parseApnsResult(response);
  }

  return {
    async createChannel(options = {}): Promise<CreateChannelResult> {
      const body = JSON.stringify({
        'message-storage-policy': options.messageStoragePolicy ?? 1,
        'push-type': 'LiveActivity',
      });
      const response = await manageClient.request({
        method: 'POST',
        path: `/1/apps/${bundleId}/channels`,
        headers: {
          authorization: authHeader(),
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body, 'utf8'),
        },
        body,
      });
      const raw = parseApnsResult(response);
      if (!raw.success || !raw.channelId) {
        throw ApnsError.fromResult(raw);
      }
      return { channelId: raw.channelId, raw };
    },

    async readChannel(channelId): Promise<ApnsResult> {
      assertChannelId(channelId);
      const response = await manageClient.request({
        method: 'GET',
        path: `/1/apps/${bundleId}/channels`,
        headers: {
          authorization: authHeader(),
          'apns-channel-id': channelId,
        },
      });
      return parseApnsResult(response);
    },

    async deleteChannel(channelId): Promise<ApnsResult> {
      assertChannelId(channelId);
      const response = await manageClient.request({
        method: 'DELETE',
        path: `/1/apps/${bundleId}/channels`,
        headers: {
          authorization: authHeader(),
          'apns-channel-id': channelId,
        },
      });
      return parseApnsResult(response);
    },

    async listChannels(): Promise<ListChannelsResult> {
      const response = await manageClient.request({
        method: 'GET',
        path: `/1/apps/${bundleId}/all-channels`,
        headers: { authorization: authHeader() },
      });
      const raw = parseApnsResult(response);
      let channels: string[] = [];
      if (response.body) {
        try {
          const parsed = JSON.parse(response.body) as { channels?: unknown };
          if (Array.isArray(parsed.channels)) {
            channels = parsed.channels.filter(
              (c): c is string => typeof c === 'string'
            );
          }
        } catch {
          // Leave channels empty on a non-JSON body.
        }
      }
      return { channels, raw };
    },

    async broadcastUpdate(channelId, options): Promise<ApnsResult> {
      const payload = buildUpdatePayload({
        state: options.state,
        alert: options.alert,
        staleDate: options.staleDate,
        relevanceScore: options.relevanceScore,
        dismissalDate: options.dismissalDate,
      });
      return broadcast(
        channelId,
        payload,
        options.priority ?? DEFAULT_PRIORITY,
        options.expiration,
        options.apnsId
      );
    },

    async broadcastEnd(channelId, options = {}): Promise<ApnsResult> {
      const payload = buildEndPayload({
        state: options.state,
        dismissalDate: options.dismissalDate,
      });
      return broadcast(
        channelId,
        payload,
        options.priority ?? DEFAULT_PRIORITY,
        options.expiration,
        options.apnsId
      );
    },

    async broadcast(channelId, payload, options = {}): Promise<ApnsResult> {
      return broadcast(
        channelId,
        payload,
        options.priority ?? DEFAULT_PRIORITY,
        options.expiration,
        options.apnsId
      );
    },

    async close(): Promise<void> {
      await Promise.all([manageClient.close(), sendClient.close()]);
    },
  };
}

/** Throw if a channel id is missing/empty. */
function assertChannelId(channelId: string): void {
  if (typeof channelId !== 'string' || channelId.length === 0) {
    throw new ApnsError(
      'invalid-argument',
      'A non-empty base64 `apns-channel-id` is required.'
    );
  }
}
