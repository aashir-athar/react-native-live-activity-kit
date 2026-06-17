# Security Policy

`react-native-live-activity-kit` does **not** collect or transmit user PII, and it
has **no telemetry** — but the **push path it enables is sensitive**: your **APNs
auth key (`.p8`)** is a credential as powerful as a password, and APNs **device
push tokens** identify a specific activity on a specific device. We take security
reports seriously and appreciate responsible disclosure.

---

## Supported versions

Security fixes are provided for the versions below. We follow semantic
versioning; fixes land on the latest minor of the current major and are
back-ported only when feasible.

| Version | Supported          | Notes                                              |
| ------- | ------------------ | -------------------------------------------------- |
| `0.1.x` | :white_check_mark: | Current release line — receives security fixes.    |
| `< 0.1` | :x:                | Pre-release / unpublished. Please upgrade.         |

Once a `0.2.x` line ships, the previous minor (`0.1.x`) will receive critical
security fixes for a transition period and this table will be updated. As a
pre-1.0 package, the public API may still change between minor versions; always
run the latest patch of your minor.

---

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.** Public disclosure before a fix is available puts
users at risk.

Please report privately through **GitHub Security Advisories**: go to the
repository's **Security → Advisories → Report a vulnerability** page
(<https://github.com/aashir-athar/react-native-live-activity-kit/security/advisories/new>).
This opens a private advisory only you and the maintainers can see, and lets us
collaborate on a fix and coordinate a CVE if warranted.

### What to include

To help us triage quickly, please include as much of the following as you can:

- A clear description of the issue and its security impact (what an attacker can
  read, write, exfiltrate, or trigger).
- The affected version(s), platform (the app side is iOS; the sender is Node),
  OS/runtime version, and device where relevant.
- Step-by-step reproduction, a proof-of-concept, or a failing test.
- Any relevant logs **with secrets redacted** — never paste a real `.p8`, Key ID,
  Team ID, or device push token.
- Whether the issue is already public or known elsewhere.

Please make a good-faith effort to avoid privacy violations, data destruction,
and service disruption while researching. Only test against apps, backends, push
keys, and devices you own or are explicitly authorized to test.

---

## Response SLA

We are a small open-source project, but we aim to meet the following targets for
privately reported vulnerabilities:

| Stage                                   | Target                          |
| --------------------------------------- | ------------------------------- |
| Acknowledge receipt of your report      | within **48 hours**             |
| Initial assessment & severity triage    | within **5 business days**      |
| Status update cadence while we work     | at least **every 7 days**       |
| Fix or mitigation for confirmed issues  | typically within **30–90 days**, prioritized by severity |
| Public disclosure / advisory + credit   | coordinated with you, **after** a fix is released |

If a report is declined (e.g. out of scope, not a vulnerability), we'll explain
why. We're happy to credit reporters in the advisory and release notes unless you
prefer to remain anonymous. We do not currently run a paid bug-bounty program.

---

## A note on data, push keys, and privacy

This library is designed to keep your data and your credentials under **your**
control, not ours.

- **No location data, no PII collection, no telemetry.** Unlike many native
  modules, this package does not collect personal data. The **client** calls
  Apple's `ActivityKit` and surfaces the activity id, push tokens, state, and
  enablement to *your* JS — nothing leaves the device unless *you* send it. The
  package has **no analytics and no "phone home"**; it never sends anything to the
  author or to any third party.
- **The APNs `.p8` auth key is the crown jewel — keep it server-side only.** The
  `/server` sender needs your APNs auth key to sign its ES256 JWT. **Never bundle
  the `.p8` (or its PEM contents, Key ID, or Team ID) in your mobile app**, never
  commit it to source control, and never paste it in an issue or log. Load it from
  a secret manager / environment variable on your backend. Anyone holding your
  `.p8` can push arbitrary Live Activities (and, with the same key, other
  notifications) to **all** your users. If it ever leaks, **revoke it in the Apple
  Developer portal and issue a new one** immediately.
- **Push tokens are sensitive identifiers — transmit and store them carefully.**
  The per-activity **update token** and the **push-to-start token** identify a
  device/activity. Send them from the app to your backend over **HTTPS**, store
  them associated with the right user, and **rotate** your stored copy when the
  device reports a new token. Treat a token leak like any session-identifier leak.
- **You own the transport and the backend.** The `/server` sender talks **only**
  to Apple's APNs hosts (`api.push.apple.com` / `api.sandbox.push.apple.com`) over
  TLS HTTP/2 with your signed token. It opens no other connections. The security
  of the backend that holds your tokens and your `.p8`, its TLS configuration, and
  its access controls are your responsibility.
- **Payloads are bounded and minimal.** The content-state you push is capped at
  **4 KB** by Apple (the sender enforces it), and it's whatever fields *you* put in
  `state` — keep it free of secrets and unnecessary personal data, since it's
  rendered on a Lock Screen that may be visible to others.
- **The `.p8` is never used on-device.** The client module does **not** read,
  embed, or require the auth key. Remote push is entirely a server concern; the
  device only ever produces tokens.

**Your obligations as an app developer:** you are the data controller for whatever
you place in a Live Activity and for the tokens your app forwards. Disclose
notification / Live Activity use in your App Store privacy answers, store push
tokens and your `.p8` securely, and don't render sensitive personal data on a
Lock Screen card.

If you believe the library itself transmits data anywhere other than Apple's APNs
(from the sender) or leaks the `.p8` / tokens, that is a security vulnerability —
please report it through the private channels above.
