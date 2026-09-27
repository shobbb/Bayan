/**
 * The on-device model, wearing the same interface as the hosted one (REQ-E10).
 *
 * This is the whole reason `LlmClient` exists as an interface rather than a
 * function: generation, schema validation, retries and partial-response salvage
 * are all written against it, so a second provider is a new implementation and
 * nothing else. Nothing in services/llm/generate.ts knows which one it holds.
 *
 * Two of the route's fields have no meaning here and are deliberately ignored:
 * `model` is chosen by the operating system, and `apiKey` does not exist —
 * being unmetered and keyless is the point. `maxTokens` is likewise not a
 * ceiling this side can enforce; see `truncated` below.
 */
import type { LlmClient, LlmCompletion } from './client';
import { promptLocalModel } from '@/services/platform/localModel';

export const localLlmClient: LlmClient = {
  async complete({ prompt }): Promise<LlmCompletion> {
    const text = await promptLocalModel({ prompt });

    // The plugin reports no stop reason, so there is no honest way to say a
    // response was cut off. Claiming `true` would send every answer down the
    // salvage path; claiming `false` is at least accurate about what is known.
    //
    // Nothing is lost by it: generateGlosses salvages on any validation
    // failure, not only on a declared truncation, precisely because a small
    // model's JSON fails in the same shape whether it ran out of room or simply
    // stopped following the format.
    return { text, truncated: false };
  },
};
