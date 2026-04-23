const DEFAULT_BACKEND_URL = 'https://bsky.social';
const DEFAULT_APPVIEW_DID = 'did:web:api.bsky.app#bsky_appview';
const APPVIEW_DID_FETCH_TIMEOUT_MS = 3500;

/** Minimum scope required by every AT Protocol OAuth server. */
export const ATPROTO_BASE_SCOPE = 'atproto repo:* blob:*/*';

// ─── Bluesky-specific scope constants ────────────────────────────────────────

const BSKY_APPVIEW_AUD = 'did:web:api.bsky.app%23bsky_appview';

const BSKY_APPVIEW_RPC_METHODS = [
  'app.bsky.actor.getPreferences',
  'app.bsky.actor.getProfile',
  'app.bsky.actor.getSuggestions',
  'app.bsky.actor.putPreferences',
  'app.bsky.actor.searchActors',
  'app.bsky.bookmark.createBookmark',
  'app.bsky.bookmark.deleteBookmark',
  'app.bsky.bookmark.getBookmarks',
  'app.bsky.feed.getActorLikes',
  'app.bsky.feed.getAuthorFeed',
  'app.bsky.feed.getFeed',
  'app.bsky.feed.getFeedGenerator',
  'app.bsky.feed.getFeedGenerators',
  'app.bsky.feed.getLikes',
  'app.bsky.feed.getPostThread',
  'app.bsky.feed.getPosts',
  'app.bsky.feed.searchPosts',
  'app.bsky.feed.sendInteractions',
  'app.bsky.graph.getBlocks',
  'app.bsky.graph.getFollowers',
  'app.bsky.graph.getFollows',
  'app.bsky.graph.getMutes',
  'app.bsky.graph.muteActor',
  'app.bsky.graph.unmuteActor',
  'app.bsky.notification.getUnreadCount',
  'app.bsky.notification.listActivitySubscriptions',
  'app.bsky.notification.listNotifications',
  'app.bsky.notification.putActivitySubscription',
  'app.bsky.notification.updateSeen',
  'app.bsky.unspecced.getPopularFeedGenerators',
  'app.bsky.video.getUploadLimits',
] as const;

// Chat service uses the #bsky_chat fragment to identify the proxy target.
// video.getJobStatus uses an unauthenticated agent — no scope needed.
// chat.bsky.actor.declaration get/put are repo record ops covered by repo:*.
const BSKY_CHAT_AUD = 'did:web:api.bsky.chat%23bsky_chat';

const BSKY_CHAT_RPC_METHODS = [
  'chat.bsky.convo.acceptConvo',
  'chat.bsky.convo.addReaction',
  'chat.bsky.convo.deleteMessageForSelf',
  'chat.bsky.convo.getConvo',
  'chat.bsky.convo.getConvoAvailability',
  'chat.bsky.convo.getConvoForMembers',
  'chat.bsky.convo.getLog',
  'chat.bsky.convo.getMessages',
  'chat.bsky.convo.leaveConvo',
  'chat.bsky.convo.listConvos',
  'chat.bsky.convo.muteConvo',
  'chat.bsky.convo.removeReaction',
  'chat.bsky.convo.sendMessage',
  'chat.bsky.convo.sendMessageBatch',
  'chat.bsky.convo.unmuteConvo',
  'chat.bsky.convo.updateAllRead',
  'chat.bsky.convo.updateRead',
] as const;

/**
 * OAuth scope extension beyond ATPROTO_BASE_SCOPE for Bluesky backends.
 * Uses explicit per-method rpc: scopes — wildcards (rpc:*) are not honored
 * by api.bsky.app's token validation despite being valid per spec.
 */
export const BLUESKY_SCOPE_EXTENSION =
  'account:email?action=manage ' +
  BSKY_APPVIEW_RPC_METHODS.map(m => `rpc:${m}?aud=${BSKY_APPVIEW_AUD}`).join(' ') +
  ' ' +
  BSKY_CHAT_RPC_METHODS.map(m => `rpc:${m}?aud=${BSKY_CHAT_AUD}`).join(' ');

// ─────────────────────────────────────────────────────────────────────────────

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
    scopeExtension: BLUESKY_SCOPE_EXTENSION,
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
