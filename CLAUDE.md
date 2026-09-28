# Bayan

Adaptive Arabic reading app. React + TypeScript + Vite, Capacitor 8 for iOS.
Spec: `docs/app_spec.md`, numbered `REQ-n`. Build notes: `docs/ios-build.md`.

## Propose design changes, don't make them

**IMPORTANT: a change outside the literal request is a proposal, not part of the
task** — including when you are already in the file, and including one-liners.

The failure this prevents is the unrequested change that arrives *inside* a
requested one, because those never announce themselves as decisions.

Never add without asking: anything choosing which model answers, substituting
one source's answer for another, or falling back where the user would otherwise
see a failure. A silent substitution is worse than a silent feature — it
corrupts measurement (REQ-92).

## Shipping

Web changes go over the air. Native changes — Swift, `ios/`, `patches/` — need a
TestFlight build.

```bash
# Dev is the public channel; bundles sent to production reach nobody.
npm version 1.0.x --no-git-tag-version && npm run build
npx @capgo/cli@latest bundle upload --channel Dev --bundle 1.0.x \
  --ignore-metadata-check --apikey "$CAPGO_TOKEN"
npx @capgo/cli@latest channel list --apikey "$CAPGO_TOKEN"   # confirm it moved
```

`--ignore-metadata-check` overrides a real check. It is only safe while the
bundle calls no native API the installed build lacks; otherwise ship a build.

Native: trigger `ios-testflight.yml`. Cloud sessions have no `gh` — use the
GitHub MCP tools, which also read job logs, so CI is the Swift compiler.

**Never change `MARKETING_VERSION`.** It stays `1.0`; raising it silently stops
every OTA update.

Plugin fixes are edited in `node_modules`, then `npx patch-package
@capgo/capacitor-llm` and commit `patches/` — otherwise the next install loses
them.

## Checks

```bash
npx tsc --noEmit -p tsconfig.app.json && npx eslint src/ && npx vitest run
```

UI changes: `npx vite preview` with Playwright at `/opt/pw-browsers/chromium`,
viewport 393px. CI proves Swift compiles and signs; nothing here runs it on a
device, so say which of the two you have.

`CAPGO_TOKEN` is in the environment. Never ask for a key in chat.
