import { ExpoOAuthClient, type ExpoOAuthClientOptions } from '@atproto/oauth-client-expo';
import { logger } from '../../utils/logger';

/**
 * OAuth service for AtProto authentication using official @atproto/oauth-client-expo package
 *
 * This service provides client metadata fetching and client instance management.
 * The ExpoOAuthClient is exposed directly for callers to use the package API.
 *
 * The package handles:
 * - Session storage (automatic)
 * - Token refresh (automatic)
 * - DPoP token management
 * - Multi-account session management
 */
export class AtProtoOAuthService {
  private static instance: AtProtoOAuthService | null = null;
  private client: ExpoOAuthClient | null = null;

  private constructor() {}

  static getInstance(): AtProtoOAuthService {
    if (!AtProtoOAuthService.instance) {
      AtProtoOAuthService.instance = new AtProtoOAuthService();
    }
    return AtProtoOAuthService.instance;
  }

  /**
   * Fetch client metadata from the website
   */
  private async fetchClientMetadata(): Promise<ExpoOAuthClientOptions['clientMetadata']> {
    try {
      const response = await fetch('https://getorbyt.com/oauth-client-metadata.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch client metadata: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      logger.error('Failed to fetch client metadata', error, { component: 'OAuthService' });
      throw new Error('Failed to load OAuth client configuration');
    }
  }

  /**
   * Get or create the OAuth client instance
   * Exposes the client directly so callers can use the package API
   */
  async getClient(): Promise<ExpoOAuthClient> {
    if (!this.client) {
      const clientMetadata = await this.fetchClientMetadata();
      this.client = new ExpoOAuthClient({
        handleResolver: 'https://bsky.social',
        clientMetadata,
      });
    }
    return this.client;
  }

  /**
   * Clear the client instance
   *
   * WARNING: This should only be used when clearing ALL accounts (complete sign out).
   * The OAuth client package manages multiple sessions internally by DID, so clearing
   * the client during account switching is unnecessary and can cause issues.
   *
   * For single account sign out, use the package's revoke(did) method instead.
   * The client instance should persist across account switches to maintain access
   * to other saved accounts.
   */
  clearClient(): void {
    this.client = null;
  }
}
