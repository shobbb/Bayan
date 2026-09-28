/**
 * Prompt templates (§8, REQ-E9). Composed from parts — a base template, the
 * language profile's guidance, the round type's directives, and the word
 * list — never written as a monolith. Adding a round type injects its
 * directives here; it never requires branching or duplicating this
 * function.
 */
import type { GlossLanguage } from '@/domain/glossLanguage';

const BASE_ROUND_INSTRUCTIONS = `You are generating a short reading passage for a language learner.

Write a coherent piece on the topic first, then work the requested vocabulary in naturally; never assemble text outward from a word list.

Full diacritics (tashkeel) are required on every word — vowelling quality is the most important property of your output.

Respond with strict JSON only, matching this shape exactly, with no prose before or after and no markdown code fence:
{
  "titleAr": string,
  "titleEn": string,
  "segments": Array<{ "text": string, "gloss": string | null, "forms": string | null }>
}

Segment rules:
- Each word is its own segment, fully vowelled, with an English gloss (1-3 words) and, where relevant, its forms (e.g. "كَتَبَ / يَكْتُبُ / كِتَابَة" for a verb, "جَانِب / جَوَانِب" for a noun). Use null for forms when not applicable (particles, pronouns, proper nouns).
- Punctuation is its own segment with "gloss": null and "forms": null.
- Mark paragraph breaks with a segment where "text" is exactly "¶" and "gloss" is null.`;

/**
 * What a generated round's segment glosses become under Arabic-only mode (§13).
 *
 * Injected as an override rather than by forking BASE_ROUND_INSTRUCTIONS: the
 * segment rules, the JSON shape and the diacritics requirement are all
 * unchanged, and two near-identical templates would drift apart the first time
 * one of them was edited.
 */
const ARABIC_ROUND_GLOSS_OVERRIDE = `Override the gloss rule above: each word's "gloss" must be a short DEFINITION IN SIMPLE ARABIC, not an English translation.

- A short phrase, typically 2-6 words, in common high-frequency Arabic.
- Fully vowelled, like the rest of the passage.
- Never the word itself or another form of its root.
- No English anywhere in a gloss.

"titleEn" is unaffected and stays English — it is how the round is listed, not something the learner reads to understand the text.`;

export interface RoundPromptParams {
  topic: string;
  format: string;
  targetWords: string[];
  excludeTopics: string[];
  /** Round-type-specific instructions, injected by the caller — never hardcoded here. */
  directives: string[];
  /** LanguageProfile.promptGuidance for the active track. */
  languageGuidance: string;
  minWords: number;
  maxWords: number;
  /** Which language the segment glosses are written in (§13). */
  glossLanguage?: GlossLanguage;
}

export function buildRoundGenerationPrompt(params: RoundPromptParams): string {
  const sections = [
    BASE_ROUND_INSTRUCTIONS,
    params.glossLanguage === 'arabic' ? ARABIC_ROUND_GLOSS_OVERRIDE : '',
    params.languageGuidance,
    ...params.directives,
    `Topic: ${params.topic}`,
    `Format: ${params.format}`,
    params.targetWords.length > 0
      ? `Work these words in naturally: ${params.targetWords.join(', ')}`
      : 'No specific target words are required for this round.',
    params.excludeTopics.length > 0
      ? `Do not write about: ${params.excludeTopics.join(', ')}.`
      : '',
    `Length: ${params.minWords}-${params.maxWords} words.`,
  ];
  return sections.filter((section) => section.trim().length > 0).join('\n\n');
}

const BASE_SENTENCE_INSTRUCTIONS = `You are writing example sentences for vocabulary cards.

For each supplied word, write ONE short Arabic sentence that uses it. Every sentence must:
- contain the supplied word,
- be fully diacritized (tashkeel on every word),
- stay within simple, already-common vocabulary wherever possible, so the sentence illuminates the target word rather than introducing new difficulty,
- be natural Arabic, not a definition or a translation exercise.

Respond with strict JSON only, no prose before or after and no markdown code fence:
{ "sentences": [ { "word": string, "sentence": string } ] }

Echo each word back exactly as supplied so the sentences can be matched to it.`;

export interface SentencePromptParams {
  /** Vowelled surface forms to illustrate. */
  words: string[];
  /** LanguageProfile.promptGuidance for the active track. */
  languageGuidance: string;
}

export function buildSentenceGenerationPrompt(params: SentencePromptParams): string {
  return [
    BASE_SENTENCE_INSTRUCTIONS,
    params.languageGuidance,
    `Words:\n${params.words.map((word) => `- ${word}`).join('\n')}`,
  ].join('\n\n');
}


const BASE_GLOSS_INSTRUCTIONS = `You are glossing Arabic words for a language learner's vocabulary tracker.

For each supplied word, give a short English gloss. Every gloss must:
- be 1-3 words, the way a dictionary or an interlinear gloss would put it,
- translate the word AS GIVEN, keeping its inflection: a plural stays plural, a past-tense verb stays past tense, a word carrying a prefixed conjunction keeps it ("and the house"),
- be the reading most likely in ordinary Modern Standard Arabic prose, when the word is ambiguous out of context.

Also give, where it applies:
- "forms": the word's principal parts, e.g. "كَتَبَ / يَكْتُبُ / كِتَابَة" for a verb or "جَانِب / جَوَانِب" for a noun. Use null for particles, pronouns and proper nouns.
- "partOfSpeech": one of verb, noun, adjective, particle, phrase. Use null if none fits.

A proper noun is glossed as itself in English ("Qatar", "Al Jazeera").

Respond with strict JSON only, no prose before or after and no markdown code fence:
{ "glosses": [ { "word": string, "gloss": string, "forms": string | null, "partOfSpeech": string | null } ] }

Echo each word back exactly as supplied so the glosses can be matched to it.`;

/**
 * The Arabic-only variant (§13).
 *
 * Not a translation of the English instructions. A one-to-three-word English
 * gloss is a *translation*; the Arabic equivalent of that is a synonym, which
 * is either a word the learner also does not know or the same word again. What
 * works monolingually is a short definition in plainer words than the headword
 * — which is why this asks for a phrase rather than a word, and why it names a
 * vocabulary ceiling instead of a length in words.
 */
const ARABIC_GLOSS_INSTRUCTIONS = `You are defining Arabic words in Arabic, for a learner who is past translating.

Some entries are multi-word expressions rather than single words. Define the expression as a whole — what it means in use, not what its words mean separately.

For each supplied entry, write a short definition IN SIMPLE ARABIC. Every definition must:
- be a short phrase, typically 2-6 words — a definition, not a one-word synonym,
- use only common, high-frequency Arabic that a learner would meet early; never explain a word with one that is rarer than it,
- never use the headword itself, or another form of its root, inside the definition,
- define the word AS GIVEN, keeping its inflection: a plural is defined as a plural, a past-tense verb as a past action,
- be fully vowelled (tashkeel on every letter), like the rest of the app's Arabic,
- contain NO English at all — not a word, not a gloss in brackets.

A proper noun is defined by what it is: "دَوْلَةٌ فِي الخَلِيجِ العَرَبِيِّ" for قطر, not the name again.

Also give, where it applies:
- "forms": the word's principal parts, e.g. "كَتَبَ / يَكْتُبُ / كِتَابَة" for a verb or "جَانِب / جَوَانِب" for a noun. Use null for particles, pronouns and proper nouns.
- "partOfSpeech": one of verb, noun, adjective, particle, phrase. Use null if none fits.

Respond with strict JSON only, no prose before or after and no markdown code fence:
{ "glosses": [ { "word": string, "gloss": string, "forms": string | null, "partOfSpeech": string | null } ] }

Echo each word back exactly as supplied so the definitions can be matched to it.`;

/**
 * The Arabic instructions rewritten for a small on-device model (§13).
 *
 * Not a summary of the full version — a different brief. The hosted prompt
 * stacks six simultaneous constraints and asks for a batch; a ~3B model given
 * that produced looped output, markdown fences, Arabic commas where JSON
 * structure belonged, and definitions unrelated to the word. Every one of those
 * is what a small model does when it is holding too much at once.
 *
 * So this asks for one word, states the two constraints that cannot be checked
 * any other way, shows the shape rather than describing it, and drops `forms`
 * and `partOfSpeech` entirely — both are optional downstream, and every field
 * asked for is another thing to get wrong.
 */
const ARABIC_GLOSS_INSTRUCTIONS_TERSE = `عَرِّف الكلمة العربية التالية بالعربية.

Rules:
- Answer in Arabic only. No English.
- Put full tashkeel on every letter.
- Do not use the word itself in your answer.
- 2 to 5 words.

Answer with JSON and nothing else, in exactly this shape:
{"glosses":[{"word":"<the word>","gloss":"<your definition>"}]}

Example:
{"glosses":[{"word":"مَدْرَسَة","gloss":"مَكَانٌ يَتَعَلَّمُ فِيهِ الأَوْلَادُ"}]}`;

export interface GlossPromptParams {
  /** Surface forms to gloss, exactly as they appear in the text. */
  words: string[];
  /** LanguageProfile.promptGuidance for the active track. */
  languageGuidance: string;
  /** Which language the definitions themselves are written in (§13). */
  glossLanguage?: GlossLanguage;
  /**
   * Whether a small on-device model is answering, which changes the brief
   * rather than trimming it. See ARABIC_GLOSS_INSTRUCTIONS_TERSE.
   */
  terse?: boolean;
}

export function buildGlossPrompt(params: GlossPromptParams): string {
  const arabic = params.glossLanguage === 'arabic';

  // The terse brief is self-contained: it carries its own example and says
  // nothing the small model has to hold in reserve. Appending the track's
  // register guidance and a bulleted list on top would put back exactly the
  // load it exists to remove.
  if (arabic && params.terse) {
    return `${ARABIC_GLOSS_INSTRUCTIONS_TERSE}\n\nWord: ${params.words[0] ?? ''}`;
  }

  return [
    arabic ? ARABIC_GLOSS_INSTRUCTIONS : BASE_GLOSS_INSTRUCTIONS,
    params.languageGuidance,
    `Words:\n${params.words.map((word) => `- ${word}`).join('\n')}`,
  ].join('\n\n');
}
