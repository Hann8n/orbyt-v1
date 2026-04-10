import { fetchJson } from '@/services/api/fetchJson';

export const ORBYT_PUBLIC_JSON_TIMEOUT_MS = 10_000;

type FetchJsonOptions = NonNullable<Parameters<typeof fetchJson>[1]>;

export async function fetchOrbytPublicJson<T>(url: string, options?: FetchJsonOptions): Promise<T> {
  return fetchJson<T>(url, {
    ...options,
    timeoutMs: options?.timeoutMs ?? ORBYT_PUBLIC_JSON_TIMEOUT_MS,
  });
}
