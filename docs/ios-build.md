# Building Bayan for iOS

The web layer in `src/` is the entire app; Capacitor wraps the built assets in a
native binary (§2.0). Everything here happens on a Mac — the cloud dev container
cannot run CocoaPods or Xcode.

## Prerequisites

| Need | Why |
|---|---|
| macOS 26 + Xcode 26 | `@capgo/capacitor-llm` binds Apple's Foundation Models framework, which is iOS 26+ |
| CocoaPods | `cap add ios` and `cap sync` install native plugin pods through it |
| Node 20+ | same toolchain as the web build |

## First run

```bash
git pull
npm install
npm run cap:add:ios     # generates ios/ and installs pods
npm run assets          # native icons and splash screens from assets/
```

Then two things Xcode needs before it will build:

1. **Deployment target → 26.0.** In `ios/App/Podfile` set `platform :ios, '26.0'`,
   and in Xcode set App target → General → Minimum Deployments → iOS 26.0. The
   Capacitor template defaults well below this, and the LLM plugin will not
   compile against the default. Re-run `npx cap sync ios` after editing the
   Podfile.
2. **Signing.** Xcode → App target → Signing & Capabilities → your team.

Then Run to a connected device. On first install, trust the developer
certificate under Settings → General → VPN & Device Management on the phone.

## Iterating

```bash
npm run cap:sync        # builds the web layer and copies it into ios/
```

Then Run again in Xcode. `cap sync` is the step people forget — Xcode rebuilds
the *native* shell from whatever `dist/` held at the last sync, so a change to
`src/` that has not been synced simply will not appear.

## Provisioning expiry

A **free** Apple account signs development builds for **7 days**. After that the
installed app refuses to launch and the only fix is re-signing from Xcode. The
$99/year Developer Program raises this to a year. Anyone who will be away from
their Mac for more than a week needs the paid account, because there is no
on-device remedy.

## Regenerating the icons

`assets/icon.png`, `assets/splash.png` and `assets/splash-dark.png` are
generated, not drawn:

```bash
npm run icons           # re-renders all sources from the Amiri face
npm run assets          # re-cuts the native sizes from them
```

`scripts/make-icons.mjs` renders the app's own typography so the home-screen
mark and the reading screen are the same face, and verifies each PNG it writes
round-trips pixel-identically. The splash background matches
`capacitor.config.ts`'s `backgroundColor` exactly, so there is no flash between
the native launch image and the first painted frame.

## The on-device model

Settings → Definitions → **Use the on-device model** routes definition requests
to Apple Intelligence instead of the hosted API. It needs:

- an A17 Pro device or later (iPhone 15 Pro/Pro Max, iPhone 16 or later, iPhone Air),
- iOS 26+,
- Apple Intelligence switched on in Settings,
- the model finished downloading.

Where any of those is false the app reports unavailability and answers through
the hosted route instead, so the toggle is safe to leave on. It has no effect in
a browser.
