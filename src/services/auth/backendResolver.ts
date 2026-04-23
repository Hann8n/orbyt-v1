const DEFAULT_BACKEND_URL = 'https://bsky.social';
const DEFAULT_APPVIEW_DID = 'did:web:api.bsky.app#bsky_appview';
const APPVIEW_DID_FETCH_TIMEOUT_MS = 3500;

/** Minimum scope required by every AT Protocol OAuth server. */
export const ATPROTO_BASE_SCOPE = 'atproto transition:generic repo:* blob:*/*';

type BackendStaticConfig = {
  key: string;
  label: string;
  backend: string;
  appViewDid: string;
  /** Extra scope tokens beyond ATPROTO_BASE_SCOPE. Omit for generic AT Protocol providers. */
  scopeExtension?: string;
  /** Public (unauthenticated) AppView endpoint for pre-auth queries (handle search, etc.). */
  publicAppviewEndpoint?: string;
};

const BACKEND_STATIC_CONFIG: BackendStaticConfig[] = [
  {
    key: 'bluesky',
    label: 'Bluesky',
    backend: 'https://bsky.social',
    appViewDid: 'did:web:api.bsky.app#bsky_appview',
    scopeExtension:
      'transition:chat.bsky transition:email account:email?action=manage ' +
      'rpc:*?aud=did:web:api.bsky.app ' +
      'rpc:*?aud=did:web:api.bsky.app%23bsky_appview ' +
      'rpc:*?aud=did:web:api.bsky.chat%23bsky_chat',
    publicAppviewEndpoint: 'https://public.api.bsky.app',
  },
  {
    key: 'blacksky',
    label: 'Blacksky',
    backend: 'https://blacksky.app',
    appViewDid: 'did:web:api.blacksky.community#bsky_appview',
    scopeExtension:
      'rpc:*?aud=did:web:api.blacksky.community ' +
      'rpc:*?aud=did:web:api.blacksky.community%23bsky_appview',
    // Blacksky users are Bluesky accounts — Bluesky's public API resolves their handles.
    publicAppviewEndpoint: 'https://public.api.bsky.app',
  },
];

export type CuratedBackend = Pick<BackendStaticConfig, 'key' | 'label' | 'backend'>;

export const CURATED_BACKENDS: CuratedBackend[] = BACKEND_STATIC_CONFIG.map(
  ({ key, label, backend }) => ({
    key,
    label,
    backend,
  })
);

export function isCuratedBackend(backend?: string | null): boolean {
  const normalized = normalizeBackendUrl(backend);
  return CURATED_BACKENDS.some(entry => normalizeBackendUrl(entry.backend) === normalized);
}

export function normalizeBackendUrl(input?: string | null): string {
  const trimmed = input?.trim();
  if (!trimmed) return DEFAULT_BACKEND_URL;
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.toLowerCase().replace(/\/+$/, '');
}

export function getDefaultBackendUrl(): string {
  return DEFAULT_BACKEND_URL;
}

function getStaticBackendConfig(backend?: string | null): BackendStaticConfig | undefined {
  const normalized = normalizeBackendUrl(backend);
  return BACKEND_STATIC_CONFIG.find(entry => entry.backend === normalized);
}

export function getAppViewDidFallbackForBackend(backend?: string | null): string {
  return getStaticBackendConfig(backend)?.appViewDid ?? DEFAULT_APPVIEW_DID;
}

/**
 * Returns the OAuth scope appropriate for the given backend.
 * Curated backends use a known scope extension; custom backends derive audience
 * scope from the discovered appViewDid. Falls back to the AT Protocol base scope.
 */
export function getScopeForBackend(backend?: string | null, appViewDid?: string | null): string {
  const config = getStaticBackendConfig(backend);
  if (config?.scopeExtension) {
    return `${ATPROTO_BASE_SCOPE} ${config.scopeExtension}`;
  }

  if (appViewDid) {
    const didWithoutFragment = appViewDid.split('#')[0];
    const encodedFull = encodeURIComponent(appViewDid);
    return `${ATPROTO_BASE_SCOPE} rpc:*?aud=${didWithoutFragment} rpc:*?aud=${encodedFull}`;
  }

  return ATPROTO_BASE_SCOPE;
}

/**
 * Returns the public (unauthenticated) AppView API endpoint for pre-auth queries.
 * Falls back to Bluesky's public API, which covers AT Protocol handle resolution broadly.
 */
export function getPublicAppviewEndpointForBackend(backend?: string | null): string {
  return getStaticBackendConfig(backend)?.publicAppviewEndpoint ?? 'https://public.api.bsky.app';
}

function extractDidFromServiceId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hashIndex = trimmed.indexOf('#');
  return hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
}

function buildCandidateAppViewHosts(backend: string): string[] {
  const candidateHosts: string[] = [];

  try {
    const host = new URL(backend).hostname;
    candidateHosts.push(`api.${host}`);
    if (host.startsWith('www.')) {
      candidateHosts.push(`api.${host.slice(4)}`);
    }
  } catch {
    // invalid URL — fall through to static fallback only
  }

  const staticFallbackDid = getAppViewDidFallbackForBackend(backend);
  const staticDid = extractDidFromServiceId(staticFallbackDid);
  if (staticDid?.startsWith('did:web:')) {
    const staticHost = staticDid.slice('did:web:'.length);
    if (!candidateHosts.includes(staticHost)) {
      candidateHosts.push(staticHost);
    }
  }

  return candidateHosts;
}

type DidDocument = {
  id?: unknown;
  service?: Array<{ id?: unknown; type?: unknown }>;
};

function getAppViewDidFromDidDocument(host: string, doc: DidDocument): string | null {
  if (!doc || typeof doc !== 'object') return null;
  const did = typeof doc.id === 'string' ? doc.id : `did:web:${host}`;
  const serviceEntries = Array.isArray(doc.service) ? doc.service : [];

  const appViewService = serviceEntries.find(service => {
    const serviceId = typeof service?.id === 'string' ? service.id : '';
    const serviceType = service?.type;
    const typed =
      typeof serviceType === 'string'
        ? serviceType
        : Array.isArray(serviceType)
          ? serviceType.filter((item): item is string => typeof item === 'string').join(' ')
          : '';

    return serviceId.endsWith('#bsky_appview') || typed.toLowerCase().includes('appview');
  });

  if (!appViewService) return null;

  const serviceId = typeof appViewService.id === 'string' ? appViewService.id : null;
  if (!serviceId) return null;

  // Build the full DID service reference from the document's own service ID.
  return serviceId.startsWith('#') ? `${did}${serviceId}` : serviceId;
}

async function fetchAppViewDidFromHost(
  host: string,
  signal?: globalThis.AbortSignal
): Promise<string | null> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), APPVIEW_DID_FETCH_TIMEOUT_MS);
  const handleSignalAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', handleSignalAbort);

  try {
    const response = await fetch(`https://${host}/.well-known/did.json`, {
      signal: timeoutController.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as DidDocument;
    return getAppViewDidFromDidDocument(host, json);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', handleSignalAbort);
  }
}

export async function resolveAppViewDidForBackend(
  backend?: string | null,
  options?: { signal?: globalThis.AbortSignal }
): Promise<string> {
  const normalizedBackend = normalizeBackendUrl(backend);
  const candidates = buildCandidateAppViewHosts(normalizedBackend);

  for (const host of candidates) {
    const did = await fetchAppViewDidFromHost(host, options?.signal);
    if (did) return did;
  }

  return getAppViewDidFallbackForBackend(normalizedBackend);
}
