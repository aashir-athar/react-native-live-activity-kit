<!-- Thanks for contributing! -->

## Description

<!-- What does this change and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change (native ↔ JS contract or content-state schema change → major version)
- [ ] Docs / chore

## Area affected

- [ ] Client module (JS / Nitro)
- [ ] Server sender (`/server` APNs)
- [ ] Config plugin (widget extension scaffolding)
- [ ] SwiftUI template / `ContentState` schema
- [ ] JS / TypeScript only

## Checklist

- [ ] `npm run codegen` run and `nitrogen/generated` committed (if specs changed)
- [ ] `npm run typecheck` passes (client + server + plugin)
- [ ] `npm run build` passes (bob + config plugin)
- [ ] If a content-state field changed: kept in sync across **all four** layers — `src/shared/schema.ts`, the client, `/server`, and `ios/LiveActivityKitAttributes.swift` (and the SwiftUI template if it renders the field)
- [ ] Native ↔ JS contract kept in sync (Nitro specs / Swift / TS types)
- [ ] If the config plugin changed: re-ran `npx expo prebuild --clean`, verified the widget extension target + `NSSupportsLiveActivities` + App Group output, and confirmed it's still idempotent
- [ ] Tested on a **physical iOS device** for the affected scenario (in-app start, push-to-start, push update, Dynamic Island render, or server APNs send) and pasted the result
- [ ] Docs are **honest** about platform limits (iOS-only feature; the native layers are reviewed, not device-compiled, in this repo; the 4 KB payload cap; token rotation)
- [ ] Docs and CHANGELOG updated
