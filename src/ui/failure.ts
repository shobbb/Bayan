/**
 * Turning a thrown error into what Home actually shows (REQ-13: unmet
 * preconditions surface as advisory text, never as a disabled control).
 *
 * Lives in ui/ rather than in app.tsx so the screens can take the type without
 * importing back through the root component.
 */
import { MissingApiKeyError } from '@/services/rounds/roundService';
import { LlmValidationError } from '@/services/llm/generate';
import {
  BackupNotConfiguredError,
  BackupWouldShrinkError,
} from '@/services/sync/backupService';

export interface Failure {
  /** One sentence, always shown. */
  message: string;
  /** Operator detail behind a disclosure — raw response, schema issues. */
  detail: string | null;
  /** Whether Settings is where the fix is, so the link only shows when true. */
  settingsWillHelp: boolean;
  /** Whether reloading is the fix, which is true only for a stale build. */
  reloadWillHelp?: boolean;
}

/**
 * A code-split chunk that is no longer on the server.
 *
 * Every deploy renames the hashed chunks, so a page opened before one asks for
 * a filename that has since been replaced. It surfaces whenever a chunk is
 * needed for the first time rather than at load — the Capacitor Preferences web
 * implementation is one, and nothing touches it until an API key is read, which
 * can be hours into a session.
 *
 * The browsers word it differently and none of them say what it means: Safari
 * "Importing a module script failed", Chrome "Failed to fetch dynamically
 * imported module", Firefox "error loading dynamically imported module".
 */
function isStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /importing a module script failed/i.test(message) ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /dynamically imported module.*(failed|error)/i.test(message)
  );
}

export function describeFailure(error: unknown): Failure {
  // Checked first: this arrives as an ordinary Error from whatever call
  // happened to need the chunk, so it would otherwise be reported as a failure
  // of that feature rather than of the build the page is running.
  if (isStaleBuild(error)) {
    return {
      message: 'The app was updated while this page was open, so part of it could not load.',
      detail: error instanceof Error ? error.message : String(error),
      settingsWillHelp: false,
      reloadWillHelp: true,
    };
  }

  if (error instanceof MissingApiKeyError) {
    return { message: error.message, detail: null, settingsWillHelp: true };
  }

  // Both backup failures are fixed in Settings — one by entering credentials,
  // the other by the deliberate "Back up anyway" that lives beside Restore.
  // The shrink guard is a refusal, not a fault, so it says what it protected.
  if (error instanceof BackupNotConfiguredError) {
    return { message: error.message, detail: null, settingsWillHelp: true };
  }
  if (error instanceof BackupWouldShrinkError) {
    return {
      message: `${error.message} Use "Back up anyway" in Settings if that is what you want.`,
      detail: null,
      settingsWillHelp: true,
    };
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
