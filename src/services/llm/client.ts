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
  /**
   * How much thinking the provider should spend before answering.
   *
   * Named for what it does rather than for the provider's field, since the
   * mapping is this file's business (REQ-E10) — one provider calls it effort,
   * another might call it reasoning depth, and an older model of the same
   * provider wants a temperature instead.
   */
  effort: string;
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

/**
 * Reads a streamed Messages response back into the same shape a plain one has.
 *
 * Streamed because a long answer — a round is up to 16,000 tokens at high
 * effort — can take over a minute, and with a plain request nothing arrives
 * until it is finished. iOS drops a connection that stays silent that long and
 * reports it only as "Load failed". A stream sends events the whole time.
 */
async function readStream(body: ReadableStream<Uint8Array>): Promise<LlmCompletion> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason: string | null = null;

  const handle = (data: string) => {
    let event: {
      type?: string;
      delta?: { type?: string; text?: string; stop_reason?: string | null };
      error?: { type?: string; message?: string };
    };
    try {
      event = JSON.parse(data);
    } catch {
      return; // a partial or keep-alive line
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      text += event.delta.text ?? '';
    } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
      stopReason = event.delta.stop_reason;
    } else if (event.type === 'error') {
      // An error after the 200: the stream says so in-band rather than by status.
      throw new LlmRequestError(`LLM request failed mid-stream: ${data}`);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) handle(line.slice(5).trim());
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith('data:')) handle(rest.slice(5).trim());

  if (!text) throw new LlmRequestError('LLM response contained no text content');
  return { text, truncated: stopReason === 'max_tokens' };
}

/** Anthropic Messages API. One concrete LlmClient implementation among possibly several. */
export const anthropicClient: LlmClient = {
  async complete({ model, maxTokens, effort, prompt, apiKey }) {
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
        // The Claude 5 family removed temperature, top_p and top_k — sending
        // any of them is a 400 — and replaced them with this. Thinking itself
        // is left unset: these models run it adaptively by default, and it is
        // effort that decides how deep.
        output_config: { effort },
        // See readStream: keeps a long answer's connection from going silent.
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmRequestError(`LLM request failed (${response.status}): ${body}`, response.status);
    }

    const contentType = response.headers?.get?.('content-type') ?? '';
    if (response.body && contentType.includes('text/event-stream')) {
      return readStream(response.body);
    }

    // Not streamed after all: read it whole, as before.
    const data = (await response.json()) as AnthropicMessagesResponse;
    // Found by type rather than by position: with thinking on, the response
    // opens with thinking blocks and the answer is not content[0].
    const text = data.content?.find((block) => block.type === 'text')?.text;
    if (!text) throw new LlmRequestError('LLM response contained no text content');
    return { text, truncated: data.stop_reason === 'max_tokens' };
  },
};
