/**
 * Gathers the full corpus and hands back a serialized dump (§14.3).
 * Orchestration only — the shape is decided in domain/interchange.
 */
import { buildStateExport, exportFilename, serializeStateExport } from '@/domain/interchange/buildExport';
import type { StateExport } from '@/domain/interchange/schema';
import { DEFAULT_TRACK_ID } from '@/domain/languageProfile';
import { listWords } from '@/data/wordRepository';
import { listRounds } from '@/data/roundRepository';
import { getConfigOverrides } from '@/data/settingsRepository';
import { listArticleReads } from '@/data/articleReadRepository';
import { listGlosses } from '@/data/glossRepository';
import type { Categories } from '@/config';

export interface ExportedState {
  state: StateExport;
  json: string;
  filename: string;
  wordCount: number;
  roundCount: number;
}

export async function exportState(
  categories: Categories,
  now = Date.now(),
): Promise<ExportedState> {
  const [words, rounds, overrides, articleReads, glosses] = await Promise.all([
    listWords(DEFAULT_TRACK_ID),
    listRounds(DEFAULT_TRACK_ID),
    getConfigOverrides(),
    listArticleReads(),
    listGlosses(),
  ]);

  // Oldest first, so a dump reads chronologically.
  const state = buildStateExport(
    words,
    [...rounds].reverse(),
    categories,
    overrides,
    now,
    articleReads,
    // The cache stores its own provenance; the dump carries only the
    // translation, so a restored gloss comes back marked as generated.
    glosses.map(({ id, gloss, forms, createdAt }) => ({ id, gloss, forms, createdAt })),
  );

  return {
    state,
    json: serializeStateExport(state),
    filename: exportFilename(now),
    wordCount: words.length,
    roundCount: rounds.length,
  };
}
