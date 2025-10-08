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
 * Completely refactored AtProto OAuth service for Orbyt
 * Based on expo-atproto-auth library
 */
export class AtProtoOAuthService {
  private static instance: AtProtoOAuthService;
  private auth: ExpoOAuthClient | null = null;
  private currentOAuthSession: any = null;
  private currentAgent: Agent | null = null;
  
  // Singleton pattern
  private constructor() {}
  
  public static getInstance(): AtProtoOAuthService {
    if (!AtProtoOAuthService.instance) {
      AtProtoOAuthService.instance = new AtProtoOAuthService();
    }
    return AtProtoOAuthService.instance;
  }
  
  /**
   * Initialize a fresh client for each operation
   * This prevents session conflicts and corruption
   */
  private async createClient(pdsUrl: string = 'https://bsky.social'): Promise<ExpoOAuthClient> {
    try {
      console.log('[OAuthService] Creating new client for PDS:', pdsUrl);
      const { ExpoOAuthClient } = await import('expo-atproto-auth');
      
      return new ExpoOAuthClient({
        clientMetadata: {
          client_id: 'https://getorbyt.com/oauth-client-metadata.json',
          client_name: 'orbyt',
          client_uri: 'https://getorbyt.com',
          logo_uri: 'https://getorbyt.com/TV-Raw.png',
          tos_uri: 'https://getorbyt.com/terms.html',
          policy_uri: 'https://getorbyt.com/privacy.html',
          redirect_uris: ['com.getorbyt:/oauth/callback'], // Single slash is correct
          scope: 'atproto transition:generic',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'native',
          dpop_bound_access_tokens: true,
        },
        handleResolver: pdsUrl,
      });
    } catch (error) {
      console.error('[OAuthService] Failed to create client:', error);
      throw error;
    }
  }
  
  /**
   * Sign in with OAuth
   * Creates a fresh client for each sign-in attempt
   */
  async signIn(identifier: string, pdsUrl?: string): Promise<OAuthSession> {
    const resolvedPdsUrl = pdsUrl || 'https://bsky.social';
    console.log('[OAuthService] Starting sign-in for:', identifier, 'PDS:', resolvedPdsUrl);
    
    try {
      // Always create a fresh client for sign-in
      const client = await this.createClient(resolvedPdsUrl);
      
      // Start OAuth flow
      const result = await client.signIn(identifier);
      console.log('[OAuthService] Sign-in result status:', result.status);
      
      if (result.status === 'success') {
        // Store session and create agent
        this.auth = client;
        this.currentOAuthSession = result.session;
        this.currentAgent = new Agent(result.session);
        
        // Get token info
        const tokenInfo = await result.session.getTokenInfo();
        console.log('[OAuthService] Session created for DID:', result.session.sub);
        
        return {
          did: result.session.sub,
          accessToken: 'stored-in-library',
          refreshToken: 'stored-in-library',
          expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
        };
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
      console.error('[OAuthService] Sign-in failed:', {
        identifier,
        pdsUrl: resolvedPdsUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  /**
   * Restore session
   * Creates a fresh client for each restore attempt
   */
  async restoreSession(did: string, pdsUrl?: string): Promise<OAuthSession> {
    const resolvedPdsUrl = pdsUrl || 'https://bsky.social';
    console.log('[OAuthService] Restoring session for DID:', did, 'PDS:', resolvedPdsUrl);
    
    try {
      // Always create a fresh client for session restoration
      const client = await this.createClient(resolvedPdsUrl);
      
      try {
        // Attempt to restore the session
        const restoredSession = await client.restore(did);
        
        if (!restoredSession) {
          console.warn('[OAuthService] No session found for DID:', did);
          throw new Error('oauth_reauth_required');
        }
        
        // Store session and create agent
        this.auth = client;
        this.currentOAuthSession = restoredSession;
        this.currentAgent = new Agent(restoredSession);
        
        // Get token info
        const tokenInfo = await restoredSession.getTokenInfo();
        console.log('[OAuthService] Session restored for DID:', restoredSession.sub);
        
        return {
          did: restoredSession.sub,
          accessToken: 'stored-in-library',
          refreshToken: 'stored-in-library',
          expiresAt: tokenInfo.expiresAt ? tokenInfo.expiresAt.getTime() : Date.now() + 3600000,
        };
      } catch (restoreError) {
        // Handle specific restoration errors
        const errorMsg = restoreError instanceof Error ? restoreError.message : 'Unknown restore error';
        
        if (errorMsg.includes('deleted by another process') || 
            errorMsg.includes('TokenRefreshError')) {
          console.warn('[OAuthService] Session corruption detected:', errorMsg);
          this.clearSession();
        }
        
        console.error('[OAuthService] Session restoration failed:', {
          did,
          pdsUrl: resolvedPdsUrl,
          error: errorMsg,
        });
        
        throw new Error('oauth_reauth_required');
      }
    } catch (error) {
      console.error('[OAuthService] Restore session operation failed:', {
        did,
        pdsUrl: resolvedPdsUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
  
  /**
   * Check if a session is valid without loading it
   */
  async hasValidSession(did: string, pdsUrl?: string): Promise<boolean> {
    try {
      const resolvedPdsUrl = pdsUrl || 'https://bsky.social';
      console.log('[OAuthService] Checking session validity for DID:', did);
      
      // Create a fresh client for validation
      const client = await this.createClient(resolvedPdsUrl);
      
      try {
        // Attempt to restore but don't store the session
        const session = await client.restore(did);
        if (!session) {
          return false;
        }
        
        // Check token expiration
        const tokenInfo = await session.getTokenInfo();
        const now = Date.now();
        
        if (tokenInfo.expiresAt && tokenInfo.expiresAt.getTime() < now + 5 * 60 * 1000) {
          console.log('[OAuthService] Session expired or expires soon for DID:', did);
          return false;
        }
        
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        // Check for session corruption
        if (errorMsg.includes('deleted by another process') || 
            errorMsg.includes('TokenRefreshError')) {
          console.warn('[OAuthService] Session corruption detected during validation:', errorMsg);
          // Clear our internal state to be safe
          this.clearSession();
        }
        
        console.warn('[OAuthService] Session validation failed:', {
          did,
          error: errorMsg
        });
        return false;
      }
    } catch (error) {
      console.error('[OAuthService] Session validation operation failed:', error);
      return false;
    }
  }
  
  /**
   * Clear current session state
   */
  clearSession(): void {
    console.log('[OAuthService] Clearing session state');
    this.auth = null;
    this.currentOAuthSession = null;
    this.currentAgent = null;
  }
  
  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    this.clearSession();
  }
  
  /**
   * Get current OAuth session
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
        this.clearSession();
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
      const session = this.currentOAuthSession;
      
      if (!agent || !session) {
        return null;
      }
      
      const response = await agent.api.app.bsky.actor.getProfile({
        actor: session.sub
      });
      
      return response.data;
    } catch (error) {
      console.error('[OAuthService] Failed to get user profile:', error);
      return null;
    }
  }
  
  /**
   * Make authenticated request
   */
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const agent = await this.getCurrentAgent();
    if (!agent) {
      throw new Error('No active session');
    }
    
    const oauthSession = this.currentOAuthSession;
    if (oauthSession && typeof oauthSession.fetchHandler === 'function') {
      return oauthSession.fetchHandler(url, options);
    }
    
    return fetch(url, options);
  }
}