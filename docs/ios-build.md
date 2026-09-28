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

## Bundle versions must exceed the native version

The bundle compiled into the binary reports the native `MARKETING_VERSION` —
Xcode's default `1.0` unless changed — and the updater will not apply a bundle
numbered below what is already running. So **every over-the-air bundle must be
greater than `MARKETING_VERSION`**, and `package.json`, which the Capgo CLI
reads, has to sit on that same line. A `0.x` package version against a `1.0`
binary is a silent downgrade: the upload succeeds, the device checks, and
nothing ever arrives.

Keeping `package.json` on the `1.0.x` line is the cheap way round it. Moving
`MARKETING_VERSION` down to match a `0.x` package version works too, but it is
a native change and costs a rebuild and reinstall.

Settings tells the two apart by bundle id, not by version: the plugin documents
the built-in bundle's id as exactly `builtin` until an update has been applied.
Its version string is indistinguishable from any other.

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

### Downloadable models need a native rebuild once

`patches/@capgo+capacitor-llm+8.1.6.patch` fixes the plugin's model download,
which discarded the partial file on any interruption — so a two-gigabyte model
restarted from zero every time the network hiccuped or iOS suspended the app.
The patch keeps the resume data iOS hands back, beside the model in the
documents directory, and continues from it on the next attempt.

It is Swift, so unlike everything else in this repository it cannot reach a
device over the air. `patch-package` applies it on `npm install` (via the
`postinstall` script), but the change only takes effect once the native shell is
rebuilt:

```bash
npm install             # applies patches/ to node_modules
npm run cap:sync
```

Then Run in Xcode, and push a build to TestFlight if the phone should have it.
Until that rebuild, downloads behave as they did before and the "Resume" label
in Settings will restart the download rather than continuing it — the label is
driven by the web layer, which updates over the air, and the behaviour by the
native one, which does not.

If the patch ever fails to apply after a plugin upgrade, `npm install` says so
loudly. Re-apply it by hand against the new version and regenerate:

```bash
npx patch-package @capgo/capacitor-llm
```
