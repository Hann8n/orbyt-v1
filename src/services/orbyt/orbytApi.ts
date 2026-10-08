/**
 * Orbyt AppView client (`api.getorbyt.com`).
 *
 * Orbyt-native reads are `com.getorbyt.*` XRPC methods served by the AppView
 * (lexicons live in the orbyt-platform repo under `lexicons/com/getorbyt`).
 * - Public queries go straight to the AppView, unauthenticated.
 * - Authenticated methods go through the user's PDS with the `atproto-proxy`
 *   header, so the PDS mints the service-auth token the AppView verifies.
 * - Record writes (`com.getorbyt.community.post`, `.membership`, profile) stay
 *   PDS-direct via `com.atproto.repo.*`.
 */
import type { Agent } from '@atproto/api';

import { ApiRequestError } from '@/services/api/fetchJson';

const DEFAULT_ORBYT_API_URL = 'https://api.getorbyt.com';

/** Service DID + fragment of the Orbyt AppView, used as the `atproto-proxy` target. */
const ORBYT_APPVIEW_PROXY = 'did:web:api.getorbyt.com#orbyt_appview';

const ORBYT_API_TIMEOUT_MS = 10_000;

function getOrbytApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_ORBYT_API_URL?.trim();
  return (fromEnv || DEFAULT_ORBYT_API_URL).replace(/\/+$/, '');
}

type QueryParamValue = string | number | boolean | undefined | null;
export type OrbytQueryParams = Record<string, QueryParamValue | readonly QueryParamValue[]>;

/** An XRPC error body (`{ error, message }`) returned by the AppView. */
export class OrbytXrpcError extends ApiRequestError {
  constructor(
    public readonly nsid: string,
    status: number,
    url: string,
    public readonly error: string | undefined,
    message: string | undefined
  ) {
    super(message || error || `${nsid} failed with status ${status}`, status, url);
    this.name = 'OrbytXrpcError';
  }
}

function buildQueryString(params?: OrbytQueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === undefined || item === null) continue;
      search.append(key, String(item));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function readXrpcResponse<T>(
  nsid: string,
  url: string,
  response: globalThis.Response
): Promise<T> {
  if (response.ok) {
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }
  let body: { error?: string; message?: string } | null = null;
  try {
    body = (await response.json()) as { error?: string; message?: string };
  } catch {
    body = null;
  }
  throw new OrbytXrpcError(nsid, response.status, url, body?.error, body?.message);
}

interface OrbytQueryOptions {
  signal?: globalThis.AbortSignal;
  timeoutMs?: number;
}

/** Unauthenticated `GET /xrpc/{nsid}` against the Orbyt AppView. */
export async function orbytPublicQuery<T>(
  nsid: string,
  params?: OrbytQueryParams,
  options: OrbytQueryOptions = {}
): Promise<T> {
  const url = `${getOrbytApiUrl()}/xrpc/${nsid}${buildQueryString(params)}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? ORBYT_API_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    return await readXrpcResponse<T>(nsid, url, response);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Authenticated XRPC call to the Orbyt AppView, proxied through the signed-in
 * user's PDS. Works for both OAuth and app-password sessions because it goes
 * through the agent's own fetch handler.
 */
export async function orbytAuthedCall<T>(
  agent: Pick<Agent, 'fetchHandler'>,
  nsid: string,
  init: { method: 'GET'; params?: OrbytQueryParams } | { method: 'POST'; body: unknown }
): Promise<T> {
  const path = `/xrpc/${nsid}${init.method === 'GET' ? buildQueryString(init.params) : ''}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'atproto-proxy': ORBYT_APPVIEW_PROXY,
  };
  let body: string | undefined;
  if (init.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body ?? {});
  }
  const response = await agent.fetchHandler(path, { method: init.method, headers, body });
  return readXrpcResponse<T>(nsid, path, response);
}
