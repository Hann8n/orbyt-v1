// Ensure minimal Event exists before dynamically importing oauth client in Expo Go
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = global as any;
if (typeof g.Event === 'undefined') {
  try {
    g.Event = class Event {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };
  } catch {}
}

import type { Agent } from '@atproto/api';
import type { ExpoOAuthClient } from 'expo-atproto-auth';
import type { OAuthSession } from './types';

/**
 * OAuth service using expo-atproto-auth with proper session management
 */
export class AtProtoOAuthService {
  private static instance: AtProtoOAuthService;
  private auth!: ExpoOAuthClient;
  private currentOAuthSession: any = null; // The actual OAuth session from expo-atproto-auth
  private currentAgent: Agent | null = null; // Agent created from OAuth session

  private constructor() {}

  private async ensureClientLoaded(): Promise<void> {
    if (this.auth) return;
    const [{ ExpoOAuthClient }, { Agent }] = await Promise.all([
      import('expo-atproto-auth'),
      import('@atproto/api'),
    ]);
    this.auth = new ExpoOAuthClient({
      clientMetadata: {
        client_id: 'https://getorbyt.com/oauth-client-metadata.json',
        client_name: 'orbyt',
        client_uri: 'https://getorbyt.com',
        logo_uri: 'https://getorbyt.com/TV-Raw.png',
        tos_uri: 'https://getorbyt.com/terms.html',
        policy_uri: 'https://getorbyt.com/privacy.html',
        redirect_uris: ['com.getorbyt:/oauth/callback'],
        scope: 'atproto transition:generic',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
        dpop_bound_access_tokens: true,
      },
      handleResolver: 'https://bsky.social',
    });
    // Create a dummy agent import to keep types available; actual instance created later
    void Agent;
  }

  public static getInstance(): AtProtoOAuthService {
    if (!AtProtoOAuthService.instance) {
      AtProtoOAuthService.instance = new AtProtoOAuthService();
    }
    return AtProtoOAuthService.instance;
  }

  /**
   * Start OAuth flow
   */
  async signIn(identifier: string = 'bsky.social'): Promise<OAuthSession> {
    try {
      await this.ensureClientLoaded();
      // Use the expo-atproto-auth library to handle the OAuth flow
      const result = await this.auth.signIn(identifier);

      if (result.status === 'success') {
        // Get token info from the session
        const tokenInfo = await result.session.getTokenInfo();
        
        // Convert to our session format
        const oauthSession: OAuthSession = {
          did: result.session.sub,
          accessToken: 'stored-in-library', // The library handles tokens internally
          refreshToken: 'stored-in-library', // The library handles tokens internally
          expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000, // 1 hour default
        };

        // Store the OAuth session and create an Agent with the OAuth session
        this.currentOAuthSession = result.session;
        const { Agent } = await import('@atproto/api');
        this.currentAgent = new Agent(result.session);

        return oauthSession;
      } else if (result.status === 'error') {
        throw new Error(`OAuth error: ${result.error}`);
      } else {
        throw new Error('Authentication was cancelled or failed');
      }

    } catch (error) {
      throw error;
    }
  }

  /**
   * Restore session from stored DID
   */
  async restoreSession(did: string): Promise<OAuthSession> {
    try {
      await this.ensureClientLoaded();
      // Use the expo-atproto-auth library to restore the session
      const restoredSession = await this.auth.restore(did);
      
      if (!restoredSession) {
        throw new Error('Failed to restore OAuth session - no session returned');
      }
      
      // Get token info from the restored session
      const tokenInfo = await restoredSession.getTokenInfo();
      
      // Check if the session is still valid
      if (tokenInfo.expiresAt && tokenInfo.expiresAt.getTime() < Date.now()) {
        console.warn('[OAuth] Session has expired, user needs to re-authenticate');
        throw new Error('Session expired and needs re-authentication');
      }
      
      // Convert to our session format
      const oauthSession: OAuthSession = {
        did: restoredSession.sub,
        accessToken: 'stored-in-library',
        refreshToken: 'stored-in-library',
        expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
      };

      // Store the OAuth session and create an Agent with the OAuth session
      this.currentOAuthSession = restoredSession;
      const { Agent } = await import('@atproto/api');
      this.currentAgent = new Agent(restoredSession);

      return oauthSession;
    } catch (error) {
      console.error('[OAuth] Failed to restore session:', error);
      // Clear any partial state
      this.currentOAuthSession = null;
      this.currentAgent = null;
      throw error;
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<OAuthSession | null> {
    if (this.currentOAuthSession) {
      try {
        const tokenInfo = await this.currentOAuthSession.getTokenInfo();
        
        return {
          did: this.currentOAuthSession.sub,
          accessToken: 'stored-in-library',
          refreshToken: 'stored-in-library',
          expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
        };
      } catch (error) {
        console.error('[OAuth] Failed to get current session:', error);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Get current OAuth session (for internal use)
   */
  async getCurrentOAuthSession(): Promise<any | null> {
    return this.currentOAuthSession;
  }

  /**
   * Get current Agent
   */
  async getCurrentAgent(): Promise<Agent | null> {
    if (this.currentAgent) {
      return this.currentAgent;
    }

    // Try to create agent from stored session
    if (this.currentOAuthSession) {
      try {
        const { Agent } = await import('@atproto/api');
        this.currentAgent = new Agent(this.currentOAuthSession);
        return this.currentAgent;
      } catch (error) {
        console.error('[OAuth] Failed to create agent from stored session:', error);
        // Clear invalid session
        await this.signOut();
        return null;
      }
    }

    return null;
  }

  /**
   * Get the current user's profile information
   */
  async getCurrentUserProfile(): Promise<any | null> {
    try {
      const agent = await this.getCurrentAgent();
      if (!agent) {
        return null;
      }

      const session = await this.getCurrentSession();
      if (!session) {
        return null;
      }

      // Get the user's profile using the agent
      const response = await agent.api.app.bsky.actor.getProfile({
        actor: session.did
      });

      return response.data;
    } catch (error) {
      console.error('[OAuth] Failed to get current user profile:', error);
      return null;
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    this.currentOAuthSession = null;
    this.currentAgent = null;
  }

  /**
   * Make authenticated request using the OAuth Agent
   */
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const agent = await this.getCurrentAgent();
    if (!agent) {
      throw new Error('No active session');
    }

    // For direct HTTP requests, we can get the OAuth session from our stored instance
    // Most API calls should use the agent.api methods instead
    const oauthSession = await this.getCurrentOAuthSession();
    if (oauthSession && typeof oauthSession.fetchHandler === 'function') {
      return oauthSession.fetchHandler(url, options);
    }
    
    // Fallback to fetch if available
    return fetch(url, options);
  }
}
