/**
 * Repository over generated comprehension questions (REQ-3). One set per
 * article; a newer set replaces the old one.
 */
import type { ComprehensionProgress, ComprehensionSet } from '@/domain/articles/comprehension';
import { db } from './db';

export async function getComprehension(articleId: string): Promise<ComprehensionSet | undefined> {
  return db.comprehension.get(articleId);
}

export async function putComprehension(set: ComprehensionSet): Promise<void> {
  await db.comprehension.put(set);
}

export async function getComprehensionProgress(
  articleId: string,
): Promise<ComprehensionProgress | undefined> {
  return db.comprehensionProgress.get(articleId);
}

export async function putComprehensionProgress(progress: ComprehensionProgress): Promise<void> {
  await db.comprehensionProgress.put(progress);
}
