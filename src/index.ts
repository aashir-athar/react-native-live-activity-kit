/**
 * `react-native-live-activity-kit` — public client API.
 *
 * A thin, fully-typed wrapper over the single Nitro HybridObject. It normalizes
 * friendly options into the flat native config, ref-counts event subscribers
 * behind a single native callback per event, and converts native optionals into
 * the `null`-shaped public types. Live Activities are iOS-only; every method is
 * a safe no-op (or a typed rejection) on Android and web.
 *
 * The matching server sender lives at `react-native-live-activity-kit/server`.
 *
 * @packageDocumentation
 */

import { Platform } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';

import type { LiveActivityKit as NativeModule } from './specs/LiveActivityKit.nitro';
import type {
  NativeActivityStateEvent,
  NativeEndConfig,
  NativeLiveActivityState,
  NativePushTokenEvent,
  NativeStartConfig,
  NativeUpdateConfig,
} from './specs/LiveActivityTypes.nitro';
import {
  type ActivityState,
  type ActivityStateChange,
  type EndLiveActivityOptions,
  type LiveActivity,
  type LiveActivityErrorCode,
  type LiveActivityInfo,
  LiveActivityError,
  type PushTokenChange,
  type StartLiveActivityOptions,
  type Subscription,
  type UpdateLiveActivityOptions,
} from './types';
import {
  type LiveActivityState,
  normalizeState,
  sanitizeStringMap,
  toEpochMs,
} from './shared/schema';

export * from './types';

/** `true` on platforms that can run Live Activities (iOS only). */
export const isSupported: boolean = Platform.OS === 'ios';

let nativeModule: NativeModule | null = null;

function native(): NativeModule {
  if (nativeModule == null) {
    nativeModule = NitroModules.createHybridObject<NativeModule>('LiveActivityKit');
  }
  return nativeModule;
}

function unsupported(op: string): LiveActivityError {
  return new LiveActivityError(
    'UNSUPPORTED_PLATFORM',
    `react-native-live-activity-kit: ${op} is only available on iOS (Live Activities are an iOS feature).`
  );
}

const VALID_STATES: ReadonlySet<string> = new Set([
  'active',
  'pending',
  'stale',
  'ended',
  'dismissed',
  'unknown',
]);

function toActivityState(value: string): ActivityState {
  return (VALID_STATES.has(value) ? value : 'unknown') as ActivityState;
}

// ---------------------------------------------------------------------------
// Option -> native config converters
// ---------------------------------------------------------------------------

function toNativeState(state: LiveActivityState): NativeLiveActivityState {
  const n = normalizeState(state);
  // `extra` is required on the native struct; default to an empty map.
  return { ...n, extra: n.extra ?? {} } as NativeLiveActivityState;
}

function toNativeStart(options: StartLiveActivityOptions): NativeStartConfig {
  if (options == null || options.attributes == null || options.state == null) {
    throw new LiveActivityError(
      'START_FAILED',
      'react-native-live-activity-kit: startLiveActivity requires { attributes, state }.'
    );
  }
  const config: NativeStartConfig = {
    attributes: {
      name: String(options.attributes.name ?? ''),
      extra: sanitizeStringMap(options.attributes.extra),
    },
    state: toNativeState(options.state),
  };
  const stale = toEpochMs(options.staleDate);
  if (stale != null) config.staleDateMs = stale;
  if (options.relevanceScore != null) config.relevanceScore = options.relevanceScore;
  return config;
}

function toNativeUpdate(options: UpdateLiveActivityOptions): NativeUpdateConfig {
  const config: NativeUpdateConfig = { state: toNativeState(options.state) };
  const stale = toEpochMs(options.staleDate);
  if (stale != null) config.staleDateMs = stale;
  if (options.relevanceScore != null) config.relevanceScore = options.relevanceScore;
  if (options.alert != null) {
    config.alertTitle = String(options.alert.title);
    config.alertBody = String(options.alert.body);
    if (options.alert.sound != null) config.alertSound = String(options.alert.sound);
  }
  return config;
}

function toNativeEnd(options: EndLiveActivityOptions = {}): NativeEndConfig {
  const config: NativeEndConfig = {
    dismissalPolicy: options.dismissalPolicy ?? 'default',
  };
  if (options.state != null) config.state = toNativeState(options.state);
  const dismissal = toEpochMs(options.dismissalDate);
  if (dismissal != null) config.dismissalDateMs = dismissal;
  return config;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Whether the user has Live Activities enabled for this app. `false` off-iOS. */
export function areActivitiesEnabled(): boolean {
  if (!isSupported) return false;
  return native().areActivitiesEnabled();
}

/**
 * Start (request) a Live Activity locally. Resolves with a {@link LiveActivity}
 * handle (its id and, when available, the per-activity push token).
 * @throws {@link LiveActivityError} off-iOS or when ActivityKit refuses.
 */
export async function startLiveActivity(
  options: StartLiveActivityOptions
): Promise<LiveActivity> {
  if (!isSupported) throw unsupported('startLiveActivity');
  const config = toNativeStart(options);
  try {
    const result = await native().startActivity(config);
    return { id: result.activityId, pushToken: result.pushToken ?? null };
  } catch (error) {
    throw wrap(error, 'START_FAILED', 'Failed to start the Live Activity.');
  }
}

/** Update a running activity's content state. No-op off-iOS. */
export async function updateLiveActivity(
  id: string,
  options: UpdateLiveActivityOptions
): Promise<void> {
  if (!isSupported) return;
  try {
    await native().updateActivity(id, toNativeUpdate(options));
  } catch (error) {
    throw wrap(error, 'UPDATE_FAILED', `Failed to update the Live Activity "${id}".`);
  }
}

/** End a specific activity. No-op off-iOS. */
export async function endLiveActivity(
  id: string,
  options?: EndLiveActivityOptions
): Promise<void> {
  if (!isSupported) return;
  await native().endActivity(id, toNativeEnd(options));
}

/** End every activity started by this app. No-op off-iOS. */
export async function endAllLiveActivities(
  options?: EndLiveActivityOptions
): Promise<void> {
  if (!isSupported) return;
  await native().endAllActivities(toNativeEnd(options));
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Snapshot of every activity this app currently knows about. `[]` off-iOS. */
export async function getActiveLiveActivities(): Promise<LiveActivityInfo[]> {
  if (!isSupported) return [];
  const list = await native().getAllActivities();
  return list.map((a) => ({
    id: a.activityId,
    state: toActivityState(a.state),
    pushToken: a.pushToken ?? null,
  }));
}

/** Lifecycle state of one activity. `'unknown'` off-iOS. */
export async function getLiveActivityState(id: string): Promise<ActivityState> {
  if (!isSupported) return 'unknown';
  return toActivityState(await native().getActivityState(id));
}

/** Current per-activity APNs update token (hex), or `null`. */
export async function getPushToken(id: string): Promise<string | null> {
  if (!isSupported) return null;
  return (await native().getPushToken(id)) ?? null;
}

/** Current push-to-start token (hex) for remote `start` (iOS 17.2+), or `null`. */
export async function getPushToStartToken(): Promise<string | null> {
  if (!isSupported) return null;
  return (await native().getPushToStartToken()) ?? null;
}

// ---------------------------------------------------------------------------
// Events (ref-counted: one native callback per event, fanned out to subscribers)
// ---------------------------------------------------------------------------

function makeEvent<T>(
  setNative: (module: NativeModule, callback: ((value: T) => void) | undefined) => void
) {
  const listeners = new Set<(value: T) => void>();
  return (listener: (value: T) => void): Subscription => {
    if (!isSupported) return { remove: () => undefined };
    listeners.add(listener);
    if (listeners.size === 1) {
      setNative(native(), (value) => {
        for (const l of listeners) {
          try {
            l(value);
          } catch {
            // a throwing subscriber must not break delivery to the others
          }
        }
      });
    }
    return {
      remove: () => {
        listeners.delete(listener);
        if (listeners.size === 0) setNative(native(), undefined);
      },
    };
  };
}

const activityStateEvent = makeEvent<NativeActivityStateEvent>((m, cb) =>
  m.setOnActivityStateChange(cb ? (e) => cb(e) : undefined)
);
const pushTokenEvent = makeEvent<NativePushTokenEvent>((m, cb) =>
  m.setOnPushTokenChange(cb ? (e) => cb(e) : undefined)
);
const pushToStartTokenEvent = makeEvent<string>((m, cb) =>
  m.setOnPushToStartTokenChange(cb ? (t) => cb(t) : undefined)
);
const enablementEvent = makeEvent<boolean>((m, cb) =>
  m.setOnEnablementChange(cb ? (v) => cb(v) : undefined)
);

/** Subscribe to activity lifecycle changes (active → ended/dismissed/stale). */
export function addActivityStateListener(
  listener: (event: ActivityStateChange) => void
): Subscription {
  return activityStateEvent((e) =>
    listener({ id: e.activityId, state: toActivityState(e.state) })
  );
}

/**
 * Subscribe to per-activity APNs **update** token changes. Fires when a token is
 * first issued and again whenever iOS rotates it — register your backend's token
 * store here so remote updates keep working.
 */
export function addPushTokenListener(
  listener: (event: PushTokenChange) => void
): Subscription {
  return pushTokenEvent((e) => listener({ id: e.activityId, token: e.token }));
}

/**
 * Subscribe to push-to-start token changes (iOS 17.2+). Send this token to your
 * backend so it can remotely `start` an activity even while the app is killed.
 */
export function addPushToStartTokenListener(
  listener: (token: string) => void
): Subscription {
  return pushToStartTokenEvent(listener);
}

/** Subscribe to changes in the user's Live Activities enablement setting. */
export function addEnablementListener(
  listener: (enabled: boolean) => void
): Subscription {
  return enablementEvent(listener);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function wrap(
  error: unknown,
  code: LiveActivityErrorCode,
  fallback: string
): LiveActivityError {
  if (error instanceof LiveActivityError) return error;
  const message = (error as { message?: string })?.message ?? fallback;
  return new LiveActivityError(code, message);
}
