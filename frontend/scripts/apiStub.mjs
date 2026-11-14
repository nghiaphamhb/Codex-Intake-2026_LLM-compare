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
              durationMs: 1200,
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
