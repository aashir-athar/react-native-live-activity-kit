package com.margelo.nitro.liveactivitykit

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.core.Promise

/**
 * Android implementation of the LiveActivityKit HybridObject.
 *
 * Live Activities (ActivityKit) are an **iOS-only** platform feature with no
 * Android equivalent. To keep the package cross-platform without crashing, this
 * Android side is a deliberate, well-behaved no-op shim:
 *
 *  - Capability checks report "unsupported" ([areActivitiesEnabled] → `false`).
 *  - [startActivity] — the one call that *must* return a value — rejects with a
 *    clear, actionable message so callers fail loudly rather than silently hang.
 *  - The mutating lifecycle calls ([updateActivity], [endActivity],
 *    [endAllActivities]) resolve as no-ops, mirroring the JS wrapper which already
 *    treats them as no-ops off iOS. Resolving (not rejecting) makes them safe to
 *    call unconditionally — belt-and-suspenders alongside the JS guard.
 *  - Query calls resolve to empty/neutral values (no activities, "unknown" state,
 *    null tokens).
 *  - The event setters store nothing; Android never produces Live Activity events.
 *
 * The class holds no state and touches no system APIs, so it is inherently
 * thread-safe and allocation-light.
 */
@DoNotStrip
@Keep
class HybridLiveActivityKit : HybridLiveActivityKitSpec() {

  // ───────────────────────────── Capability ──────────────────────────────

  override fun areActivitiesEnabled(): Boolean {
    // Live Activities are never available on Android.
    return false
  }

  // ───────────────────────────── Lifecycle ───────────────────────────────

  override fun startActivity(config: NativeStartConfig): Promise<NativeStartResult> {
    // The only call that returns a meaningful payload — there is nothing sensible
    // to fabricate on Android, so reject loudly with an actionable message.
    return Promise.rejected(
      IllegalStateException(UNSUPPORTED_MESSAGE)
    )
  }

  override fun updateActivity(activityId: String, config: NativeUpdateConfig): Promise<Unit> {
    // No-op: there is no activity to update. Resolve so callers can fire-and-forget.
    return Promise.resolved(Unit)
  }

  override fun endActivity(activityId: String, config: NativeEndConfig): Promise<Unit> {
    // No-op: there is no activity to end.
    return Promise.resolved(Unit)
  }

  override fun endAllActivities(config: NativeEndConfig): Promise<Unit> {
    // No-op: there are never any activities to end.
    return Promise.resolved(Unit)
  }

  // ─────────────────────────────── Queries ───────────────────────────────

  override fun getAllActivities(): Promise<Array<NativeActivityInfo>> {
    // No activities can ever exist on Android.
    return Promise.resolved(emptyArray())
  }

  override fun getActivityState(activityId: String): Promise<String> {
    // Mirrors ActivityState.unknown for any requested id.
    return Promise.resolved("unknown")
  }

  override fun getPushToken(activityId: String): Promise<String?> {
    // No push tokens without Live Activities.
    return Promise.resolved(null)
  }

  override fun getPushToStartToken(): Promise<String?> {
    // No push-to-start tokens without Live Activities.
    return Promise.resolved(null)
  }

  // ─────────────────────────────── Events ────────────────────────────────
  // Android never emits Live Activity events, so every listener is a no-op.
  // We intentionally do not retain the callbacks (nothing would ever invoke them).

  override fun setOnActivityStateChange(callback: ((event: NativeActivityStateEvent) -> Unit)?) {
    // No-op.
  }

  override fun setOnPushTokenChange(callback: ((event: NativePushTokenEvent) -> Unit)?) {
    // No-op.
  }

  override fun setOnPushToStartTokenChange(callback: ((token: String) -> Unit)?) {
    // No-op.
  }

  override fun setOnEnablementChange(callback: ((enabled: Boolean) -> Unit)?) {
    // No-op.
  }

  private companion object {
    private const val UNSUPPORTED_MESSAGE =
      "react-native-live-activity-kit: Live Activities are an iOS-only feature; " +
        "not available on Android."
  }
}
