/**
 * Repository over generated comprehension questions (REQ-3). One set per
 * article; a newer set replaces the old one.
 */
import type { ComprehensionSet } from '@/domain/articles/comprehension';
import { db } from './db';

export async function getComprehension(articleId: string): Promise<ComprehensionSet | undefined> {
  return db.comprehension.get(articleId);
}

export async function putComprehension(set: ComprehensionSet): Promise<void> {
  await db.comprehension.put(set);
}
