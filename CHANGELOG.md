# Changelog

All notable changes to `react-native-live-activity-kit` are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-17

Initial public release — the self-contained, **vendor-neutral**, **custom-UI**
iOS Live Activities & Dynamic Island toolkit for React Native and Expo, and a
drop-in home for anyone stranded by the archived `expo-live-activity`. Built on
the **New Architecture (Nitro)**.

### Added

- **Client Nitro module.** A fully-typed `LiveActivityKit` HybridObject wrapper:
  `startLiveActivity` / `updateLiveActivity` / `endLiveActivity` /
  `endAllLiveActivities`, query helpers (`getActiveLiveActivities`,
  `getLiveActivityState`, `getPushToken`, `getPushToStartToken`), capability
  checks (`isSupported`, `areActivitiesEnabled`), and a typed `LiveActivityError`.
  Live Activities are iOS-only; every method is a **safe no-op** (or a typed
  rejection on `startLiveActivity`) on Android and web.
- **Dynamic Island + Lock Screen SwiftUI template.** A built-in, fully
  **data-driven** widget that renders the shared `ContentState` across the Lock
  Screen / banner and every Dynamic Island presentation (compact, minimal,
  expanded). It's plain SwiftUI source you **own and customize** — accent color
  via `tintColorHex`, an SF Symbol glyph via `imageName`, a `progress` bar, a
  `status` pill, and a live `date` timer.
- **Push-to-start + update token collection with rotation handling.** Per-activity
  APNs **update** tokens (iOS 16.1+) and the static **push-to-start** token
  (iOS 17.2+) are surfaced through ref-counted listeners
  (`addPushTokenListener`, `addPushToStartTokenListener`,
  `addActivityStateListener`, `addEnablementListener`) that **re-fire on
  rotation**, so a backend can always push to the latest token.
- **Typed, dependency-free Node APNs sender** (`react-native-live-activity-kit/server`).
  Pushes `start` / `update` / `end` over APNs HTTP/2 with a hand-rolled ES256 JWT
  — **no runtime dependencies** beyond the Node standard library. Enforces the
  **4 KB** payload cap client-side (`MAX_PAYLOAD_BYTES`), surfaces a typed
  `ApnsError` (`kind` + `status`/`reason`) for branching (e.g. purge a token on
  `Unregistered` / `410`), supports **iOS 18 broadcast channels**, and ships a
  `LiveActivityTokenRegistry` interface plus an `InMemoryTokenRegistry` reference
  implementation.
- **One shared content-state schema.** `src/shared/schema.ts` is the single source
  of truth, imported by **both** the client and the `/server` sender and mirrored
  field-for-field by the Swift `ContentState`, so a payload that type-checks
  (JS → APNs JSON → Swift `Codable`) is guaranteed to decode and render.
- **Expo config plugin.** Scaffolds the SwiftUI **Widget Extension** target, copies
  in the generated Swift, sets `NSSupportsLiveActivities` (and
  `NSSupportsLiveActivitiesFrequentUpdates` when `frequentUpdates`), and optionally
  wires an **App Group** and the **Push Notifications** capability — configurable
  via `widgetName`, `deploymentTarget`, `appGroup`, `frequentUpdates`, `enablePush`.
  Idempotent (`createRunOncePlugin`). Bare React Native is supported via documented
  manual Xcode steps.
- **New Architecture / Nitro.** Built on [Nitro Modules](https://nitro.margelo.com)
  — a single typed `HybridObject`, no old-bridge support.
- **No telemetry.** The package collects and transmits no PII; the `/server` sender
  talks only to Apple's APNs hosts with your signed token.

### Notes

- The native iOS layers (the Swift Nitro module, the `ActivityKit` attributes, and
  the scaffolded SwiftUI widget) are **reviewed, not device-compiled in CI** —
  Live Activities, the Dynamic Island, push-to-start, and APNs delivery require an
  Apple Developer account, a signed build, and a physical device. CI verifies the
  JS / Nitro-spec / config-plugin / server layer (codegen, typecheck, build, pack).
- The Dynamic Island is available only on **iPhone 14 Pro and later**; other
  iPhones show the Lock Screen presentation.

[Unreleased]: https://github.com/aashir-athar/react-native-live-activity-kit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aashir-athar/react-native-live-activity-kit/releases/tag/v0.1.0
