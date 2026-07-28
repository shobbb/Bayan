/**
 * Prompt templates (§8, REQ-E9). Composed from parts — a base template, the
 * language profile's guidance, the round type's directives, and the word
 * list — never written as a monolith. Adding a round type injects its
 * directives here; it never requires branching or duplicating this
 * function.
 */

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
}

export function buildRoundGenerationPrompt(params: RoundPromptParams): string {
  const sections = [
    BASE_ROUND_INSTRUCTIONS,
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
