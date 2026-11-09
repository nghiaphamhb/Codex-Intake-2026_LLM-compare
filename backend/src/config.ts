export interface AppConfig {
  port: number;
  llmBaseUrl: string;
  llmApiKey: string;
  llmTimeoutMs: number;
}

export function readConfig(env: NodeJS.ProcessEnv): AppConfig {
  let port = 3000;
  if (env.PORT !== undefined) {
    const rawPort = env.PORT.trim();
    if (rawPort === '' || !/^\d+$/.test(rawPort)) {
      throw new Error('Invalid configuration: PORT');
    }
    const parsedPort = Number(rawPort);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new Error('Invalid configuration: PORT');
    }
    port = parsedPort;
  }

  if (env.LLM_BASE_URL === undefined) {
    throw new Error('Invalid configuration: LLM_BASE_URL');
  }
  const rawBaseUrl = env.LLM_BASE_URL.trim();
  if (rawBaseUrl === '') {
    throw new Error('Invalid configuration: LLM_BASE_URL');
  }
  let urlObj: URL;
  try {
    urlObj = new URL(rawBaseUrl);
  } catch {
    throw new Error('Invalid configuration: LLM_BASE_URL');
  }
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw new Error('Invalid configuration: LLM_BASE_URL');
  }
  if (urlObj.username !== '' || urlObj.password !== '' || urlObj.search !== '' || urlObj.hash !== '') {
    throw new Error('Invalid configuration: LLM_BASE_URL');
  }
  const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, '');
  try {
    const recheck = new URL(normalizedBaseUrl);
    if (recheck.protocol !== 'http:' && recheck.protocol !== 'https:') {
      throw new Error('Invalid configuration: LLM_BASE_URL');
    }
  } catch {
    throw new Error('Invalid configuration: LLM_BASE_URL');
  }

  if (env.LLM_API_KEY === undefined) {
    throw new Error('Invalid configuration: LLM_API_KEY');
  }
  const apiKey = env.LLM_API_KEY.trim();
  if (apiKey === '') {
    throw new Error('Invalid configuration: LLM_API_KEY');
  }

  let timeoutMs = 60000;
  if (env.LLM_TIMEOUT_MS !== undefined) {
    const rawTimeout = env.LLM_TIMEOUT_MS.trim();
    if (rawTimeout === '' || !/^\d+$/.test(rawTimeout)) {
      throw new Error('Invalid configuration: LLM_TIMEOUT_MS');
    }
    const parsedTimeout = Number(rawTimeout);
    if (!Number.isInteger(parsedTimeout) || parsedTimeout < 1 || parsedTimeout > 2147483647) {
      throw new Error('Invalid configuration: LLM_TIMEOUT_MS');
    }
    timeoutMs = parsedTimeout;
  }

  return {
    port,
    llmBaseUrl: normalizedBaseUrl,
    llmApiKey: apiKey,
    llmTimeoutMs: timeoutMs
  };
}

