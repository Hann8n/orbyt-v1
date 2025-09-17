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
    await this.ensureClientLoaded();
    const result = await this.auth.signIn(identifier);

    if (result.status === 'success') {
      const tokenInfo = await result.session.getTokenInfo();
      
      const oauthSession: OAuthSession = {
        did: result.session.sub,
        accessToken: 'stored-in-library',
        refreshToken: 'stored-in-library',
        expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
      };

      this.currentOAuthSession = result.session;
      const { Agent } = await import('@atproto/api');
      this.currentAgent = new Agent(result.session);

      return oauthSession;
    } else if (result.status === 'error') {
      throw new Error(`OAuth error: ${result.error}`);
    } else {
      throw new Error('Authentication was cancelled or failed');
    }
  }

  /**
   * Restore session from stored DID
   */
  async restoreSession(did: string): Promise<OAuthSession> {
    await this.ensureClientLoaded();
    const restoredSession = await this.auth.restore(did);
    
    if (!restoredSession) {
      throw new Error('Failed to restore OAuth session - no session returned');
    }
    
    const tokenInfo = await restoredSession.getTokenInfo();
    
    // Check if the session is still valid
    if (tokenInfo.expiresAt && tokenInfo.expiresAt.getTime() < Date.now()) {
      throw new Error('Session expired and needs re-authentication');
    }
    
    const oauthSession: OAuthSession = {
      did: restoredSession.sub,
      accessToken: 'stored-in-library',
      refreshToken: 'stored-in-library',
      expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
    };

    this.currentOAuthSession = restoredSession;
    const { Agent } = await import('@atproto/api');
    this.currentAgent = new Agent(restoredSession);

    return oauthSession;
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<OAuthSession | null> {
    if (!this.currentOAuthSession) return null;
    
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
    if (this.currentAgent) return this.currentAgent;

    if (!this.currentOAuthSession) return null;
    
    try {
      const { Agent } = await import('@atproto/api');
      this.currentAgent = new Agent(this.currentOAuthSession);
      return this.currentAgent;
    } catch (error) {
      console.error('[OAuth] Failed to create agent from stored session:', error);
      this.signOut();
      return null;
    }
  }

  /**
   * Get the current user's profile information
   */
  async getCurrentUserProfile(): Promise<any | null> {
    const agent = await this.getCurrentAgent();
    const session = await this.getCurrentSession();
    
    if (!agent || !session) return null;

    try {
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
    const oauthSession = await this.getCurrentOAuthSession();
    if (!oauthSession) {
      throw new Error('No active session');
    }

    if (typeof oauthSession.fetchHandler === 'function') {
      return oauthSession.fetchHandler(url, options);
    }
    
    return fetch(url, options);
  }
}
