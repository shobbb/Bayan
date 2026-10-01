/**
 * Arabic definitions written ahead of time and shipped with the app.
 *
 * The app's own definition pass asks a model one article at a time, on the
 * reader's key, over the network. That is the right shape for a word nobody has
 * met before and the wrong shape for the corpus's common vocabulary, which is
 * the same few thousand words across 284 articles and does not need writing
 * twice — let alone on a plane with no signal.
 *
 * These are written once, keyed by the same WordId segmentation looks up, and
 * ride in the bundle beside the articles. A bundle reaches a phone over the air
 * in seconds, so the set grows without an App Store release.
 *
 * Code-split rather than imported eagerly: it is dead weight in English mode and
 * on every screen that is not an article.
 */
import type { WordId } from '@/domain/types';

export interface BundledDefinition {
  gloss: string;
  /** The vowelled form it was written for, so a homograph can be told apart. */
  surface: string;
}

interface DefinitionsFile {
  version: number;
  definitions: Record<string, { ar: string; surface: string }>;
}

let loaded: Map<WordId, BundledDefinition> | null = null;

/**
 * Every pre-written Arabic definition, by WordId.
 *
 * Cached after the first read: the file is immutable for the life of the bundle,
 * and re-parsing it on every re-segmentation would be paid on every tap.
 */
export async function bundledArabicDefinitions(): Promise<Map<WordId, BundledDefinition>> {
  if (loaded) return loaded;

  const { default: file } = (await import('@/assets/definitions/definitions.json')) as unknown as {
    default: DefinitionsFile;
  };

  loaded = new Map(
    Object.entries(file.definitions).map(
      ([id, entry]) => [id as WordId, { gloss: entry.ar, surface: entry.surface }] as const,
    ),
  );
  return loaded;
}
