import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNdjson, NdjsonParseError } from '../src/ndjson.js';

async function* createAsyncIterable(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collect<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of generator) {
    items.push(item);
  }
  return items;
}

const encoder = new TextEncoder();

test('ndjson: parses single line ending with LF', async () => {
  const stream = createAsyncIterable([encoder.encode('{"hello":"world"}\n')]);
  const results = await collect(parseNdjson(stream));
  assert.deepEqual(results, [{ hello: 'world' }]);
});

test('ndjson: parses CRLF line endings', async () => {
  const stream = createAsyncIterable([encoder.encode('{"a":1}\r\n{"b":2}\r\n')]);
  const results = await collect(parseNdjson(stream));
  assert.deepEqual(results, [{ a: 1 }, { b: 2 }]);
});

test('ndjson: handles multiple lines in a single chunk and lines split across chunks', async () => {
  const part1 = encoder.encode('{"first":1}\n{"sec');
  const part2 = encoder.encode('ond":2}\n{"third":3}\n');
  const stream = createAsyncIterable([part1, part2]);
  const results = await collect(parseNdjson(stream));
  assert.deepEqual(results, [{ first: 1 }, { second: 2 }, { third: 3 }]);
});

test('ndjson: accurately reconstructs Vietnamese, Russian, and emoji split byte-by-byte', async () => {
  const text = '{"vi":"Xin chào Việt Nam","ru":"Привет мир","emoji":"🚀🔥✨"}\n';
  const bytes = encoder.encode(text);
  // Send 1 byte at a time to test boundary reconstruction
  const chunks = Array.from(bytes).map((b) => new Uint8Array([b]));
  const stream = createAsyncIterable(chunks);
  const results = await collect(parseNdjson(stream));
  assert.equal(results.length, 1);
  const item = results[0] as { vi: string; ru: string; emoji: string };
  assert.equal(item.vi, 'Xin chào Việt Nam');
  assert.equal(item.ru, 'Привет мир');
  assert.equal(item.emoji, '🚀🔥✨');
  assert.ok(!JSON.stringify(item).includes('\uFFFD'), 'must not contain replacement characters');
});

test('ndjson: skips empty and whitespace-only lines', async () => {
  const stream = createAsyncIterable([
    encoder.encode('\n   \n\t\r\n{"ok":true}\n\n   \t  \r\n{"next":1}\n\n'),
  ]);
  const results = await collect(parseNdjson(stream));
  assert.deepEqual(results, [{ ok: true }, { next: 1 }]);
});

test('ndjson: parses final line with valid JSON without trailing LF', async () => {
  const stream = createAsyncIterable([encoder.encode('{"a":1}\n{"final":true}')]);
  const results = await collect(parseNdjson(stream));
  assert.deepEqual(results, [{ a: 1 }, { final: true }]);
});

test('ndjson: supports single UTF-8 BOM at stream start and does not strip subsequent BOMs', async () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const line1 = encoder.encode('{"first":1}\n');
  const combined = new Uint8Array(bom.length + line1.length);
  combined.set(bom, 0);
  combined.set(line1, bom.length);

  const stream = createAsyncIterable([combined]);
  const results = await collect(parseNdjson(stream));
  assert.deepEqual(results, [{ first: 1 }]);

  // BOM in middle of stream (e.g. at line 2) is not stripped and causes syntax error
  const line2WithBom = new Uint8Array(bom.length + line1.length);
  line2WithBom.set(bom, 0);
  line2WithBom.set(line1, bom.length);
  const stream2 = createAsyncIterable([line1, line2WithBom]);
  await assert.rejects(
    async () => {
      await collect(parseNdjson(stream2));
    },
    (err: unknown) => {
      assert.ok(err instanceof NdjsonParseError);
      assert.equal((err as Error).message, 'Invalid NDJSON stream');
      return true;
    },
  );
});

test('ndjson: yields objects, arrays, null, strings, numbers, booleans as unknown', async () => {
  const stream = createAsyncIterable([
    encoder.encode('{"type":"object"}\n[1,2,3]\nnull\n"text"\n123\ntrue\nfalse\n'),
  ]);
  const results = await collect(parseNdjson(stream));
  assert.deepEqual(results, [{ type: 'object' }, [1, 2, 3], null, 'text', 123, true, false]);
});

test('ndjson: rejects malformed JSON with NdjsonParseError', async () => {
  const stream = createAsyncIterable([encoder.encode('{"bad":\n')]);
  await assert.rejects(
    async () => {
      await collect(parseNdjson(stream));
    },
    (err: unknown) => {
      assert.ok(err instanceof NdjsonParseError);
      assert.equal((err as Error).message, 'Invalid NDJSON stream');
      return true;
    },
  );
});

test('ndjson: rejects truncated JSON at EOF without LF with NdjsonParseError', async () => {
  const stream = createAsyncIterable([encoder.encode('{"a":1}\n{"truncated":')]);
  await assert.rejects(
    async () => {
      await collect(parseNdjson(stream));
    },
    (err: unknown) => {
      assert.ok(err instanceof NdjsonParseError);
      return true;
    },
  );
});

test('ndjson: rejects invalid UTF-8 bytes with NdjsonParseError', async () => {
  const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xff, 0x7d, 0x0a]);
  const stream = createAsyncIterable([invalidUtf8]);
  await assert.rejects(
    async () => {
      await collect(parseNdjson(stream));
    },
    (err: unknown) => {
      assert.ok(err instanceof NdjsonParseError);
      return true;
    },
  );
});

test('ndjson: rejects dangling multibyte sequence at EOF with NdjsonParseError', async () => {
  // 0xc3 is the start of a 2-byte sequence (e.g. é = c3 a9), missing second byte
  const dangling = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3]);
  const stream = createAsyncIterable([dangling]);
  await assert.rejects(
    async () => {
      await collect(parseNdjson(stream));
    },
    (err: unknown) => {
      assert.ok(err instanceof NdjsonParseError);
      return true;
    },
  );
});

test('ndjson: allows a line of exactly 1,048,576 bytes before LF', async () => {
  const prefix = '{"pad":"';
  const suffix = '"}';
  const padLength = 1048576 - prefix.length - suffix.length; // total before LF is exactly 1,048,576
  const bigLine = prefix + 'a'.repeat(padLength) + suffix + '\n';
  assert.equal(encoder.encode(bigLine).length - 1, 1048576);

  const stream = createAsyncIterable([encoder.encode(bigLine)]);
  const results = await collect(parseNdjson(stream));
  assert.equal(results.length, 1);
  assert.equal((results[0] as { pad: string }).pad.length, padLength);
});

test('ndjson: rejects a line exceeding 1,048,576 bytes before LF, aborting immediately', async () => {
  const prefix = '{"pad":"';
  const padLength = 1048576 - prefix.length + 1; // 1 byte over limit before LF
  const stream = createAsyncIterable([
    encoder.encode(prefix),
    encoder.encode('a'.repeat(padLength)),
  ]);

  await assert.rejects(
    async () => {
      await collect(parseNdjson(stream));
    },
    (err: unknown) => {
      assert.ok(err instanceof NdjsonParseError);
      assert.equal((err as Error).message, 'Invalid NDJSON stream');
      return true;
    },
  );
});

test('ndjson: does not reject a large chunk (> 1MB) containing multiple small lines', async () => {
  const line = '{"k":1}\n';
  const repetitions = Math.ceil(1100000 / line.length);
  const bigChunk = encoder.encode(line.repeat(repetitions));
  assert.ok(bigChunk.length > 1048576);

  const stream = createAsyncIterable([bigChunk]);
  const results = await collect(parseNdjson(stream));
  assert.equal(results.length, repetitions);
});

test('ndjson: propagates input iterator error without wrapping in NdjsonParseError', async () => {
  const networkError = new Error('Socket reset by peer');
  async function* failingStream(): AsyncIterable<Uint8Array> {
    yield encoder.encode('{"ok":1}\n');
    throw networkError;
  }

  await assert.rejects(
    async () => {
      await collect(parseNdjson(failingStream()));
    },
    (err: unknown) => {
      assert.equal(err, networkError);
      assert.ok(!(err instanceof NdjsonParseError));
      return true;
    },
  );
});

test('ndjson: releases input iterator via return() when consumer terminates early and ignores garbage', async () => {
  let returned = false;
  let yieldedAfterFirst = false;

  const source: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index === 0) {
            index++;
            return { done: false, value: encoder.encode('{"first":1}\n') };
          }
          yieldedAfterFirst = true;
          return { done: false, value: encoder.encode('NOT_JSON_GARBAGE\n') };
        },
        async return() {
          returned = true;
          return { done: true, value: undefined };
        },
      };
    },
  };

  for await (const item of parseNdjson(source)) {
    assert.deepEqual(item, { first: 1 });
    break; // consumer early exit
  }

  assert.ok(returned, 'source.return() must be called');
  assert.equal(yieldedAfterFirst, false, 'no further chunks should be read after consumer exit');
});
