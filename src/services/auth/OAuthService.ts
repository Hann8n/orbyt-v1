import { ExpoOAuthClient, type ExpoOAuthClientOptions } from '@atproto/oauth-client-expo';

// Bundled client metadata - MUST stay byte-for-byte aligned with:
// https://getorbyt.com/oauth-client-metadata.json
// The Expo OAuth package handles session storage, refresh, and token lifecycle internally.
const CLIENT_METADATA: ExpoOAuthClientOptions['clientMetadata'] = {
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

export const REQUIRED_OAUTH_SCOPES = (CLIENT_METADATA.scope ?? '').split(' ').filter(Boolean);

let clientInstance: ExpoOAuthClient | null = null;

/**
 * Get the OAuth client instance. Uses bundled metadata - no network fetch.
 * The @atproto/oauth-client-expo package handles session storage, token refresh,
 * and restore internally via its built-in stores.
 */
export function getOAuthClient(): ExpoOAuthClient {
  if (!clientInstance) {
    clientInstance = new ExpoOAuthClient({
      handleResolver: 'https://bsky.social',
      clientMetadata: CLIENT_METADATA,
    });
  }
  return clientInstance;
}
