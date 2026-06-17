<div align="center">

# 🚀 ZERO-TO-DEPLOY

### From an empty project to a **remotely pushed Live Activity** — and the maintainer runbook to npm.

</div>

> **Two audiences.** §1–§7 are for **you, the app developer**: install →
> Apple Developer setup → plugin → prebuild → collect tokens → push a real
> update. §8–§11 are the **maintainer runbook** (build, on-device test, publish).
> End users only need §1–§7 and the [README](./README.md).

This is a **Nitro module** plus a **SwiftUI widget extension** plus a **Node APNs
sender**. Live Activities, the Dynamic Island, push-to-start, and APNs delivery
**cannot be verified in CI** — they need an Apple Developer account, a signed
build, and a **physical iPhone** (push delivery is unreliable on the Simulator).
So CI gates the JS / Nitro-spec / config-plugin / server layer; **the on-device
push test (§6) is the load-bearing test.** Treat it as required for every release.

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Node | ≥ 20 LTS |
| npm | ≥ 10 |
| Xcode | 16+ (iOS 16.2+ deployment target for the widget) |
| CocoaPods | 1.15+ |
| A real iPhone | iOS 16.2+ (iOS 17.2+ for push-to-start; iPhone 14 Pro+ for the Dynamic Island) |
| Apple Developer account | paid — needed for the App ID, Push capability, and APNs key |

> The Simulator can render the Lock Screen card but **does not exercise the APNs
> push path** reliably. Always do the push test on hardware.

---

## 2. Install

```sh
npm install react-native-live-activity-kit react-native-nitro-modules
```

Enable the **New Architecture** (Nitro requires it): Expo →
`"newArchEnabled": true` in `app.json`; bare RN → `newArchEnabled=true` in
`ios/Podfile`/`gradle.properties` per the RN docs.

---

## 3. Apple Developer setup (one-time)

You need four things from [developer.apple.com](https://developer.apple.com):

1. **App ID with Push Notifications.** Certificates, Identifiers & Profiles →
   **Identifiers** → your app's identifier → enable **Push Notifications**.
2. **An APNs Auth Key (`.p8`).** Keys → **+** → enable **Apple Push Notifications
   service (APNs)** → Continue → Register. **Download the `AuthKey_XXXXXXXXXX.p8`
   now — you can only download it once.** Store it somewhere safe and secret.
3. **The Key ID.** The 10-character id shown next to the key (also in the filename:
   `AuthKey_<KEYID>.p8`).
4. **The Team ID.** Top-right of the Developer portal / Membership page — your
   10-character team identifier.

> **The `.p8` is a credential as sensitive as a password** — anyone with it can
> push to your app. Never commit it, never bundle it in the app, never paste it
> in an issue. Load it from a secret/env var on your backend only. See
> [SECURITY.md](./SECURITY.md).

---

## 4. Configure the widget (plugin or Xcode)

### Expo

```json
{
  "expo": {
    "newArchEnabled": true,
    "plugins": [
      "expo-dev-client",
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
npx expo run:ios --device     # a dev client — NOT Expo Go
```

### Bare React Native

Add the Widget Extension target and the three Swift files by hand — see
[README → Bare React Native](./README.md#bare-react-native-manual-xcode-steps).
The short version: **New Target → Widget Extension** (Include Live Activity,
target 16.2+); add `ios/LiveActivityKitAttributes.swift` to **both** targets;
add `LiveActivityKitLiveActivity.swift` + `LiveActivityKitWidgetBundle.swift` to
the extension; set `NSSupportsLiveActivities` = `YES`; add **Push Notifications**
(and an App Group if you want one).

---

## 5. Start an activity & collect tokens (in the app)

```ts
import {
  startLiveActivity,
  addPushTokenListener,
  addPushToStartTokenListener,
} from 'react-native-live-activity-kit';

// Forward both token types to YOUR backend (they may arrive/rotate at any time).
addPushToStartTokenListener((token) => post('/lak/pts-token', { token }));
addPushTokenListener(({ id, token }) => post('/lak/activity-token', { id, token }));

const activity = await startLiveActivity({
  attributes: { name: 'Order #1234' },
  state: { title: 'Order #1234', status: 'Preparing', progress: 0.25, imageName: 'bag.fill' },
});
// activity.id is your handle; activity.pushToken may be the update token already.
```

Confirm the card appears on the Lock Screen and (on iPhone 14 Pro+) in the
Dynamic Island. Confirm your backend received an **update token** and a
**push-to-start token**.

---

## 6. Push a real update from your backend (the test that matters)

On your Node server, **with the `.p8` from §3 in an env var:**

```ts
import { createLiveActivityPusher, ApnsError } from 'react-native-live-activity-kit/server';

const pusher = createLiveActivityPusher({
  key: process.env.APNS_KEY_P8!,
  keyId: process.env.APNS_KEY_ID!,
  teamId: process.env.APPLE_TEAM_ID!,
  bundleId: 'com.you.app',
  production: false, // a dev-client build's tokens are SANDBOX; TestFlight = true
});

try {
  await pusher.update(updateToken, {
    state: { title: 'Order #1234', status: 'On the way', progress: 0.7, imageName: 'bicycle' },
  });
} catch (e) {
  if (e instanceof ApnsError) console.error(e.kind, e.status, e.reason);
}
await pusher.close();
```

**Verify on the device** that the Lock Screen / Dynamic Island re-renders with no
app code running. Then test the rest of the matrix:

- **Push-to-start** (iOS 17.2+): `pusher.startViaPush(ptsToken, { attributes, state, alert })`
  starts a new activity **while the app is killed**. (`alert` is required.)
- **End:** `pusher.end(updateToken, {})` removes the card.
- **Rotation:** trigger/observe a token change; confirm your store updates and
  pushes still land on the new token.
- **Environment:** confirm a sandbox token + `production: true` (or vice-versa)
  yields `BadDeviceToken` — proving your environment wiring.

If §6 passes on hardware, the integration is real. If it doesn't, nothing else
matters — debug here first.

---

## 7. Ship

- Switch the pusher to `production: true` for **TestFlight / App Store** builds
  (their tokens are production-environment).
- Keep the `.p8` in your backend's secret store; rotate it if it ever leaks.
- Disclose Live Activity / notification use in your App Store privacy answers.

---

## 8. (Maintainer) How the scaffold works

- **Client (Nitro).** One HybridObject `LiveActivityKit` (`nitro.json`: iOS
  module `LiveActivityKit`, C++ namespace `liveactivitykit`, Swift impl
  `HybridLiveActivityKit`). `npm run codegen` (`nitrogen`) regenerates
  `nitrogen/generated/**` (committed; CI fails on drift). The Swift impl drives
  `ActivityKit` and surfaces tokens/state/enablement through the spec callbacks.
- **Shared schema.** [`src/shared/schema.ts`](./src/shared/schema.ts) is the one
  source of truth for `ContentState`, imported by the client **and**
  `src/server`, and mirrored by
  [`ios/LiveActivityKitAttributes.swift`](./ios/LiveActivityKitAttributes.swift).
- **Server.** `src/server` is **dependency-free** (Node stdlib only): ES256 JWT
  signing, HTTP/2 to APNs, the 4 KB guard, the token registry. Types in
  [`src/server/types.ts`](./src/server/types.ts), in-memory registry in
  [`src/server/registry.ts`](./src/server/registry.ts).
- **Config plugin.** `plugin/` (compiled to `plugin/build`, re-exported by
  `app.plugin.js`) scaffolds the widget extension and copies the Swift in
  `plugin/swift/` (`LiveActivityKitLiveActivity.swift`,
  `LiveActivityKitWidgetBundle.swift`).

**Whenever you change a `.nitro.ts` spec:** `npm run codegen`, commit
`nitrogen/generated`, then update the Swift impl in lock-step. **Whenever you
change a content-state field:** edit it in **all four** layers (schema, client
view, Swift `ContentState`, SwiftUI template) — a drift is a silent decode failure.

---

## 9. Local dev loop

```sh
npm install
npm run codegen        # regenerate native specs (only after spec changes)
npm run build          # bob (JS → lib/) + tsc (config plugin → plugin/build)
npm run typecheck

# Run the example on a real device:
cd example
npm install
npx expo prebuild --clean
npx expo run:ios --device
```

---

## 10. Static checks before publish

```sh
npm run codegen && git diff --exit-status nitrogen   # codegen is committed & clean
npm run typecheck
npm run build
npm pack --dry-run                                   # inspect the published file set
```

The tarball must include `src`, `lib`, `android`, `ios`, `nitrogen`,
`plugin/build`, `plugin/swift`, `app.plugin.js`,
`react-native-live-activity-kit.podspec`, `react-native.config.js`, `nitro.json`,
`README.md`, `LICENSE` — and must **exclude** `example/`, `.github/`,
`node_modules`, tests, and dotfiles (the `files` allowlist + `!`-globs in
`package.json` enforce this; eyeball `npm pack --dry-run` anyway). Confirm the
`./server` and `./app.plugin.js` subpath exports resolve.

---

## 11. Versioning & publishing

SemVer. The Nitro spec **and** the shared `ContentState` schema are wire
contracts: **any change to a method, struct field, event, or content-state key
that changes the wire/JSON shape is a breaking change → major bump.** Keep
`nitrogen/generated`, the Swift impls, `src/shared/schema.ts`, and the Swift
`ContentState` in lock-step. The `react-native-nitro-modules` peer floor is also
a contract — bump it deliberately and note it in the changelog.

CI (`.github/workflows/release.yml`) publishes on a pushed `vX.Y.Z` tag with
provenance:

```sh
# Update CHANGELOG, bump version in package.json, commit.
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Prefer **npm Trusted Publishing (OIDC)** — configure the package's trusted
publisher to the GitHub Actions workflow and drop the long-lived token entirely.
Fallback: an `NPM_TOKEN` repo secret (npm **Automation** token). Manual publish:

```sh
npm publish --provenance --access public
```

Confirm the green **provenance** badge on the npm page afterwards.

---

## 12. Common pitfalls

- **Old Architecture** — Nitro requires the New Architecture; there is no
  fallback. "Cannot create HybridObject" → the consumer is on the old bridge or
  missing `react-native-nitro-modules`.
- **Expo Go** — Live Activities need the **custom widget extension**, which Expo
  Go can't carry. Always a **dev client** / bare run on a device.
- **Schema drift across four layers** — `src/shared/schema.ts` ↔ client ↔
  `ios/LiveActivityKitAttributes.swift` ↔ the SwiftUI template. Change one,
  change all; the JSON key must equal the JS key or APNs `content-state` won't
  decode.
- **Sandbox vs production** — dev-client tokens are sandbox; TestFlight/App Store
  tokens are production. Mismatch → `BadDeviceToken`. Match `production` on the
  pusher to the build.
- **4 KB cap** — keep `content-state` under 4096 bytes; the server throws
  `payload-too-large` before sending. Never base64 an image into state — use an
  SF Symbol via `imageName`.
- **Token rotation** — push to the **latest** update/push-to-start token;
  `addPushTokenListener` / `addPushToStartTokenListener` fire on rotation. `410
  Unregistered` → the activity ended; purge the token.
- **`.p8` handling** — server-side only, from a secret store. Never bundle it,
  never commit it, never log it.
- **`@v6` pinned actions** — keep `actions/checkout` and `actions/setup-node`
  pinned to `@v6` in the workflows; let Dependabot bump them.
