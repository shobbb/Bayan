import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicClient, LlmRequestError } from './client';

const PARAMS = {
  model: 'claude-sonnet-5',
  maxTokens: 8000,
  effort: 'medium',
  prompt: 'Gloss these words.',
  apiKey: 'sk-test',
};

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('anthropicClient', () => {
  // The Claude 5 family removed temperature, top_p and top_k. Sending any of
  // them is a 400 that reaches the reader as a failed translation, which is
  // exactly how this was found.
  it('sends no sampling parameters', () => {
    const fetchMock = respondWith({ content: [{ type: 'text', text: 'ok' }] });

    return anthropicClient.complete(PARAMS).then(() => {
      const body = sentBody(fetchMock);
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('top_p');
      expect(body).not.toHaveProperty('top_k');
    });
  });

  it('sends effort where the sampling parameters used to be', async () => {
    const fetchMock = respondWith({ content: [{ type: 'text', text: 'ok' }] });

    await anthropicClient.complete({ ...PARAMS, effort: 'high' });

    expect(sentBody(fetchMock).output_config).toEqual({ effort: 'high' });
  });

  it('sends the model and the output ceiling', async () => {
    const fetchMock = respondWith({ content: [{ type: 'text', text: 'ok' }] });

    await anthropicClient.complete(PARAMS);
    const body = sentBody(fetchMock);

    expect(body.model).toBe('claude-sonnet-5');
    expect(body.max_tokens).toBe(8000);
  });

  // These models think before answering, so the answer is not content[0].
  it('finds the answer past the thinking blocks', async () => {
    respondWith({
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'the answer' },
      ],
    });

    expect((await anthropicClient.complete(PARAMS)).text).toBe('the answer');
  });

  it('reports a response cut off by the output ceiling as partial', async () => {
    respondWith({ content: [{ type: 'text', text: '{"a":' }], stop_reason: 'max_tokens' });

    expect((await anthropicClient.complete(PARAMS)).truncated).toBe(true);
  });

  it('does not call a complete response partial', async () => {
    respondWith({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });

    expect((await anthropicClient.complete(PARAMS)).truncated).toBe(false);
  });

  it('carries the provider status and body into the error', async () => {
    respondWith({ error: { message: '`temperature` is deprecated for this model.' } }, 400);

    await expect(anthropicClient.complete(PARAMS)).rejects.toThrow(LlmRequestError);
    await expect(anthropicClient.complete(PARAMS)).rejects.toThrow(/400/);
  });

  it('refuses a response with no text rather than returning an empty one', async () => {
    respondWith({ content: [{ type: 'thinking', thinking: '' }] });

    await expect(anthropicClient.complete(PARAMS)).rejects.toThrow(/no text content/);
  });
});

/** A streamed response, its bytes cut into the given chunks. */
function streamWith(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream; charset=utf-8' }),
    body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

describe('anthropicClient, streamed', () => {
  // A plain request sends nothing until the answer is done, and iOS drops a
  // connection that silent for a minute ("Load failed") — a round takes longer.
  it('asks for a stream', async () => {
    const fetchMock = streamWith([event('message_stop', { type: 'message_stop' })]);
    await anthropicClient.complete(PARAMS).catch(() => undefined);

    expect(sentBody(fetchMock).stream).toBe(true);
  });

  it('assembles the answer from text deltas, skipping thinking', async () => {
    const whole =
      event('message_start', { type: 'message_start', message: { content: [] } }) +
      event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }) +
      event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } }) +
      event('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '{"words":' } }) +
      event('ping', { type: 'ping' }) +
      event('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: ' []}' } }) +
      event('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' } }) +
      event('message_stop', { type: 'message_stop' });
    // Cut mid-line, as the network does.
    streamWith([whole.slice(0, 137), whole.slice(137, 400), whole.slice(400)]);

    expect(await anthropicClient.complete(PARAMS)).toEqual({ text: '{"words": []}', truncated: false });
  });

  it('reports a stream cut off by the output ceiling as partial', async () => {
    streamWith([
      event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"a":' } }),
      event('message_delta', { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }),
    ]);

    expect((await anthropicClient.complete(PARAMS)).truncated).toBe(true);
  });

  it('fails on an error that arrives mid-stream', async () => {
    streamWith([
      event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'par' } }),
      event('error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }),
    ]);

    await expect(anthropicClient.complete(PARAMS)).rejects.toThrow(/Overloaded/);
  });
});
