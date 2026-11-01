import OpenAI from 'openai';

// Otari speaks the OpenAI API but authenticates with an `Otari-Key` header, not a bearer token.
// The SDK always adds `Authorization: Bearer <apiKey>` and won't start without an apiKey, so it gets a
// placeholder and `Authorization: null` in the default headers removes that header again (default
// headers merge after the SDK's auth headers). The fetch guard makes sure no request leaves with an
// Authorization header or without the Otari-Key one.
export const guardedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (headers.has('authorization')) throw new Error('Refusing to send an Authorization header to Otari.');
  if (!headers.has('otari-key')) throw new Error('Refusing to call Otari without the Otari-Key header.');
  return fetch(input, init);
};

export interface OtariClientOptions {
  baseUrl: string;
  apiKey: string;
  // Paid calls are never retried automatically; each attempt costs money
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export function createOtariClient({ baseUrl, apiKey, timeoutMs = 30_000, fetch: fetchImpl = guardedFetch }: OtariClientOptions): OpenAI {
  return new OpenAI({
    baseURL: baseUrl,
    apiKey: 'unused-otari-authenticates-with-the-Otari-Key-header',
    defaultHeaders: { Authorization: null, 'Otari-Key': apiKey },
    fetch: fetchImpl,
    maxRetries: 0,
    timeout: timeoutMs,
  });
}
