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
 * Arabic punctuation the model used where JSON structure was meant, normalized
 * to ASCII — but only outside strings, so an Arabic gloss that itself contains a
 * comma is left untouched. A small on-device model generating Arabic emits ،
 * (U+060C) and ؛ (U+061B) as separators; that is invalid JSON and loses the
 * whole object to `JSON.parse` even when every value in it is correct.
 */
export function normalizeStructuralPunctuation(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }
    if (inString) {
      out += char;
      if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
    } else if (char === '،' || char === '؛') {
      out += ',';
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Every balanced `{…}` object anywhere in `raw`, deduplicated.
 *
 * The last resort when `completeObjectsInFirstArray` finds nothing, which is how
 * a small on-device model's output arrives: wrapped in markdown fences, and
 * looped — the array restarted several times, each restart opening braces the
 * previous copy never closed, so the array-scoped scan's depth never returns to
 * zero and it reports no complete object. Scanning outward from each `{`
 * independently recovers the one copy that did close. Identical repeats collapse
 * to one; a value's inner braces stay put because string state is tracked.
 */
export function recoverObjects(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < raw.length; j++) {
      const char = raw[j]!;
      if (escaped) {
        escaped = false;
      } else if (inString) {
        if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const text = raw.slice(i, j + 1);
          const key = text.replace(/\s+/g, ' ').trim();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(text);
          }
          break;
        }
      }
    }
  }

  return out;
}

/** JSON.parse, retried once with structural Arabic punctuation normalized. */
function parseTolerant(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(normalizeStructuralPunctuation(text));
    } catch {
      return undefined;
    }
  }
}

/**
 * Parses each complete object and keeps the ones that survive `accept`.
 *
 * Entries are validated individually rather than as a list, so one malformed
 * answer costs that answer and not the batch. The clean-truncation scan runs
 * first; only when it recovers nothing does the aggressive whole-string scan
 * take over, so a well-formed response's results are unchanged and unduplicated.
 */
export function salvageEntries<T>(raw: string, accept: (value: unknown) => T | null): T[] {
  const collect = (texts: string[]): T[] => {
    const out: T[] = [];
    for (const text of texts) {
      const parsed = parseTolerant(text);
      if (parsed === undefined) continue;
      const accepted = accept(parsed);
      if (accepted !== null) out.push(accepted);
    }
    return out;
  };

  const primary = collect(completeObjectsInFirstArray(raw));
  if (primary.length > 0) return primary;
  return collect(recoverObjects(raw));
}
