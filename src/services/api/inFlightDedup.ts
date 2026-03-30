/**
 * Deduplicate identical in-flight XRPC-style requests within a short TTL.
 * Leaf module: no imports from AtprotoService or namespace services (avoids cycles).
 */

const requestCache = new Map<string, { promise: Promise<unknown>; timestamp: number }>();
const REQUEST_CACHE_TTL_MS = 2000;

export async function deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
  const now = Date.now();

  const cached = requestCache.get(key);
  if (cached && now - cached.timestamp < REQUEST_CACHE_TTL_MS) {
    return cached.promise as Promise<T>;
  }

  const promise = requestFn();
  requestCache.set(key, { promise, timestamp: now });

  for (const [k, v] of requestCache.entries()) {
    if (now - v.timestamp > REQUEST_CACHE_TTL_MS) {
      requestCache.delete(k);
    }
  }

  return promise;
}
