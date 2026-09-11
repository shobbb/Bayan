# APP SPEC — Adaptive Arabic Reading & Drilling

**Audience:** implementing agent (Claude Code or equivalent), and a maintainer who will edit this codebase by hand later.

Read §2 (Architecture), §3 (Configuration), §4 (Code Standards), §5 (Design Direction) and §18 (Extensibility) before writing any code. Requirements are tagged `REQ-n` and are testable; anything not tagged is guidance.

---

## 1. PRODUCT SUMMARY

Single-user language-acquisition app. Two activities:

- **Reading** — the app generates a short Arabic text; the learner taps words they don't know; taps are recorded.
- **Drilling** — the app builds flashcard batches from recorded failures and schedules them for spaced review.

Reading finds gaps. Drilling closes them. The app owns both, plus the state that connects them.

**Runtime:** native iOS and Android app, built with **Capacitor** over a React/TypeScript web layer. Ships as a signed `.ipa` and `.apk` through the App Store and Play Store. Not a PWA — a real installable binary with native plugins.
**Persistence:** on-device only (IndexedDB via the WebView). No account, no backend, no sync.
**Content:** generated at runtime via LLM API. Nothing bundled.
**Scheduling:** built-in SRS. Replaces Anki.

---

## 2. ARCHITECTURE

### 2.0 Platform

Capacitor project from initialization — **not** a web app that gets wrapped later. Run `npx cap add ios android` at project setup, before feature work begins.

```
ios/          Xcode project (committed)
android/      Gradle project (committed)
src/          React/TypeScript — the entire UI and logic layer
capacitor.config.ts
```

**Why this stack:** the app's hardest rendering problem is flowing, justified, fully-diacritized RTL Arabic with per-word tap targets. Browser text engines handle Arabic shaping, bidi, and diacritic stacking reliably, and splitting at word boundaries is safe because Arabic shaping does not cross whitespace. A WebView gives that for free. The performance cost of a WebView is irrelevant for an app that is text, buttons, and cards.

`REQ-P1` Development iterates against the dev server with a browser automation loop (Playwright / Chrome DevTools MCP) for fast sighted feedback. **This is a workflow choice, not a product phase.** The app is native from day one; the browser is a development surface.

`REQ-P2` Verify on a real device or simulator before considering any UI work complete. WebView text metrics, safe areas, and keyboard behaviour differ from desktop Chrome — and Arabic line-breaking in particular must be checked on-device.

`REQ-P3` No browser-only assumptions: no `window.open`, no URL-based routing that assumes an address bar, no reliance on browser back. Use in-app navigation state and handle the Android hardware back button explicitly.

### 2.0.1 Native plugins

| Concern | Plugin | Use |
|---|---|---|
| Local notifications | `@capacitor/local-notifications` | Daily review reminder when cards are due |
| Filesystem | `@capacitor/filesystem` | Export/import of the state dump (§12) |
| Preferences | `@capacitor/preferences` | API key storage — **not** localStorage |
| Share | `@capacitor/share` | Share exported state |
| Status/Nav bar | `@capacitor/status-bar` | Safe-area and theme handling |
| Haptics | `@capacitor/haptics` | Drill answer feedback |

`REQ-P4` The API key is stored via `Preferences` (which maps to Keychain / EncryptedSharedPreferences), never in `localStorage`.

`REQ-P5` All plugin calls go behind an interface in `services/platform/`. Domain and UI never import Capacitor directly. This keeps `domain/` pure per REQ-4 and keeps the browser dev loop working without native shims.

`REQ-P6` Respect safe-area insets throughout. The `GlossPanel` is bottom-fixed and **must** sit above the home indicator on iOS.

`REQ-P7` Local notifications are opt-in, scheduled only, and never used for engagement nagging — consistent with REQ-15.

### 2.0.2 Build

- `npm run build && npx cap sync` before any native build.
- iOS requires macOS with Xcode. Android needs Android Studio.
- Commit `ios/` and `android/` so the agent can modify native config (permissions, icons, splash) directly.
- Live reload during development: `npx cap run ios --livereload --external`.

---

### 2.1 Layers

Three layers, strictly one-directional. Enforce with lint rules on import paths.

```
   ui/          React components. No business logic, no direct DB access.
    ↓
  domain/       Pure logic: selection, scheduling, scoring, normalization.
    ↓           No React, no IndexedDB, no fetch. Pure functions + plain classes.
   data/        Repositories over IndexedDB. No domain rules.
```

`domain/` must be independently unit-testable with zero mocking of browser APIs. If a domain function needs the DB, it takes data as an argument instead.

`services/` sits beside `domain/` for I/O that isn't persistence — the LLM client. It may be called from `ui/` but never from `domain/`.

### 2.2 Directory layout

```
src/
  config/
    index.ts              merged, typed AppConfig
    models.ts             model routing per query kind
    algorithm.ts          bandit + draw weights, batch sizing
    categories.ts         topic / format controlled vocabularies
    generation.ts         length targets, retries, density
    types.ts
  data/
    db.ts                 Dexie schema + migrations
    wordRepository.ts
    roundRepository.ts
    batchRepository.ts
    settingsRepository.ts
  domain/
    normalize.ts          Arabic form normalization
    selector/
      bandit.ts           UCB1 over categories
      wordDraw.ts         weighted word sampling
      roundPlanner.ts     composes bandit + draw into a RoundPlan
    srs/
      scheduler.ts        FSRS/SM-2 wrapper
      grading.ts          answer evaluation (typo tolerance, synonyms)
    stats/
      metrics.ts          acquisition rate, flag rates, aggregation
    types.ts              shared domain types (no imports from data/ or ui/)
  services/
    llm/
      client.ts           transport, retries, key handling
      prompts.ts          prompt templates
      schemas.ts          zod schemas for LLM responses
    platform/
      index.ts            interface — the only Capacitor import site
      notifications.ts
      storage.ts          secure key storage (Preferences)
      files.ts            export / import
  ui/
    screens/
      HomeScreen.tsx
      ReadingScreen.tsx
      BatchScreen.tsx
      StatsScreen.tsx
      SettingsScreen.tsx
    components/
      ArabicText.tsx      RTL renderer, tap targets
      GlossPanel.tsx      fixed bottom panel
      ActionButton.tsx
      FlashcardView.tsx
      MultipleChoiceView.tsx
      WriteInView.tsx
    hooks/
      useRound.ts
      useBatch.ts
      useStats.ts
  app.tsx
```

### 2.3 Core types

Define once in `domain/types.ts`. Nothing else declares these shapes.

```ts
export type PartOfSpeech = 'verb' | 'noun' | 'adjective' | 'particle' | 'phrase';

export type RoundType =
  | 'explore' | 'reinforcement' | 'pureReinforcement' | 'backlog';

/** Normalized, diacritic-free. The join key for all word identity. */
export type WordId = string & { readonly __brand: 'WordId' };

export interface Word {
  id: WordId;
  surface: string;          // vowelled form as last displayed
  gloss: string;            // English, 1–3 words
  forms: string | null;     // "كَتَبَ / يَكْتُبُ / كِتَابَة" | "جَانِب / جَوَانِب"
  partOfSpeech: PartOfSpeech;
  seenCount: number;
  unclearCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  roundIds: string[];
  srs: SrsState | null;     // null until first included in a batch
}

/** One renderable token. gloss === null ⇒ punctuation or paragraph break. */
export interface Segment {
  text: string;             // word, punctuation, or PARAGRAPH_BREAK
  gloss: string | null;
  forms: string | null;
}

export interface Round {
  id: string;
  titleAr: string;
  titleEn: string;
  topic: string;
  format: string;
  roundType: RoundType;
  segments: Segment[];      // stored so rounds are re-readable
  distinctForms: number;
  flagCount: number;
  createdAt: number;
}

export interface SrsState {
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface Batch {
  id: string;
  wordIds: WordId[];
  exampleSentences: Record<WordId, string>;
  createdAt: number;
}

/** Output of the selector; input to generation. */
export interface RoundPlan {
  roundType: RoundType;
  topic: string;
  format: string;
  targetWordIds: WordId[];
  excludeTopics: string[];  // populated for reinforcement rounds
}
```

`WordId` is branded deliberately — it prevents raw strings being passed where a normalized id is required, which is the single most likely source of silent data corruption in this app.

---

## 3. CONFIGURATION

`REQ-C1` **Every tunable value lives in `src/config/`, not inline.** If a number, model name, or category label appears as a literal in `domain/`, `services/`, or `ui/`, that is a bug.

The rule of thumb: anything the maintainer might reasonably want to change without reading the implementation belongs here.

### 3.1 Layout

```
src/config/
  index.ts          merges defaults + user overrides, exports typed AppConfig
  models.ts         which model handles which query kind
  algorithm.ts      bandit + word-draw weights, batch sizing
  categories.ts     topic and format controlled vocabularies
  generation.ts     length targets, retry counts, prompt knobs
  types.ts          AppConfig interface
```

### 3.2 Model routing (`models.ts`)

Different query kinds have different requirements and costs. Route them independently — do not hardcode one model app-wide.

```ts
export type QueryKind =
  | 'roundGeneration'      // story/article + glosses + diacritics
  | 'sentenceGeneration'   // batched example sentences for cards
  | 'distractorGeneration' // multiple-choice wrong answers
  | 'diacritization';      // optional: re-vowel existing text

export interface ModelRoute {
  model: string;
  maxTokens: number;
  temperature: number;
}

export const DEFAULT_MODEL_ROUTES: Record<QueryKind, ModelRoute> = {
  roundGeneration:      { model: '<capable>', maxTokens: 4000, temperature: 0.8 },
  sentenceGeneration:   { model: '<mid>',     maxTokens: 3000, temperature: 0.7 },
  distractorGeneration: { model: '<cheap>',   maxTokens: 1000, temperature: 0.9 },
  diacritization:       { model: '<capable>', maxTokens: 4000, temperature: 0.2 },
};
```

Leave the model identifiers as placeholders in the initial build and resolve them at setup time — model names change frequently and hardcoding current ones guarantees staleness.

`REQ-C2` Diacritization quality is the binding constraint on generation quality. If output vowelling is unreliable, escalate `roundGeneration` before changing anything else.

### 3.3 Algorithm weights (`algorithm.ts`)

```ts
export const DEFAULT_ALGORITHM_CONFIG = {
  bandit: {
    explorationConstant: 0.7,   // UCB1 C. Higher ⇒ covers new categories faster.
  },
  wordDraw: {
    missRateWeight:   1.0,      // re-exposure of failing words
    underSampledWeight: 0.5,    // words seen few times
    stalenessWeight:  0.4,      // rounds since last appearance
    sampleSize:       15,
  },
  batch: {
    defaultSize: 40,            // measured ceiling; retention degrades above this
    warnAboveSize: 50,
  },
  grading: {
    maxLevenshteinDistance: 2,
  },
};
```

`REQ-C3` Each weight carries an inline comment stating what it controls. A future editor must be able to tune these without reading the selector implementation.

`REQ-C4` Domain functions receive weights as arguments. They must not import config directly — that would break their purity and testability (see REQ-4).

### 3.4 Categories (`categories.ts`)

Topic and format controlled vocabularies live here as exported arrays. Editable without touching logic.

`REQ-C5` Categories are a closed set at runtime. Free-text entry is prohibited — labels drift and the performance aggregation in §9 stops being comparable across rounds.

`REQ-C6` Adding a category is a config edit only. No code change may be required.

### 3.5 Generation parameters (`generation.ts`)

```ts
export const DEFAULT_GENERATION_CONFIG = {
  targetWordCount: { min: 90, max: 140 },
  maxValidationRetries: 1,
  requireFullDiacritics: true,
  newWordDensity: {          // approx share of unseen vocabulary, by round type
    explore: 0.20,
    reinforcement: 0.08,
    pureReinforcement: 0.0,
    backlog: 0.0,
  },
};
```

### 3.6 Overrides

`REQ-C7` `config/index.ts` merges compile-time defaults with user overrides persisted in `settingsRepository`. User overrides win. Everything in `algorithm.ts` and `models.ts` is overridable from the Settings screen (§12).

`REQ-C8` `AppConfig` is fully typed. No untyped config object reaches the rest of the app.

`REQ-C9` Config is read once at startup into a context provider. No module reads config at import time — that makes it impossible to override in tests.

---

## 4. CODE STANDARDS

`REQ-1` **TypeScript strict mode.** `strict: true`, `noUncheckedIndexedAccess: true`. No `any`. Unavoidable escapes use `unknown` plus a narrowing guard.

`REQ-2` **No business logic in components.** Components render and dispatch. Any conditional that encodes a rule belongs in `domain/`.

`REQ-3` **Repositories are the only IndexedDB callers.** No component or domain function touches Dexie directly.

`REQ-4` **Domain functions are pure.** No `Date.now()`, no `Math.random()` inside them — inject a clock and an RNG. This makes the selector deterministically testable, which matters because its behaviour is otherwise hard to verify.

`REQ-5` **Validate all LLM output with zod** before it reaches the domain layer. Malformed responses are an expected condition, not an exception.

`REQ-6` **Named exports only.** No default exports outside route-level screens.

`REQ-7` **File size ceiling ~200 lines.** Past that, split. A file doing two things gets two files.

`REQ-8` **Unit tests required** for: `normalize`, `bandit`, `wordDraw`, `scheduler`, `grading`, `metrics`. These are the pieces where a silent error corrupts data over weeks rather than failing loudly.

`REQ-9` **Comments explain *why*, not *what*.** Every non-obvious constant (bandit `C`, draw weights, batch ceiling) carries a one-line comment stating its origin, so a future editor doesn't "tidy" it away.

`REQ-10` **No global mutable state.** State flows through React context or hooks. No singletons holding data.

Naming: `camelCase` functions/variables, `PascalCase` types/components, `SCREAMING_SNAKE` module-level constants. Repository methods read as `getX` / `listX` / `upsertX` / `deleteX`.

---

## 5. DESIGN DIRECTION

This section is binding. Derive every colour and type decision from it rather than reaching for framework defaults.

### 5.1 Thesis: two registers

The app contains two fundamentally different activities and they should not look alike.

**Reading is a page.** The interface disappears. No cards, no shadows, no visible containers, minimal chrome. The learner is reading a text, not operating software. Anything that draws attention to the UI is taking attention from the Arabic.

**Drilling is an instrument.** Controls forward, states legible, feedback immediate. Here the interface should be obviously present and obviously responsive — it is a tool being used, not a text being read.

Home and Stats sit closer to the instrument register.

`REQ-D1` Do not unify these two registers under one card-based visual system. The difference is the design.

### 5.2 The governing constraint

**Diacritics drive every visual decision.** Fatḥa, kasra, shadda and sukūn are small, thin marks. They are the highest-value and most fragile information on screen. If they are hard to read, the app fails at its only job.

Consequences, which are not negotiable:
- Contrast must stay high. Low-contrast "elegant" grey-on-grey text destroys diacritics before it touches the base letters.
- Line height must clear stacked marks. Arabic with full vowelling occupies more vertical space than unvowelled Arabic.
- Never render Arabic body text below 1.6rem.
- Never apply letter-spacing to Arabic. It breaks cursive joining.
- Never use faux-bold or synthetic italics on Arabic. Use a real weight or none.

### 5.3 Palette

Cool-neutral ground, not warm cream. Warm paper tones push diacritic contrast down and are the reflexive choice for anything text-related; this app needs the contrast more than it needs the warmth.

```
--ground        #F7F7F5   near-white, faintly cool. Reading surface.
--ink           #16161A   near-black with a blue cast. Body text.
--ink-muted     #5C5C66   English glosses, secondary labels.
--rule          #E2E2DE   hairlines, dividers, panel edges.
--mark-seen     #DCE4EE   wash behind a tapped word. Cool, low-saturation.
--mark-new      #E8DFF0   wash behind first-encounter vocabulary.
--signal        #2E5E8C   the single accent. Interactive state only.
```

`REQ-D2` `--signal` appears only where something is interactive or currently active. It is never decorative, never a background, never a gradient.

`REQ-D3` Tapped-word state is a **background wash**, never an underline, border, or outline. Rules and borders sit in the same visual band as diacritics and compete with them directly.

**Dark mode is required, not optional** — this is an app used in the evening for long stretches.

```
--ground        #131316
--ink           #E8E8E4     not pure white; pure white on dark haloes thin marks
--ink-muted     #93939C
--rule          #2A2A30
--mark-seen     #22303F
--mark-new      #2E2740
--signal        #6FA3D6
```

### 5.4 Typography

**The Arabic face is both the display face and the body face. English is utility only.** This inverts the usual bilingual hierarchy and it is deliberate: English never competes for attention with the text being learned.

| Role | Face | Notes |
|---|---|---|
| Arabic reading | A Naskh face with proper diacritic positioning (Amiri, Noto Naskh Arabic) | This is the product. Choose on diacritic quality, nothing else. |
| Arabic UI | Same family, smaller | Do not introduce a second Arabic face |
| English | A quiet neutral sans (Inter, system UI) | Subordinate by design |

Scale:
```
reading-body     1.85rem / 2.45 line-height    the text itself
reading-title    2.1rem  / 1.4                 Arabic, weight 700
gloss-arabic     1.3rem  / 1.6                 in the panel
gloss-english    1.0rem  / 1.4
ui-label         0.82rem / 1.3                 English, muted
data             0.75rem / 1.2                 counts, rates
```

`REQ-D4` Bundle the Arabic face. Do not rely on a CDN — the app must render correctly offline on first launch.

`REQ-D5` The reading text is justified with `text-align: justify` only if word-spacing stays even; otherwise left-align (which is right-align in RTL). Ragged edges are preferable to rivers in vowelled Arabic.

### 5.5 The signature element: the gloss panel

The one memorable component. It should read as a **marginal note**, not a modal.

- Anchored to the bottom edge, above the safe area. Fixed height, never resizing as content changes.
- Separated from the text by a single hairline `--rule`. No shadow, no elevation, no rounded card.
- Does not dim, blur, or overlay the text. The learner must be able to see the word in its sentence while reading its gloss.
- Contents right-to-left: Arabic word, then forms in `--ink-muted`, then the English gloss.
- Content changes without the panel moving. Cross-fade, no slide.

`REQ-D6` The gloss panel never covers the tapped word. If the word sits in the bottom region, scroll the text so it clears.

The commentary tradition this echoes — the ḥāshiya in the margin of a matn — is the reason it should feel adjacent and permanent rather than interruptive and temporary.

### 5.6 Layout and space

- Single column throughout. No sidebars, no split panes.
- Reading screen: generous horizontal margins. Comfortable Arabic measure is roughly 30–40 characters per line, narrower than Latin text.
- Home: the six actions get equal visual weight in a two-column grid. No primary/secondary hierarchy — every action is equally available (§6).
- Spacing scale: `4 / 8 / 12 / 16 / 24 / 32 / 48`. Nothing off-scale.

`REQ-D7` Border radius is `0` or `4px`. Nothing more. Rounded cards read as generic app furniture and pull toward exactly the templated look this brief rejects.

### 5.7 Motion

Restrained. Motion here signals state change; it does not decorate.

- Gloss panel content: 120ms cross-fade.
- Tapped-word wash: 100ms, no easing flourish.
- Drill card reveal: 160ms.
- Correct/incorrect feedback: colour change plus haptic. No bounce, no scale, no confetti.
- Screen transitions: none, or a 120ms fade. No slide-in stacks.

`REQ-D8` Respect `prefers-reduced-motion`. All of the above become instant.

### 5.8 Copy

- Sentence case everywhere. No title case, no all-caps labels.
- Buttons name the action: "Start explore round", not "Explore →".
- Empty states direct rather than apologize: "No cards due. Start a round to find new words."
- Errors state what happened and what to do. They do not apologize and are never vague.
- Never use encouragement copy. No "Great job!", no streak language, no badges. This is a study tool for an adult; the data in Stats is the feedback.

`REQ-D9` No gamification of any kind — no streaks, points, levels, or celebratory animation. It would corrupt the honest-measurement premise the whole method rests on.

### 5.9 Quality floor

Meet these without announcing them: responsive to small phones, visible keyboard focus rings, reduced motion respected, tap targets ≥ 44px, `prefers-color-scheme` honoured, text scaling respected up to 200%.

---

## 6. NORMALIZATION

`REQ-11` `normalizeArabic(input: string): WordId` must:
- strip all diacritics (harakat, shadda, sukun) and tatweel `ـ`
- normalize hamza carriers: `أ إ آ ٱ → ا`
- normalize `ة → ه`, `ى → ي`
- strip the definite article `ال` prefix **only** when the remainder is ≥ 3 characters
- lowercase-equivalent trim of whitespace and punctuation

`REQ-12` Display always uses the stored vowelled `surface`. Normalization is for identity only, never for rendering.

This is the highest-risk component in the app. Without it the same word accumulates as several unrelated entries and every downstream metric silently degrades. Test it first and test it hard.

---

## 7. VIEW: HOME

Entry screen. Purpose: expose every action directly, orchestrate nothing.

**Layout**
- Header: app title. Stats and Settings are reached from the bottom navigation,
  not from here.
- Status — cards due, undrilled backlog, rounds completed, current batch size. Cards due is the only one that implies an action, so it carries the weight; the rest are context and are set quietly beside it.
- Actions — all six present and always enabled, ranked by how often they are reached for:

`REQ-50` Four destinations — Home, Articles, Stats, Settings — share a bottom
navigation bar. Reading and drilling do not show it: those are the two screens
where the interface is supposed to disappear (§5.1), the reader already owns the
bottom edge with its gloss panel, and a tab bar there invites leaving
mid-sentence. Destinations get a bar; activities get a way back. A destination
reachable from the bar carries no second control that does the same thing — one
navigation, not two.

`REQ-51` Every activity has an exit that is not its completion control. "Finish"
sits at the end of the text and records the reading; the exit leaves without
recording. Backing out of a round costs only that session's flags, since the
round is already persisted when it is shown (REQ-32); backing out of an article
discards the reading, since nothing is written until Finish.

`REQ-49` Rank the actions and the figures. Equal visual weight for everything was the earlier instruction here and it was wrong: when every element competes for attention nothing stands out, and the screen reads as noise. Deference is a real constraint (§5.1) and it applies to Home too — most screens have one primary action, a few secondary, and a couple of tertiary. Rank by expected frequency, never by hiding anything: exposing every action directly is the point of this screen, and ranking is not gating (REQ-13).

| Button | Rank | Dispatches |
|---|---|---|
| Study current batch | primary | open drill session (batch + due cards) |
| Explore | secondary | new round, `roundType: 'explore'` |
| Reinforcement | secondary | new round, `roundType: 'reinforcement'` |
| Pure reinforcement | secondary | new round, `roundType: 'pureReinforcement'` |
| Backlog clearing | secondary | new round, `roundType: 'backlog'` |
| Generate new batch | tertiary | build a ~40-card batch |

The four round types are one family and read as one — a set of four ways to do the same thing, not four peers of "Study". The rank belongs to the action's own descriptor, so the view still never branches on which action it is rendering (REQ-E2).

- Recent rounds list, tappable to re-read.

`REQ-13` **No action is ever disabled or gated.** Preconditions surface as advisory text only.
`REQ-14` **No auto-advance.** Completing any activity returns here.
`REQ-15` **No prompting or nagging.** Status is displayed; it never interrupts.
`REQ-16` The six actions are six independent exported functions with no ordering dependency between them. Any future sequencing composes them from above; it does not live inside them.

Rationale for 13–16: the method is still under test. Hardcoding a flow would freeze sequencing assumptions that the data has not yet validated.

---

## 8. VIEW: READING

**Generation flow**
1. `roundPlanner.plan(roundType, state)` → `RoundPlan`
2. `llm.generateRound(plan)` → validated `{ titleAr, titleEn, segments }`
3. Persist `Round`, increment `seenCount` for every distinct word
4. Render

`REQ-17` One retry on schema-validation failure, then a user-facing error with the raw response available for inspection.

**Prompt requirements** (`services/llm/prompts.ts`)
- Requested topic, format, target words, length 90–140 words
- Full diacritics required
- Strict JSON, schema inlined
- Verbatim instruction: *write a coherent piece on the topic first, then work the requested vocabulary in naturally; never assemble text outward from a word list.*
- For `reinforcement`: include `excludeTopics`, and require target words appear in a **different inflection** than their stored `surface`
- For `pureReinforcement`: post-validate that no segment normalizes to an unknown `WordId`; regenerate on failure

**Rendering** (`ArabicText.tsx`)
- `dir="rtl"`, Amiri or equivalent, ~1.8rem, line-height ~2.4
- Each glossed segment is a button; punctuation renders inline with no leading space
- `PARAGRAPH_BREAK` renders as a break

**Interaction**
- `REQ-18` Tapping a word records it as unclear (`unclearCount++`) and opens `GlossPanel` with gloss + forms. The tap *is* the signal — there is no separate flag control.
- `REQ-19` Tapping an already-marked word unmarks it and decrements. Mistaps must be reversible.
- Marked words stay visually distinct for the session.
- `GlossPanel` is fixed to the bottom, does not reflow the text, and persists until another word is tapped.

**Completion**
- "Finish" writes `flagCount`, updates `lastSeenAt`, returns to Home.

---

## 9. VIEW: BATCH GENERATION

`REQ-20` Triggered only by the Generate-new-batch action.

**Selection**: rank words by `unclearCount / seenCount`, tie-break on `unclearCount`. Take 40.

`REQ-21` Default batch size 40. Configurable. Warn above 50 — larger batches measurably degrade retention under fatigue.

**Sentence generation**: one batched LLM call for all 40 example sentences. Each sentence must contain the target word and stay within already-seen vocabulary where possible.

**Card content**
- `REQ-22` Prompt side is **Arabic only**: base forms, then example sentence.
- `REQ-23` Answer side is **English only**: the gloss. No Arabic on the answer side.
- `REQ-24` Arabic → English only. Reverse cards are out of scope.

---

## 10. VIEW: DRILL SESSION

Queue = current batch + all due SRS cards, interleaved. Modes rotate across the session so the learner sees each word through more than one retrieval path.

**The interaction model is Quizlet's, not Anki's.** This is a deliberate choice and not a default: it is the app the learner actually uses, and a study loop they already have in their fingers costs nothing to learn. Concretely that means a card that flips, a two-way self-report, running counts of what is known versus still being learned, short rounds with a checkpoint between them, and a follow-up pass narrowed to what was missed. Where the two traditions disagree, follow Quizlet.

The visual language is still §5's — cool neutrals, one signal colour, no gradients or shadows. Borrow the mechanics, not the styling.

### 10.1 Shared shell

- Progress: position in the round, a thin bar, and a running count of `still learning` and `known` (§10.6).
- Prompt occupies the upper half, centered, generous whitespace.
- Response controls occupy the lower half, thumb-reachable.
- Exit control returns to Home; partial progress is saved.
- `REQ-38` Arabic prompt text uses the same typographic treatment as the reading screen (§8): same face, ~1.6rem minimum, `dir="rtl"`. Consistency matters — the learner should recognize the same script rendering in both contexts.
- `REQ-46` Undo reverts the last response, restoring the card's prior `SrsState` exactly. A mistap must be fully reversible, as on the reading screen (REQ-19).

### 10.2 `FlashcardView`

- **Front:** base forms on one line, example sentence below in a lighter weight. Arabic only.
- Tap anywhere on the card to flip.
- **Back:** English gloss, large and alone. Front content stays visible above it so the pairing is seen together.
- Two response buttons: `Still learning` and `Know it`. Nothing else.
- `REQ-39` The self-report is two-way. A mode reports what happened — known or not — and the mapping onto scheduler grades lives in one place, not in the view. Four-way self-grading is Anki's model and is not used here: it asks the learner to predict a scheduling interval mid-recall, which is a worse signal than what the graded modes measure directly.
- `REQ-47` The graded modes derive a finer grade from what the learner actually did — an exact answer, a typo-tolerated near miss, a wrong answer — rather than asking. Derived granularity is kept; self-reported granularity is not.

### 10.3 `MultipleChoiceView`

- **Prompt:** base forms + example sentence, Arabic only.
- Four English options, vertically stacked, full-width tap targets.
- On selection: correct choice turns green, incorrect turns red and the correct one is also highlighted. Brief pause, then advance.
- `REQ-25` Distractors share the target's part of speech and come from semantically adjacent words in the corpus. Random distractors make items trivially solvable and produce meaningless grading data.
- `REQ-40` Option order is randomized per presentation. A stable correct-position is learnable and corrupts the signal.

### 10.4 `WriteInView`

- **Prompt:** base forms + example sentence, Arabic only.
- Single-line English text input, autofocus, autocorrect and autocapitalize **off**.
- Submit on enter or button.
- `REQ-26` Accept Levenshtein distance ≤ 2 and any listed synonym. Show the canonical gloss on both correct and incorrect responses.
- `REQ-41` On a near-miss accepted by typo tolerance, show what was typed alongside the canonical form. The learner should see the discrepancy even when credited.
- `REQ-42` Provide an "I was right" override on rejection. Gloss matching is imperfect; the learner arbitrates.

### 10.5 Session end

- Summary: the two counts, and the missed items listed with their glosses.
- "Keep reviewing" restarts on the missed subset alone, carrying the counts forward.
- `REQ-27` Every response writes `SrsState` through `srs/scheduler.ts`. Use an established algorithm (FSRS preferred, SM-2 acceptable). Do not invent one.
- No auto-advance to another activity. Return to Home.

### 10.6 Rounds

A long queue is presented as a sequence of short rounds with a checkpoint between them, rather than one unbroken run.

- `REQ-48` Round length is a config value, not a literal.
- A checkpoint shows the running counts and continues on command. It is a resting point, not a reward screen — no streaks, no congratulation, consistent with REQ-15.
- Leaving at a checkpoint keeps everything already answered; nothing is scored only at the end.

---

## 11. VIEW: STATS

Read-only. All computation in `domain/stats/metrics.ts`.

**Word status breakdown**
- never flagged · flagged-then-passed · still failing · flagged once, never re-shown

`REQ-28` Acquisition rate = `passed / (passed + stillFailing)`, computed **only over words seen ≥ 2 times**. Words seen once are untested, not failures. Including them understates the figure by roughly 3×.

`REQ-29` Never display raw word-row count as vocabulary size. Label it "forms tracked" — multiple inflections of one root are multiple rows and one word.

**Word breakdown**: the per-form view behind the status buckets, so a count can be opened and inspected rather than taken on trust.
- Columns: surface, gloss, seen, flagged, miss rate, last seen, status bucket.
- Sortable by miss rate, seen count, and last seen. Filterable by status bucket.
- Tapping a row lists the rounds that form appeared in, each tappable to re-read.

`REQ-44` The breakdown reads the same `domain/stats/metrics.ts` figures the summary does. No component recomputes a metric — a number shown in two places is computed once.

`REQ-45` Default sort is miss rate descending across forms seen ≥ 2, matching REQ-28's threshold. Forms seen once sort last regardless of rate: they are untested, not failing.

**Category performance**: flag rate by topic, by format, by round type. Sortable. Surface sample size next to each rate; a single round is not a signal.

**History**: rounds with date, type, topic, format, flag rate. Tappable to re-read.

---

## 12. SELECTOR

### 12.1 Category bandit (`domain/selector/bandit.ts`)

UCB1 over topics and formats independently.

```
score(arm) = flagRate(arm) + C * sqrt(2 * ln(totalPulls) / pulls(arm))
C = 0.7
```

`REQ-30` **Reward is difficulty, not success.** High flag rate ⇒ higher score ⇒ more likely selected. This is inverted relative to a conventional bandit and is intentional: the app should steer toward what the learner finds hard. Do not "correct" this.

`REQ-31` Unpulled arms receive `Infinity`, ensuring category coverage.

`REQ-32` Count pulls from **all** rounds; compute reward only from rounds with a recorded `flagCount`. A round awaiting completion must not read as unpulled.

`REQ-33` The bandit selects topic and format only. **Round type is always the learner's explicit choice** and is never inferred.

### 12.2 Word draw (`domain/selector/wordDraw.ts`)

```
score(w) = 1.0 * missRate(w)
         + 0.5 * (1 / sqrt(seenCount + 1))
         + 0.4 * staleness(w)

missRate  = unclearCount / seenCount
staleness = (currentRoundIndex - lastRoundIndex) / currentRoundIndex
```

Weighted sample without replacement, ~15 words.

`REQ-34` The staleness term is required. Without it, early vocabulary silently exits rotation and the app only ever measures recent material.

`REQ-35` Weights are injectable parameters, not literals inside the function. They are expected to be tuned.

### 12.3 Round planner (`domain/selector/roundPlanner.ts`)

Composes the above per round type:

| Type | Behaviour |
|---|---|
| explore | Bandit topic/format. Target words weighted toward unseen. Higher new-word density. |
| reinforcement | Bandit topic/format, **excluding the previous round's topic**. Targets recently-drilled words. Requires different inflections. |
| pureReinforcement | Target words restricted to known `WordId`s. Post-generation validation enforces zero new vocabulary. |
| backlog | Target words restricted to those with `seenCount === 0` in the DB. |

`REQ-36` Reinforcement must change domain, not merely vary word forms. Same-domain reinforcement yields weak signal.

---

## 13. SETTINGS

- API key entry, stored on-device, never transmitted anywhere but the model provider.
- Model selection for generation.
- **Config overrides** — everything in `config/algorithm.ts` and `config/models.ts` is editable here (batch size, draw weights, bandit `C`, model per query kind). Show each value's default alongside the current setting, with a per-value reset.
- **Notifications**: opt-in daily reminder, time picker. Off by default.
- **Export**: full JSON dump of all stores, written via the Filesystem plugin and shareable via the Share sheet.
- **Import**: restore from dump, with a destructive-action confirmation.

`REQ-37` Export/import is the only backup path. There is no server. Surface it prominently, not buried.

---

## 14. STATE INTERCHANGE

The app must round-trip its full state with an external tooling environment (the chat session where this method was developed and where analysis is still run). This is bidirectional and load-bearing: the app is seeded from ~30 rounds of existing data on first run, and its state is periodically exported back out for analysis.

`REQ-I1` Import and export use **one schema**, versioned. Same shape both directions.

### 14.1 Interchange schema

```ts
interface StateExport {
  schemaVersion: 1;
  exportedAt: number;
  source: 'app' | 'external';

  words: Array<{
    id: string;              // normalized. If absent on import, derive via normalizeArabic()
    surface: string;         // vowelled display form
    gloss: string | null;    // null ⇒ needs enrichment (see REQ-I5)
    forms: string | null;
    partOfSpeech: PartOfSpeech | null;
    seenCount: number;
    unclearCount: number;
    firstSeenAt: number | null;
    lastSeenAt: number | null;
    roundIds: string[];
    srs: SrsState | null;    // null ⇒ never drilled
  }>;

  rounds: Array<{
    id: string;
    titleAr: string;
    titleEn: string;
    topic: string;
    format: string;
    roundType: RoundType;
    distinctForms: number;
    flagCount: number | null;   // null ⇒ round generated, feedback not recorded
    createdAt: number | null;
    segments: Segment[] | null; // null ⇒ text not retained; round is not re-readable
    notes: string | null;       // free-text method annotations
  }>;

  categories: { topics: string[]; formats: string[] };
  config: Partial<AppConfig> | null;
}
```

### 14.2 Import

`REQ-I2` Accessible from Settings. Accept a pasted JSON blob **and** a picked file — the seed data arrives as a paste, later restores as files.

`REQ-I3` Normalize every incoming `surface` through `normalizeArabic()` and merge on the resulting `id`. External data will contain multiple inflections of the same lemma as separate records; these **must** collapse. Merge rule: sum `seenCount` and `unclearCount`, union `roundIds`, keep the earliest `firstSeenAt` and latest `lastSeenAt`, keep the longest non-null `gloss` and `forms`.

`REQ-I4` Three modes, chosen by the user: **merge** (default, additive), **replace** (destructive, requires confirmation), **dry run** (report only, no writes).

`REQ-I5` Records with `gloss: null` import successfully and are flagged `needsEnrichment`. Provide a "fill missing glosses" action that batches them to the LLM. Do not block import on incomplete records — a meaningful share of the seed data has no gloss.

`REQ-I6` Rounds with `segments: null` import as history only: they count toward bandit statistics and appear in Stats, but are not re-readable. Mark them visually as such.

`REQ-I7` `srs: null` means never drilled. These words are eligible for the next batch, not treated as mature. Do not fabricate an SRS state on import.

`REQ-I8` Validate with zod before writing anything. On failure, report which records failed and why; import nothing. Partial writes are prohibited.

`REQ-I9` Show a pre-import summary — words added, words merged, rounds added, records needing enrichment — and require confirmation.

### 14.3 Export

`REQ-I10` One-tap export producing the same schema. Offer both **copy to clipboard** (for pasting into a chat session) and **save file** via the Filesystem plugin, plus the Share sheet.

`REQ-I11` Export is complete and lossless — every word, every round, all SRS state, current config, current categories. This is also the only backup path (REQ-37); it must never be a partial dump.

`REQ-I12` Offer a **compact export**: words and rounds with `segments` omitted and glosses truncated. Full exports of a large corpus exceed comfortable paste size for a chat window; the compact form preserves everything needed for analysis.

`REQ-I13` Include a derived summary block at the top of every export so an external reader gets the state of play without parsing the whole payload:

```json
"summary": {
  "totalWords": 0, "neverFlagged": 0, "flaggedThenPassed": 0,
  "stillFailing": 0, "flaggedOnceNeverRetested": 0,
  "acquisitionRate": 0.0,
  "totalRounds": 0, "flagRateByTopic": {}, "flagRateByFormat": {}
}
```

`REQ-I14` Schema version mismatches fail loudly with a clear message. Never attempt a silent best-effort parse.

---

## 15. NON-GOALS

State these in-app so expectations stay calibrated:

- Not a vocabulary-size measure. The app only knows words that appeared in generated texts.
- Receptive only. Does not develop production; that requires corrected output with a human.
- Does not train listening.
- Generated text is not authentic text — grammatical and useful for coverage, but lacking real collocational texture. It is an on-ramp to real material, not a substitute.

---

## 16. BUILD ORDER

1. Capacitor project init, `cap add ios android`, both platforms building and launching an empty shell. Do this before any feature work — discovering a native build problem at step 9 is expensive.
2. `config/` — types and defaults. Everything downstream imports from here rather than declaring literals.
3. `data/` — Dexie schema, repositories, migrations.
4. `domain/normalize.ts` + tests. Do not proceed until these pass.
5. `ui/ReadingScreen` + `ArabicText` + `GlossPanel` against hardcoded segments. Prove RTL rendering and tap logging.
6. `services/llm` — client, prompts, zod schemas, retry.
7. `ui/HomeScreen` with the six actions wired to independent functions.
8. `domain/selector/*` + tests.
9. `ui/StatsScreen` (§11) — aggregate metrics and the per-word breakdown. Ahead of drilling deliberately: reading rounds already produce flag data, so seeing which words are actually failing is what validates the selector before more machinery is built on top of it.
10. `domain/srs/*`, batch generation, three drill views.
11. Settings, notifications.
12. **State interchange (§14)** — import first, so the app can be seeded with real data and everything downstream is exercised against a realistic corpus rather than a handful of test rounds.
13. Store assets: icons, splash screens, listing metadata.

Steps 1–6 constitute a usable slice: reading works on-device and data accumulates while the remainder is built.

**Do step 5 on a real device before building anything else.** Flowing diacritized RTL Arabic with per-word tap targets is the one genuinely risky piece of this app. If it does not render correctly there, every downstream decision changes.

---

## 17. REFERENCE IMPLEMENTATION

`reference_reader.jsx` accompanies this spec. It is the working prototype the method was developed against — a React component rendering a vowelled Arabic text with per-word tap targets, a fixed gloss panel, and word tracking.

**Use it for:** the segment data shape, RTL rendering approach, tap-target construction inside flowing text, gloss panel layout, and the paragraph-break sentinel. It demonstrates that per-word tap targets work correctly in a browser text engine without breaking Arabic shaping — splitting at word boundaries is safe because shaping does not cross whitespace.

**Do not use it for:** architecture. It is a single-file prototype with inline styles, hardcoded story data, and no separation of layers. The production build follows §2 and §4 instead.

`REQ-43` Verify the reading screen reproduces the prototype's rendering quality on a real device before building anything downstream. This is the highest-risk component in the app.

---

## 18. EXTENSIBILITY

The method this app implements is still under active development. Round types, drill modes, weighting, and even the target language are expected to change. The architecture must absorb that without rewrites.

### 18.1 What is expected to change vs. what is stable

| Expected to change often | Stable |
|---|---|
| Round types | The word/round data model |
| Drill modes | The layer boundaries (§2.1) |
| Selector weights, bandit constant | Normalization semantics |
| Topic and format lists | The interchange schema (versioned) |
| Model routing | Repository interfaces |
| SRS algorithm | The tap-to-flag interaction |
| Prompt templates | |
| **Target language** | |

`REQ-E1` Anything in the left column is added by writing one new file and registering it. If adding a round type or drill mode requires edits across more than three files, the abstraction is wrong — fix it rather than working around it.

### 18.2 Extension point: round types

Round types are strategies, not switch cases.

```ts
// domain/selector/roundTypes/types.ts
export interface RoundTypeStrategy {
  readonly id: string;
  readonly label: string;
  /** Constrain the candidate word pool. */
  selectWords(pool: Word[], ctx: SelectionContext): WordId[];
  /** Constrain topic/format choice. e.g. exclude the previous round's topic. */
  constrainCategories(available: Categories, ctx: SelectionContext): Categories;
  /** Extra instructions appended to the generation prompt. */
  promptDirectives(): string[];
  /** Optional post-generation gate. Return null to accept, or a reason to regenerate. */
  validate?(segments: Segment[], ctx: SelectionContext): string | null;
}
```

Each type lives in its own file and is registered in one map. Adding a type touches: the new file, the registry, and a label in config. Nothing else.

`REQ-E2` No `switch (roundType)` outside the registry. That pattern is how this becomes unmaintainable — it scatters one concept across the codebase.

### 18.3 Extension point: drill modes

Same shape.

```ts
export interface DrillMode {
  readonly id: string;
  readonly label: string;
  /** Anything needed beyond the word itself, e.g. distractors. */
  prepare(word: Word, corpus: Word[]): DrillItem;
  /** Component rendering the item. */
  readonly component: React.ComponentType<DrillProps>;
  /** Map a raw response to a scheduler grade. */
  grade(response: unknown, item: DrillItem): Grade;
}
```

`REQ-E3` Drill modes own their own grading. The session runner never inspects a mode's response shape — it receives a `Grade` and passes it to the scheduler.

### 18.4 Extension point: scheduling

`REQ-E4` The SRS algorithm sits behind one interface:

```ts
export interface Scheduler {
  readonly id: string;
  next(state: SrsState | null, grade: Grade, now: number): SrsState;
  isDue(state: SrsState, now: number): boolean;
}
```

Swapping FSRS for SM-2 or anything else is a one-file change plus a config value. No component and no repository knows which is in use.

### 18.5 Multi-language readiness

**This matters concretely and near-term:** a second language track (Levantine Arabic) is planned. Retrofitting this later is expensive; designing for it now is nearly free.

`REQ-E5` Every `Word` and `Round` record carries a `trackId: string`. All queries filter on it. A track is a self-contained corpus with its own words, rounds, categories, and bandit statistics.

`REQ-E6` Language-specific behaviour is isolated behind one interface:

```ts
export interface LanguageProfile {
  readonly id: string;
  readonly name: string;
  readonly direction: 'rtl' | 'ltr';
  normalize(surface: string): string;
  readonly fontStack: string;
  readonly formsLabel: Record<PartOfSpeech, string>;   // "past / present / masdar"
  readonly promptGuidance: string;                      // register, script, vowelling
}
```

`REQ-E7` `normalizeArabic` is one implementation of `LanguageProfile.normalize`, not a globally imported function. Do not scatter Arabic-specific string handling through the codebase.

`REQ-E8` Ship with a single track active. Do not build track-switching UI now — build the schema so it can be added without migration.

### 18.6 Extension point: generation

`REQ-E9` Prompts are composed from parts, not written as monoliths: a base template, the language profile's guidance, the round type's directives, and the word list. Adding a round type must not require duplicating a prompt.

`REQ-E10` The LLM client is provider-agnostic behind an interface. Model identifiers live only in `config/models.ts`.

### 18.7 Anti-patterns

These are the specific ways this codebase would degrade. Avoid them explicitly.

- **Switch statements on round type or drill mode outside a registry.** The single most likely source of sprawl.
- **Business rules in components.** A conditional in JSX that encodes a method decision belongs in `domain/`.
- **Reaching around the repository layer** because a query is awkward. Fix the repository.
- **Tuning constants inline.** Every one belongs in `config/` (§3).
- **Arabic-specific logic outside the language profile.** Normalization, font choice, direction, and form labels are all profile concerns.
- **Coupling the SRS state shape to a specific algorithm.** Keep `SrsState` general enough to serve more than one scheduler.
- **Treating the interchange schema as internal.** It is a contract with an external tool (§13) and changes to it are versioned, not casual.

### 18.8 Maintainer test

Before considering the build complete, verify each of these is a small, local change:

1. Add a round type that biases toward words with a specific part of speech.
2. Add a drill mode that shows the example sentence with the target word blanked.
3. Replace the SRS algorithm.
4. Add a topic and a format.
5. Change the word-draw weights at runtime.
6. Add a second language track.

`REQ-E11` If any of these requires touching more than three files, revise the architecture before shipping. These are not hypotheticals — items 1, 4, 5, and 6 are all planned.

