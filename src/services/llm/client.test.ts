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
