/**
 * Gateway sign-in against the AppView contract (orbyt-platform
 * workers/appview/src/gateway/routes.ts): login URL, exchange body, session
 * lookup, Bearer on XRPC, and a refused token returning the member to sign-in.
 */
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import {
  GatewaySessionExpiredError,
  onGatewaySessionExpired,
  restore,
  signIn,
  signOut,
} from '../services/auth/gateway';

jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(7) }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

const DID = 'did:plc:abc123';
const TOKEN = 'gt1.session.9999999999.sig';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => fetchMock.mockReset());

async function signInOnce() {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
    type: 'success',
    url: 'https://getorbyt.com/oauth/callback?code=one-time-code',
  });
  fetchMock
    .mockResolvedValueOnce(json({ session_id: TOKEN }))
    .mockResolvedValueOnce(json({ did: DID, handle: 'alice.test', active: true }));
  return signIn('@alice.test');
}

test('signs in through /auth/login, /auth/exchange and /auth/session', async () => {
  const session = await signInOnce();

  const [loginUrl, callback, options] = (WebBrowser.openAuthSessionAsync as jest.Mock).mock
    .calls[0];
  const login = new URL(loginUrl);
  expect(login.origin + login.pathname).toBe('https://api.getorbyt.com/auth/login');
  expect(login.searchParams.get('redirect_to')).toBe('https://getorbyt.com/oauth/callback');
  expect(login.searchParams.get('identifier')).toBe('alice.test');
  const nonce = login.searchParams.get('browser_nonce') ?? '';
  expect(nonce).toMatch(/^[a-zA-Z0-9_-]{32,128}$/);
  expect(callback).toBe('https://getorbyt.com/oauth/callback');
  expect(options).toEqual({ preferUniversalLinks: true });

  const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[0];
  expect(exchangeUrl).toBe('https://api.getorbyt.com/auth/exchange');
  expect(JSON.parse(exchangeInit.body)).toEqual({ code: 'one-time-code', browser_nonce: nonce });

  expect(session).toMatchObject({ did: DID, handle: 'alice.test' });
});

test('sign-up names the PDS instead of an identifier', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: 'cancel' });
  await expect(signIn('https://example.pds/', { signUp: true })).rejects.toThrow(/cancelled/);
  const login = new URL((WebBrowser.openAuthSessionAsync as jest.Mock).mock.lastCall[0]);
  expect(login.searchParams.get('pds')).toBe('https://example.pds');
  expect(login.searchParams.has('identifier')).toBe(false);
});

test('XRPC calls go to the gateway with the Bearer token', async () => {
  const session = await signInOnce();
  fetchMock.mockResolvedValueOnce(json({ ok: true }));
  await session.fetchHandler('/xrpc/app.bsky.actor.getProfile?actor=x', { method: 'GET' });
  const [url, init] = fetchMock.mock.lastCall;
  expect(url).toBe('https://api.getorbyt.com/xrpc/app.bsky.actor.getProfile?actor=x');
  expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
});

test('a refused token forgets the session and notifies', async () => {
  const session = await signInOnce();
  const expired = jest.fn();
  const unsubscribe = onGatewaySessionExpired(expired);
  fetchMock.mockResolvedValueOnce(json({ error: 'session_expired' }, 401));
  const response = await session.fetchHandler('/xrpc/app.bsky.feed.getTimeline', {});
  unsubscribe();
  expect(response.status).toBe(401);
  expect(expired).toHaveBeenCalledWith(DID);
  await expect(restore(DID)).rejects.toBeInstanceOf(GatewaySessionExpiredError);
});

test('restore verifies with /auth/session and keeps the session on a network failure', async () => {
  await signInOnce();
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(restore(DID, { verify: true })).rejects.toThrow('Network request failed');
  await expect(restore(DID)).resolves.toMatchObject({ did: DID });
});

test('sign-out calls /auth/logout and forgets the token', async () => {
  await signInOnce();
  fetchMock.mockResolvedValueOnce(json({ success: true }));
  await signOut(DID);
  expect(fetchMock.mock.lastCall[0]).toBe('https://api.getorbyt.com/auth/logout');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  await expect(restore(DID)).rejects.toBeInstanceOf(GatewaySessionExpiredError);
});
