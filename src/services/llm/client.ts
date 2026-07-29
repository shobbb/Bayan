/**
 * Provider-agnostic LLM transport (REQ-E10). Model identifiers live only in
 * config/models.ts — this file only knows how to send a prompt to whichever
 * endpoint the active provider points at and get text back. Swapping
 * providers means implementing LlmClient differently; nothing else in the
 * app knows which provider is in use.
 */

export interface LlmCompleteParams {
  model: string;
  maxTokens: number;
  temperature: number;
  prompt: string;
  apiKey: string;
}

export interface LlmCompletion {
  text: string;
  /**
   * The provider stopped because the output budget ran out, so `text` is cut
   * off mid-stream. Provider-neutral on purpose (REQ-E10) — every provider has
   * some form of this, and the callers only need to know the text is partial.
   * Worth distinguishing because truncated JSON fails to parse and is
   * otherwise indistinguishable from a model that simply answered badly.
   */
  truncated: boolean;
}

export interface LlmClient {
  complete(params: LlmCompleteParams): Promise<LlmCompletion>;
}

export class LlmRequestError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LlmRequestError';
    this.status = status;
  }
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
}

/** Anthropic Messages API. One concrete LlmClient implementation among possibly several. */
export const anthropicClient: LlmClient = {
  async complete({ model, maxTokens, temperature, prompt, apiKey }) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // The app is a WebView with no backend (§2.0), so requests are issued
        // from a browser origin. Without this the provider rejects them at CORS.
        // The key never leaves the device except on this request (§13).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmRequestError(`LLM request failed (${response.status}): ${body}`, response.status);
    }

    const data = (await response.json()) as AnthropicMessagesResponse;
    const text = data.content?.find((block) => block.type === 'text')?.text;
    if (!text) throw new LlmRequestError('LLM response contained no text content');
    return { text, truncated: data.stop_reason === 'max_tokens' };
  },
};
