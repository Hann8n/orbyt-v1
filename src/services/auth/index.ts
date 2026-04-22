export { getOAuthClient, getDefaultBackendUrl } from './OAuthService';
export {
  CURATED_BACKENDS,
  isCuratedBackend,
  normalizeBackendUrl,
  getAppViewDidFallbackForBackend,
  resolveAppViewDidForBackend,
} from './backendResolver';
export { getProviderMetadata } from './providerMetadata';
export type { OAuthSession } from '@atproto/oauth-client';
export type { ExpoOAuthClientOptions } from '@atproto/oauth-client-expo';
