import { describe, it, expect } from 'vitest';
import { parseStreamNdjson, StreamNdjsonError } from './streamNdjson.js';

const encoder = new TextEncoder();

function chunks(...parts: string[]): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < parts.length) return { value: encoder.encode(parts[i++]), done: false };
          return { value: undefined, done: true };
        },
      };
    },
  };
}

function rawChunks(...parts: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < parts.length) return { value: parts[i++], done: false };
          return { value: undefined, done: true };
        },
      };
    },
  };
}

async function collect(iter: AsyncIterable<unknown>): Promise<unknown[]> {
  const results: unknown[] = [];
  for await (const item of iter) {
    results.push(item);
  }
  return results;
}

describe('StreamNdjsonError', () => {
  it('has fixed message and extends Error', () => {
    const err = new StreamNdjsonError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Invalid NDJSON stream');
    expect(err.name).toBe('StreamNdjsonError');
  });
});

describe('parseStreamNdjson', () => {
  it('ignores whitespace-only lines, including the last line without LF', async () => {
    expect(await collect(parseStreamNdjson(chunks(' \t\r\n{"a":1}\n \t')))).toEqual([{ a: 1 }]);
  });

  it('rejects a BOM on a later final line without LF', async () => {
    await expect(collect(parseStreamNdjson(chunks('{"a":1}\n\uFEFF{"b":2}')))).rejects.toThrow(
      StreamNdjsonError,
    );
  });

  it('counts the initial BOM in the byte limit before LF', async () => {
    const line = '\uFEFF' + JSON.stringify({ v: 'x'.repeat(1_048_568) }) + '\n';
    await expect(collect(parseStreamNdjson(chunks(line)))).rejects.toThrow(StreamNdjsonError);
  });
  it('parses single JSON object per line', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"type":"start","modelId":"test"}\n')));
    expect(result).toEqual([{ type: 'start', modelId: 'test' }]);
  });

  it('parses multiple lines in a single chunk', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"a":1}\n{"b":2}\n{"c":3}\n')));
    expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('parses lines split across multiple chunks', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"ty', 'pe":"s', 'tart"}\n')));
    expect(result).toEqual([{ type: 'start' }]);
  });

  it('handles CRLF line endings', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"a":1}\r\n{"b":2}\r\n')));
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips blank lines', async () => {
    const result = await collect(parseStreamNdjson(chunks('\n{"a":1}\n\n{"b":2}\n\n')));
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('handles UTF-8 BOM at stream start only', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const text = encoder.encode('{"a":1}\n');
    const combined = new Uint8Array(bom.length + text.length);
    combined.set(bom);
    combined.set(text, bom.length);
    const result = await collect(parseStreamNdjson(rawChunks(combined)));
    expect(result).toEqual([{ a: 1 }]);
  });

  it('rejects BOM mid-stream', async () => {
    const first = encoder.encode('{"a":1}\n');
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const second = encoder.encode('{"b":2}\n');
    const midBom = new Uint8Array(bom.length + second.length);
    midBom.set(bom);
    midBom.set(second, bom.length);

    await expect(collect(parseStreamNdjson(rawChunks(first, midBom)))).rejects.toThrow(
      StreamNdjsonError,
    );
  });

  it('parses final line without trailing LF at EOF', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"a":1}')));
    expect(result).toEqual([{ a: 1 }]);
  });

  it('handles Russian text correctly', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"text":"Привет мир"}\n')));
    expect(result).toEqual([{ text: 'Привет мир' }]);
  });

  it('handles Vietnamese text correctly', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"text":"Xin chào thế giới"}\n')));
    expect(result).toEqual([{ text: 'Xin chào thế giới' }]);
  });

  it('handles emoji split across chunk boundaries', async () => {
    // 🚀 is U+1F680, encoded as 4 bytes: F0 9F 9A 80
    const bytes = encoder.encode('{"e":"🚀"}\n');
    // Split right in the middle of the emoji
    const part1 = bytes.slice(0, 7); // {"e":"  + first 2 bytes of emoji
    const part2 = bytes.slice(7); // last 2 bytes of emoji + "}\n
    const result = await collect(parseStreamNdjson(rawChunks(part1, part2)));
    expect(result).toEqual([{ e: '🚀' }]);
  });

  it('handles JSON escape sequences split across chunks', async () => {
    // \\n in JSON is an escape sequence for newline
    const result = await collect(parseStreamNdjson(chunks('{"t":"line1\\', 'nline2"}\n')));
    expect(result).toEqual([{ t: 'line1\nline2' }]);
  });

  it('rejects invalid UTF-8 with StreamNdjsonError', async () => {
    const invalid = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xff, 0x7d, 0x0a]);
    await expect(collect(parseStreamNdjson(rawChunks(invalid)))).rejects.toThrow(StreamNdjsonError);
  });

  it('rejects invalid JSON with StreamNdjsonError', async () => {
    await expect(collect(parseStreamNdjson(chunks('{not valid json}\n')))).rejects.toThrow(
      StreamNdjsonError,
    );
  });

  it('rejects line exceeding 1,048,576 byte limit', async () => {
    // Create a line just over the limit
    const bigValue = 'x'.repeat(1_048_570);
    const line = `{"v":"${bigValue}"}\n`;
    // This line is > 1,048,576 bytes before LF
    await expect(collect(parseStreamNdjson(chunks(line)))).rejects.toThrow(StreamNdjsonError);
  });

  it('allows line exactly at 1,048,576 byte limit', async () => {
    // Create a line that is exactly at the limit
    // {"v":"..."} is 8 + content bytes. We need content = 1048576 - 8 = 1048568
    const bigValue = 'x'.repeat(1_048_568);
    const line = `{"v":"${bigValue}"}`;
    const lineBytes = encoder.encode(line);
    expect(lineBytes.length).toBe(1_048_576);
    const result = await collect(parseStreamNdjson(chunks(line + '\n')));
    expect(result).toHaveLength(1);
    expect((result[0] as { v: string }).v).toBe(bigValue);
  });

  it('large chunk with many small lines does not fail', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `{"i":${i}}`).join('\n') + '\n';
    const result = await collect(parseStreamNdjson(chunks(lines)));
    expect(result).toHaveLength(100);
    expect(result[0]).toEqual({ i: 0 });
    expect(result[99]).toEqual({ i: 99 });
  });

  it('consumer can return early without reading garbage after', async () => {
    let chunkIndex = 0;
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            chunkIndex++;
            if (chunkIndex === 1) return { value: encoder.encode('{"a":1}\n'), done: false };
            if (chunkIndex === 2) return { value: encoder.encode('GARBAGE\n'), done: false };
            return { value: undefined, done: true };
          },
          async return() {
            return { value: undefined, done: true };
          },
        };
      },
    };

    const gen = parseStreamNdjson(source);
    const first = await gen.next();
    expect(first.value).toEqual({ a: 1 });
    // Consumer returns early - should not process GARBAGE
    await gen.return(undefined);
  });

  it('propagates input iterator errors without wrapping', async () => {
    const networkError = new TypeError('network failure');
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw networkError;
          },
        };
      },
    };

    await expect(collect(parseStreamNdjson(source))).rejects.toBe(networkError);
  });

  it('handles mixed LF and CRLF in same stream', async () => {
    const result = await collect(parseStreamNdjson(chunks('{"a":1}\n{"b":2}\r\n{"c":3}\n')));
    expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});
