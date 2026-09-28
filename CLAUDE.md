# Bayan

Adaptive Arabic reading and drilling app. React + TypeScript + Vite, wrapped in
Capacitor 8 for iOS. The specification is `docs/app_spec.md`, numbered `REQ-n`;
cite the requirement when a change turns on one.

## Ask before changing what was not asked for

**YOU MUST propose design changes rather than make them.** A change outside the
literal request is a proposal, even when it is obviously good, even when you are
already in the file, and even when it is one line.

The failure this exists to stop is not the unrequested feature. It is the
unrequested feature that arrives *inside* a requested one — a fallback added
while fixing error handling, a retry added while fixing a crash — because those
never announce themselves as decisions.

**IMPORTANT — these are never added silently, only proposed:**

- anything that decides **which model answers** a request
- anything that **substitutes** one source's answer for another's
- anything that **discards, retries, or falls back** where the user would
  otherwise see a failure
- anything that changes **what the reader is shown** when something goes wrong

A silent substitution is worse than a silent feature: it corrupts measurement.
Choosing an on-device model and being served a hosted answer makes every
judgement about that model worthless, and nothing on screen says so (REQ-92).

If you notice something worth fixing mid-task: finish what was asked, then say
what you found in one or two sentences. Do not fix it and mention it after.

## Say what you verified, not what you assume

- **Read the source before claiming behaviour.** Plugin internals, native code,
  and API shapes are in `node_modules`; read them. Several bugs here were found
  that way and several wrong claims were avoided by it.
- **Measure before shipping a heuristic.** Thresholds in this codebase carry the
  numbers they were set from. Keep that habit.
- **Never report something as working because it compiled.** CI proves Swift
  builds and signs; it proves nothing about behaviour on a device. Say which one
  you have.
- Correct yourself plainly when wrong, and move on.

## Shipping

Two delivery paths. Pick by what changed.

| Changed | Path | How |
|---|---|---|
| Web (`src/`) | Capgo OTA | bump `package.json`, build, upload |
| Native (Swift, `ios/`, `patches/`) | TestFlight | trigger the CI workflow |

**Web — publish to the `Dev` channel, not `production`.** `Dev` is the public
channel and the only one devices follow. Bundles uploaded to `production` reach
nobody.

```bash
npm version 1.0.x --no-git-tag-version && npm run build
npx @capgo/cli@latest bundle upload --channel Dev --bundle 1.0.x \
  --ignore-metadata-check --apikey "$CAPGO_TOKEN"
npx @capgo/cli@latest channel list --apikey "$CAPGO_TOKEN"   # confirm it moved
```

`--ignore-metadata-check` is needed only because `patches/` changes the plugin's
native source. **Before using it, confirm the bundle calls no native API the
installed build lacks.** If it genuinely needs new native code, the answer is a
TestFlight build, not the flag.

**Native:** trigger `ios-testflight.yml`. From a machine with `gh`, that is
`gh workflow run ios-testflight.yml`. Cloud sessions have no `gh` — use the
GitHub MCP tools, which can also read run status and job logs. That matters:
with CI as the compiler, Swift can be iterated on without a Mac, about five
minutes a cycle.

**YOU MUST NOT change `MARKETING_VERSION`.** It stays `1.0`. The updater refuses
any bundle at or below the native version, so raising it silently cuts off every
OTA update. After a TestFlight build, publish an OTA bundle numbered above
whatever web code went into that build.

## Codebase rules

- **Layering is `ui → domain → data`**, with `services/` beside `domain/`.
  ESLint enforces it: `domain/` may not import `services/`.
- **Every Capacitor plugin call lives behind `services/platform/`** (REQ-P5).
  This is what made the Capacitor 6→8 upgrade typecheck clean first try.
- **`LlmClient` is an interface** (REQ-E10). A new provider is a new
  implementation and nothing else.
- **Plugin patches go through `patch-package`.** Edit in `node_modules`, then
  `npx patch-package @capgo/capacitor-llm` and commit the patch, or the work is
  lost on the next install.
- `npm run cap:sync` re-pins the SPM platform floor itself. Do not hand-edit it.

## Checks

```bash
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/
npx vitest run
```

Browser verification runs against `npx vite preview` with Playwright at
`/opt/pw-browsers/chromium`. Check at 393px; the app is a phone app.

## Environment

- The sandbox reaches HuggingFace and GitHub. It cannot run the app on a device.
- `CAPGO_TOKEN` is in the environment. Never ask for a key in chat.
- Articles are bundled (`src/assets/articles/articles.json`, 284 of them), so
  reading works offline. Definitions are generated and cached; images are remote.
