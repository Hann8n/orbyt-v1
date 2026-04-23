import { ExpoOAuthClient, type ExpoOAuthClientOptions } from '@atproto/oauth-client-expo';
import {
  getDefaultBackendUrl as getResolverDefaultBackendUrl,
  getScopeForBackend,
  normalizeBackendUrl,
} from './backendResolver';

// Bundled client metadata - MUST stay byte-for-byte aligned with:
// https://getorbyt.com/oauth-client-metadata.json
// The Expo OAuth package handles session storage, refresh, and token lifecycle internally.
const BLUESKY_CLIENT_METADATA: ExpoOAuthClientOptions['clientMetadata'] = {
  client_id: 'https://getorbyt.com/oauth-client-metadata.json',
  client_name: 'orbyt',
  client_uri: 'https://getorbyt.com',
  logo_uri: 'https://getorbyt.com/images/orbyt-logo.png',
  tos_uri: 'https://getorbyt.com/terms',
  policy_uri: 'https://getorbyt.com/privacy',
  // Include both native and web redirect URIs (per oauth-client-expo docs)
  redirect_uris: ['com.getorbyt:/oauth/callback', 'https://getorbyt.com/oauth/callback'],
  // NOTE: Keep this in sync with the hosted oauth-client-metadata.json at client_id.
  // If this differs from hosted metadata, some auth servers may cache/validate in ways
  // that result in stale or partial grants during scope upgrades.
  scope:
    'atproto transition:generic transition:chat.bsky transition:email account:email?action=manage repo:* blob:*/* rpc:*?aud=did:web:api.bsky.app rpc:*?aud=did:web:api.bsky.app%23bsky_appview rpc:*?aud=did:web:api.bsky.chat%23bsky_chat',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'native',
  dpop_bound_access_tokens: true,
};

/**
 * Build client metadata for non-Bluesky backends.
 * The client_id URL remains the same (OAuth servers fetch it to validate the client),
 * but the scope is narrowed to what that backend actually supports. Per OAuth spec,
 * servers accept scope requests that are a subset of the registered max scope.
 */
function buildClientMetadataForBackend(
  backend: string,
  appViewDid?: string | null
): ExpoOAuthClientOptions['clientMetadata'] {
  return {
    ...BLUESKY_CLIENT_METADATA,
    scope: getScopeForBackend(backend, appViewDid),
  };
}

let clientInstance: ExpoOAuthClient | null = null;
const backendClients = new Map<string, ExpoOAuthClient>();
const DEFAULT_BACKEND = getResolverDefaultBackendUrl();

export function getDefaultBackendUrl(): string {
  return DEFAULT_BACKEND;
}

/**
 * Get the OAuth client for a backend. Uses bundled metadata for Bluesky; builds
 * backend-appropriate metadata (scope) for other AT Protocol providers.
 * The @atproto/oauth-client-expo package handles session storage, token refresh,
 * and restore internally via its built-in stores.
 */
export function getOAuthClient(backend?: string, appViewDid?: string | null): ExpoOAuthClient {
  const normalizedBackend = normalizeBackendUrl(backend);

  if (normalizedBackend === DEFAULT_BACKEND) {
    if (!clientInstance) {
      clientInstance = new ExpoOAuthClient({
        handleResolver: DEFAULT_BACKEND,
        clientMetadata: BLUESKY_CLIENT_METADATA,
      });
    }
    return clientInstance;
  }

  // Cache key includes appViewDid so scope is correct when appView changes.
  const cacheKey = appViewDid ? `${normalizedBackend}|${appViewDid}` : normalizedBackend;
  const existing = backendClients.get(cacheKey);
  if (existing) return existing;

  const client = new ExpoOAuthClient({
    handleResolver: normalizedBackend,
    clientMetadata: buildClientMetadataForBackend(normalizedBackend, appViewDid),
  });
  backendClients.set(cacheKey, client);
  return client;
}
