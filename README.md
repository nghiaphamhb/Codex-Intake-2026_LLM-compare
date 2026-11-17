# LLM Compare

Compare responses from 2–4 LLMs side by side, with parallel requests, Markdown rendering and independent error handling.

Built with React, TypeScript, Vite and Fastify. Supports desktop and mobile layouts.

## Run locally

Requires **Node.js 24.x**, npm and a valid CodeX AI Proxy key.

Install dependencies from the repository root:

```sh
npm ci
npm ci --prefix backend
npm ci --prefix frontend
```

Copy `.env.example` to `.env` at the repository root and configure:

```dotenv
PORT=3000
LLM_BASE_URL=https://llm.codex.so
LLM_API_KEY=your-api-key
LLM_TIMEOUT_MS=60000
```

The API key stays on the backend. Do not commit `.env`.

Start the backend:

```sh
npm run dev --prefix backend
```

In another terminal, start the frontend:

```sh
npm run dev --prefix frontend
```

Open **http://127.0.0.1:5173/**.

The backend loads the model catalog before accepting requests. Sending questions uses your API allowance.

## Extended requirements implemented

- **Streaming:** responses from selected models stream independently; users can stop one or all.
- **Metrics:** shows response time and estimated USD cost when available.
- **Reasoning:** shows streamed reasoning when provided; unavailable reasoning isn’t simulated.
- **Input form:** supports auto-resize, validation, Enter to send and Shift+Enter for newlines.
- **Markdown:** renders headings, lists, tables, syntax-highlighted code and LaTeX math expressions, including during streaming.
