# Contributing to react-native-live-activity-kit

Thanks for taking the time to contribute! This is a free, open-source toolkit for
iOS **Live Activities** and the **Dynamic Island** in **React Native and Expo** —
a Nitro client that starts/updates/ends activities and collects push tokens, a
config plugin that scaffolds a customizable SwiftUI widget, and a dependency-free
Node APNs sender — all sharing **one** content-state schema. It's a drop-in home
for anyone stranded by the archived `expo-live-activity`, and it stays good
because people like you file issues, send device reports, and open PRs.

This document covers how to set up the repo, the Nitro codegen → build loop, the
coding standards we hold the JS / Swift / server / plugin to, how to actually test
on a device (the only test that means anything for a Live Activity), and our
commit / PR conventions.

Please keep all project spaces — issues, pull requests, and discussions —
respectful and constructive.

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Setting up the repo](#setting-up-the-repo)
- [The Nitro codegen → build loop](#the-nitro-codegen--build-loop)
- [The one shared schema (four layers)](#the-one-shared-schema-four-layers)
- [Running the example app](#running-the-example-app)
- [Coding standards](#coding-standards)
  - [TypeScript (client)](#typescript-client)
  - [TypeScript (server)](#typescript-server)
  - [Swift (iOS module + widget)](#swift-ios-module--widget)
  - [Config plugin](#config-plugin)
  - [The native ⇄ JS contract](#the-native--js-contract)
- [Testing on a device](#testing-on-a-device)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [PR checklist](#pr-checklist)
- [Scope: what we will and won't take](#scope-what-we-will-and-wont-take)
- [Reporting security issues](#reporting-security-issues)

---

## Ways to contribute

You don't have to write Swift to help. Especially valuable:

- **Device reports** — open an issue with the exact iPhone, iOS version, and which
  scenarios you verified (in-app start, push-to-start, push update, Dynamic Island
  render, server APNs). Note whether the Dynamic Island appeared (iPhone 14 Pro+
  only) or just the Lock Screen.
- **Docs & honesty fixes** — if a doc oversells what's possible (e.g. implies the
  native layers are device-compiled in CI when they're reviewed-not-compiled, or
  glosses the 4 KB cap or token rotation), send a PR. Honesty about platform
  limits is a feature here.
- **SwiftUI template** — additional presentations, better defaults, accessibility.
- **Server** — broadcast/channel ergonomics, registry adapters for real databases,
  more precise APNs error mapping.
- **Config-plugin coverage** — widget-extension edge cases across Expo SDKs.

## Repository layout

```
.
├── src/                          # TypeScript: public client API + Nitro specs + shared schema + server
│   ├── index.ts                  # Public client API (the surface users import)
│   ├── types.ts                  # Public client type contract
│   ├── shared/schema.ts          # THE one ContentState schema (client + server import this)
│   ├── specs/                    # Nitro HybridObject + struct specs (*.nitro.ts)
│   └── server/                   # Dependency-free Node APNs sender (types.ts, registry.ts, …)
├── nitrogen/                     # Nitro-generated C++/Swift glue (committed)
├── ios/                          # Swift: HybridLiveActivityKit + LiveActivityKitAttributes.swift (shared)
├── android/                      # Kotlin no-op stub (Live Activities are iOS-only)
├── plugin/                       # Config plugin (@expo/config-plugins) + the scaffolded SwiftUI in plugin/swift/
├── example/                      # Expo dev-client example app used to test on a real device
├── nitro.json                    # Nitro module config
└── package.json
```

## Prerequisites

- **Node** 20+ and your package manager of choice (`npm` / `yarn` / `pnpm`).
- **React Native 0.79+** with the **New Architecture enabled** (Nitro requires it;
  there is no old-bridge fallback).
- **iOS**: macOS with **Xcode 16+**, an Apple developer signing identity, and a
  **real iPhone** — the Simulator can render the Lock Screen card but does not
  reliably exercise the **APNs push path** or push-to-start.
- For server work: just **Node** (the sender has **zero runtime dependencies**).
- For a real push test: an **APNs `.p8`**, its **Key ID**, your **Team ID** (see
  [ZERO-TO-DEPLOY.md](./ZERO-TO-DEPLOY.md) §3). **Never commit the `.p8`.**

> This is a Nitro native module with a custom widget extension — it does **not**
> run in Expo Go. You always work through a dev client / prebuild.

## Setting up the repo

```bash
git clone https://github.com/aashir-athar/react-native-live-activity-kit
cd react-native-live-activity-kit
npm install

# Regenerate the Nitro glue, type-check, and build the library + config plugin.
npm run codegen
npm run typecheck
npm run build
```

## The Nitro codegen → build loop

The TypeScript specs in `src/specs/*.nitro.ts` are the source of truth for the
native interface; the C++/Swift bindings in `nitrogen/generated` are **generated**
from them and **committed** to the repo. Whenever you change a `*.nitro.ts` spec:

```bash
npm run codegen      # nitrogen — regenerates nitrogen/generated from the specs
npm run typecheck    # tsc --noEmit — TS must be clean (client + server + plugin)
npm run build        # bob build + tsc -p plugin/tsconfig.json (the config plugin)
```

Then **commit the regenerated `nitrogen/generated` output** alongside your spec
change — CI runs `npm run codegen` and a stale or missing generated tree fails
review. `npm run build` produces the published JS (`lib/`, via
`react-native-builder-bob`) and the compiled config plugin (`plugin/build/`).

## The one shared schema (four layers)

The single most important rule in this repo: there is **one** content-state shape
and it must agree across **four** layers. If you add/rename/remove a field, change
all four in the same PR:

1. **`src/shared/schema.ts`** — the `LiveActivityState` interface + its handling
   in `normalizeState`. This one edit types both the **client** and the
   **`/server`** sender.
2. **`ios/LiveActivityKitAttributes.swift`** — the `ContentState` struct. The
   **JSON key must equal the JS key**, every property must be `Optional` or have a
   default (so older encoded states still decode), and the struct must stay
   **byte-identical between the app target and the widget extension** (ActivityKit
   matches them by type name).
3. **`plugin/swift/LiveActivityKitLiveActivity.swift`** — render the field in the
   relevant presentations.
4. **Docs** — the schema table in the README.

Because the keys flow JS → APNs JSON → Swift `Codable` unchanged, a drift here is
a **silent decode failure**, not a compile error. Treat schema edits with care.

## Running the example app

The `example/` app is the harness for everything. It's an **Expo dev-client** app
(Nitro + a widget extension need a dev build, not Expo Go) that resolves the
library from the repo root via `file:..` and a `metro.config.js` that watches the
parent folder. From the repo root:

```bash
cd example
npm install
npx expo prebuild --clean      # regenerate native projects + the widget extension
npx expo run:ios --device      # a real iPhone is strongly recommended
```

Re-run `npx expo prebuild --clean` whenever you change the **config plugin** or
the **Nitro specs**. For pure Swift edits to the widget you can usually rebuild
from Xcode.

## Coding standards

### TypeScript (client)

- **Strict mode, no exceptions** (`npm run typecheck`). No `any`; prefer precise
  types and `unknown` + narrowing at the native boundary. The bridge is untyped at
  runtime — sanitize there (see `toNativeState` / `sanitizeStringMap` /
  `normalizeState` in `src/index.ts` + `src/shared/schema.ts`; never let
  `undefined` cross the bridge).
- **Public API is the contract.** Everything users touch lives in `src/index.ts`;
  every type they see lives in `src/types.ts` / `src/shared/schema.ts`. Keep TSDoc
  on exported symbols — the existing files set the tone (explain *why*, document
  defaults, be honest about platform limits).
- **Off-iOS paths stay safe no-ops** — never throw on `updateLiveActivity` /
  `endLiveActivity` / queries / listeners; the one place a typed rejection is
  correct is `startLiveActivity` (it can't return a real handle off-iOS).

### TypeScript (server)

- The `/server` module is **server-only and dependency-free** — Node standard
  library only. **Do not add a runtime dependency** (no `node-apn`, no JWT lib, no
  HTTP client). ES256 signing, HTTP/2, and the 4 KB guard are hand-rolled on
  purpose; keep it that way.
- It imports the **same** `src/shared/schema.ts` as the client — never fork the
  schema.
- Surface a typed `ApnsError` (`kind` + `status`/`reason`) so callers can branch
  (e.g. purge a token on `Unregistered` / `410`). Don't swallow APNs reasons.
- Enforce the 4 KB cap **before** the network call; throw `payload-too-large`.

### Swift (iOS module + widget)

- **Swift 5.9+**, widget deployment target **16.2+**. Gate ActivityKit APIs with
  the right `@available` (push-to-start 17.2+, broadcast 18+).
- The `ContentState` struct is the **shared source of truth** — keep it
  byte-identical across targets, every field `Optional`/defaulted, JSON keys equal
  to the JS keys. Don't add a stored property without a default or older states
  won't decode.
- The SwiftUI template (`plugin/swift/LiveActivityKitLiveActivity.swift`) is
  **the user's to customize** — it must read only `ContentState`, never hard-code
  app-specific copy, and degrade gracefully when optional fields are absent.
- Be honest in code and comments about platform limits (iOS-only; Dynamic Island
  is iPhone 14 Pro+; 4 KB cap; tokens rotate).

### Config plugin

- Plain strict TypeScript importing from `@expo/config-plugins`. It scaffolds the
  Widget Extension target, copies the Swift in `plugin/swift/`, sets
  `NSSupportsLiveActivities` (+ `NSSupportsLiveActivitiesFrequentUpdates` when
  `frequentUpdates`), and optionally wires the App Group and Push capability.
- Must compile under `plugin/tsconfig.json` (`npm run build:plugin`).
- Keep it **idempotent** and wrapped in `createRunOncePlugin`. Re-running prebuild
  must not duplicate the target or entries.
- Any new option needs a documented default and a matching README row.

### The native ⇄ JS contract

The Nitro spec method and event names **must match across the spec, the generated
glue, and the Swift `HybridObject`**. Do not rename one side only. When you change
a spec, run `npm run codegen` and commit the regenerated `nitrogen/generated` tree
in the same PR. Keep the public TS types (`src/types.ts`) and the flat native
structs in sync — the wrapper converts between them, so a missing conversion is a
silent `undefined`.

## Testing on a device

A Live Activity library is only truly tested **on real hardware** (the Simulator
doesn't exercise the push path). Before requesting review on anything that touches
the client, the Swift, the server, or the plugin, walk the relevant scenario and
paste the result into the PR.

1. `cd example && npx expo run:ios --device` on a **real iPhone**.
2. **In-app start:** `startLiveActivity(...)` — confirm the Lock Screen card and
   (on iPhone 14 Pro+) the Dynamic Island appear and `update`/`end` reshape them.
3. **Token collection:** confirm `addPushTokenListener` and
   `addPushToStartTokenListener` deliver tokens; confirm a rotation re-fires them.
4. **Server update:** push `pusher.update(updateToken, { state })` from Node and
   confirm the device re-renders **with no app code running**.
5. **Push-to-start** (iOS 17.2+): `pusher.startViaPush(ptsToken, …)` starts a new
   activity **while the app is killed**.
6. **End + dismissal policy:** confirm `end` removes the card per the policy.
7. **Environment negative test:** confirm a sandbox token + `production: true`
   yields `BadDeviceToken` (proves the environment wiring).
8. Note the **iPhone model + iOS version** — the Dynamic Island and push-to-start
   availability depend on it.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
This keeps the [changelog](./CHANGELOG.md) and releases tidy.

```
<type>(<optional scope>): <short summary>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`. Useful scopes: `client`, `server`, `ios`, `swift`, `plugin`, `schema`,
`tokens`, `nitro`, `types`, `example`, `docs`.

Examples:

```
feat(server): add iOS 18 broadcast channel management
fix(ios): make ContentState.date Optional so old states decode
docs(readme): clarify native layers are reviewed, not device-compiled in CI
feat(plugin): add frequentUpdates option (NSSupportsLiveActivitiesFrequentUpdates)
```

Use `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer for breaking changes
(anything that alters the public JS API, the Nitro spec names, or the
content-state schema / JSON shape).

## Pull request process

1. **Open an issue first** for anything non-trivial so we can agree on approach —
   especially schema or native changes.
2. Branch off `main`: `git checkout -b feat/server-broadcast`.
3. Make focused commits following the conventions above.
4. Run the full local gate: `npm run codegen && npm run typecheck && npm run build`.
5. Run the relevant **device scenario** above and capture the result.
6. Open the PR against `main` with a clear description, linked issue, and the
   completed checklist below. Keep PRs small and single-purpose.
7. Be responsive to review. Maintainers may ask for the on-device result or the
   redacted APNs response for any push-affecting change.

## PR checklist

Copy this into your PR description and tick each box:

- [ ] The change is focused and single-purpose; the PR title is a Conventional Commit.
- [ ] `npm run codegen` run and the regenerated `nitrogen/generated` is committed (if specs changed).
- [ ] `npm run typecheck` passes (client + server + plugin).
- [ ] `npm run build` succeeds (library **and** `plugin/build`).
- [ ] TypeScript is strict-clean — no new `any`, no `undefined` crossing the bridge.
- [ ] **No new runtime dependency added to `/server`** (Node stdlib only).
- [ ] If a content-state field changed: synced across **all four** layers — `src/shared/schema.ts`, the client, `ios/LiveActivityKitAttributes.swift`, and the SwiftUI template — with JSON keys equal to JS keys.
- [ ] If a Nitro spec method or event changed: the spec **and** Swift match (names + payload shape), and the generated glue is committed.
- [ ] If the config plugin changed: re-ran `npx expo prebuild --clean` and verified the widget target + `NSSupportsLiveActivities` + App Group / Push capability output; it's still idempotent.
- [ ] Tested on a **real iPhone** for the affected scenario (in-app start, push-to-start, push update, Dynamic Island render, or server APNs) and pasted the result.
- [ ] Docs are **honest** about platform limits — iOS-only, native layers reviewed-not-device-compiled in CI, the 4 KB cap, the Dynamic Island being iPhone 14 Pro+, and token rotation.
- [ ] Added/updated tests where it makes sense (the schema/server logic is unit-testable without a device).
- [ ] `CHANGELOG.md` has an entry under **Unreleased** describing the change.

## Scope: what we will and won't take

**In scope:** the Nitro client (start/update/end, token collection with rotation,
push-to-start token, enablement + state listeners); the SwiftUI widget template
(Lock Screen + Dynamic Island, data-driven, customizable); the dependency-free
Node APNs sender (`start`/`update`/`end`, broadcast/channel, token registry); the
Expo config plugin; and keeping the **one shared schema** consistent across all
layers.

**Out of scope / won't take:**

- **A runtime dependency in `/server`.** The zero-dependency APNs sender is a
  deliberate feature. PRs adding `node-apn`/JWT/HTTP libraries will be declined.
- **A hosted/SaaS push path.** This package is vendor-neutral by design — you own
  the `.p8` and the backend. We won't route pushes through a third-party service.
- **Android/web Live Activity UI.** It's an iOS feature; off-iOS stays a typed
  no-op. PRs implying a cross-platform Live Activity will be asked to reframe.
- **Claims that the native layers are device-verified by CI.** They're
  reviewed-not-device-compiled here; docs must say so.

PRs that *honestly document* limits are very welcome. PRs that *claim to remove*
an Apple OS constraint (the 4 KB cap, the Dynamic Island hardware gate,
push-to-start's iOS-17.2 floor) will be sent back for evidence.

## Reporting security issues

Please do **not** open a public issue for a vulnerability. APNs auth keys (`.p8`)
are highly sensitive — follow the private process in
[SECURITY.md](./SECURITY.md) (GitHub Security Advisories).

---

Thank you for helping keep custom Live Activities free, open, and vendor-neutral. 🟢
