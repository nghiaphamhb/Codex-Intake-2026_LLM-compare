import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAnswer, type ComparisonStreamDelta } from './comparisonStream.js';

function createNdjsonStream(lines: string[], delayMs = 0): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= lines.length) {
        controller.close();
        return;
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      controller.enqueue(encoder.encode(lines[index++] + '\n'));
    },
  });
}

describe('streamAnswer', () => {
  it('cancels a live response body rejected for a wrong content type', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    try {
      await expect(
        streamAnswer({ prompt: 'p', modelId: 'm' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('preserves an application callback error instead of reporting a network failure', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          createNdjsonStream([
            '{"type":"start","modelId":"m"}',
            '{"type":"text-delta","delta":"partial"}',
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        ),
      );
    const failure = new TypeError('callback programming error');
    try {
      await expect(
        streamAnswer({ prompt: 'p', modelId: 'm' }, new AbortController().signal, () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('request format and headers', () => {
    it('sends POST /api/stream with application/json and application/x-ndjson Accept', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'model-a' }),
        JSON.stringify({ type: 'text-delta', delta: 'Hello ' }),
        JSON.stringify({ type: 'done', durationMs: 120, costUsd: 0.001 }),
      ]);

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
        });
      });

      const deltas: ComparisonStreamDelta[] = [];
      const controller = new AbortController();

      const result = await streamAnswer(
        { prompt: 'Tell me something', modelId: 'model-a' },
        controller.signal,
        (d) => deltas.push(d),
      );

      expect(capturedUrl).toBe('/api/stream');
      expect(capturedInit?.method).toBe('POST');
      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers?.['Content-Type']).toBe('application/json');
      expect(headers?.['Accept']).toBe('application/x-ndjson');
      expect(capturedInit?.body).toBe(
        JSON.stringify({ prompt: 'Tell me something', modelId: 'model-a' }),
      );
      expect(capturedInit?.signal).toBe(controller.signal);

      expect(deltas).toEqual([{ type: 'text-delta', delta: 'Hello ' }]);
      expect(result).toEqual({ durationMs: 120, costUsd: 0.001 });
    });

    it('does not fetch if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await expect(
        streamAnswer({ prompt: 'test', modelId: 'model-a' }, controller.signal, () => {}),
      ).rejects.toThrow();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Content-Type validation', () => {
    it('rejects if Content-Type is not application/x-ndjson', async () => {
      const invalidContentTypes = ['text/html', 'application/json', 'text/event-stream', ''];

      for (const ct of invalidContentTypes) {
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response('{"type":"start","modelId":"m1"}\n', {
            status: 200,
            headers: ct ? { 'Content-Type': ct } : {},
          }),
        );

        await expect(
          streamAnswer({ prompt: 'test', modelId: 'm1' }, new AbortController().signal, () => {}),
        ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      }
    });

    it('rejects if response body is null', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/x-ndjson' }),
        body: null,
      });

      await expect(
        streamAnswer({ prompt: 'test', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
  });

  describe('streaming events and sequencing', () => {
    it('receives text-delta and reasoning-delta in order', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'm1' }),
        JSON.stringify({ type: 'reasoning-delta', delta: 'Thinking step 1...' }),
        JSON.stringify({ type: 'text-delta', delta: 'Answer part 1. ' }),
        JSON.stringify({ type: 'reasoning-delta', delta: 'Thinking step 2...' }),
        JSON.stringify({ type: 'text-delta', delta: 'Answer part 2.' }),
        JSON.stringify({ type: 'done', durationMs: 500, costUsd: null }),
      ]);

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      const deltas: ComparisonStreamDelta[] = [];
      const res = await streamAnswer(
        { prompt: 'q', modelId: 'm1' },
        new AbortController().signal,
        (d) => deltas.push(d),
      );

      expect(deltas).toEqual([
        { type: 'reasoning-delta', delta: 'Thinking step 1...' },
        { type: 'text-delta', delta: 'Answer part 1. ' },
        { type: 'reasoning-delta', delta: 'Thinking step 2...' },
        { type: 'text-delta', delta: 'Answer part 2.' },
      ]);
      expect(res).toEqual({ durationMs: 500, costUsd: null });
    });

    it('ignores empty deltas', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'm1' }),
        JSON.stringify({ type: 'text-delta', delta: '' }),
        JSON.stringify({ type: 'reasoning-delta', delta: '' }),
        JSON.stringify({ type: 'text-delta', delta: 'Actual' }),
        JSON.stringify({ type: 'done', durationMs: 10, costUsd: 0 }),
      ]);

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      const deltas: ComparisonStreamDelta[] = [];
      await streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, (d) =>
        deltas.push(d),
      );

      expect(deltas).toEqual([{ type: 'text-delta', delta: 'Actual' }]);
    });

    it('rejects delta before start', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'text-delta', delta: 'No start' }),
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('rejects start with mismatched modelId', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'different-model' }),
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      await expect(
        streamAnswer(
          { prompt: 'q', modelId: 'expected-model' },
          new AbortController().signal,
          () => {},
        ),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('rejects start arriving a second time', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'm1' }),
        JSON.stringify({ type: 'start', modelId: 'm1' }),
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('rejects unknown event type', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'm1' }),
        JSON.stringify({ type: 'custom-event', foo: 'bar' }),
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('validates done fields: durationMs and costUsd', async () => {
      // Valid done cases
      const validDoneCases = [
        { durationMs: 0, costUsd: 0 },
        { durationMs: 1500, costUsd: null },
        { durationMs: 2500, costUsd: 0.0016 },
      ];

      for (const d of validDoneCases) {
        const stream = createNdjsonStream([
          JSON.stringify({ type: 'start', modelId: 'm1' }),
          JSON.stringify({ type: 'done', ...d }),
        ]);
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        );

        const res = await streamAnswer(
          { prompt: 'q', modelId: 'm1' },
          new AbortController().signal,
          () => {},
        );
        expect(res).toEqual(d);
      }

      // Invalid done cases
      const invalidDoneCases = [
        JSON.stringify({ type: 'done', durationMs: -1, costUsd: 0 }),
        JSON.stringify({ type: 'done', durationMs: '100', costUsd: 0 }),
        '{"type":"done","durationMs":100}', // missing costUsd
        JSON.stringify({ type: 'done', durationMs: 100, costUsd: -0.1 }),
        JSON.stringify({ type: 'done', durationMs: 100, costUsd: '0.001' }),
        JSON.stringify({ type: 'done', durationMs: 100, costUsd: true }),
        JSON.stringify({ type: 'done', durationMs: 100, costUsd: {} }),
      ];

      for (const line of invalidDoneCases) {
        const stream = createNdjsonStream([JSON.stringify({ type: 'start', modelId: 'm1' }), line]);
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        );

        await expect(
          streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
        ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      }
    });

    it('handles error event before start', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({
          type: 'error',
          error: { code: 'UPSTREAM_LIMIT_EXCEEDED', message: 'Rate limited' },
        }),
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'UPSTREAM_LIMIT_EXCEEDED' });
    });

    it('handles error event after start and deltas', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'm1' }),
        JSON.stringify({ type: 'text-delta', delta: 'Partial text' }),
        JSON.stringify({
          type: 'error',
          error: { code: 'UPSTREAM_TIMEOUT', message: 'Timed out' },
        }),
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      const deltas: ComparisonStreamDelta[] = [];
      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, (d) =>
          deltas.push(d),
        ),
      ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });

      // Partial delta was still received before error
      expect(deltas).toEqual([{ type: 'text-delta', delta: 'Partial text' }]);
    });

    it('maps unknown error code or INTERNAL_ERROR to UPSTREAM_ERROR', async () => {
      for (const code of ['INTERNAL_ERROR', 'SOME_UNKNOWN_CODE']) {
        const bodyStream = createNdjsonStream([
          JSON.stringify({
            type: 'error',
            error: { code, message: 'secret' },
          }),
        ]);
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response(bodyStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        );

        await expect(
          streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
        ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
      }
    });

    it('stops consuming stream and ignores garbage after done', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'm1' }),
        JSON.stringify({ type: 'text-delta', delta: 'Hello' }),
        JSON.stringify({ type: 'done', durationMs: 100, costUsd: null }),
        'INVALID GARBAGE AFTER DONE',
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      const deltas: ComparisonStreamDelta[] = [];
      const res = await streamAnswer(
        { prompt: 'q', modelId: 'm1' },
        new AbortController().signal,
        (d) => deltas.push(d),
      );

      expect(deltas).toEqual([{ type: 'text-delta', delta: 'Hello' }]);
      expect(res).toEqual({ durationMs: 100, costUsd: null });
    });

    it('throws INVALID_RESPONSE on clean EOF without terminal event', async () => {
      const bodyStream = createNdjsonStream([
        JSON.stringify({ type: 'start', modelId: 'm1' }),
        JSON.stringify({ type: 'text-delta', delta: 'Half way...' }),
      ]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bodyStream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
  });

  describe('HTTP error and network error handling', () => {
    it('delegates non-200 responses to handleHttpError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'GENERATION_UNAVAILABLE', message: 'Down' },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'GENERATION_UNAVAILABLE' });
    });

    it('maps network fetch failure to NETWORK_ERROR', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('maps socket read error mid-stream to NETWORK_ERROR', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'start', modelId: 'm1' }) + '\n'),
          );
          controller.error(new TypeError('Socket closed abruptly'));
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      );

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, new AbortController().signal, () => {}),
      ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('preserves AbortError without wrapping when aborted by client', async () => {
      const controller = new AbortController();
      const abortError = new DOMException('The user aborted a request.', 'AbortError');

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        controller.abort();
        throw abortError;
      });

      await expect(
        streamAnswer({ prompt: 'q', modelId: 'm1' }, controller.signal, () => {}),
      ).rejects.toBe(abortError);
    });
  });
});
