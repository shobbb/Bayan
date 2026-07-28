/**
 * The active LanguageProfile (§18.5, REQ-E6). normalizeArabic is one
 * implementation of LanguageProfile.normalize, not a globally imported
 * function (REQ-E7) — callers that need normalization should generally go
 * through the active profile so a second track (e.g. Levantine) can supply
 * its own. Ships with a single track active; no track-switching UI yet
 * (REQ-E8).
 */
import { normalizeArabic } from './normalize';
import type { LanguageProfile, PartOfSpeech, TrackId } from './types';

const MSA_FORMS_LABEL: Record<PartOfSpeech, string> = {
  verb: 'past / present / masdar',
  noun: 'singular / plural',
  adjective: 'masculine / feminine',
  particle: '',
  phrase: '',
};

export const modernStandardArabicProfile: LanguageProfile = {
  id: 'msa',
  name: 'Modern Standard Arabic',
  direction: 'rtl',
  normalize: normalizeArabic,
  fontStack: "'Amiri', 'Noto Naskh Arabic', serif",
  formsLabel: MSA_FORMS_LABEL,
  promptGuidance:
    'Modern Standard Arabic (Fusha), fully diacritized (tashkeel on every letter), ' +
    'formal register suitable for news, literature, and educated conversation.',
};

/** The single active track (REQ-E8) — every Word and Round is scoped to it. */
export const DEFAULT_TRACK_ID = modernStandardArabicProfile.id as TrackId;
