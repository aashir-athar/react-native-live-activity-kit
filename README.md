<div align="center">

# react-native-live-activity-kit

### iOS **Live Activities** & **Dynamic Island** for **React Native** *and* **Expo** — start/update/end from JS, a built-in **data-driven SwiftUI** template, on-device **push-token** collection, and a typed, **dependency-free Node APNs sender** that shares **one** content-state schema with the client.

Start, update, and end Live Activities from JavaScript; render them on the **Lock Screen** and across every **Dynamic Island** presentation with a customizable SwiftUI widget the config plugin scaffolds for you; collect the per-activity **update token** and the **push-to-start token** (with rotation) so your backend can drive activities remotely; and push `start` / `update` / `end` / `broadcast` from Node with a zero-dependency sender — all over **one** typed `ContentState` schema that flows JS → APNs JSON → Swift `Codable` unchanged. The self-contained, **vendor-neutral**, **custom-UI** Live Activity toolkit — and a drop-in home for anyone stranded by the archived `expo-live-activity`. **New Architecture (Nitro).**

<br />

[![npm version](https://img.shields.io/npm/v/react-native-live-activity-kit.svg?style=for-the-badge&color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/react-native-live-activity-kit)
[![npm downloads](https://img.shields.io/npm/dm/react-native-live-activity-kit.svg?style=for-the-badge&color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/react-native-live-activity-kit)
[![Platform](https://img.shields.io/badge/platform-iOS%2016.2%2B-000000.svg?style=for-the-badge&logo=apple&logoColor=white)](#requirements)
[![New Architecture](https://img.shields.io/badge/New%20Architecture-required-9457EB.svg?style=for-the-badge&logo=react&logoColor=white)](#requirements)

[![Nitro](https://img.shields.io/badge/Nitro-modules-ff6688.svg?style=flat-square)](https://nitro.margelo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?style=flat-square&logo=typescript&logoColor=white)](#)
[![Server](https://img.shields.io/badge/server-zero%20dependencies-2ea043.svg?style=flat-square&logo=node.js&logoColor=white)](#server-api-react-native-live-activity-kitserver)
[![License](https://img.shields.io/npm/l/react-native-live-activity-kit.svg?style=flat-square&color=blue)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](#contributing)

```
                ┌─────────────────────────── on device (this package, client) ───────────────────────────┐
                │                                                                                          │
  startLiveActivity ─► ActivityKit ─► SwiftUI widget (Lock Screen + Dynamic Island)                       │
                │           │                                                                              │
                │           ├─► per-activity UPDATE token ─┐   addPushTokenListener  (rotates)             │
                │           └─► PUSH-TO-START token ───────┤   addPushToStartTokenListener (iOS 17.2+)     │
                └───────────────────────────────────────── │ ─────────────────────────────────────────────┘
                                                            ▼
                                          your app forwards tokens to YOUR backend
                                                            │
                ┌────────────── on your server (react-native-live-activity-kit/server) ──────────────┐
                │  createLiveActivityPusher({ key: .p8, keyId, teamId, bundleId, production })         │
                │     • pusher.startViaPush(pushToStartToken, { attributes, state, alert })  ← start   │
                │     • pusher.update(updateToken, { state })                               ← update   │
                │     • pusher.end(updateToken, {})                                         ← end      │
                │              ───────────────► APNs (HTTP/2, ES256 JWT) ───────────────►  the device   │
                └───────────────────────────────────────────────────────────────────────────────────┘

                         ONE ContentState schema (src/shared/schema.ts) across every arrow above.
```

</div>

---

> [!IMPORTANT]
> **Honesty note (read this first).** The native iOS layers in this package — the
> Nitro `HybridLiveActivityKit` Swift module, the `ActivityKit` attributes, and
> the scaffolded SwiftUI widget — are **reviewed, not device-compiled in this
> repository's CI.** Live Activities, the Dynamic Island, push-to-start, and APNs
> delivery cannot be exercised on the iOS Simulator or in a Linux CI runner; they
> require a real Apple Developer account, a signed build, and a **physical
> device**. CI here verifies the **JS / Nitro-spec / config-plugin / server**
> layer only (codegen, typecheck, build, pack). Treat an on-device run of the
> bundled [`example/`](./example) app as the load-bearing test. See
> [Honest limitations](#honest-limitations--read-before-you-ship).

---

## Table of contents

- [Why this exists](#why-this-exists)
- [How this compares](#how-this-compares)
- [Requirements](#requirements)
- [Installation](#installation)
  - [Expo (config plugin)](#expo-config-plugin)
  - [Bare React Native (manual Xcode steps)](#bare-react-native-manual-xcode-steps)
- [Quick start](#quick-start)
- [The end-to-end push flow](#the-end-to-end-push-flow)
- [Lock Screen & Dynamic Island](#lock-screen--dynamic-island)
- [Content-state schema](#content-state-schema)
- [Client API](#client-api)
  - [Capabilities](#capabilities)
  - [Lifecycle](#lifecycle)
  - [Queries](#queries)
  - [Listeners](#listeners)
  - [Types & errors](#types--errors)
- [Server API (`react-native-live-activity-kit/server`)](#server-api-react-native-live-activity-kitserver)
- [Config plugin options](#config-plugin-options)
- [Customizing the SwiftUI template](#customizing-the-swiftui-template)
- [Extending `ContentState` across every layer](#extending-contentstate-across-every-layer)
- [Honest limitations — read before you ship](#honest-limitations--read-before-you-ship)
- [Troubleshooting](#troubleshooting)
- [Migrating from `expo-live-activity`](#migrating-from-expo-live-activity)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

A Live Activity is the small, glanceable, **always-current** card iOS shows on the
Lock Screen and in the Dynamic Island — the ride that's 3 minutes away, the
delivery that's *On the way*, the score that just changed. Building one well in
React Native has historically meant gluing together three awkward pieces:

1. **A native client** to call `ActivityKit` (`Activity.request` / `update` /
   `end`) and to collect the APNs tokens iOS hands you.
2. **A SwiftUI widget extension** — a *separate Xcode target* with its own
   `ActivityAttributes`, Lock Screen view, and four Dynamic Island presentations.
3. **A backend APNs sender** to push `start` / `update` / `end` over HTTP/2 with
   an ES256-signed JWT, under a 4 KB payload cap, with rotating tokens.

Get any one of those wrong and the card silently never appears. The existing
options each solve a slice and leave the rest to you, or they trade your custom
UI and your backend for a vendor's. The community's most-reached-for Expo
package, [`expo-live-activity`](https://github.com/software-mansion-labs/expo-live-activity),
is **archived**.

**`react-native-live-activity-kit` is all three pieces, designed together, around
one schema:**

- A **Nitro client** (`react-native-live-activity-kit`) starts/updates/ends
  activities from JS and surfaces the per-activity **update token**, the
  **push-to-start token** (iOS 17.2+), enablement, and activity state — with
  **token rotation** handled as a first-class event.
- A **config plugin** scaffolds a pure-**SwiftUI** widget extension — Lock Screen
  + Dynamic Island, fully **data-driven**, **yours to restyle** — so a `prebuild`
  gives you a working, customizable widget instead of a blank Xcode target.
- A **dependency-free Node sender** (`react-native-live-activity-kit/server`)
  pushes `start` / `update` / `end` and manages iOS 18 **broadcast channels** —
  with the **same** typed `ContentState` the client and the SwiftUI template use,
  so a payload that type-checks is guaranteed to decode and render.

It is **self-contained** (no SaaS, no account), **vendor-neutral** (you own the
APNs key and the backend), and **custom-UI** (the widget is plain SwiftUI source
in your project). iOS-only by nature — on **Android and web every method is a
safe no-op** so your cross-platform build never breaks.

---

## How this compares

| | **react-native-live-activity-kit** (this) | `expo-live-activity` | "bring-your-own-server" kits (`expo-widgets`, Voltra, …) | OneSignal Live Activities |
|---|---|---|---|---|
| Status | **Active** | **Archived** | Active | Active (SaaS) |
| Custom SwiftUI UI | ✅ scaffolded + fully editable | ✅ | ✅ (you write it) | ❌ mostly fixed/templated |
| Client start/update/end from JS | ✅ | ✅ | partial | ✅ |
| Push-to-start (iOS 17.2+) | ✅ token + server `startViaPush` | partial | ❌ you wire it | ✅ |
| Token rotation handled | ✅ first-class event | partial | ❌ | ✅ (their servers) |
| **Backend APNs sender included** | ✅ typed, **zero-dependency** Node | ❌ DIY | ❌ DIY | ✅ but **on their servers** |
| iOS 18 broadcast channels | ✅ | ❌ | ❌ | ✅ |
| Shared client⇄server⇄Swift schema | ✅ one `ContentState` | ❌ | ❌ | n/a |
| Vendor lock-in | **none** — you own the `.p8` | none | none | **yes** — routes through OneSignal |
| Expo **and** bare RN | ✅ both | Expo | varies | both |
| Arch | New Arch (Nitro) | Expo modules | varies | varies |

**Pick this** when you want a **custom Live Activity UI**, your **own APNs key
and backend**, and **typed end-to-end** code with no SaaS in the path. Pick
OneSignal if you're happy routing pushes (and a fixed-ish UI) through their
service; pick a bring-your-own-server kit if you'd rather hand-write the backend
and the token plumbing yourself.

---

## Requirements

- **iOS 16.2+** for Live Activities (the Dynamic Island exists on **iPhone 14 Pro
  and later**; older iPhones still get the Lock Screen card). **Push-to-start**
  needs **iOS 17.2+**; **broadcast channels** need **iOS 18+**.
- **React Native 0.79+ with the New Architecture enabled** (Nitro requires it;
  there is **no old-bridge fallback** — Fabric / TurboModules only).
- **`react-native-nitro-modules`** installed in the app (peer dependency).
- A **physical iOS device** and an **Apple Developer account** to see and push
  Live Activities (the Simulator can render but does not exercise the push path).
- For remote push: an **APNs Auth Key (`.p8`)**, its **Key ID**, your **Team ID**,
  and a **Node** backend. See [ZERO-TO-DEPLOY.md](./ZERO-TO-DEPLOY.md).
- **Android / web:** no requirements — every call is a typed no-op.

---

## Installation

```sh
npm install react-native-live-activity-kit react-native-nitro-modules
# or: yarn add / pnpm add
```

The package is iOS-only at runtime, but installs cleanly in any RN/Expo app; the
JS is a no-op off-iOS. The widget extension is created by the **config plugin**
(Expo) or **by hand in Xcode** (bare RN) — both described below.

### Expo (config plugin)

Add the plugin in `app.json` / `app.config.js`, then prebuild. The plugin
scaffolds the SwiftUI **widget extension** target, copies in the three generated
Swift files, sets `NSSupportsLiveActivities`, and (optionally) wires the App
Group and push capability:

```json
{
  "expo": {
    "newArchEnabled": true,
    "plugins": [
      [
        "react-native-live-activity-kit",
        {
          "widgetName": "LiveActivityKitWidget",
          "deploymentTarget": "16.2",
          "appGroup": "group.com.you.app",
          "frequentUpdates": false,
          "enablePush": true
        }
      ]
    ]
  }
}
```

```sh
npx expo prebuild -p ios
```

Then run a **dev client** (Live Activities do **not** run in **Expo Go** — it
can't carry your custom widget extension):

```sh
npx expo run:ios --device
```

See [Config plugin options](#config-plugin-options) for every field. The bundled
[`example/`](./example) app is a complete, runnable reference.

### Bare React Native (manual Xcode steps)

The config plugin requires `prebuild`, which a bare RN app doesn't run — so you
add the widget extension yourself, **once**:

```sh
cd ios && pod install
```

Then in Xcode:

1. **File → New → Target… → Widget Extension.** Name it (e.g.
   `LiveActivityKitWidget`), tick **Include Live Activity**, and **uncheck**
   "Include Configuration App Intent" unless you need it. Set the extension's
   **iOS Deployment Target to 16.2+**.
2. **Add the three generated Swift files** to that new target:
   - [`ios/LiveActivityKitAttributes.swift`](./ios/LiveActivityKitAttributes.swift)
     — the shared `ActivityAttributes` + `ContentState` (add it to **both** the
     app target and the extension target so ActivityKit matches them by name).
   - [`plugin/swift/LiveActivityKitLiveActivity.swift`](./plugin/swift/LiveActivityKitLiveActivity.swift)
     — the Lock Screen + Dynamic Island UI (**this is the file you customize**).
   - [`plugin/swift/LiveActivityKitWidgetBundle.swift`](./plugin/swift/LiveActivityKitWidgetBundle.swift)
     — the `@main` `WidgetBundle` entry point.
3. **Enable Live Activities.** Add `NSSupportsLiveActivities` = `YES` to the
   **app target's** `Info.plist` (and, for frequent push updates, optionally
   `NSSupportsLiveActivitiesFrequentUpdates` = `YES`).
4. **(Push) Add capabilities.** In **Signing & Capabilities** add **Push
   Notifications** to the app target. If you want the app and widget to share
   data, add an **App Group** (e.g. `group.com.you.app`) to both targets.
5. Build and run on a **device**.

> The exact filenames mirror what the config plugin copies, so the same SwiftUI
> source works in both flows. Add new typed fields by editing
> `LiveActivityKitAttributes.swift` (see
> [Extending `ContentState`](#extending-contentstate-across-every-layer)).

---

## Quick start

```ts
import {
  isSupported,
  areActivitiesEnabled,
  startLiveActivity,
  updateLiveActivity,
  endLiveActivity,
  addPushTokenListener,
  addPushToStartTokenListener,
} from 'react-native-live-activity-kit';

async function trackOrder() {
  if (!isSupported || !areActivitiesEnabled()) return; // off-iOS or user disabled

  // 1. Forward tokens to your backend so it can drive the activity remotely.
  addPushToStartTokenListener((token) => sendToBackend('/pts-token', { token }));

  // 2. Start the activity locally with the initial state.
  const activity = await startLiveActivity({
    attributes: { name: 'Order #1234' },
    state: {
      title: 'Order #1234',
      status: 'Preparing',
      progress: 0.25,
      imageName: 'bag.fill',
      tintColorHex: '#FF9500',
    },
  });

  // 3. The per-activity UPDATE token — first value + every rotation.
  addPushTokenListener(({ id, token }) => sendToBackend('/activity-token', { id, token }));

  // 4. Update it as the order progresses (locally, or do this from your server).
  await updateLiveActivity(activity.id, {
    state: { title: 'Order #1234', status: 'On the way', progress: 0.7, imageName: 'bicycle' },
    alert: { title: 'Order update', body: 'Your order is on the way!' },
  });

  // 5. End it.
  await endLiveActivity(activity.id, { dismissalPolicy: 'default' });
}
```

The card now appears on the Lock Screen and in the Dynamic Island, and updates
live. To update it **while the app is backgrounded or killed**, push from your
server — next section.

---

## The end-to-end push flow

Local `startLiveActivity` / `updateLiveActivity` only run while your app is
alive. To keep a Live Activity current after the app is backgrounded or killed,
**your backend pushes to APNs.** The full loop:

1. **Device collects tokens.** On `start`, iOS issues a per-activity **update
   token**; separately it issues a static **push-to-start token** (iOS 17.2+).
   You receive both through [`addPushTokenListener`](#addpushtokenlistener) and
   [`addPushToStartTokenListener`](#addpushtostarttokenlistener). **Tokens
   rotate** — those listeners fire again with the new value; always push to the
   most recent.
2. **App forwards tokens to your backend.** POST them to your server keyed by the
   user / order. (Never ship the `.p8` to the app — it's server-side only.)
3. **Backend pushes via `/server`.** Using your APNs `.p8`, Key ID, Team ID, and
   bundle ID, your server calls the typed sender:

```ts
// On YOUR Node backend — never in the app.
import { createLiveActivityPusher } from 'react-native-live-activity-kit/server';

const pusher = createLiveActivityPusher({
  key: process.env.APNS_KEY_P8!,   // PEM contents of AuthKey_XXXXXXXXXX.p8
  keyId: process.env.APNS_KEY_ID!, // 10-char Key ID
  teamId: process.env.APPLE_TEAM_ID!,
  bundleId: 'com.you.app',
  production: process.env.NODE_ENV === 'production', // TestFlight uses production
});

// Remotely START an activity (even while the app is killed) — iOS 17.2+:
await pusher.startViaPush(pushToStartToken, {
  attributes: { name: 'Order #1234' },
  state: { title: 'Order #1234', status: 'Preparing', progress: 0.25 },
  alert: { title: 'Order placed', body: 'We are preparing your order.' },
});

// UPDATE a running activity (push to its latest update token):
await pusher.update(updateToken, {
  state: { title: 'Order #1234', status: 'On the way', progress: 0.7, imageName: 'bicycle' },
});

// END it:
await pusher.end(updateToken, {});

await pusher.close(); // tear down the HTTP/2 session when your process exits
```

4. **Device renders the push.** APNs delivers the `content-state` JSON; iOS
   decodes it into the SwiftUI `ContentState` and re-renders the card — **no app
   code runs.** Because the same schema is used everywhere, a payload that
   type-checks on the server decodes on the device.

See [ZERO-TO-DEPLOY.md](./ZERO-TO-DEPLOY.md) for the Apple Developer setup
(App ID, Push key, Key ID, Team ID) end to end.

---

## Lock Screen & Dynamic Island

A Live Activity is rendered by your **widget extension** in several
presentations. The scaffolded template
([`LiveActivityKitLiveActivity.swift`](./plugin/swift/LiveActivityKitLiveActivity.swift))
implements them all, driven entirely by the `ContentState` fields:

| Presentation | Where it shows | Template renders |
|---|---|---|
| **Lock Screen / banner** | Lock Screen, and as a banner when an update alerts | `imageName` glyph, `title`, `subtitle`, `body`, a `progress` bar, a `status` pill, and a live `date` timer |
| **Dynamic Island — compact** | The pill, when nothing's expanded | leading `imageName`/`leading`, trailing `status`/`trailing` or a circular `progress` / `date` timer |
| **Dynamic Island — minimal** | The tiny circle (multiple activities) | `imageName`, a circular `progress`, or the first letter of `title` |
| **Dynamic Island — expanded** | Long-press / when relevant | leading glyph + `leading`, trailing `status`/timer, centered `title`, bottom `subtitle` + `progress` |

The Dynamic Island lives only on **iPhone 14 Pro and later**; on every other
iPhone the activity shows the **Lock Screen** presentation. The `tintColorHex`
field accents the glyph, progress bar, status pill, and the island keyline.
Everything is data-driven, so the same `update` reshapes every presentation at
once — and it's all plain SwiftUI you can rewrite (see
[Customizing the SwiftUI template](#customizing-the-swiftui-template)).

---

## Content-state schema

There is **one** content-state shape, defined in
[`src/shared/schema.ts`](./src/shared/schema.ts) and mirrored field-for-field by
the Swift `ContentState` in
[`ios/LiveActivityKitAttributes.swift`](./ios/LiveActivityKitAttributes.swift).
The **same keys** flow JS → APNs JSON → Swift `Codable`, so a payload that
type-checks renders.

```ts
interface LiveActivityState {
  title: string;                  // required — primary headline (Lock Screen + expanded island)
  subtitle?: string;              // secondary line under the title
  body?: string;                  // longer descriptive text (Lock Screen)
  status?: string;                // short label, e.g. "On the way"
  progress?: number;              // [0, 1] — renders a progress bar
  date?: number;                  // epoch MILLISECONDS — drives a live timer / countdown
  imageName?: string;             // SF Symbol name, e.g. "bicycle"
  tintColorHex?: string;          // "#RRGGBB" / "#AARRGGBB" accent color
  leading?: string;               // compact Dynamic Island leading text
  trailing?: string;              // compact Dynamic Island trailing text
  extra?: Record<string, string>; // custom string key/values the template may render
}
```

The immutable **attributes** (set once at start, never changed) are:

```ts
interface LiveActivityAttributesData {
  name: string;                   // e.g. "Order #1234"
  extra?: Record<string, string>;
}
```

`normalizeState` (also in `schema.ts`) validates and normalizes a state before
it crosses the bridge or hits APNs: it **requires a non-empty `title`**, clamps
`progress` to `[0, 1]`, rounds `date`, coerces `extra` values to strings, and
drops `undefined` fields. The client and the server both call it, so both ends
behave identically. Keep `state` small — the **APNs payload cap is 4 KB**.

---

## Client API

Everything is imported from the package root. `isSupported` /
`areActivitiesEnabled()` are synchronous; the rest are `Promise`-returning;
listeners return a `Subscription` with `.remove()`. **Off iOS**, every method is
a safe no-op (or a typed rejection where a value is impossible). The canonical
source is [`src/index.ts`](./src/index.ts) and [`src/types.ts`](./src/types.ts).

```ts
import {
  isSupported, areActivitiesEnabled,
  startLiveActivity, updateLiveActivity, endLiveActivity, endAllLiveActivities,
  getActiveLiveActivities, getLiveActivityState, getPushToken, getPushToStartToken,
  addActivityStateListener, addPushTokenListener, addPushToStartTokenListener, addEnablementListener,
  LiveActivityError,
} from 'react-native-live-activity-kit';
```

### Capabilities

#### `isSupported`

```ts
const isSupported: boolean;
```

`true` on platforms that can run Live Activities (iOS only). Use it to gate UI.

#### `areActivitiesEnabled()`

```ts
areActivitiesEnabled(): boolean;
```

Whether the user has Live Activities enabled for this app (Settings → your app →
Live Activities). Synchronous. `false` off-iOS. Subscribe to changes with
[`addEnablementListener`](#addenablementlistener).

### Lifecycle

#### `startLiveActivity(options)`

```ts
startLiveActivity(options: StartLiveActivityOptions): Promise<LiveActivity>;
```

Start (request) a Live Activity locally. Resolves with a
[`LiveActivity`](#types--errors) handle — its `id` (pass to `update`/`end`) and,
when available synchronously, its `pushToken`. **Throws** a
[`LiveActivityError`](#types--errors) off-iOS or when ActivityKit refuses (e.g.
the user disabled Live Activities, or you've hit the activity limit).

| Option           | Type                          | Notes                                                            |
| ---------------- | ----------------------------- | ---------------------------------------------------------------- |
| `attributes`     | `LiveActivityAttributesData`  | **Required.** Immutable for the activity's life (`{ name, extra? }`). |
| `state`          | `LiveActivityState`           | **Required.** Initial mutable content state (`title` required).  |
| `staleDate`      | `Date \| number`              | When the system should mark the content stale (greys it out).    |
| `relevanceScore` | `number`                      | Sort priority for limited Dynamic Island / Smart Stack space (higher wins). |

#### `updateLiveActivity(id, options)`

```ts
updateLiveActivity(id: string, options: UpdateLiveActivityOptions): Promise<void>;
```

Update a running activity's content state. No-op off-iOS.

| Option           | Type                | Notes                                                                |
| ---------------- | ------------------- | -------------------------------------------------------------------- |
| `state`          | `LiveActivityState` | **Required.** The new content state.                                 |
| `alert`          | `AlertConfig`       | Show a banner (`{ title, body, sound? }`) when delivered backgrounded. |
| `staleDate`      | `Date \| number`    | Refresh the stale time.                                              |
| `relevanceScore` | `number`            | Re-rank among multiple activities.                                   |

#### `endLiveActivity(id, options?)`

```ts
endLiveActivity(id: string, options?: EndLiveActivityOptions): Promise<void>;
```

End a specific activity. No-op off-iOS.

| Option            | Type                              | Default     | Notes                                                       |
| ----------------- | --------------------------------- | ----------- | ---------------------------------------------------------- |
| `state`           | `LiveActivityState`               | —           | Optional final state to freeze before dismissal.           |
| `dismissalPolicy` | `'default' \| 'immediate' \| 'after'` | `'default'` | `default` keeps the card up to ~4 h; `immediate` removes now; `after` uses `dismissalDate`. |
| `dismissalDate`   | `Date \| number`                  | —           | Removal time; used only when `dismissalPolicy === 'after'`. |

#### `endAllLiveActivities(options?)`

```ts
endAllLiveActivities(options?: EndLiveActivityOptions): Promise<void>;
```

End **every** activity started by this app. Same options as `endLiveActivity`
(minus a per-activity `id`). No-op off-iOS.

### Queries

#### `getActiveLiveActivities()`

```ts
getActiveLiveActivities(): Promise<LiveActivityInfo[]>;
```

Snapshot of every activity this app currently knows about
(`{ id, state, pushToken }`). `[]` off-iOS. Useful after a relaunch to re-adopt
in-flight activities.

#### `getLiveActivityState(id)`

```ts
getLiveActivityState(id: string): Promise<ActivityState>;
```

The lifecycle state of one activity:
`'active' | 'pending' | 'stale' | 'ended' | 'dismissed' | 'unknown'`.
`'unknown'` off-iOS or for an unrecognized id.

#### `getPushToken(id)`

```ts
getPushToken(id: string): Promise<string | null>;
```

The current per-activity APNs **update** token (hex) for an activity, or `null`.
Prefer [`addPushTokenListener`](#addpushtokenlistener) to also catch rotations.

#### `getPushToStartToken()`

```ts
getPushToStartToken(): Promise<string | null>;
```

The current **push-to-start** token (hex) for remote `start` (iOS 17.2+), or
`null`.

### Listeners

Each returns a `Subscription`; call `.remove()` to unsubscribe. Internally one
native callback is registered per event and **ref-counted** across subscribers.
Off-iOS they return a no-op subscription.

#### `addActivityStateListener(listener)`

```ts
addActivityStateListener(listener: (event: { id: string; state: ActivityState }) => void): Subscription;
```

Activity lifecycle changes (`active` → `ended` / `dismissed` / `stale`).

#### `addPushTokenListener(listener)`

```ts
addPushTokenListener(listener: (event: { id: string; token: string }) => void): Subscription;
```

Per-activity APNs **update** token changes. **Fires when a token is first issued
and again whenever iOS rotates it** — register your backend's token store here so
remote updates keep working through rotation.

#### `addPushToStartTokenListener(listener)`

```ts
addPushToStartTokenListener(listener: (token: string) => void): Subscription;
```

Push-to-start token changes (iOS 17.2+). Send this token to your backend so it
can remotely `start` an activity even while the app is killed.

#### `addEnablementListener(listener)`

```ts
addEnablementListener(listener: (enabled: boolean) => void): Subscription;
```

Changes to the user's Live Activities enablement setting.

### Types & errors

The canonical definitions live in [`src/types.ts`](./src/types.ts) and
[`src/shared/schema.ts`](./src/shared/schema.ts).

```ts
interface LiveActivity {            // returned by startLiveActivity
  id: string;                       // stable ActivityKit id; pass to update/end
  pushToken: string | null;         // update token if available synchronously (also via listener)
}

interface LiveActivityInfo {        // returned by getActiveLiveActivities
  id: string;
  state: ActivityState;
  pushToken: string | null;
}

interface Subscription { remove(): void; }

type ActivityState = 'active' | 'pending' | 'stale' | 'ended' | 'dismissed' | 'unknown';
type DismissalPolicy = 'default' | 'immediate' | 'after';
interface AlertConfig { title: string; body: string; sound?: string; }
```

#### `LiveActivityError`

Thrown / rejected by the client when an operation fails. Carries a machine-readable
`code` and is `instanceof`-checkable.

```ts
type LiveActivityErrorCode =
  | 'UNSUPPORTED_PLATFORM' | 'NOT_ENABLED' | 'NOT_FOUND'
  | 'START_FAILED' | 'UPDATE_FAILED' | 'UNKNOWN';

import { startLiveActivity, LiveActivityError } from 'react-native-live-activity-kit';

try {
  await startLiveActivity({ attributes: { name: 'Order' }, state: { title: 'Order' } });
} catch (e) {
  if (e instanceof LiveActivityError) console.log(e.code, e.message);
}
```

---

## Server API (`react-native-live-activity-kit/server`)

A **server-only**, **zero-dependency** Node module (Node standard library only —
no `node-apn`, no JWT package) that pushes Live Activity `start` / `update` /
`end` over APNs HTTP/2 with an ES256-signed token, and manages iOS 18 broadcast
channels. It imports the **same** `ContentState` schema as the client, so the
payloads are typed and guaranteed to decode.

> [!WARNING]
> **Never ship the `.p8` (or its contents) in your app — it's server-side only.**
> Anyone with your APNs auth key can push to your app. Load it from a secret /
> environment variable on the backend. See [SECURITY.md](./SECURITY.md).

> [!NOTE]
> The server surface is finalized in code; the canonical types are in
> [`src/server/types.ts`](./src/server/types.ts) and the in-memory token
> registry in [`src/server/registry.ts`](./src/server/registry.ts). The examples
> below match that shape. Where a symbol differs in your installed version,
> follow the types file.

### Create a pusher

```ts
import { createLiveActivityPusher } from 'react-native-live-activity-kit/server';

const pusher = createLiveActivityPusher({
  key: process.env.APNS_KEY_P8!,   // PEM contents of AuthKey_XXXXXXXXXX.p8
  keyId: process.env.APNS_KEY_ID!, // 10-char Key ID
  teamId: process.env.APPLE_TEAM_ID!,
  bundleId: 'com.you.app',         // topic = <bundleId>.push-type.liveactivity
  production: process.env.NODE_ENV === 'production', // TestFlight = production
});
```

| Config option      | Type            | Notes                                                                 |
| ------------------ | --------------- | --------------------------------------------------------------------- |
| `key`              | `string`        | **PEM contents** of the `.p8` (the whole `-----BEGIN PRIVATE KEY-----…` string). |
| `keyId`            | `string`        | 10-character APNs Key ID (the JWT `kid`).                             |
| `teamId`           | `string`        | 10-character Apple Team ID (the JWT `iss`).                           |
| `bundleId`         | `string`        | App bundle id; topic becomes `<bundleId>.push-type.liveactivity`.    |
| `production`       | `boolean`       | `true` → `api.push.apple.com`; default `false` → sandbox. **TestFlight uses production.** |
| `host` / `port`    | `string` / `443 \| 2197` | Override host (proxies/mocks); port `2197` when `443` is firewalled. |
| `connectTimeoutMs` / `requestTimeoutMs` | `number` | HTTP/2 connect / per-request timeouts (default `10_000`).        |

### Send

```ts
// Remotely START an activity (iOS 17.2+ push-to-start). `alert` is required by APNs.
await pusher.startViaPush(pushToStartToken, {
  attributes: { name: 'Order #1234' },
  state: { title: 'Order #1234', status: 'Preparing', progress: 0.25 },
  alert: { title: 'Order placed', body: 'We are preparing your order.' },
});

// UPDATE a running activity (push to its latest update token).
await pusher.update(updateToken, {
  state: { title: 'Order #1234', status: 'On the way', progress: 0.7, imageName: 'bicycle' },
  // priority: 5  // use 5 for high-frequency updates (and enable frequentUpdates)
});

// END it (optionally with a final state and a dismissal time).
await pusher.end(updateToken, { state: { title: 'Order #1234', status: 'Delivered', progress: 1 } });

await pusher.close(); // close the HTTP/2 session on shutdown
```

Every send resolves to an `ApnsResult` (`{ success, status, apnsId?, reason?,
timestamp?, channelId? }`) or throws an `ApnsError` carrying a machine-readable
`kind` (`'payload-too-large' | 'invalid-argument' | 'transport' | 'apns'`) plus
the HTTP `status` and `reason` for `'apns'` failures. Branch on it to purge dead
tokens:

```ts
import { ApnsError } from 'react-native-live-activity-kit/server';

try {
  await pusher.update(updateToken, { state });
} catch (e) {
  if (e instanceof ApnsError && (e.reason === 'Unregistered' || e.status === 410)) {
    await tokenStore.invalidate(updateToken); // the activity ended on-device; stop pushing
  } else {
    throw e;
  }
}
```

### Token registry & broadcast channels

The server ships a `LiveActivityTokenRegistry` interface plus an
`InMemoryTokenRegistry` reference implementation (tests / single-process). Map
its methods (`storeActivityToken` / `rotateActivityToken` /
`getActivityToken` / `listActivityTokens`, and the push-to-start equivalents)
onto your database's upsert/delete queries so rotation is a one-liner.

For **iOS 18 broadcast channels** — one push fanning out to many activities (a
live sports score, a transit alert) — the server exposes channel
creation/management so you can subscribe activities to a channel id and broadcast
a single `update` to all of them. See [`src/server/types.ts`](./src/server/types.ts)
for the current channel/registry shapes.

---

## Config plugin options

Configure the plugin in `app.json` under `plugins`. Every option is optional;
the defaults match the scaffolded Swift files.

| Option             | Type      | Default                   | Effect                                                                              |
| ------------------ | --------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `widgetName`       | `string`  | `'LiveActivityKitWidget'` | Name of the generated Widget Extension target / scheme.                             |
| `deploymentTarget` | `string`  | `'16.2'`                  | iOS deployment target for the widget extension (Live Activities need 16.2+).        |
| `appGroup`         | `string`  | none                      | App Group id (e.g. `group.com.you.app`) added to **both** targets, so the app and widget can share data. |
| `frequentUpdates`  | `boolean` | `false`                   | Sets `NSSupportsLiveActivitiesFrequentUpdates` for high-frequency push updates (use APNs priority `5`). |
| `enablePush`       | `boolean` | `true`                    | Add the **Push Notifications** capability (required for remote `start`/`update`/`end`). |

After changing plugin options, re-run `npx expo prebuild -p ios`. The plugin is
idempotent — re-running prebuild won't duplicate the target.

---

## Customizing the SwiftUI template

The Lock Screen and Dynamic Island UI is **plain SwiftUI source you own**, in
[`plugin/swift/LiveActivityKitLiveActivity.swift`](./plugin/swift/LiveActivityKitLiveActivity.swift)
(copied into your widget extension by the plugin / by hand). It reads only fields
from `ContentState`, so restyling is just SwiftUI:

- **`LiveActivityKitLockScreenView`** — the Lock Screen / banner layout. Change
  fonts, spacing, the status pill, the timer, the progress bar here.
- The **`dynamicIsland:`** closure — the `expanded`, `compactLeading`,
  `compactTrailing`, and `minimal` regions. Rearrange what each region shows.
- **`LiveActivityKitTheme`** — helpers: `color(_:)` parses your `tintColorHex`
  (`#RRGGBB` / `#AARRGGBB`) into a SwiftUI `Color`, and `relativeDate(_:)`
  converts your epoch-ms `date` into a `Date` for `Text(_:style: .timer)`.

Edit the SwiftUI freely; you do **not** regenerate anything for visual changes.
Only when you add a **new data field** do you also touch the schema (next
section). Keep these guarantees intact: the `ContentState` struct must stay
byte-identical between the app target and the extension target (ActivityKit
matches them by type name), and every stored property must have a default or be
`Optional` so older encoded states still decode.

---

## Extending `ContentState` across every layer

The schema is shared across **four** layers. To add a typed field, edit all four
(it's mechanical and the comments in each file point at the others):

1. **`src/shared/schema.ts`** — add the field to the `LiveActivityState`
   interface and handle it in `normalizeState` (coerce/clamp, drop when
   `undefined`). This single edit types **both** the client and the `/server`
   sender.
2. **`ios/LiveActivityKitAttributes.swift`** — add the matching property to the
   `ContentState` struct (make it `Optional` or give it a default, and update the
   `init`). The **JSON key must equal the JS key** so APNs `content-state`
   decodes.
3. **`plugin/swift/LiveActivityKitLiveActivity.swift`** — render the new field in
   whichever presentations should show it.
4. **Docs** — add the field to the [schema table](#content-state-schema).

Because the keys flow JS → APNs JSON → Swift `Codable` unchanged, once these four
agree a payload that type-checks decodes and renders. If you only need a few
extra strings and don't want to touch Swift, use the untyped **`extra`** map
(`Record<string, string>`) — it's already plumbed end to end; just read the keys
you want in the SwiftUI template.

---

## Honest limitations — read before you ship

> [!IMPORTANT]
> **The native iOS layers are reviewed, not device-compiled in this repo.** This
> package's value is the *design* — one schema across the client, the SwiftUI
> widget, and the Node sender — and the JS/server/plugin layers are CI-verified
> (codegen, typecheck, build, pack). The Swift module, the `ActivityKit`
> attributes, and the widget extension are **reviewed by hand**; they are **not**
> compiled or push-tested in CI because Live Activities, the Dynamic Island, and
> APNs delivery only exist on a signed build on a **physical device**. Run the
> [`example/`](./example) app on a device before depending on the push path.

> **iOS-only feature.** Live Activities and the Dynamic Island do not exist on
> Android or web. Every client method here is a **safe no-op** off-iOS (returning
> sane defaults, or a typed rejection on `startLiveActivity`) so cross-platform
> builds don't break — but you get **no UI** there. The `/server` sender runs on
> any Node host; it pushes to iOS devices regardless of where the app build runs.

> **The Dynamic Island is hardware-limited.** It exists only on **iPhone 14 Pro
> and later**. On every other iPhone (and on iPad), the activity shows the
> **Lock Screen** presentation only. Design for the Lock Screen first.

> **4 KB payload cap.** The entire APNs `content-state` must serialize under
> **4096 bytes**. Keep `state` lean — short strings, no base64 blobs. The
> `/server` sender enforces this and throws `payload-too-large` before sending;
> the client normalizes but you should still budget the size.

> **Tokens rotate — you must handle it.** The per-activity update token and the
> push-to-start token can change over an activity's life. `addPushTokenListener`
> and `addPushToStartTokenListener` fire again on rotation; **always push to the
> most recently received token** and overwrite your stored copy, or remote
> updates silently stop. A `410 Unregistered` from APNs means the activity ended
> on-device — purge the token.

> **Sandbox vs production APNs.** A dev-client/debug build's tokens work against
> the **sandbox** environment; a **TestFlight or App Store** build's tokens work
> against **production**. Using the wrong environment yields `BadDeviceToken`. Set
> `production` on the pusher to match the build that produced the token.

> **New Architecture is required.** This is a Nitro module; it only runs with
> Fabric / TurboModules enabled. There is no legacy-bridge fallback.

---

## Troubleshooting

<details>
<summary><strong>The activity never appears.</strong></summary>

Check, in order: (1) `isSupported && areActivitiesEnabled()` is `true` (the user
can disable Live Activities in Settings); (2) you're on a **real device** with a
**dev client** (not Expo Go); (3) the **widget extension exists** and includes
`LiveActivityKitAttributes.swift` + `LiveActivityKitLiveActivity.swift` +
`LiveActivityKitWidgetBundle.swift`; (4) `NSSupportsLiveActivities` = `YES` in the
app target's Info.plist; (5) your `state` has a non-empty `title`. The
[`example/`](./example) app is a known-good reference.
</details>

<details>
<summary><strong><code>BadDeviceToken</code> from APNs.</strong></summary>

You're pushing to the **wrong environment**. Tokens from a debug/dev-client build
are **sandbox**; tokens from a TestFlight/App Store build are **production**. Set
`production: true/false` on `createLiveActivityPusher` to match the build that
issued the token. `BadDeviceToken` can also mean the token is from a different
app / bundle id, or it's malformed (push the **hex** token exactly as received).
</details>

<details>
<summary><strong><code>PayloadTooLarge</code> / the 4 KB limit.</strong></summary>

The serialized `content-state` exceeded **4096 bytes**. Shorten your strings,
drop large `extra` entries, and never put base64 images in the state — reference
an **SF Symbol** via `imageName` instead. The `/server` sender throws
`payload-too-large` (an `ApnsError`) before sending so you catch this server-side.
</details>

<details>
<summary><strong>Remote updates stopped working after a while.</strong></summary>

The **token rotated** and you're pushing to a stale one. Subscribe with
`addPushTokenListener` (it fires on every rotation), forward the new token to your
backend, and overwrite the stored copy. On `410 Unregistered` / `Unregistered`
reason, the activity ended on-device — stop pushing to that token. See
[the push flow](#the-end-to-end-push-flow).
</details>

<details>
<summary><strong><code>InvalidProviderToken</code> / <code>ExpiredProviderToken</code> / <code>403</code>.</strong></summary>

Your **JWT auth token** is wrong or stale. Verify the `.p8` PEM, the `keyId`, and
the `teamId`, and that the key is enabled for APNs in the Developer portal. The
ES256 JWT must be re-signed periodically (the sender does this); if you cache it
too long APNs returns `ExpiredProviderToken`. Don't regenerate it on every request
either — APNs throttles `TooManyProviderTokenUpdates`.
</details>

<details>
<summary><strong><code>startViaPush</code> does nothing.</strong></summary>

Push-to-start requires **iOS 17.2+**, a valid **push-to-start token** (not an
update token — different token, collected via `addPushToStartTokenListener`), and
an `alert` (APNs **requires** an alert on `start` pushes). Confirm the
`attributesType` matches your Swift `ActivityAttributes` type name
(`LiveActivityKitAttributes` by default).
</details>

<details>
<summary><strong>"Cannot create HybridObject" / native module not found.</strong></summary>

This is a Nitro module: you must have the **New Architecture enabled** and
**`react-native-nitro-modules` installed**, then `pod install` (iOS) and a clean
rebuild. It does not run on the old bridge, and it does not run in **Expo Go** —
use a dev build.
</details>

<details>
<summary><strong>Nothing happens on Android / web.</strong></summary>

By design — Live Activities are an iOS feature. Off-iOS every client method is a
typed no-op (or `startLiveActivity` rejects with
`UNSUPPORTED_PLATFORM`). Gate your UI on `isSupported`.
</details>

---

## Migrating from `expo-live-activity`

[`expo-live-activity`](https://github.com/software-mansion-labs/expo-live-activity)
is **archived**. This package is a drop-in target with a similar mental model and
more shipped for you. The migration shape:

- **Install** `react-native-live-activity-kit` + `react-native-nitro-modules`
  (New Architecture required), swap the config plugin in `app.json`, and
  `npx expo prebuild -p ios` with a **dev client**.
- **Move your custom UI** into the scaffolded
  [`LiveActivityKitLiveActivity.swift`](./plugin/swift/LiveActivityKitLiveActivity.swift)
  — it's plain SwiftUI, so most of your existing widget body ports over directly.
- **Map your state fields** onto the shared
  [`ContentState` schema](#content-state-schema); add any extra typed fields by
  [extending it across the four layers](#extending-contentstate-across-every-layer)
  (or stash them in `extra`).
- **Replace your push code** with the included
  [`/server` sender](#server-api-react-native-live-activity-kitserver) instead of
  hand-rolling APNs — same `ContentState`, so your update payloads stay typed.

You get token rotation, push-to-start, broadcast channels, and a typed backend
without leaving the package.

---

## Contributing

PRs and issues welcome — especially:

- **Device test reports** — which iPhone / iOS combos render the Lock Screen and
  Dynamic Island correctly, and which push scenarios (in-app, push-to-start,
  update, broadcast) you verified.
- **SwiftUI template** improvements and additional presentations.
- **Server** coverage — broadcast/channel ergonomics, registry adapters for
  popular databases.
- **Config plugin** edge cases across Expo SDKs.
- **Docs** — clearer push onboarding, more honest platform-limit framing.

```sh
git clone https://github.com/aashir-athar/react-native-live-activity-kit
cd react-native-live-activity-kit
npm install
npm run codegen     # regenerate the Nitro native specs (commit the output)
npm run build       # bob (JS) + tsc (config plugin)
npm run typecheck
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide and
[ZERO-TO-DEPLOY.md](./ZERO-TO-DEPLOY.md) for the maintainer runbook (Apple setup,
on-device push test, publishing).

---

## License

MIT © aashir-athar — see [LICENSE](./LICENSE).
