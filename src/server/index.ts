/**
 * `react-native-live-activity-kit/server` — a typed, **zero-runtime-dependency**
 * Node APNs sender for iOS Live Activities.
 *
 * It speaks HTTP/2 to Apple Push Notification service over a single reused
 * session, authenticates with a cached ES256 provider token, and shares the
 * exact content-state schema (`LiveActivityState`) used by the client and the
 * on-device SwiftUI template — so a payload that type-checks here decodes on the
 * phone.
 *
 * @example Update a running activity
 * ```ts
 * import { createLiveActivityPusher } from 'react-native-live-activity-kit/server';
 *
 * const pusher = createLiveActivityPusher({
 *   key: process.env.APNS_P8!,          // .p8 PEM contents
 *   keyId: process.env.APNS_KEY_ID!,
 *   teamId: process.env.APPLE_TEAM_ID!,
 *   bundleId: 'com.acme.app',
 *   production: true,
 * });
 *
 * const result = await pusher.update(activityToken, {
 *   state: { title: 'Order on the way', status: 'Arriving', progress: 0.8 },
 * });
 * if (!result.success && result.reason === 'Unregistered') {
 *   // purge the token from your registry
 * }
 * ```
 *
 * @packageDocumentation
 */

// --- Factories --------------------------------------------------------------
export { createLiveActivityPusher, type LiveActivityPusher } from './pusher';
export {
  createBroadcastChannelManager,
  type BroadcastChannelManager,
  type CreateChannelResult,
  type ListChannelsResult,
} from './broadcast';

// --- Token registry ---------------------------------------------------------
export { InMemoryTokenRegistry } from './registry';

// --- Types & errors ---------------------------------------------------------
export {
  ApnsError,
  MAX_PAYLOAD_BYTES,
  type LiveActivityPusherConfig,
  type ApnsPriority,
  type ApnsResult,
  type ApnsReason,
  type ApnsErrorKind,
  type UpdateOptions,
  type EndOptions,
  type StartViaPushOptions,
  type LiveActivityTokenRegistry,
  type PushToStartTokenRecord,
  type ActivityTokenRecord,
} from './types';

// --- Payload builders (advanced/escape-hatch) -------------------------------
export {
  buildUpdatePayload,
  buildEndPayload,
  buildStartPayload,
  serializePayload,
  liveActivityTopic,
  type ApnsPayload,
} from './payload';

// --- Re-exported shared schema (so server users need one import) ------------
export type {
  LiveActivityState,
  LiveActivityAttributesData,
  AlertConfig,
  DismissalPolicy,
} from '../shared/schema';
export { normalizeState, toEpochMs } from '../shared/schema';
