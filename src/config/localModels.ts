/**
 * On-device models that can be downloaded in place of the system one (§13).
 *
 * A short list rather than a free-text URL: this downloads gigabytes and then
 * runs whatever arrives as the thing that defines Arabic words. A typo in a
 * hand-entered link is a long wait ending in a failure; a wrong link is worse.
 *
 * Apple Intelligence and Gemini Nano are not here. They are not downloaded —
 * the operating system already holds them — and are what the app uses when
 * nothing else is chosen.
 */
export interface LocalModelChoice {
  id: string;
  label: string;
  /** Direct link to a `.litertlm` bundle. */
  url: string;
  filename: string;
  /** Roughly what the download costs, so the choice is made with it in view. */
  approxDownload: string;
  note: string;
}

export const DOWNLOADABLE_MODELS: readonly LocalModelChoice[] = [
  {
    id: 'gemma-4-e2b',
    label: 'Gemma 4 E2B',
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm?download=true',
    filename: 'gemma-4-E2B-it.litertlm',
    approxDownload: '~2 GB',
    note: 'Far more multilingual training than the system model, at about 0.8 GB of weights once loaded. Whether that is enough for vowelled Arabic definitions is the open question — the discard count after one article is the answer.',
  },
];
