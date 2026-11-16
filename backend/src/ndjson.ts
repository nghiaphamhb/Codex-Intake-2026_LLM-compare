export class NdjsonParseError extends Error {
  constructor() {
    super('Invalid NDJSON stream');
    this.name = 'NdjsonParseError';
  }
}

const MAX_LINE_BYTES = 1_048_576;
const LF = 0x0a;
const CR = 0x0d;

function concatParts(parts: Uint8Array[], totalLength: number): Uint8Array {
  if (parts.length === 1) {
    return parts[0];
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export async function* parseNdjson(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<unknown> {
  const iterator = chunks[Symbol.asyncIterator]();
  let currentLineParts: Uint8Array[] = [];
  let currentLineLength = 0;
  let isStreamStart = true;

  function processLineBytes(bytes: Uint8Array): { shouldYield: boolean; value?: unknown } {
    if (isStreamStart) {
      isStreamStart = false;
      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        bytes = bytes.subarray(3);
      }
    }

    if (bytes.length > 0 && bytes[bytes.length - 1] === CR) {
      bytes = bytes.subarray(0, bytes.length - 1);
    }

    let text: string;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      text = decoder.decode(bytes);
    } catch {
      throw new NdjsonParseError();
    }

    if (text.trim().length === 0) {
      return { shouldYield: false };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new NdjsonParseError();
    }

    return { shouldYield: true, value: parsed };
  }

  try {
    while (true) {
      const { done, value } = await iterator.next();
      if (done) {
        break;
      }

      const chunk = value;
      let start = 0;
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === LF) {
          const slice = chunk.subarray(start, i);
          const lineLength = currentLineLength + slice.byteLength;
          if (lineLength > MAX_LINE_BYTES) {
            throw new NdjsonParseError();
          }

          let lineBytes: Uint8Array;
          if (currentLineParts.length === 0) {
            lineBytes = slice;
          } else {
            currentLineParts.push(slice);
            lineBytes = concatParts(currentLineParts, lineLength);
          }

          currentLineParts = [];
          currentLineLength = 0;
          start = i + 1;

          const outcome = processLineBytes(lineBytes);
          if (outcome.shouldYield) {
            yield outcome.value;
          }
        }
      }

      if (start < chunk.length) {
        const remaining = chunk.subarray(start);
        currentLineLength += remaining.byteLength;
        if (currentLineLength > MAX_LINE_BYTES) {
          throw new NdjsonParseError();
        }
        currentLineParts.push(remaining);
      }
    }

    if (currentLineLength > 0) {
      const finalBytes = concatParts(currentLineParts, currentLineLength);
      currentLineParts = [];
      currentLineLength = 0;
      const outcome = processLineBytes(finalBytes);
      if (outcome.shouldYield) {
        yield outcome.value;
      }
    }
  } finally {
    await iterator.return?.();
  }
}
