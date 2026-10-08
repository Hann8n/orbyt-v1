/**
 * Sign-in through the Orbyt AppView gateway (orbyt-platform
 * `workers/appview/src/gateway/routes.ts`). The gateway is Orbyt's one
 * confidential OAuth client; the device holds only its signed session token
 * and sends every XRPC call to the gateway, which answers `com.getorbyt.*`
 * itself and forwards the rest to the account's PDS.
 *
 * 1. Open `/auth/login?redirect_to&browser_nonce[&identifier|&pds]`.
 * 2. The gateway returns to `https://getorbyt.com/oauth/callback?code=…` (or `?error=…`).
 * 3. `POST /auth/exchange {code, browser_nonce}` → `{session_id}` (the token).
 * 4. `GET /auth/session` → `{did, handle}`; `POST /auth/logout` ends it.
 */
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

const GATEWAY_ORIGIN = 'https://api.getorbyt.com';
const APP_CALLBACK = 'https://getorbyt.com/oauth/callback';
const DEFAULT_SIGN_UP_PDS = 'https://bsky.social';

/** The gateway refused the token: the member has to sign in again. */
export class GatewaySessionExpiredError extends Error {
  constructor(message = 'Session expired. Please log in again.') {
    super(message);
    this.name = 'GatewaySessionExpiredError';
  }
}

export interface GatewaySession {
  did: string;
  handle: string;
  /** `@atproto/api` SessionManager contract: `new Agent(session)`. */
  fetchHandler: (url: string, init: RequestInit) => Promise<Response>;
}

interface StoredSession {
  token: string;
  handle: string;
}

const expiredListeners = new Set<(did: string) => void>();

/** Called when a live session's token is refused, so the app can return to sign-in. */
export function onGatewaySessionExpired(listener: (did: string) => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

// SecureStore keys allow only [A-Za-z0-9._-].
const storageKey = (did: string) => `orbyt_gateway_${did.replace(/[^A-Za-z0-9._-]/g, '_')}`;

async function readStored(did: string): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(storageKey(did));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return typeof parsed.token === 'string'
      ? { token: parsed.token, handle: parsed.handle ?? did }
      : null;
  } catch {
    return null;
  }
}

const authorized = (token: string, init?: RequestInit): Headers => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
};

async function isSessionExpired(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: string } | null;
  return body?.error === 'session_expired';
}

function makeSession(did: string, stored: StoredSession): GatewaySession {
  return {
    did,
    handle: stored.handle,
    fetchHandler: async (url, init) => {
      const response = await fetch(new URL(url, GATEWAY_ORIGIN).toString(), {
        ...init,
        headers: authorized(stored.token, init),
      });
      if (await isSessionExpired(response)) {
        await SecureStore.deleteItemAsync(storageKey(did)).catch(() => {});
        expiredListeners.forEach(listener => listener(did));
      }
      return response;
    },
  };
}

/** Session checks gate sign-in and restore; a stalled gateway must not hang them. */
const SESSION_CHECK_TIMEOUT_MS = 10_000;

async function fetchViewer(token: string): Promise<{ did: string; handle: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
  const response = await fetch(`${GATEWAY_ORIGIN}/auth/session`, {
    headers: authorized(token),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  if (response.status === 401) throw new GatewaySessionExpiredError();
  if (!response.ok) throw new Error(`Gateway session check failed: ${response.status}`);
  return (await response.json()) as { did: string; handle: string };
}

function randomNonce(): string {
  return Buffer.from(Crypto.getRandomBytes(32))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Opens the gateway sign-in. `identifier` is a handle or DID; empty lets the
 * member choose at the entryway. With `signUp`, `identifier` is instead the PDS
 * host to create the account on (bsky.social when empty).
 * Throws an Error whose message contains "cancelled" when the member backs out.
 */
export async function signIn(
  identifier: string,
  { signUp = false }: { signUp?: boolean } = {}
): Promise<GatewaySession> {
  const nonce = randomNonce();
  const login = new URL(`${GATEWAY_ORIGIN}/auth/login`);
  login.searchParams.set('redirect_to', APP_CALLBACK);
  login.searchParams.set('browser_nonce', nonce);
  const trimmed = identifier.trim().replace(/^@/, '');
  if (signUp) {
    const host = trimmed.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    login.searchParams.set('pds', host ? `https://${host}` : DEFAULT_SIGN_UP_PDS);
  } else if (trimmed) login.searchParams.set('identifier', trimmed);

  const result = await WebBrowser.openAuthSessionAsync(login.toString(), APP_CALLBACK, {
    preferUniversalLinks: true,
  });
  if (result.type !== 'success') throw new Error('Sign-in cancelled');

  const callback = new URL(result.url);
  const error = callback.searchParams.get('error');
  if (error === 'access_denied') throw new Error('Sign-in cancelled');
  if (error === 'invalid_request') throw new Error(`Couldn't find the account "${trimmed}".`);
  const code = callback.searchParams.get('code');
  if (error || !code) throw new Error('Sign-in failed. Please try again.');

  const exchange = await fetch(`${GATEWAY_ORIGIN}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://getorbyt.com' },
    body: JSON.stringify({ code, browser_nonce: nonce }),
  });
  if (!exchange.ok) throw new Error('Sign-in expired. Please try again.');
  const { session_id: token } = (await exchange.json()) as { session_id?: string };
  if (!token) throw new Error('Sign-in failed. Please try again.');

  const viewer = await fetchViewer(token);
  const stored = { token, handle: viewer.handle };
  await SecureStore.setItemAsync(storageKey(viewer.did), JSON.stringify(stored));
  return makeSession(viewer.did, stored);
}

/**
 * The saved session for `did`. With `verify`, asks the gateway first: a refused
 * token is deleted and throws GatewaySessionExpiredError; a network failure throws as is.
 */
export async function restore(did: string, { verify = false } = {}): Promise<GatewaySession> {
  const stored = await readStored(did);
  if (!stored) throw new GatewaySessionExpiredError();
  if (verify) {
    try {
      const viewer = await fetchViewer(stored.token);
      stored.handle = viewer.handle;
    } catch (error) {
      if (error instanceof GatewaySessionExpiredError) {
        await SecureStore.deleteItemAsync(storageKey(did)).catch(() => {});
      }
      throw error;
    }
  }
  return makeSession(did, stored);
}

/** Ends the gateway session (best effort) and forgets it on this device. */
export async function signOut(did: string): Promise<void> {
  const stored = await readStored(did);
  await SecureStore.deleteItemAsync(storageKey(did)).catch(() => {});
  if (stored) {
    await fetch(`${GATEWAY_ORIGIN}/auth/logout`, {
      method: 'POST',
      headers: authorized(stored.token),
    }).catch(() => {});
  }
}
