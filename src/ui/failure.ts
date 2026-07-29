/**
 * Turning a thrown error into what Home actually shows (REQ-13: unmet
 * preconditions surface as advisory text, never as a disabled control).
 *
 * Lives in ui/ rather than in app.tsx so the screens can take the type without
 * importing back through the root component.
 */
import { MissingApiKeyError } from '@/services/rounds/roundService';
import { LlmValidationError } from '@/services/llm/generate';

export interface Failure {
  /** One sentence, always shown. */
  message: string;
  /** Operator detail behind a disclosure — raw response, schema issues. */
  detail: string | null;
  /** Whether Settings is where the fix is, so the link only shows when true. */
  settingsWillHelp: boolean;
}

export function describeFailure(error: unknown): Failure {
  if (error instanceof MissingApiKeyError) {
    return { message: error.message, detail: null, settingsWillHelp: true };
  }

  // REQ-17: a schema failure surfaces as a user-facing error with the raw
  // response available for inspection. The headline stays one sentence; the
  // raw response and the schema issues go in the detail, because a bare "did
  // not match the expected shape" gives nobody anything to act on.
  if (error instanceof LlmValidationError) {
    return {
      message: error.truncated
        ? 'The model ran out of room mid-response, so the round came back incomplete.'
        : 'The model returned a response that did not match the expected shape. Try again.',
      detail: error.describe(),
      settingsWillHelp: false,
    };
  }

  return {
    message: error instanceof Error ? error.message : 'Round generation failed.',
    detail: null,
    settingsWillHelp: false,
  };
}
