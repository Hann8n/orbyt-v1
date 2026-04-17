/**
 * Shared low-level concerns for all chat.bsky.convo calls:
 *  - atproto-proxy header for bsky_chat
 *  - 429 retry with Retry-After honoring
 *  - global rate-limit gate so polling and user actions cannot thunder past a 429
 */

import { retry } from '@atproto/common-web';
import { XRPCError, ResponseType } from '@atproto/xrpc';

const CHAT_SERVICE_DID = 'did:web:api.bsky.chat';

const RATE_LIMIT_DEFAULT_BACKOFF_MS = 5000;
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_MAX_BACKOFF_MS = 60_000;

export const chatOpts = () => ({
  headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` as const },
});

export function parseRetryAfterMs(headers?: Record<string, string | undefined>): number {
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (raw == null) return RATE_LIMIT_DEFAULT_BACKOFF_MS;
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && n > 0) return Math.min(n * 1000, RATE_LIMIT_MAX_BACKOFF_MS);
  return RATE_LIMIT_DEFAULT_BACKOFF_MS;
}

// Global gate: when a 429 fires, all new chat calls await this promise before
// running. This prevents the per-thread poller and the list poller from
// stampeding the server once it's told us to back off.
let rateLimitGate: Promise<void> = Promise.resolve();

function openGateAfter(ms: number) {
  rateLimitGate = new Promise(resolve => setTimeout(resolve, ms));
}

export function getRateLimitGate(): Promise<void> {
  return rateLimitGate;
}

export async function withRetry429<T>(fn: () => Promise<T>): Promise<T> {
  await rateLimitGate;
  let last429Headers: Record<string, string | undefined> | undefined;
  return retry(fn, {
    maxRetries: RATE_LIMIT_MAX_RETRIES,
    retryable: e => {
      if (e instanceof XRPCError && e.status === ResponseType.RateLimitExceeded) {
        last429Headers = e.headers;
        const waitMs = parseRetryAfterMs(last429Headers);
        openGateAfter(waitMs);
        return true;
      }
      return false;
    },
    getWaitMs: () =>
      last429Headers ? parseRetryAfterMs(last429Headers) : RATE_LIMIT_DEFAULT_BACKOFF_MS,
  });
}
