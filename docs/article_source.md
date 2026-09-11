# ARTICLE SOURCE — AL JAZEERA LEARNING ARABIC

Published articles from `learning.aljazeera.net`, rendered in Bayan's reader.

This records what the source actually contains, as measured against a saved dump
of 325 lesson pages — several assumptions in the original plan turned out to be
wrong, and the corrections are the useful part of this document.

---

## 1. WHAT AN ARTICLE IS HERE

An `Article` is **not** a `Round`, and deliberately not a Round with empty
fields.

`REQ-A1` Articles never reach `domain/selector`. They are fixed text: no target
words can be injected, so `wordDraw` has nothing to do, and their level/series
taxonomy is not in `config/categories.ts`. Feeding them to the bandit fails in
both directions — `scoreArms` filters observations to the configured arm set, so
their flag rates would be *silently dropped*; and mapping them onto configured
topics would let publisher-written text set difficulty rewards for arms that
plan generated text.

`REQ-A2` The corpus is shared. Reading an article writes `Word` rows through
`ingestRoundWords`, exactly as a generated round does, so a word met in an
article earns a `seenCount`, joins batches, and appears in stats as the same
word. There is one set of counting rules, not two.

`REQ-A3` Attribution is mandatory and always visible: source name and a link to
the original, in the reader header.

---

## 2. THE SOURCE, AS MEASURED

From 325 saved pages (elementary + intermediate):

| Fact | Figure |
|---|---|
| Articles with body text | 284 |
| Bodies fully vowelled | 274 |
| Articles with a derivable thumbnail | 236 |
| Articles with a video embed | 50 |
| Articles with neither image nor video | 0 |
| Publisher gloss pairs | 3,577 |
| Articles with no body at all | 41 — all video lessons, no transcript |

### 2.1 The vowelled body is already served

Every lesson ships **two** body containers. The page's tashkeel toggle only
flips visibility between them:

```html
<div class="original-body body-text">…</div>          <!-- unvowelled -->
<div class="formilized-body body-text hidden">…</div>  <!-- fully vowelled -->
```

Median diacritic density of the vowelled variant is 0.81. No headless render is
needed, and no auto-vowelling is ever attempted (§5.2 forbids guessing at
diacritics).

### 2.2 Everything worth having is behind a class

No script-boundary heuristics are needed anywhere:

```html
<h1 class="page-header">ARABIC<span class="lang">ENGLISH</span></h1>
<div class="phrases-row"><span class="arabic">تَظُنُّهُ</span><span class="locale lang">You believe it is</span></div>
```

Vocabulary is `#block-views-block-phrases-sidebar-block-1`, expressions are
`block-2`. Both sit in an `<aside>`, a sibling of `<article>` — not below the
body, so "parse between the toolbar and the مفردات heading" is wrong. Parse by
container.

### 2.3 Things that are not true of this source

- `إخفاء النص` appears on only 62 of 325 pages. It is not a usable fence.
- **Level is not on the article page.** All seven level labels appear on every
  page, because they are site navigation. It comes from the index.
- Paragraphs are `<p>` on some articles and `<div>` on others; keying on `<p>`
  alone loses 78 of 325.
- Numeric article ids observed run 21786–21995, and other URL families exist
  (`/en/asktheteacher/pages/…`), so id-range enumeration is unsafe.
- Only 91 of 325 carry video, not "most" — and of the 284 with body text, 50
  do. The site embeds its own interactive exercises in iframes too (391 of
  them), so an iframe is not evidence of video; match on the host.
- All `og:image` URLs are served over `http://`, which a page on `https://`
  refuses as mixed content. Rewrite the scheme.

---

## 3. INGESTION

`scripts/import_aljazeera.py` converts a saved dump into
`src/assets/articles/articles.json`, which ships as a build asset.

`REQ-A4` The app never crawls. Articles are static third-party content, so they
are converted offline and bundled. This removes pagination, rate limiting and
crawl idempotency from the app entirely, and means the text itself is always
available offline (REQ-D4).

`REQ-A9` Text is bundled; the publisher's images and video are not, and are
referenced at their original URLs. Two consequences to be honest about: media
does not work offline, and loading it is a request to a third party. The image
loads with the article and falls back to a plain surface when it fails. The
video does **not** load until the reader taps play — a heavy player frame on
every article open would be wasteful when most readings never watch it, and
silently contacting a video host the moment a page of Arabic appears is not
something reading should do unasked.

`REQ-A5` The bundle is imported dynamically so it is code-split. It is roughly a
megabyte and only the library and reader need it.

---

## 4. GLOSS RESOLUTION

`domain/articles/segment.ts`, pure and tested. In order:

1. a publisher **expression** — longest phrase wins, so an idiom stays one tap
2. a publisher **vocabulary** entry
3. the learner's own corpus
4. nothing

`REQ-A6` Publisher glosses outrank the corpus. They are editorial and were
written for *this* sentence; a corpus gloss was written for some other one.

`REQ-A7` Matching is by `LanguageProfile.normalize`, never a local
reimplementation (REQ-E7). The publisher's lists vowel words differently from
the bodies, so an exact-string index would miss most entries.

`REQ-A8` An Arabic word with no gloss gets an **empty** gloss, not `null`. Null
means punctuation and is dropped by ingestion; empty keeps the word tappable,
flaggable, and counted as seen, and lands it in the corpus with
`needsEnrichment` set (REQ-I5). Roughly 60% of an article's words arrive this
way — the publisher glosses only what its editors thought hard — so dropping
them would mean most of what is read never counts as read.

**Measured coverage**: 7.7% from publisher glosses alone; 40% once the learner's
existing corpus is layered in. The remaining 60% are tracked but untranslated.
Filling them is the obvious next step and has a hook already (`needsEnrichment`).

---

## 5. OPEN

- Only elementary and intermediate are ingested; five more levels exist.
- `robots.txt` and terms of use have **not** been checked. The current design
  does not crawl, which makes this much less pressing, but redistribution of
  bundled text is a separate question from crawling and is unresolved.
- Brightcove video stills cannot be derived without an API call, so 48 articles
  fall back to a title tile.
