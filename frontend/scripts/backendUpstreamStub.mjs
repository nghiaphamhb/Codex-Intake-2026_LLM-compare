import assert from 'node:assert/strict';
import { createServer } from 'node:http';

export const ids = ['openai/be009-a', 'anthropic/be009-b', 'google/be009-c', 'deepseek/be009-d'];
export const fakeKey = 'be009-fake-key';
export const sentinel = 'BE009_RAW_SECRET_SENTINEL';

export async function createBackendUpstreamStub() {
  const attempts = [];
  const failures = [];
  let scenario = 'hold';
  let catalogCalls = 0;
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.headers['x-api-key'], fakeKey);
      if (req.method === 'GET' && req.url === '/models') {
        catalogCalls++;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            models: ids.map((id, i) => ({
              id,
              name: `BE009 ${'ABCD'[i]}`,
              ...(i === 0
                ? { pricing: { input: 1, output: 2 } }
                : i === 2
                  ? { pricing: { input: 0, output: 0 } }
                  : {}),
            })),
          }),
        );
        return;
      }
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/stream');
      assert.match(req.headers.accept, /application\/x-ndjson/);
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      assert.deepEqual(Object.keys(payload).sort(), ['model', 'prompt']);
      assert.ok(ids.includes(payload.model));
      const prior = attempts.filter(
        (a) => a.model === payload.model && a.prompt === payload.prompt,
      ).length;
      const item = {
        ...payload,
        res,
        finished: false,
        disconnected: false,
        mode: scenario,
        ordinal: prior + 1,
      };
      attempts.push(item);
      res.on('close', () => {
        if (!item.finished) item.disconnected = true;
      });
      if (scenario === 'http' && payload.model === ids[1] && prior === 0) {
        item.finished = true;
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: sentinel }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.flushHeaders();
      if (payload.model === ids[0])
        emit(item, { type: 'reasoning-delta', delta: 'Suy luận fixture BE009' });
      emit(item, { type: 'text-delta', delta: `Xin chào — ${payload.model} 🧪\n\n` });
      if (scenario === 'eof' && payload.model === ids[1]) {
        item.finished = true;
        res.end();
      }
      if (scenario === 'timeout' && payload.model !== ids[1]) finish(item);
    } catch (error) {
      failures.push(error);
      res.writeHead(500);
      res.end();
    }
  });
  function emit(item, event) {
    if (!item.res.destroyed) item.res.write(JSON.stringify(event) + '\n');
  }
  function finish(item) {
    if (item.finished || item.disconnected) return;
    item.finished = true;
    emit(item, {
      type: 'text-delta',
      delta:
        '## Hoàn tất\n\n- Một\n- Hai\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst ok = true;\n```\n',
    });
    emit(item, { type: 'finish', usage: { inputTokens: 10, outputTokens: 20 } });
    item.res.end();
  }
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    attempts,
    failures,
    get catalogCalls() {
      return catalogCalls;
    },
    setScenario(value) {
      scenario = value;
    },
    finish,
    active() {
      return attempts.filter((a) => !a.finished && !a.disconnected);
    },
    async close() {
      for (const item of attempts) item.res.destroy();
      await new Promise((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
