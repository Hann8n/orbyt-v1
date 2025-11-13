import { ExpoOAuthClient } from '@atproto/oauth-client-expo';
import { Agent } from '@atproto/api';
import { logger } from '../../utils/logger';

/**
 * OAuth service for AtProto authentication using official @atproto/oauth-client-expo package
 * 
 * This service provides a clean interface for OAuth authentication with AtProto,
 * using the official @atproto/oauth-client-expo package for session management.
 * 
 * Key features:
 * - Built-in Session Management
 * - Automatic token refresh
 * - DPoP token management
 * - Secure Storage by the @atproto/oauth-client-expo package
 * - Support for custom PDS instances
 * - Multi-account session management
 */
export class AtProtoOAuthService {
  private static instance: AtProtoOAuthService | null = null;
  private client: ExpoOAuthClient | null = null;
  private clientMetadata: any | null = null;

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
  private async fetchClientMetadata(): Promise<any> {
    if (this.clientMetadata) {
      return this.clientMetadata;
    }

    try {
      const response = await fetch('https://getorbyt.com/oauth-client-metadata.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch client metadata: ${response.status}`);
      }
      this.clientMetadata = await response.json();
      return this.clientMetadata;
    } catch (error) {
      logger.error('Failed to fetch client metadata', error, { component: 'OAuthService' });
      throw new Error('Failed to load OAuth client configuration');
    }
  }

  /**
   * Create and configure the OAuth client
   */
  private async createClient(): Promise<ExpoOAuthClient> {
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
   * Sign in with a handle, DID, or PDS URL
   */
  async signIn(identifier: string): Promise<any> {
    try {
      const client = await this.createClient();
      
      const result = await client.signIn(identifier);
      
      // The new package returns the session directly, not wrapped in a status object
      if (result && result.sub) {
        return result;
      } else if (result.status === 'error') {
        const errorMsg = `Authentication failed: ${result.error}`;
        logger.error('Authentication failed', { component: 'OAuthService', error: errorMsg });
        throw new Error(errorMsg);
      } else if (result.status === 'cancel') {
        throw new Error('User cancelled authentication');
      } else {
        // Handle other cases
        const errorMsg = `Authentication failed with unexpected result format`;
        logger.error('Authentication failed', { component: 'OAuthService', error: errorMsg });
        throw new Error(errorMsg);
      }
    } catch (error) {
      logger.error('Sign-in failed', error, { component: 'OAuthService', identifier });
      throw error;
    }
  }

  /**
   * Restore a session using a DID
   */
  async restoreSession(did: string, pdsUrl?: string): Promise<any> {
    try {
      const client = await this.createClient();
      
      const session = await client.restore(did);
      
      if (session) {
        return session;
      } else {
        throw new Error('No session found for the provided DID');
      }
    } catch (error) {
      logger.error('Restore session operation failed', error, { component: 'OAuthService', did, pdsUrl });
      throw error;
    }
  }

  /**
   * Check if there's a valid session for a DID
   */
  async hasValidSession(did: string, pdsUrl?: string): Promise<boolean> {
    try {
      const session = await this.restoreSession(did, pdsUrl);
      return !!session;
    } catch {
      return false;
    }
  }

  /**
   * Validate session health by making a test API call
   */
  async validateSessionHealth(session: any): Promise<boolean> {
    try {
      if (!session || !session.sub) {
        return false;
      }

      // Create a temporary agent to test the session
      const agent = new Agent(session);
      
      // Make a simple API call to verify the session is still valid
      await agent.api.app.bsky.actor.getProfile({
        actor: session.sub
      });
      
      return true;
    } catch (error) {
      logger.debug('Session health check failed', { component: 'OAuthService', error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  /**
   * Get session with automatic refresh if needed
   */
  async getValidSession(did: string, pdsUrl?: string, forceRefresh: boolean = false): Promise<any> {
    try {
      const client = await this.createClient();
      
      // Try to restore session (with optional force refresh)
      const session = await client.restore(did, forceRefresh);
      
      if (!session) {
        throw new Error('No session found for the provided DID');
      }

      // Validate session health
      const isHealthy = await this.validateSessionHealth(session);
      
      if (!isHealthy) {
        // Try to refresh the session
        if (!forceRefresh) {
          logger.debug('Session unhealthy, attempting refresh', { component: 'OAuthService', did });
          return await this.getValidSession(did, pdsUrl, true);
        } else {
          throw new Error('Session is invalid and could not be refreshed');
        }
      }

      return session;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if this is an expected session expiration error
      const isSessionExpired = errorMessage.includes('deleted by another process') ||
                               errorMessage.includes('TokenRefreshError') ||
                               errorMessage.includes('Session expired') ||
                               errorMessage.includes('No session found');
      
      if (isSessionExpired) {
        // Use DEBUG level for expected session expiration
        logger.debug('Session expired or deleted', { 
          component: 'OAuthService', 
          did, 
          pdsUrl, 
          forceRefresh,
          error: errorMessage 
        });
        // Throw a specific error that can be handled gracefully
        const expiredError = new Error('Session expired');
        (expiredError as any).isSessionExpired = true;
        throw expiredError;
      }
      
      // Log unexpected errors at ERROR level
      logger.error('Failed to get valid session', error, { component: 'OAuthService', did, pdsUrl, forceRefresh });
      throw error;
    }
  }

  /**
   * Remove a session
   */
  async removeSession(did: string): Promise<void> {
    try {
      // The @atproto/oauth-client-expo library manages session storage automatically
      // When a user signs out or switches accounts, the OAuth client handles cleanup
    } catch (error) {
      logger.error('Failed to remove session', error, { component: 'OAuthService', did });
      throw error;
    }
  }

  /**
   * Sign out and clear client state
   */
  async signOut(): Promise<void> {
    try {
      // The OAuth client doesn't expose a revoke method yet
      // Clear the client instance to force recreation on next sign-in
      this.client = null;
      this.clientMetadata = null;
    } catch (error) {
      logger.error('Failed to sign out', error, { component: 'OAuthService' });
      throw error;
    }
  }

}