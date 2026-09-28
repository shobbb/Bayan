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
  {
    id: 'gemma-4-e2b-trimmed',
    label: 'Gemma 4 E2B (trimmed)',
    url: 'https://huggingface.co/elcooooo/gemma-4-E2B-it-latn-arab-cyrl-1.75GB-litertlm/resolve/main/gemma-4-E2B-it-latn-arab-cyrl-1.75GB.litertlm?download=true',
    filename: 'gemma-4-E2B-it-latn-arab-cyrl-1.75GB.litertlm',
    approxDownload: '~1.7 GB',
    note: 'The same Gemma above with its vocabulary cut to the Latin, Arabic and Cyrillic scripts — nearly a gigabyte less to hold, with the Arabic left in. Worth trying first if the full one runs out of memory. It is one person’s conversion rather than the LiteRT project’s, so it may simply fail to load; nothing is lost if it does.',
  },
  {
    id: 'qwen3-4b',
    label: 'Qwen3 4B',
    // Same URL shape as the Gemma entry above, which is known to work on a
    // device — including the query, so the two differ only in the file named.
    url: 'https://huggingface.co/litert-community/Qwen3-4B/resolve/main/qwen3_4b_mixed_int4.litertlm?download=true',
    filename: 'qwen3_4b_mixed_int4.litertlm',
    approxDownload: '~2.5 GB',
    note: 'A different family from Gemma, at four billion parameters quantized to mixed INT4 — the largest that fits under what iOS lets one app hold. Worth trying because it should fail differently, not because it is known to be better: its strongest languages are English and Chinese. Judge it the same way, on the discard count.',
  },
];
