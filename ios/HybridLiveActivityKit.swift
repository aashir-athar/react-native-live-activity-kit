//
//  HybridLiveActivityKit.swift
//  react-native-live-activity-kit
//
//  Nitro HybridObject implementation backing the JS `LiveActivityKit` API.
//
//  ─────────────────────────────────────────────────────────────────────────
//  iOS AVAILABILITY ISOLATION (critical)
//  ─────────────────────────────────────────────────────────────────────────
//  The pod's deployment target is iOS 15.1, but ActivityKit (`Activity`,
//  `ActivityAuthorizationInfo`, `ActivityContent`, …) is iOS 16.1+. Nitro's
//  autolinking constructs `HybridLiveActivityKit` eagerly on EVERY device that
//  loads the JS module — including iOS 15.x — so this class must be fully
//  instantiable below 16.1. Therefore it holds NO ActivityKit-typed stored
//  properties: all ActivityKit state + logic lives in the separate
//  `@available(iOS 16.1, *) LiveActivityManager` singleton, reached only from
//  inside `if #available(iOS 16.1, *)` blocks. The single bridge between them
//  is `private var managerStore: Any?` (an erased `LiveActivityManager`).
//
//  Under unavailable iOS, `areActivitiesEnabled()` returns false and all
//  mutating / query methods reject their Promise with a clear error.
//

import Foundation
import NitroModules

#if canImport(ActivityKit)
import ActivityKit
#endif

/// The Nitro Hybrid class. Safe to construct on iOS 15.1+ (no ActivityKit in
/// its stored properties or its non-`@available` code paths).
public final class HybridLiveActivityKit: HybridLiveActivityKitSpec {
  /// Type-erased holder for the `@available(iOS 16.1, *) LiveActivityManager`.
  /// Erased to `Any?` so the property's declared type never references an
  /// ActivityKit-gated symbol on iOS 15.x.
  private var managerStore: Any?

  public override init() {
    super.init()
    // Eagerly create the manager so token / state / enablement observers start
    // streaming as early as possible (push tokens for relaunched / push-started
    // activities can arrive before JS asks for them).
    if #available(iOS 16.1, *) {
      let manager = LiveActivityManager.shared
      self.managerStore = manager
      manager.bootstrap()
    }
  }

  /// Resolves the strongly-typed manager when ActivityKit is available.
  @available(iOS 16.1, *)
  private var manager: LiveActivityManager {
    if let existing = managerStore as? LiveActivityManager {
      return existing
    }
    let manager = LiveActivityManager.shared
    managerStore = manager
    return manager
  }

  /// Shared rejection used by every code path that runs on a device too old for
  /// Live Activities (or a build without ActivityKit).
  private static let unavailableMessage =
    "Live Activities require iOS 16.1 or newer. This device does not support ActivityKit."

  private static func unavailableError() -> RuntimeError {
    return RuntimeError(unavailableMessage)
  }

  // MARK: - Enablement

  public func areActivitiesEnabled() throws -> Bool {
    if #available(iOS 16.1, *) {
      return manager.areActivitiesEnabled()
    }
    return false
  }

  // MARK: - Lifecycle (start / update / end)

  public func startActivity(config: NativeStartConfig) throws -> Promise<NativeStartResult> {
    if #available(iOS 16.2, *) {
      return manager.startActivity(config: config)
    }
    return Promise.rejected(withError: Self.unavailableError())
  }

  public func updateActivity(
    activityId: String,
    config: NativeUpdateConfig
  ) throws -> Promise<Void> {
    if #available(iOS 16.2, *) {
      return manager.updateActivity(activityId: activityId, config: config)
    }
    return Promise.rejected(withError: Self.unavailableError())
  }

  public func endActivity(activityId: String, config: NativeEndConfig) throws -> Promise<Void> {
    if #available(iOS 16.2, *) {
      return manager.endActivity(activityId: activityId, config: config)
    }
    return Promise.rejected(withError: Self.unavailableError())
  }

  public func endAllActivities(config: NativeEndConfig) throws -> Promise<Void> {
    if #available(iOS 16.2, *) {
      return manager.endAllActivities(config: config)
    }
    return Promise.rejected(withError: Self.unavailableError())
  }

  // MARK: - Queries

  public func getAllActivities() throws -> Promise<[NativeActivityInfo]> {
    if #available(iOS 16.1, *) {
      return Promise.resolved(withResult: manager.getAllActivities())
    }
    return Promise.resolved(withResult: [])
  }

  public func getActivityState(activityId: String) throws -> Promise<String> {
    if #available(iOS 16.1, *) {
      return Promise.resolved(withResult: manager.getActivityState(activityId: activityId))
    }
    // No such activity can exist below 16.1.
    return Promise.resolved(withResult: "unknown")
  }

  public func getPushToken(activityId: String) throws -> Promise<String?> {
    if #available(iOS 16.1, *) {
      return Promise.resolved(withResult: manager.getPushToken(activityId: activityId))
    }
    return Promise.resolved(withResult: nil)
  }

  public func getPushToStartToken() throws -> Promise<String?> {
    if #available(iOS 17.2, *) {
      return Promise.resolved(withResult: manager.getPushToStartToken())
    }
    return Promise.resolved(withResult: nil)
  }

  // MARK: - Event callbacks (single callback per event)

  public func setOnActivityStateChange(
    callback: ((_ event: NativeActivityStateEvent) -> Void)?
  ) throws {
    if #available(iOS 16.1, *) {
      manager.onActivityStateChange = callback
    }
  }

  public func setOnPushTokenChange(
    callback: ((_ event: NativePushTokenEvent) -> Void)?
  ) throws {
    if #available(iOS 16.1, *) {
      manager.onPushTokenChange = callback
    }
  }

  public func setOnPushToStartTokenChange(callback: ((_ token: String) -> Void)?) throws {
    if #available(iOS 16.1, *) {
      manager.onPushToStartTokenChange = callback
    }
  }

  public func setOnEnablementChange(callback: ((_ enabled: Bool) -> Void)?) throws {
    if #available(iOS 16.1, *) {
      manager.onEnablementChange = callback
    }
  }
}

#if canImport(ActivityKit)

// ───────────────────────────────────────────────────────────────────────────
// MARK: - LiveActivityManager
// ───────────────────────────────────────────────────────────────────────────
//
// All ActivityKit-typed state and logic. Compiled only where ActivityKit is
// importable, and every member is gated to iOS 16.1+ (with finer 16.2 / 17.2
// gates on individual calls). A process-wide singleton so observation Tasks and
// the activity / token registries survive across HybridObject re-creations and
// match the system's single ActivityKit surface.
//
@available(iOS 16.1, *)
final class LiveActivityManager {
  static let shared = LiveActivityManager()

  // MARK: Callbacks (set from the Hybrid class; fired from observation Tasks).

  /// Guards the callback closures. Separate from `registryLock` to keep the hot
  /// registry path from contending with JS callback registration.
  private let callbackLock = NSLock()

  private var _onActivityStateChange: ((NativeActivityStateEvent) -> Void)?
  private var _onPushTokenChange: ((NativePushTokenEvent) -> Void)?
  private var _onPushToStartTokenChange: ((String) -> Void)?
  private var _onEnablementChange: ((Bool) -> Void)?

  var onActivityStateChange: ((NativeActivityStateEvent) -> Void)? {
    get { callbackLock.withLock { _onActivityStateChange } }
    set { callbackLock.withLock { _onActivityStateChange = newValue } }
  }
  var onPushTokenChange: ((NativePushTokenEvent) -> Void)? {
    get { callbackLock.withLock { _onPushTokenChange } }
    set { callbackLock.withLock { _onPushTokenChange = newValue } }
  }
  var onPushToStartTokenChange: ((String) -> Void)? {
    get { callbackLock.withLock { _onPushToStartTokenChange } }
    set { callbackLock.withLock { _onPushToStartTokenChange = newValue } }
  }
  var onEnablementChange: ((Bool) -> Void)? {
    get { callbackLock.withLock { _onEnablementChange } }
    set { callbackLock.withLock { _onEnablementChange = newValue } }
  }

  // MARK: Registries (guarded by `registryLock`).

  private let registryLock = NSLock()
  /// activityId -> the live `Activity` handle (for update / end).
  private var activities: [String: Activity<LiveActivityKitAttributes>] = [:]
  /// activityId -> latest per-activity APNs update token (lowercase hex).
  /// Tokens ROTATE, so this is always the most recent value seen.
  private var updateTokens: [String: String] = [:]
  /// Per-activity observation Tasks, so we never double-observe one activity and
  /// can cancel on teardown.
  private var observationTasks: [String: Task<Void, Never>] = [:]
  /// Latest push-to-start token (lowercase hex), iOS 17.2+.
  private var pushToStartToken: String?

  private var didBootstrap = false

  private init() {}

  // MARK: Bootstrap

  /// Idempotently start the process-wide observers: existing activities,
  /// new/relaunched activities, the push-to-start token stream, and enablement.
  func bootstrap() {
    registryLock.lock()
    if didBootstrap {
      registryLock.unlock()
      return
    }
    didBootstrap = true
    // Snapshot whatever the system already has (relaunch / push-started).
    let existing = Activity<LiveActivityKitAttributes>.activities
    registryLock.unlock()

    for activity in existing {
      observe(activity)
    }

    observeNewActivities()
    observePushToStartToken()
    observeEnablement()
  }

  // MARK: Enablement

  func areActivitiesEnabled() -> Bool {
    return ActivityAuthorizationInfo().areActivitiesEnabled
  }

  private func observeEnablement() {
    let info = ActivityAuthorizationInfo()
    Task { [weak self] in
      for await enabled in info.activityEnablementUpdates {
        guard let self else { return }
        self.onEnablementChange?(enabled)
      }
    }
  }

  // MARK: Start

  /// Build the attributes + content state and request the activity. `request` is
  /// SYNC + throwing, so we run it inline on the main queue and resolve / reject
  /// a manually-controlled Promise. iOS 16.2+ for `ActivityContent`.
  @available(iOS 16.2, *)
  func startActivity(config: NativeStartConfig) -> Promise<NativeStartResult> {
    let promise = Promise<NativeStartResult>()

    DispatchQueue.main.async { [weak self] in
      guard let self else {
        promise.reject(withError: RuntimeError("LiveActivityManager was deallocated."))
        return
      }

      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        promise.reject(
          withError: RuntimeError(
            "Live Activities are not enabled. The user has disabled them for this app in Settings, or the app is not in a state that permits starting one."
          ))
        return
      }

      let attributes = Self.makeAttributes(from: config.attributes)
      let state = Self.makeContentState(from: config.state)
      let content = ActivityContent(
        state: state,
        staleDate: Self.date(fromEpochMs: config.staleDateMs),
        relevanceScore: config.relevanceScore ?? 0.0
      )

      do {
        let activity = try Activity<LiveActivityKitAttributes>.request(
          attributes: attributes,
          content: content,
          pushType: .token
        )

        // Capture the token synchronously if one is already available.
        let initialToken = activity.pushToken.map(Self.hexString(from:))
        if let initialToken {
          self.registryLock.withLock { self.updateTokens[activity.id] = initialToken }
        }

        // Register + start per-activity observation.
        self.observe(activity)

        promise.resolve(
          withResult: NativeStartResult(activityId: activity.id, pushToken: initialToken))
      } catch {
        promise.reject(
          withError: RuntimeError("Failed to start Live Activity: \(error.localizedDescription)"))
      }
    }

    return promise
  }

  // MARK: Update

  @available(iOS 16.2, *)
  func updateActivity(activityId: String, config: NativeUpdateConfig) -> Promise<Void> {
    return Promise.async { [weak self] in
      guard let self else {
        throw RuntimeError("LiveActivityManager was deallocated.")
      }
      guard let activity = self.activity(for: activityId) else {
        throw RuntimeError("NOT_FOUND: No Live Activity with id \"\(activityId)\".")
      }

      let state = Self.makeContentState(from: config.state)
      let content = ActivityContent(
        state: state,
        staleDate: Self.date(fromEpochMs: config.staleDateMs),
        relevanceScore: config.relevanceScore ?? 0.0
      )

      let alert = Self.makeAlertConfiguration(
        title: config.alertTitle, body: config.alertBody, sound: config.alertSound)

      // `update` is async + non-throwing.
      await activity.update(content, alertConfiguration: alert)
    }
  }

  // MARK: End

  @available(iOS 16.2, *)
  func endActivity(activityId: String, config: NativeEndConfig) -> Promise<Void> {
    return Promise.async { [weak self] in
      guard let self else {
        throw RuntimeError("LiveActivityManager was deallocated.")
      }
      guard let activity = self.activity(for: activityId) else {
        throw RuntimeError("NOT_FOUND: No Live Activity with id \"\(activityId)\".")
      }

      let content = Self.makeFinalContent(from: config.state)
      let policy = Self.dismissalPolicy(
        from: config.dismissalPolicy, dismissalDateMs: config.dismissalDateMs)

      await activity.end(content, dismissalPolicy: policy)
      // The activityStateUpdates observer will purge the registry on .ended /
      // .dismissed; no manual removal needed here.
    }
  }

  @available(iOS 16.2, *)
  func endAllActivities(config: NativeEndConfig) -> Promise<Void> {
    return Promise.async { [weak self] in
      guard let self else {
        throw RuntimeError("LiveActivityManager was deallocated.")
      }

      let content = Self.makeFinalContent(from: config.state)
      let policy = Self.dismissalPolicy(
        from: config.dismissalPolicy, dismissalDateMs: config.dismissalDateMs)

      // End every activity the system knows about (covers ones we may not have
      // registered, e.g. push-started before this process attached).
      let all = Activity<LiveActivityKitAttributes>.activities
      await withTaskGroup(of: Void.self) { group in
        for activity in all {
          group.addTask {
            await activity.end(content, dismissalPolicy: policy)
          }
        }
      }
      _ = self  // keep `self` alive for the duration; registry purges via observer.
    }
  }

  // MARK: Queries

  func getAllActivities() -> [NativeActivityInfo] {
    // Source of truth is the system snapshot; enrich each with the freshest
    // token we hold (system `pushToken` can briefly lag our stream).
    let snapshot = Activity<LiveActivityKitAttributes>.activities
    let tokens = registryLock.withLock { updateTokens }

    return snapshot.map { activity in
      let token = tokens[activity.id] ?? activity.pushToken.map(Self.hexString(from:))
      return NativeActivityInfo(
        activityId: activity.id,
        state: Self.stateString(activity.activityState),
        pushToken: token
      )
    }
  }

  func getActivityState(activityId: String) -> String {
    if let activity = activity(for: activityId) {
      return Self.stateString(activity.activityState)
    }
    // Fall back to the system snapshot in case it isn't in our registry yet.
    if let activity = Activity<LiveActivityKitAttributes>.activities
      .first(where: { $0.id == activityId })
    {
      return Self.stateString(activity.activityState)
    }
    return "unknown"
  }

  func getPushToken(activityId: String) -> String? {
    if let token = (registryLock.withLock { updateTokens[activityId] }) {
      return token
    }
    if let activity = Activity<LiveActivityKitAttributes>.activities
      .first(where: { $0.id == activityId })
    {
      return activity.pushToken.map(Self.hexString(from:))
    }
    return nil
  }

  func getPushToStartToken() -> String? {
    return registryLock.withLock { pushToStartToken }
  }

  // MARK: - Observation

  /// Look up a live `Activity` handle: registry first, then the system snapshot.
  private func activity(for activityId: String) -> Activity<LiveActivityKitAttributes>? {
    if let registered = (registryLock.withLock { activities[activityId] }) {
      return registered
    }
    return Activity<LiveActivityKitAttributes>.activities.first { $0.id == activityId }
  }

  /// Register an activity and spin up its long-lived token + state observers.
  /// Idempotent and race-free: the observation Task is created and stored under
  /// a single `registryLock` acquisition, so concurrent `observe` calls for the
  /// same id (e.g. `startActivity` racing the `activityUpdates` stream) can never
  /// start two Tasks for one activity.
  private func observe(_ activity: Activity<LiveActivityKitAttributes>) {
    let id = activity.id

    registryLock.lock()
    activities[id] = activity
    guard observationTasks[id] == nil else {
      // Already observing this activity — just refreshed its handle above.
      registryLock.unlock()
      return
    }

    let task = Task { [weak self] in
      await withTaskGroup(of: Void.self) { group in
        // Per-activity APNs update token stream (tokens rotate).
        group.addTask { [weak self] in
          for await tokenData in activity.pushTokenUpdates {
            guard let self else { return }
            let hex = Self.hexString(from: tokenData)
            self.registryLock.withLock { self.updateTokens[id] = hex }
            self.onPushTokenChange?(NativePushTokenEvent(activityId: id, token: hex))
          }
        }
        // Lifecycle state stream.
        group.addTask { [weak self] in
          for await state in activity.activityStateUpdates {
            guard let self else { return }
            let stateString = Self.stateString(state)
            self.onActivityStateChange?(
              NativeActivityStateEvent(activityId: id, state: stateString))
            if state == .ended || state == .dismissed {
              self.cleanup(activityId: id)
            }
          }
        }
      }
    }
    observationTasks[id] = task
    registryLock.unlock()
  }

  /// Observe activities started/relaunched outside our own `request` call
  /// (push-to-start, app relaunch with a running activity).
  private func observeNewActivities() {
    Task { [weak self] in
      for await activity in Activity<LiveActivityKitAttributes>.activityUpdates {
        guard let self else { return }
        self.observe(activity)
      }
    }
  }

  /// Static push-to-start token stream (iOS 17.2+). Tokens rotate.
  private func observePushToStartToken() {
    guard #available(iOS 17.2, *) else { return }
    Task { [weak self] in
      for await tokenData in Activity<LiveActivityKitAttributes>.pushToStartTokenUpdates {
        guard let self else { return }
        let hex = Self.hexString(from: tokenData)
        self.registryLock.withLock { self.pushToStartToken = hex }
        self.onPushToStartTokenChange?(hex)
      }
    }
  }

  /// Remove a finished activity from the registries and cancel its observers.
  private func cleanup(activityId: String) {
    let task: Task<Void, Never>? = registryLock.withLock {
      activities.removeValue(forKey: activityId)
      updateTokens.removeValue(forKey: activityId)
      return observationTasks.removeValue(forKey: activityId)
    }
    task?.cancel()
  }

  // MARK: - Mapping helpers

  /// Build the immutable attributes from the Nitro struct.
  private static func makeAttributes(
    from native: NativeLiveActivityAttributes
  ) -> LiveActivityKitAttributes {
    return LiveActivityKitAttributes(
      name: native.name,
      extra: native.extra.isEmpty ? nil : native.extra
    )
  }

  /// Build the mutable content state from the Nitro struct. Optionals map 1:1;
  /// `extra` collapses an empty dictionary to `nil` to match the Codable shape.
  private static func makeContentState(
    from native: NativeLiveActivityState
  ) -> LiveActivityKitAttributes.ContentState {
    return LiveActivityKitAttributes.ContentState(
      title: native.title,
      subtitle: native.subtitle,
      body: native.body,
      status: native.status,
      progress: native.progress,
      date: native.date,
      imageName: native.imageName,
      tintColorHex: native.tintColorHex,
      leading: native.leading,
      trailing: native.trailing,
      extra: native.extra.isEmpty ? nil : native.extra
    )
  }

  /// Optional final content for `end(...)`. `nil` keeps the last shown state.
  @available(iOS 16.2, *)
  private static func makeFinalContent(
    from native: NativeLiveActivityState?
  ) -> ActivityContent<LiveActivityKitAttributes.ContentState>? {
    guard let native else { return nil }
    return ActivityContent(state: makeContentState(from: native), staleDate: nil)
  }

  /// Build an `AlertConfiguration` only when BOTH title and body are present
  /// (an alert without text is meaningless). Sound: `.named(...)` if provided,
  /// else `.default`.
  @available(iOS 16.2, *)
  private static func makeAlertConfiguration(
    title: String?, body: String?, sound: String?
  ) -> AlertConfiguration? {
    guard let title, let body else { return nil }
    let alertSound: AlertConfiguration.AlertSound
    if let sound, !sound.isEmpty {
      alertSound = .named(sound)
    } else {
      alertSound = .default
    }
    return AlertConfiguration(
      title: LocalizedStringResource(stringLiteral: title),
      body: LocalizedStringResource(stringLiteral: body),
      sound: alertSound
    )
  }

  /// Map the JS dismissal policy string -> `ActivityUIDismissalPolicy`.
  /// `'after'` uses `dismissalDateMs` (epoch ms); a missing date degrades to
  /// `.default`. `'immediate'` -> `.immediate`. Anything else -> `.default`.
  @available(iOS 16.2, *)
  private static func dismissalPolicy(
    from policy: String, dismissalDateMs: Double?
  ) -> ActivityUIDismissalPolicy {
    switch policy {
    case "immediate":
      return .immediate
    case "after":
      if let date = date(fromEpochMs: dismissalDateMs) {
        return .after(date)
      }
      return .default
    default:
      return .default
    }
  }

  /// Epoch milliseconds -> `Date`. Returns `nil` for a missing value.
  private static func date(fromEpochMs ms: Double?) -> Date? {
    guard let ms else { return nil }
    return Date(timeIntervalSince1970: ms / 1000.0)
  }

  /// Lowercase hex encoding of an APNs token.
  private static func hexString(from data: Data) -> String {
    return data.map { String(format: "%02x", $0) }.joined()
  }

  /// Map `ActivityState` -> the exact JS string contract.
  private static func stateString(_ state: ActivityState) -> String {
    switch state {
    case .active: return "active"
    case .pending: return "pending"
    case .stale: return "stale"
    case .ended: return "ended"
    case .dismissed: return "dismissed"
    @unknown default: return "unknown"
    }
  }
}

#endif  // canImport(ActivityKit)

// MARK: - NSLock convenience

extension NSLock {
  /// Run `body` while holding the lock; always unlocks, even on throw.
  @inline(__always)
  fileprivate func withLock<R>(_ body: () throws -> R) rethrows -> R {
    lock()
    defer { unlock() }
    return try body()
  }
}
