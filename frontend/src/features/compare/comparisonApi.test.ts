import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchModels,
  generateAnswer,
  ComparisonApiError,
  type ComparisonApiErrorCode,
} from './comparisonApi.js';

describe('comparisonApi', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('ComparisonApiError', () => {
    it('sets the fixed error code and does not accept or leak raw cause in message', () => {
      const err = new ComparisonApiError('INVALID_REQUEST');
      expect(err.name).toBe('ComparisonApiError');
      expect(err.code).toBe('INVALID_REQUEST');
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    });
  });

  describe('fetchModels', () => {
    it('fetches /api/models with relative URL, GET method, no body, and forwards signal', async () => {
      const controller = new AbortController();
      let capturedUrl: string | URL | Request = '';
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(
          JSON.stringify({
            models: [
              { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
              {
                id: 'anthropic/claude-3-haiku',
                name: 'Claude 3 Haiku',
                provider: 'Anthropic',
                extra: 'ignored',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const models = await fetchModels(controller.signal);
      expect(capturedUrl).toBe('/api/models');
      expect(capturedInit?.method ?? 'GET').toBe('GET');
      expect(capturedInit?.body).toBeUndefined();
      expect(capturedInit?.signal).toBe(controller.signal);
      expect(models).toEqual([
        { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
      ]);
    });

    it('accepts an empty catalog []', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));

      const models = await fetchModels(new AbortController().signal);
      expect(models).toEqual([]);
    });

    it('rejects invalid catalog structure or items with INVALID_RESPONSE', async () => {
      const invalidBodies = [
        'not json',
        'null',
        '{}',
        JSON.stringify({ models: null }),
        JSON.stringify({ models: 'string' }),
        JSON.stringify({ models: [null] }),
        JSON.stringify({ models: [{ id: 'm1' }] }),
        JSON.stringify({ models: [{ id: '', name: 'M1', provider: 'P1' }] }),
        JSON.stringify({ models: [{ id: ' m1', name: 'M1', provider: 'P1' }] }),
        JSON.stringify({ models: [{ id: 'm1 ', name: 'M1', provider: 'P1' }] }),
        JSON.stringify({ models: [{ id: 'm1', name: '', provider: 'P1' }] }),
        JSON.stringify({ models: [{ id: 'm1', name: ' M1', provider: 'P1' }] }),
        JSON.stringify({ models: [{ id: 'm1', name: 'M1', provider: '' }] }),
        JSON.stringify({ models: [{ id: 'm1', name: 'M1', provider: ' P1' }] }),
        JSON.stringify({
          models: [
            { id: 'm1', name: 'Model 1', provider: 'P1' },
            { id: 'm1', name: 'Model 1 Duplicate', provider: 'P1' },
          ],
        }),
      ];

      for (const body of invalidBodies) {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
        await expect(fetchModels(new AbortController().signal)).rejects.toThrow(ComparisonApiError);
        await expect(fetchModels(new AbortController().signal)).rejects.toMatchObject({
          code: 'INVALID_RESPONSE',
        });
      }
    });

    it('passes through AbortError when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(fetchModels(controller.signal)).rejects.toThrow('The operation was aborted.');
    });

    it('maps network failures to NETWORK_ERROR', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(fetchModels(new AbortController().signal)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('maps backend error envelopes to respective codes without leaking raw message', async () => {
      const secretSentinel = 'RAW_SECRET_DO_NOT_LEAK_IN_UI';
      const envelopeCases: Array<{
        status: number;
        code: ComparisonApiErrorCode;
      }> = [
        { status: 400, code: 'INVALID_REQUEST' },
        { status: 503, code: 'GENERATION_UNAVAILABLE' },
        { status: 502, code: 'UPSTREAM_AUTH_ERROR' },
        { status: 429, code: 'UPSTREAM_LIMIT_EXCEEDED' },
        { status: 504, code: 'UPSTREAM_TIMEOUT' },
        { status: 502, code: 'UPSTREAM_ERROR' },
        { status: 502, code: 'UPSTREAM_INVALID_RESPONSE' },
      ];

      for (const { status, code } of envelopeCases) {
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { code, message: `Detailed server message: ${secretSentinel}` },
            }),
            { status, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        try {
          await fetchModels(new AbortController().signal);
          expect.fail('Expected to throw');
        } catch (err: unknown) {
          expect(err).toBeInstanceOf(ComparisonApiError);
          const apiErr = err as ComparisonApiError;
          expect(apiErr.code).toBe(code);
          expect(apiErr.message.includes(secretSentinel)).toBe(false);
        }
      }
    });

    it('falls back to status code mapping when error body is not JSON or has unknown code', async () => {
      const fallbackCases: Array<{ status: number; expected: ComparisonApiErrorCode }> = [
        { status: 400, expected: 'INVALID_REQUEST' },
        { status: 429, expected: 'UPSTREAM_LIMIT_EXCEEDED' },
        { status: 503, expected: 'GENERATION_UNAVAILABLE' },
        { status: 504, expected: 'UPSTREAM_TIMEOUT' },
        { status: 500, expected: 'UPSTREAM_ERROR' },
        { status: 502, expected: 'UPSTREAM_ERROR' },
        { status: 418, expected: 'UPSTREAM_ERROR' },
      ];

      for (const { status, expected } of fallbackCases) {
        globalThis.fetch = vi
          .fn()
          .mockResolvedValue(new Response('<html><body>Error</body></html>', { status }));

        await expect(fetchModels(new AbortController().signal)).rejects.toMatchObject({
          code: expected,
        });
      }
    });
  });

  describe('generateAnswer', () => {
    it('sends POST /api/generate with application/json body and forwards signal', async () => {
      const controller = new AbortController();
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            modelId: 'openai/gpt-5-mini',
            text: '  Preserved whitespace  \n\n```ts\nconst x = 1;\n```',
            durationMs: 1234.56,
            usage: { prompt_tokens: 10, completion_tokens: 20 },
            extra_field: 'ignored',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const result = await generateAnswer(
        { prompt: 'Say hello', modelId: 'openai/gpt-5-mini' },
        controller.signal,
      );

      expect(capturedUrl).toBe('/api/generate');
      expect(capturedInit?.method).toBe('POST');
      expect((capturedInit?.headers as Record<string, string>)?.['Content-Type']).toBe(
        'application/json',
      );
      expect(capturedInit?.body).toBe(
        JSON.stringify({ prompt: 'Say hello', modelId: 'openai/gpt-5-mini' }),
      );
      expect(capturedInit?.signal).toBe(controller.signal);

      expect(result).toEqual({
        modelId: 'openai/gpt-5-mini',
        text: '  Preserved whitespace  \n\n```ts\nconst x = 1;\n```',
        durationMs: 1234.56,
      });
    });

    it('accepts an empty string text as valid and durationMs 0', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            modelId: 'openai/gpt-5-mini',
            text: '',
            durationMs: 0,
          }),
          { status: 200 },
        ),
      );

      const result = await generateAnswer(
        { prompt: 'prompt', modelId: 'openai/gpt-5-mini' },
        new AbortController().signal,
      );

      expect(result).toEqual({
        modelId: 'openai/gpt-5-mini',
        text: '',
        durationMs: 0,
      });
    });

    it('rejects with INVALID_RESPONSE when 200 payload breaks contract', async () => {
      const invalidPayloads = [
        'invalid json',
        'null',
        '{}',
        JSON.stringify({ modelId: 'different/model', text: 'ok', durationMs: 100 }),
        JSON.stringify({ modelId: 'openai/gpt-5-mini', text: null, durationMs: 100 }),
        JSON.stringify({ modelId: 'openai/gpt-5-mini', text: 123, durationMs: 100 }),
        JSON.stringify({ modelId: 'openai/gpt-5-mini', text: 'ok', durationMs: -1 }),
        JSON.stringify({ modelId: 'openai/gpt-5-mini', text: 'ok', durationMs: '100' }),
        JSON.stringify({ modelId: 'openai/gpt-5-mini', text: 'ok', durationMs: NaN }),
        JSON.stringify({ modelId: 'openai/gpt-5-mini', text: 'ok', durationMs: Infinity }),
      ];

      for (const payload of invalidPayloads) {
        globalThis.fetch = vi.fn().mockResolvedValue(new Response(payload, { status: 200 }));
        await expect(
          generateAnswer(
            { prompt: 'prompt', modelId: 'openai/gpt-5-mini' },
            new AbortController().signal,
          ),
        ).rejects.toMatchObject({
          code: 'INVALID_RESPONSE',
        });
      }
    });

    it('passes through AbortError on aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        generateAnswer({ prompt: 'prompt', modelId: 'openai/gpt-5-mini' }, controller.signal),
      ).rejects.toThrow('The operation was aborted.');
    });

    it('maps network errors to NETWORK_ERROR', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        generateAnswer(
          { prompt: 'prompt', modelId: 'openai/gpt-5-mini' },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('maps non-200 responses to appropriate ComparisonApiErrorCode', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'UPSTREAM_LIMIT_EXCEEDED', message: 'Rate limit exceeded' },
          }),
          { status: 429 },
        ),
      );

      await expect(
        generateAnswer(
          { prompt: 'prompt', modelId: 'openai/gpt-5-mini' },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        code: 'UPSTREAM_LIMIT_EXCEEDED',
      });
    });
  });
});

for (const api of ['catalog', 'generate'] as const) {
  for (const status of [200, 504]) {
    it(api + ' preserves abort while reading HTTP ' + status + ' body', async () => {
      const controller = new AbortController();
      const error = new DOMException('Body aborted', 'AbortError');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        status,
        json: async () => {
          controller.abort();
          throw error;
        },
      } as unknown as Response);
      try {
        const request =
          api === 'catalog'
            ? fetchModels(controller.signal)
            : generateAnswer({ modelId: 'test/model', prompt: 'Hi' }, controller.signal);
        await expect(request).rejects.toBe(error);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  }
}
