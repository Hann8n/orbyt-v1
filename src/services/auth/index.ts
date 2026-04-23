export { getOAuthClient, getDefaultBackendUrl } from './OAuthService';
export {
  CURATED_BACKENDS,
  isCuratedBackend,
  normalizeBackendUrl,
  getAppViewDidFallbackForBackend,
  resolveAppViewDidForBackend,
  getScopeForBackend,
  getPublicAppviewEndpointForBackend,
  ATPROTO_BASE_SCOPE,
} from './backendResolver';
export { getProviderMetadata } from './providerMetadata';
export type { OAuthSession } from '@atproto/oauth-client';
export type { ExpoOAuthClientOptions } from '@atproto/oauth-client-expo';
