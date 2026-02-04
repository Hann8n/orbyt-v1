import { ExpoOAuthClient, type ExpoOAuthClientOptions } from '@atproto/oauth-client-expo';
import { logger } from '../../utils/logger';

interface CachedMetadata {
  metadata: ExpoOAuthClientOptions['clientMetadata'];
  timestamp: number;
}

// Bundled client metadata - always available, no network fetch required
// This is the source of truth and matches https://getorbyt.com/oauth-client-metadata.json
const BUNDLED_CLIENT_METADATA: ExpoOAuthClientOptions['clientMetadata'] = {
  client_id: 'https://getorbyt.com/oauth-client-metadata.json',
  client_name: 'orbyt',
  client_uri: 'https://getorbyt.com',
  logo_uri: 'https://getorbyt.com/TV-Raw.png',
  tos_uri: 'https://getorbyt.com/terms',
  policy_uri: 'https://getorbyt.com/privacy',
  redirect_uris: ['com.getorbyt:/oauth/callback'],
  scope:
    'atproto transition:generic transition:chat.bsky transition:email account:email?action=manage',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'native',
  dpop_bound_access_tokens: true,
};

// Cache client metadata for 24 hours (client metadata rarely changes)
const CLIENT_METADATA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CLIENT_METADATA_URL = 'https://getorbyt.com/oauth-client-metadata.json';
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second base delay

export class AtProtoOAuthService {
  private static instance: AtProtoOAuthService | null = null;
  private client: ExpoOAuthClient | null = null;
  private cachedMetadata: CachedMetadata | null = null;
  private metadataFetchPromise: Promise<ExpoOAuthClientOptions['clientMetadata']> | null = null;

  private constructor() {}

  static getInstance(): AtProtoOAuthService {
    if (!AtProtoOAuthService.instance) {
      AtProtoOAuthService.instance = new AtProtoOAuthService();
    }
    return AtProtoOAuthService.instance;
  }

  /**
   * Fetches client metadata with retry logic and exponential backoff
   */
  private async fetchClientMetadataWithRetry(
    retries = MAX_RETRIES
  ): Promise<ExpoOAuthClientOptions['clientMetadata']> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // eslint-disable-next-line no-undef
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
          const response = await fetch(CLIENT_METADATA_URL, {
            signal: controller.signal,
            headers: {
              'Cache-Control': 'no-cache', // Always fetch fresh, but we cache in memory
            },
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `Failed to fetch client metadata: ${response.status} ${response.statusText}`
            );
          }

          const metadata = await response.json();

          // Validate that we got valid metadata
          if (!metadata || typeof metadata !== 'object') {
            throw new Error('Invalid client metadata format');
          }

          // Cache the metadata
          this.cachedMetadata = {
            metadata,
            timestamp: Date.now(),
          };

          logger.debug('Successfully fetched client metadata', {
            component: 'OAuthService',
            attempt: attempt + 1,
          });

          return metadata;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isNetworkError =
          lastError.message.includes('fetch') ||
          lastError.message.includes('Network') ||
          lastError.message.includes('Failed to fetch') ||
          lastError.name === 'AbortError' ||
          lastError.name === 'TypeError';

        // If it's not a network error or we're on the last attempt, throw immediately
        if (!isNetworkError || attempt === retries - 1) {
          break;
        }

        // Exponential backoff: wait 1s, 2s, 4s...
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
        logger.warn(`Client metadata fetch failed, retrying in ${delay}ms`, {
          component: 'OAuthService',
          attempt: attempt + 1,
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // If we have cached metadata, use it as fallback
    if (this.cachedMetadata) {
      const cacheAge = Date.now() - this.cachedMetadata.timestamp;
      logger.warn('Using cached client metadata due to fetch failure', {
        component: 'OAuthService',
        cacheAgeHours: Math.round(cacheAge / (60 * 60 * 1000)),
        error: lastError?.message,
      });
      return this.cachedMetadata.metadata;
    }

    // No cache available, throw the error
    logger.error('Failed to fetch client metadata after retries', lastError, {
      component: 'OAuthService',
      retries,
    });
    throw new Error(
      `Failed to load OAuth client configuration: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Gets client metadata, using bundled metadata first, then cache, then network
   * Bundled metadata ensures instant availability without network dependency
   */
  private async getClientMetadata(): Promise<ExpoOAuthClientOptions['clientMetadata']> {
    // Always use bundled metadata immediately - no network fetch required
    // This ensures the OAuth client can be created instantly
    const getBundledMetadata = () => {
      logger.debug('Using bundled client metadata', { component: 'OAuthService' });
      return BUNDLED_CLIENT_METADATA;
    };

    // Check if we have valid cached metadata from network (newer than bundled)
    if (this.cachedMetadata) {
      const cacheAge = Date.now() - this.cachedMetadata.timestamp;
      if (cacheAge < CLIENT_METADATA_CACHE_TTL) {
        logger.debug('Using cached client metadata from network', {
          component: 'OAuthService',
          cacheAgeHours: Math.round(cacheAge / (60 * 60 * 1000)),
        });
        return this.cachedMetadata.metadata;
      }
    }

    // Return bundled metadata immediately (no waiting)
    // Fetch from network in background for future updates
    this.updateMetadataFromNetwork().catch(error => {
      // Silent failure - bundled metadata is sufficient
      logger.debug('Background metadata update failed (using bundled)', {
        component: 'OAuthService',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return getBundledMetadata();
  }

  /**
   * Fetches metadata from network in the background to update cache
   * This is non-blocking and doesn't affect client creation
   */
  private async updateMetadataFromNetwork(): Promise<void> {
    // If there's already a fetch in progress, don't start another
    if (this.metadataFetchPromise) {
      return this.metadataFetchPromise.then(() => undefined);
    }

    // Start a background fetch (non-blocking)
    this.metadataFetchPromise = this.fetchClientMetadataWithRetry().finally(() => {
      this.metadataFetchPromise = null;
    });

    try {
      await this.metadataFetchPromise;
      logger.debug('Background metadata update successful', { component: 'OAuthService' });
    } catch (error) {
      // Silent failure - bundled metadata is sufficient
      logger.debug('Background metadata update failed', {
        component: 'OAuthService',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Gets or creates the OAuth client instance
   * Uses cached client metadata to avoid unnecessary network requests
   * Ensures metadata is fetched and cached before creating the client
   */
  async getClient(): Promise<ExpoOAuthClient> {
    if (!this.client) {
      try {
        // Ensure metadata is fetched and cached before creating client
        // This prevents the library from needing to fetch it during restore()
        const clientMetadata = await this.getClientMetadata();

        // Validate metadata has required fields
        if (!clientMetadata || !clientMetadata.client_id) {
          throw new Error('Invalid client metadata: missing required fields');
        }

        this.client = new ExpoOAuthClient({
          handleResolver: 'https://bsky.social',
          clientMetadata,
        });
        logger.debug('Created new OAuth client instance', { component: 'OAuthService' });
      } catch (error) {
        logger.error('Failed to create OAuth client', error, { component: 'OAuthService' });
        throw error;
      }
    }
    return this.client;
  }

  /**
   * Pre-warms the client by starting background metadata fetch
   * Since we use bundled metadata, this is instant and non-blocking
   * Call this early in app initialization to update cache in background
   */
  async prewarm(): Promise<void> {
    // Bundled metadata is always available, so this is instant
    // Start background fetch to update cache for future use
    this.updateMetadataFromNetwork().catch(() => {
      // Silent failure - bundled metadata is sufficient
    });
    logger.debug('OAuth client metadata pre-warmed (using bundled, updating in background)', {
      component: 'OAuthService',
    });
  }

  /**
   * Clears the client instance (but keeps cached metadata)
   * This should only be called when explicitly needed (e.g., corrupted session cleanup)
   */
  clearClient(): void {
    logger.debug('Clearing OAuth client instance', { component: 'OAuthService' });
    this.client = null;
  }

  /**
   * Clears both client and cached metadata
   * Use this only if you need to force a fresh metadata fetch
   */
  clearCache(): void {
    logger.debug('Clearing OAuth client and metadata cache', { component: 'OAuthService' });
    this.client = null;
    this.cachedMetadata = null;
    this.metadataFetchPromise = null;
  }
}
