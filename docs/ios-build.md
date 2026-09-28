# Building Bayan for iOS

The web layer in `src/` is the entire app; Capacitor wraps the built assets in a
native binary (§2.0). Everything here happens on a Mac — the cloud dev container
cannot run CocoaPods or Xcode.

## Prerequisites

| Need | Why |
|---|---|
| macOS 26 + Xcode 26 | `@capgo/capacitor-llm` binds Apple's Foundation Models framework, which is iOS 26+ |
| Node 20+ | same toolchain as the web build |

Capacitor 8 resolves native plugins through **Swift Package Manager**, not
CocoaPods — there is no Podfile. The generated package lives at
`ios/App/CapApp-SPM/` and Xcode resolves it on open.

## First run

```bash
git pull
npm install
npm run cap:add:ios     # generates ios/ and installs pods
npm run assets          # native icons and splash screens from assets/
```

Then two things Xcode needs before it will build:

1. **Deployment target → 26.0.** Xcode → App target → General → Minimum
   Deployments → iOS 26.0, which writes `IPHONEOS_DEPLOYMENT_TARGET = 26.0`
   into the project. The Capacitor template defaults well below this and the
   LLM plugin will not build against the default. (`CapApp-SPM/Package.swift`
   keeps Capacitor's own lower floor; the plugins gate their newer APIs
   internally, so the two differing is expected rather than a mismatch to fix.)
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
