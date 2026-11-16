import http from 'node:http';

export const defaultStubCatalog = [
  { id: 'claude-demo', name: 'Claude Haiku 5.5', provider: 'Anthropic' },
  { id: 'giga-demo', name: 'GigaChat 2', provider: 'Сбер' },
  { id: 'yandex-demo', name: 'YandexGPT 5 Lite', provider: 'Яндекс' },
  { id: 'demo-alpha', name: 'Демо Альфа', provider: 'Демо' },
  { id: 'demo-beta', name: 'Демо Бета', provider: 'Демо' },
];

export function getDeterministicMarkdown(modelId, prompt) {
  const model = defaultStubCatalog.find((m) => m.id === modelId);
  const name = model ? model.name : modelId;
  return `### Ответ ${name}

Ответ на вопрос: **${prompt}**

| Характеристика | Значение |
|---|---|
| Модель | ${name} |
| Статус | Готово |

\`\`\`json
{
  "model": "${modelId}",
  "ok": true
}
\`\`\`

Демонстрационный ответ модели ${name}.`;
}

export function createApiStub() {
  let catalog = [...defaultStubCatalog];
  let catalogFault = null;
  const faults = new Map();
  let holdGenerate = false;
  let heldRequests = [];

  const counters = {
    totalRequests: 0,
    catalogRequests: 0,
    activeRequests: 0,
    byModel: {},
    byPrompt: {},
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    counters.totalRequests++;

    if (req.method === 'GET' && url.pathname === '/api/models') {
      counters.catalogRequests++;
      if (catalogFault) {
        res.writeHead(catalogFault.status || 500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(
          JSON.stringify(
            catalogFault.body || {
              error: { code: 'UPSTREAM_ERROR', message: 'Catalog error' },
            },
          ),
        );
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ models: catalog }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/stream') {
      let bodyStr = '';
      let isAborted = false;

      req.on('aborted', () => {
        isAborted = true;
      });

      req.on('data', (chunk) => {
        bodyStr += chunk;
      });

      req.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(bodyStr);
        } catch {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              error: { code: 'INVALID_REQUEST', message: 'Некорректный JSON' },
            }),
          );
          return;
        }

        const { modelId, prompt } = parsed;
        counters.activeRequests++;
        counters.streamRequests = (counters.streamRequests || 0) + 1;
        counters.byModel[modelId] = (counters.byModel[modelId] || 0) + 1;
        counters.byPrompt[prompt] = (counters.byPrompt[prompt] || 0) + 1;

        let activeDecremented = false;
        const decrementActive = () => {
          if (!activeDecremented) {
            activeDecremented = true;
            counters.activeRequests = Math.max(0, counters.activeRequests - 1);
          }
        };

        res.on('close', () => {
          if (!res.writableFinished) {
            counters.abortedRequests = (counters.abortedRequests || 0) + 1;
          }
          decrementActive();
        });

        let partialSent = false;

        const processRequest = () => {
          if (isAborted || res.destroyed) {
            decrementActive();
            return;
          }

          if (partialSent) {
            const costUsd =
              modelId === 'claude-demo'
                ? 0.0016
                : modelId === 'giga-demo'
                  ? 0
                  : modelId === 'demo-alpha'
                    ? 0.00001
                    : null;
            res.write(
              JSON.stringify({
                type: 'done',
                durationMs: 1800,
                costUsd,
              }) + '\n',
            );
            res.end();
            decrementActive();
            return;
          }

          if (faults.has(modelId)) {
            const fault = faults.get(modelId);
            if (fault.inband) {
              res.writeHead(200, {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
              });
              res.write(JSON.stringify({ type: 'start', modelId }) + '\n');
              if (fault.partialText) {
                res.write(JSON.stringify({ type: 'text-delta', delta: fault.partialText }) + '\n');
              }
              res.write(
                JSON.stringify({
                  type: 'error',
                  error: fault.body?.error || {
                    code: 'UPSTREAM_ERROR',
                    message: 'Fault injected',
                  },
                }) + '\n',
              );
              res.end();
              decrementActive();
              return;
            }

            res.writeHead(fault.status || 500, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(
              JSON.stringify(
                fault.body || {
                  error: { code: 'UPSTREAM_ERROR', message: 'Fault injected' },
                },
              ),
            );
            decrementActive();
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          });

          res.write(JSON.stringify({ type: 'start', modelId }) + '\n');

          const fullMarkdown = getDeterministicMarkdown(modelId, prompt);
          if (modelId === 'claude-demo') {
            res.write(
              JSON.stringify({
                type: 'reasoning-delta',
                delta: 'Анализируем вопрос и формируем ответ...\n',
              }) + '\n',
            );
          }

          const mid = Math.floor(fullMarkdown.length / 2);
          const chunk1 = fullMarkdown.slice(0, mid);
          const chunk2 = fullMarkdown.slice(mid);

          res.write(JSON.stringify({ type: 'text-delta', delta: chunk1 }) + '\n');
          res.write(JSON.stringify({ type: 'text-delta', delta: chunk2 }) + '\n');

          const costUsd =
            modelId === 'claude-demo'
              ? 0.0016
              : modelId === 'giga-demo'
                ? 0
                : modelId === 'demo-alpha'
                  ? 0.00001
                  : null;

          res.write(
            JSON.stringify({
              type: 'done',
              durationMs: 1800,
              costUsd,
            }) + '\n',
          );
          res.end();
          decrementActive();
        };

        if (holdGenerate) {
          heldRequests.push({
            modelId,
            processRequest,
            sendPartial: () => {
              if (res.destroyed || res.writableEnded || partialSent) return;
              partialSent = true;
              res.writeHead(200, {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
              });
              res.write(JSON.stringify({ type: 'start', modelId }) + '\n');
              res.write(
                JSON.stringify({
                  type: 'reasoning-delta',
                  delta: 'Промежуточные рассуждения модели...\n',
                }) + '\n',
              );
              res.write(
                JSON.stringify({
                  type: 'text-delta',
                  delta: `### Частичный ответ модели ${modelId}\n\nТекст в процессе генерации...`,
                }) + '\n',
              );
            },
            sendDone: () => {
              if (res.destroyed || res.writableEnded) {
                decrementActive();
                return;
              }
              const costUsd =
                modelId === 'claude-demo'
                  ? 0.0016
                  : modelId === 'giga-demo'
                    ? 0
                    : modelId === 'demo-alpha'
                      ? 0.00001
                      : null;
              res.write(
                JSON.stringify({
                  type: 'done',
                  durationMs: 1800,
                  costUsd,
                }) + '\n',
              );
              res.end();
              decrementActive();
            },
          });
        } else {
          processRequest();
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      let bodyStr = '';
      let isAborted = false;

      req.on('aborted', () => {
        isAborted = true;
      });

      req.on('data', (chunk) => {
        bodyStr += chunk;
      });

      req.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(bodyStr);
        } catch {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              error: { code: 'INVALID_REQUEST', message: 'Некорректный JSON' },
            }),
          );
          return;
        }

        const { modelId, prompt } = parsed;
        counters.activeRequests++;
        counters.byModel[modelId] = (counters.byModel[modelId] || 0) + 1;
        counters.byPrompt[prompt] = (counters.byPrompt[prompt] || 0) + 1;

        const processRequest = () => {
          counters.activeRequests = Math.max(0, counters.activeRequests - 1);
          if (isAborted || res.destroyed) {
            return;
          }

          if (faults.has(modelId)) {
            const fault = faults.get(modelId);
            res.writeHead(fault.status || 500, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(
              JSON.stringify(
                fault.body || {
                  error: { code: 'UPSTREAM_ERROR', message: 'Fault injected' },
                },
              ),
            );
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              modelId,
              text: getDeterministicMarkdown(modelId, prompt),
              durationMs: 1800,
              costUsd:
                modelId === 'claude-demo'
                  ? 0.0016
                  : modelId === 'giga-demo'
                    ? 0
                    : modelId === 'demo-alpha'
                      ? 0.00001
                      : null,
            }),
          );
        };

        if (holdGenerate) {
          heldRequests.push({ modelId, processRequest });
        } else {
          processRequest();
        }
      });
      return;
    }

    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        error: { code: 'NOT_FOUND', message: 'Маршрут не найден' },
      }),
    );
  });

  return {
    server,
    counters,
    setCatalog(newCatalog) {
      catalog = [...newCatalog];
    },
    resetCatalog() {
      catalog = [...defaultStubCatalog];
      catalogFault = null;
    },
    setCatalogFault(fault) {
      catalogFault = fault;
    },
    clearCatalogFault() {
      catalogFault = null;
    },
    setGenerateFault(modelId, fault) {
      faults.set(modelId, fault);
    },
    clearFault(modelId) {
      faults.delete(modelId);
    },
    clearAllFaults() {
      faults.clear();
    },
    setHoldGenerate(hold) {
      holdGenerate = hold;
      if (!hold) {
        const toRelease = [...heldRequests];
        heldRequests = [];
        toRelease.forEach(({ processRequest }) => processRequest());
      }
    },
    releaseGenerate(modelId) {
      const toRelease = heldRequests.filter(
        (item) => modelId === undefined || item.modelId === modelId,
      );
      heldRequests = heldRequests.filter(
        (item) => modelId !== undefined && item.modelId !== modelId,
      );
      toRelease.forEach(({ processRequest }) => processRequest());
    },
    sendPartialGenerate(modelId) {
      heldRequests
        .filter((item) => modelId === undefined || item.modelId === modelId)
        .forEach((item) => item.sendPartial?.());
    },
    sendDoneGenerate(modelId) {
      const toRelease = heldRequests.filter(
        (item) => modelId === undefined || item.modelId === modelId,
      );
      heldRequests = heldRequests.filter(
        (item) => modelId !== undefined && item.modelId !== modelId,
      );
      toRelease.forEach((item) => (item.sendDone ? item.sendDone() : item.processRequest()));
    },
    async waitForActive(count, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (counters.activeRequests !== count) {
        if (Date.now() >= deadline) {
          throw new Error(`Expected ${count} active requests, got ${counters.activeRequests}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async start() {
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          resolve({
            port,
            url: `http://127.0.0.1:${port}`,
          });
        });
      });
    },
    async close() {
      return new Promise((resolve) => {
        heldRequests = [];
        server.close(resolve);
        server.closeAllConnections();
      });
    },
  };
}
