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
 * Modern OAuth service with clean architecture
 * No backwards compatibility - optimized for current implementation
 */
export class AtProtoOAuthService {
  private static instance: AtProtoOAuthService;
  private auth!: ExpoOAuthClient;
  private currentOAuthSession: any = null;
  private currentAgent: Agent | null = null;

  private constructor() {}

  /**
   * Initialize OAuth client with specific PDS URL
   * Always creates a fresh client to ensure correct PDS resolution
   */
  private async initializeClient(pdsUrl: string = 'https://bsky.social'): Promise<void> {
    const { ExpoOAuthClient } = await import('expo-atproto-auth');
    
    // Clear any existing client to prevent conflicts
    if (this.auth) {
      console.log('[OAuthService] Clearing existing client to prevent conflicts');
      this.auth = null as any;
    }
    
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
      handleResolver: pdsUrl,
    });
    
    console.log('[OAuthService] Client initialized with PDS:', pdsUrl);
  }

  public static getInstance(): AtProtoOAuthService {
    if (!AtProtoOAuthService.instance) {
      AtProtoOAuthService.instance = new AtProtoOAuthService();
    }
    return AtProtoOAuthService.instance;
  }

  /**
   * Sign in with OAuth - clean implementation
   */
  async signIn(identifier: string, pdsUrl?: string): Promise<OAuthSession> {
    const resolvedPdsUrl = pdsUrl || 'https://bsky.social';
    
    try {
      console.log('[OAuthService] Starting OAuth flow for:', identifier, 'PDS:', resolvedPdsUrl);
      await this.initializeClient(resolvedPdsUrl);
      
      const result = await this.auth.signIn(identifier);
      
      if (result.status === 'success') {
        return this.handleSuccessfulAuth(result.session, resolvedPdsUrl);
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
        pdsUrl: resolvedPdsUrl,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Clear corrupted session storage
   */
  private async clearCorruptedSessions(): Promise<void> {
    try {
      console.log('[OAuthService] Attempting to clear corrupted session storage...');
      
      // Clear our internal state
      this.currentOAuthSession = null;
      this.currentAgent = null;
      
      // Note: The OAuth library manages its own internal storage
      // We can't directly clear it, but clearing our state forces re-authentication
      console.log('[OAuthService] Internal session state cleared successfully');
    } catch (error) {
      console.warn('[OAuthService] Failed to clear session storage:', error);
    }
  }

  /**
   * Restore session - improved with corruption handling
   */
  async restoreSession(did: string, pdsUrl?: string): Promise<OAuthSession> {
    const resolvedPdsUrl = pdsUrl || 'https://bsky.social';
    
    try {
      console.log('[OAuthService] === SESSION RESTORATION START ===');
      console.log('[OAuthService] DID:', did);
      console.log('[OAuthService] PDS URL:', resolvedPdsUrl);
      console.log('[OAuthService] Environment:', __DEV__ ? 'development' : 'production');
      
      console.log('[OAuthService] Initializing client...');
      await this.initializeClient(resolvedPdsUrl);
      console.log('[OAuthService] Client initialized successfully');
      
      console.log('[OAuthService] Attempting to restore session...');
      const restoredSession = await this.auth.restore(did);
      
      if (!restoredSession) {
        console.log('[OAuthService] ❌ No session found for DID:', did);
        console.log('[OAuthService] === SESSION RESTORATION FAILED ===');
        throw new Error('oauth_reauth_required');
      }
      
      console.log('[OAuthService] ✅ Session restored successfully for DID:', did);
      console.log('[OAuthService] Processing successful auth...');
      const result = this.handleSuccessfulAuth(restoredSession, resolvedPdsUrl);
      console.log('[OAuthService] === SESSION RESTORATION SUCCESS ===');
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown restore error';
      console.error('[OAuthService] ❌ SESSION RESTORATION FAILED');
      console.error('[OAuthService] DID:', did);
      console.error('[OAuthService] PDS URL:', resolvedPdsUrl);
      console.error('[OAuthService] Error message:', errorMsg);
      console.error('[OAuthService] Error stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('[OAuthService] Error type:', typeof error);
      console.error('[OAuthService] Full error object:', error);
      
      // Check if this is a "session deleted by another process" error
      if (errorMsg.includes('session was deleted by another process') || 
          errorMsg.includes('TokenRefreshError') ||
          errorMsg.includes('deleted by another process')) {
        console.log('[OAuthService] Detected corrupted session storage, clearing...');
        await this.clearCorruptedSessions();
      }
      
      // Always throw oauth_reauth_required for session restoration failures
      throw new Error('oauth_reauth_required');
    }
  }

  /**
   * Handle successful authentication - centralized logic
   */
  private handleSuccessfulAuth(session: any, pdsUrl: string): OAuthSession {
    try {
      const tokenInfo = session.getTokenInfo();
      
      const oauthSession: OAuthSession = {
        did: session.sub,
        accessToken: 'stored-in-library',
        refreshToken: 'stored-in-library',
        expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
      };

      // Store session and create agent
      this.currentOAuthSession = session;
      this.currentAgent = new Agent(session);
      
      console.log('[OAuthService] Authentication successful for DID:', session.sub);
      return oauthSession;
    } catch (error) {
      console.error('[OAuthService] Failed to process successful auth:', error);
      throw new Error('Failed to process authentication result');
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<OAuthSession | null> {
    if (!this.currentOAuthSession) {
      return null;
    }

    try {
      const tokenInfo = await this.currentOAuthSession.getTokenInfo();
      
      return {
        did: this.currentOAuthSession.sub,
        accessToken: 'stored-in-library',
        refreshToken: 'stored-in-library',
        expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
      };
    } catch (error) {
      console.error('[OAuthService] Failed to get current session:', error);
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
    if (this.currentAgent) {
      return this.currentAgent;
    }

    if (this.currentOAuthSession) {
      try {
        this.currentAgent = new Agent(this.currentOAuthSession);
        return this.currentAgent;
      } catch (error) {
        console.error('[OAuthService] Failed to create agent from session:', error);
        await this.signOut();
        return null;
      }
    }

    return null;
  }

  /**
   * Get current user profile
   */
  async getCurrentUserProfile(): Promise<any | null> {
    try {
      const agent = await this.getCurrentAgent();
      const session = await this.getCurrentSession();
      
      if (!agent || !session) {
        return null;
      }

      const response = await agent.api.app.bsky.actor.getProfile({
        actor: session.did
      });

      return response.data;
    } catch (error) {
      console.error('[OAuthService] Failed to get user profile:', error);
      return null;
    }
  }

  /**
   * Check if current session is valid and healthy
   */
  async isSessionHealthy(): Promise<boolean> {
    if (!this.currentOAuthSession) {
      return false;
    }

    try {
      const tokenInfo = await this.currentOAuthSession.getTokenInfo();
      const now = Date.now();
      
      // Check if token is expired or expires soon (within 5 minutes)
      if (tokenInfo.expiresAt && tokenInfo.expiresAt.getTime() < now + 5 * 60 * 1000) {
        console.log('[OAuthService] Session expires soon or is expired');
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn('[OAuthService] Session health check failed:', error);
      return false;
    }
  }

  /**
   * Refresh session if needed
   */
  async refreshSessionIfNeeded(): Promise<boolean> {
    if (!(await this.isSessionHealthy())) {
      console.log('[OAuthService] Session needs refresh, but auto-refresh not implemented');
      return false;
    }
    return true;
  }

  /**
   * Check if a specific DID has a valid session without switching to it
   */
  async hasValidSession(did: string, pdsUrl?: string): Promise<boolean> {
    try {
      const resolvedPdsUrl = pdsUrl || 'https://bsky.social';
      console.log('[OAuthService] Checking session validity for DID:', did, 'PDS:', resolvedPdsUrl);
      
      await this.initializeClient(resolvedPdsUrl);
      const session = await this.auth.restore(did);
      
      if (!session) {
        console.log('[OAuthService] No session found for DID:', did);
        return false;
      }
      
      // Check if the session is valid by getting token info
      const tokenInfo = await session.getTokenInfo();
      const now = Date.now();
      
      // Check if token is expired or expires soon (within 5 minutes)
      if (tokenInfo.expiresAt && tokenInfo.expiresAt.getTime() < now + 5 * 60 * 1000) {
        console.log('[OAuthService] Session expires soon or is expired for DID:', did);
        return false;
      }
      
      console.log('[OAuthService] Valid session found for DID:', did);
      return true;
    } catch (error) {
      console.warn('[OAuthService] Session check failed for DID:', did, error);
      return false;
    }
  }

  /**
   * Sign out - clean state
   */
  async signOut(): Promise<void> {
    this.currentOAuthSession = null;
    this.currentAgent = null;
    console.log('[OAuthService] Signed out successfully');
  }

  /**
   * Make authenticated request
   */
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const agent = await this.getCurrentAgent();
    if (!agent) {
      throw new Error('No active session');
    }

    const oauthSession = await this.getCurrentOAuthSession();
    if (oauthSession && typeof oauthSession.fetchHandler === 'function') {
      return oauthSession.fetchHandler(url, options);
    }
    
    return fetch(url, options);
  }
}