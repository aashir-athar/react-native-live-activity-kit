/// <reference types="node" />
/**
 * Payload construction, size enforcement, header building, and APNs response
 * parsing shared by the device pusher and the broadcaster.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import type * as http2 from 'node:http2';
import {
  normalizeState,
  toEpochMs,
  type LiveActivityState,
  type LiveActivityAttributesData,
  type AlertConfig,
} from '../shared/schema';
import {
  ApnsError,
  MAX_PAYLOAD_BYTES,
  type ApnsPriority,
  type ApnsReason,
  type ApnsResult,
} from './types';

/** The `aps` envelope as serialized to APNs JSON (wire keys are kebab-case). */
interface ApsEnvelope {
  /** Event timestamp in epoch **seconds**. */
  timestamp: number;
  /** Lifecycle event. */
  event: 'start' | 'update' | 'end';
  /**
   * Normalized content state (camelCase keys, matches Swift `Codable`).
   * Present for `update`/`start`; optional for `end` (omitting it keeps the
   * activity's last rendered state).
   */
  'content-state'?: LiveActivityState;
  /** Optional alert banner (string or structured). */
  alert?: { title: string; body: string; sound?: string };
  /** Stale date in epoch **seconds**. */
  'stale-date'?: number;
  /** Relevance score (sort weight). */
  'relevance-score'?: number;
  /** Dismissal date in epoch **seconds**. */
  'dismissal-date'?: number;
  // start-only fields:
  /** Bare attributes struct name (start). */
  'attributes-type'?: string;
  /** Immutable attributes (start). */
  attributes?: LiveActivityAttributesData;
  /** iOS 18: subscribe started activity to a broadcast channel (start). */
  'input-push-channel'?: string;
  /** iOS 18: request a per-activity update token for the started activity (start). */
  'input-push-token'?: number;
}

/** The full APNs JSON body. */
export interface ApnsPayload {
  aps: ApsEnvelope;
}

/** Convert epoch-ms (or `Date`/number) to epoch **seconds**, or `undefined`. */
function toEpochSeconds(value: Date | number | undefined): number | undefined {
  const ms = toEpochMs(value);
  return ms === undefined ? undefined : Math.floor(ms / 1000);
}

/** Map a shared {@link AlertConfig} to the APNs `alert` object. */
function buildAlert(alert: AlertConfig | undefined): ApsEnvelope['alert'] {
  if (alert == null) return undefined;
  const out: { title: string; body: string; sound?: string } = {
    title: alert.title,
    body: alert.body,
  };
  if (alert.sound != null) out.sound = alert.sound;
  return out;
}

/** Inputs for {@link buildUpdatePayload}. */
export interface BuildUpdateInput {
  state: LiveActivityState;
  alert?: AlertConfig;
  staleDate?: Date | number;
  relevanceScore?: number;
  dismissalDate?: Date | number;
}

/** Build the `event:'update'` APNs payload (content-state normalized). */
export function buildUpdatePayload(input: BuildUpdateInput): ApnsPayload {
  const aps: ApsEnvelope = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'update',
    'content-state': normalizeState(input.state),
  };
  const alert = buildAlert(input.alert);
  if (alert) aps.alert = alert;
  const stale = toEpochSeconds(input.staleDate);
  if (stale !== undefined) aps['stale-date'] = stale;
  if (input.relevanceScore != null) aps['relevance-score'] = input.relevanceScore;
  const dismissal = toEpochSeconds(input.dismissalDate);
  if (dismissal !== undefined) aps['dismissal-date'] = dismissal;
  return { aps };
}

/** Inputs for {@link buildEndPayload}. */
export interface BuildEndInput {
  state?: LiveActivityState;
  dismissalDate?: Date | number;
}

/** Build the `event:'end'` APNs payload (final state optional). */
export function buildEndPayload(input: BuildEndInput): ApnsPayload {
  const aps: ApsEnvelope = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'end',
  };
  // Attach a final state only when provided; otherwise APNs keeps the last one.
  if (input.state != null) aps['content-state'] = normalizeState(input.state);
  const dismissal = toEpochSeconds(input.dismissalDate);
  if (dismissal !== undefined) aps['dismissal-date'] = dismissal;
  return { aps };
}

/** Inputs for {@link buildStartPayload}. */
export interface BuildStartInput {
  attributesType: string;
  attributes: LiveActivityAttributesData;
  state: LiveActivityState;
  alert: AlertConfig;
  staleDate?: Date | number;
  relevanceScore?: number;
  inputPushToken?: boolean;
  inputPushChannel?: string;
}

/**
 * Build the `event:'start'` (push-to-start) APNs payload.
 *
 * @throws {ApnsError} of kind `'invalid-argument'` if `alert` is missing — APNs
 * rejects `start` pushes without an alert.
 */
export function buildStartPayload(input: BuildStartInput): ApnsPayload {
  if (input.alert == null) {
    throw new ApnsError(
      'invalid-argument',
      'startViaPush requires an `alert` (APNs rejects start pushes without one).'
    );
  }
  const aps: ApsEnvelope = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'start',
    'content-state': normalizeState(input.state),
    'attributes-type': input.attributesType,
    attributes: input.attributes,
    alert: buildAlert(input.alert),
  };
  const stale = toEpochSeconds(input.staleDate);
  if (stale !== undefined) aps['stale-date'] = stale;
  if (input.relevanceScore != null) aps['relevance-score'] = input.relevanceScore;
  if (input.inputPushToken === true) aps['input-push-token'] = 1;
  if (input.inputPushChannel != null) {
    aps['input-push-channel'] = input.inputPushChannel;
  }
  return { aps };
}

/**
 * Serialize a payload to JSON and enforce the 4 KB APNs limit on the **byte**
 * length (UTF-8), throwing before any network I/O if exceeded.
 *
 * @throws {ApnsError} of kind `'payload-too-large'`.
 */
export function serializePayload(payload: ApnsPayload): {
  json: string;
  byteLength: number;
} {
  const json = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(json, 'utf8');
  if (byteLength > MAX_PAYLOAD_BYTES) {
    throw new ApnsError(
      'payload-too-large',
      `Live Activity payload is ${byteLength} bytes, exceeding the ${MAX_PAYLOAD_BYTES}-byte (4 KB) APNs limit. ` +
        'Trim the content state (shorter strings, fewer `extra` keys).',
      { reason: 'PayloadTooLarge' }
    );
  }
  return { json, byteLength };
}

/** Build the common APNs header set for a device push. */
export function buildPushHeaders(options: {
  token: string;
  topic: string;
  priority: ApnsPriority;
  byteLength: number;
  apnsId?: string;
  expiration?: number;
  /** Broadcast channel id (mutually exclusive with `topic` per Apple). */
  channelId?: string;
}): http2.OutgoingHttpHeaders {
  const headers: http2.OutgoingHttpHeaders = {
    'apns-push-type': 'liveactivity',
    'apns-priority': options.priority,
    'content-length': options.byteLength,
    'content-type': 'application/json',
  };
  // Broadcasts use `apns-channel-id` and MUST NOT send `apns-topic`.
  if (options.channelId != null) {
    headers['apns-channel-id'] = options.channelId;
  } else {
    headers['apns-topic'] = options.topic;
  }
  headers['apns-id'] = options.apnsId ?? randomUUID();
  if (options.expiration != null) headers['apns-expiration'] = options.expiration;
  return headers;
}

/** Derive the APNs topic for Live Activities from a bundle id. */
export function liveActivityTopic(bundleId: string): string {
  return `${bundleId}.push-type.liveactivity`;
}

/**
 * Parse a raw HTTP/2 response into a typed {@link ApnsResult}. Never throws;
 * callers decide whether to surface a failure as an {@link ApnsError}.
 */
export function parseApnsResult(response: {
  status: number;
  headers: http2.IncomingHttpHeaders;
  body: string;
}): ApnsResult {
  const apnsIdHeader = response.headers['apns-id'];
  const channelIdHeader = response.headers['apns-channel-id'];
  const result: ApnsResult = {
    // APNs uses 2xx for success across all endpoints: 200 (device push / channel
    // read / list), 201 (channel create), 204 (channel delete). 4xx/5xx are
    // failures carrying a `{reason}` body.
    success: response.status >= 200 && response.status < 300,
    status: response.status,
  };
  if (typeof apnsIdHeader === 'string') result.apnsId = apnsIdHeader;
  else if (Array.isArray(apnsIdHeader) && apnsIdHeader[0]) result.apnsId = apnsIdHeader[0];
  if (typeof channelIdHeader === 'string') result.channelId = channelIdHeader;
  else if (Array.isArray(channelIdHeader) && channelIdHeader[0]) {
    result.channelId = channelIdHeader[0];
  }

  if (!result.success && response.body) {
    try {
      const parsed = JSON.parse(response.body) as {
        reason?: string;
        timestamp?: number;
      };
      if (parsed.reason) result.reason = parsed.reason as ApnsReason;
      if (typeof parsed.timestamp === 'number') result.timestamp = parsed.timestamp;
    } catch {
      // Non-JSON error body (rare); leave reason undefined.
    }
  }
  return result;
}
