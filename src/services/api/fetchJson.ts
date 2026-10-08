export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface FetchJsonOptions extends Omit<globalThis.RequestInit, 'signal'> {
  signal?: globalThis.AbortSignal;
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs, signal, ...requestInit } = options;
  const controller = new AbortController();
  const timer =
    typeof timeoutMs === 'number' && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const onAbort = () => controller.abort();
  // An already-aborted signal never fires 'abort', so forward its state up front.
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(url, {
      ...requestInit,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiRequestError(
        `Request failed with status ${response.status}`,
        response.status,
        url
      );
    }

    return (await response.json()) as T;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    signal?.removeEventListener('abort', onAbort);
  }
}
