import type { HybridObject } from 'react-native-nitro-modules';

import type {
  NativeActivityInfo,
  NativeActivityStateEvent,
  NativeEndConfig,
  NativePushTokenEvent,
  NativeStartConfig,
  NativeStartResult,
  NativeUpdateConfig,
} from './LiveActivityTypes.nitro';

/**
 * The single native HybridObject backing the package. Created once from JS via
 * `NitroModules.createHybridObject('LiveActivityKit')` and wrapped by the
 * ergonomic API in `src/index.ts`.
 *
 * Live Activities are an **iOS 16.1+** feature; the Android implementation is a
 * graceful no-op (`areActivitiesEnabled()` returns `false`, mutating calls
 * reject). The widget UI itself lives in a pure-SwiftUI app-extension scaffolded
 * by the config plugin — no JS runs inside the extension.
 *
 * Events use the single-callback pattern: native holds one callback per event;
 * the JS wrapper registers one native callback and fans it out to subscribers.
 */
export interface LiveActivityKit
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Whether the user has Live Activities enabled for this app (iOS 16.1+). */
  areActivitiesEnabled(): boolean;

  /** Start (request) a Live Activity. Resolves with its id and update token. */
  startActivity(config: NativeStartConfig): Promise<NativeStartResult>;
  /** Update a running activity's content state. */
  updateActivity(activityId: string, config: NativeUpdateConfig): Promise<void>;
  /** End a specific activity. */
  endActivity(activityId: string, config: NativeEndConfig): Promise<void>;
  /** End every activity started by this app. */
  endAllActivities(config: NativeEndConfig): Promise<void>;

  /** Snapshot of all activities this app currently knows about. */
  getAllActivities(): Promise<NativeActivityInfo[]>;
  /** Lifecycle state of one activity. */
  getActivityState(activityId: string): Promise<string>;
  /** Current per-activity APNs update token (hex), if any. */
  getPushToken(activityId: string): Promise<string | undefined>;
  /** Current push-to-start token (hex) for remote `start` (iOS 17.2+), if any. */
  getPushToStartToken(): Promise<string | undefined>;

  /** Set (or clear, with `undefined`) the single native callback per event. */
  setOnActivityStateChange(callback?: (event: NativeActivityStateEvent) => void): void;
  setOnPushTokenChange(callback?: (event: NativePushTokenEvent) => void): void;
  setOnPushToStartTokenChange(callback?: (token: string) => void): void;
  setOnEnablementChange(callback?: (enabled: boolean) => void): void;
}
