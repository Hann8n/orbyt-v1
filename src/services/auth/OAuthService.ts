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

import { Agent } from '@atproto/api';
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

  private async ensureClientLoaded(pdsUrl?: string): Promise<void> {
    if (this.auth) return;
    const { ExpoOAuthClient } = await import('expo-atproto-auth');
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
      handleResolver: pdsUrl || 'https://bsky.social',
    });
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
      console.log('[OAuthService] Starting signIn with identifier:', identifier);
      await this.ensureClientLoaded();
      console.log('[OAuthService] Client loaded, initiating OAuth flow');
      
      const result = await this.auth.signIn(identifier);
      console.log('[OAuthService] OAuth result status:', result.status);

      if (result.status === 'success') {
        console.log('[OAuthService] OAuth success, getting token info');
        const tokenInfo = await result.session.getTokenInfo();
        
        const oauthSession: OAuthSession = {
          did: result.session.sub,
          accessToken: 'stored-in-library',
          refreshToken: 'stored-in-library',
          expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
        };

        // Store the OAuth session and create an Agent with the OAuth session
        this.currentOAuthSession = result.session;
        this.currentAgent = new Agent(result.session);
        console.log('[OAuthService] Session created for DID:', result.session.sub);

        return oauthSession;
      } else if (result.status === 'error') {
        const errorMsg = `OAuth error: ${JSON.stringify(result.error)}`;
        console.error('[OAuthService] OAuth error:', errorMsg);
        throw new Error(errorMsg);
      } else {
        const errorMsg = `Authentication failed with status: ${result.status}`;
        console.error('[OAuthService] Authentication failed:', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown OAuth error';
      console.error('[OAuthService] SignIn failed:', {
        identifier,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Start OAuth flow with specific PDS URL
   */
  async signInWithPDS(identifier: string, pdsUrl: string): Promise<OAuthSession> {
    try {
      console.log('[OAuthService] Starting signInWithPDS with identifier:', identifier, 'PDS:', pdsUrl);
      await this.ensureClientLoaded(pdsUrl);
      console.log('[OAuthService] Client loaded with PDS, initiating OAuth flow');
      
      const result = await this.auth.signIn(identifier);
      console.log('[OAuthService] OAuth result status:', result.status);

      if (result.status === 'success') {
        console.log('[OAuthService] OAuth success, getting token info');
        const tokenInfo = await result.session.getTokenInfo();
        
        const oauthSession: OAuthSession = {
          did: result.session.sub,
          accessToken: 'stored-in-library',
          refreshToken: 'stored-in-library',
          expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
        };

        console.log('[OAuthService] Session created for DID:', result.session.sub);
        this.currentOAuthSession = result.session;
        this.currentAgent = new Agent(result.session);

        return oauthSession;
      } else if (result.status === 'error') {
        const errorMsg = `OAuth error: ${JSON.stringify(result.error)}`;
        console.error('[OAuthService] OAuth error:', errorMsg);
        throw new Error(errorMsg);
      } else {
        const errorMsg = `Authentication failed with status: ${result.status}`;
        console.error('[OAuthService] Authentication failed:', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown OAuth error';
      console.error('[OAuthService] SignInWithPDS failed:', {
        identifier,
        pdsUrl,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Restore session from stored DID
   */
  async restoreSession(did: string, pdsUrl?: string): Promise<OAuthSession> {
    try {
      console.log('[OAuthService] Starting restoreSession for DID:', did, 'PDS:', pdsUrl || 'default');
      await this.ensureClientLoaded(pdsUrl);
      
      let restoredSession: any;
      try {
        console.log('[OAuthService] Attempting to restore session');
        restoredSession = await this.auth.restore(did);
        console.log('[OAuthService] Session restore result:', restoredSession ? 'success' : 'failed');
      } catch (err) {
        // Session restoration failure is expected when sessions expire
        console.warn('[OAuthService] Session restoration failed, re-auth required:', {
          did,
          pdsUrl,
          error: err instanceof Error ? err.message : 'Unknown error',
          stack: err instanceof Error ? err.stack : undefined
        });
        throw new Error('oauth_reauth_required');
      }
      
      if (!restoredSession) {
        console.warn('[OAuthService] No session returned from restore for DID:', did);
        throw new Error('oauth_reauth_required');
      }
      
      console.log('[OAuthService] Getting token info for restored session');
      const tokenInfo = await restoredSession.getTokenInfo();
      
      const oauthSession: OAuthSession = {
        did: restoredSession.sub,
        accessToken: 'stored-in-library',
        refreshToken: 'stored-in-library',
        expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
      };

      // Store the OAuth session and create an Agent with the OAuth session
      this.currentOAuthSession = restoredSession;
      this.currentAgent = new Agent(restoredSession);
      console.log('[OAuthService] Session restored for DID:', restoredSession.sub);

      return oauthSession;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown restore error';
      console.error('[OAuthService] RestoreSession failed:', {
        did,
        pdsUrl,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
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