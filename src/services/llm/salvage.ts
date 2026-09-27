/**
 * Recovering the usable part of a response that ran out of output budget.
 *
 * A gloss request is a list of independent answers: one word, one definition,
 * no ordering between them. When the response is cut off mid-array, everything
 * before the cut is correct and paid for, and throwing it away costs the
 * learner the whole call — which for a long article is most of the cost of
 * reading it. Recovering the complete entries turns a truncation from a failed
 * call into a partial one, and the words that did not arrive are simply still
 * untranslated, which is the state the next tap already knows how to fix.
 *
 * Deliberately not applied to round generation. A round is one passage, and
 * half a passage is not a shorter round — it is a text that stops mid-sentence.
 * Only a list of independent answers can be cut in half and still be right.
 */

/**
 * The complete objects inside the first array in `raw`, as JSON text.
 *
 * A brace scan rather than a JSON parse, because the input is by definition not
 * valid JSON. It tracks string state and escapes so a brace inside a gloss —
 * or any of the Arabic the response is mostly made of — is not counted as
 * structure.
 */
export function completeObjectsInFirstArray(raw: string): string[] {
  const start = raw.indexOf('[');
  if (start === -1) return [];

  const out: string[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < raw.length; i++) {
    const char = raw[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        out.push(raw.slice(objectStart, i + 1));
        objectStart = -1;
      } else if (depth < 0) {
        // The array closed: everything after this belongs to the enclosing
        // object, not to the list.
        break;
      }
    } else if (char === ']' && depth === 0) {
      break;
    }
  }

  return out;
}

/**
 * Parses each complete object and keeps the ones that survive `accept`.
 *
 * Entries are validated individually rather than as a list, so one malformed
 * answer costs that answer and not the batch.
 */
export function salvageEntries<T>(raw: string, accept: (value: unknown) => T | null): T[] {
  const out: T[] = [];
  for (const text of completeObjectsInFirstArray(raw)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const accepted = accept(parsed);
    if (accepted !== null) out.push(accepted);
  }
  return out;
}
