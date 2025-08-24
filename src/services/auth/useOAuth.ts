import { useState, useEffect, useCallback } from 'react';
import { AtProtoOAuthService } from './OAuthService';
import type { AuthState } from './types';

export interface UseOAuthResult {
  session: AuthState['session'];
  isLoading: AuthState['isLoading'];
  isSigningIn: AuthState['isSigningIn'];
  error: AuthState['error'];
  signIn: (identifier?: string) => Promise<void>;
  signOut: () => Promise<void>;
  restoreSession: (did: string) => Promise<void>;
  makeAuthenticatedRequest: (url: string, options?: RequestInit) => Promise<Response>;
}

/**
 * React hook for atproto OAuth authentication
 */
export function useOAuth(): UseOAuthResult {
  const [state, setState] = useState<AuthState>({
    session: null,
    isLoading: true,
    isSigningIn: false,
    error: null,
  });

  const oauthService = AtProtoOAuthService.getInstance();

  // Load existing session on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true }));
        const existingSession = await oauthService.getCurrentSession();
        setState(prev => ({ 
          ...prev, 
          session: existingSession,
          isLoading: false 
        }));
      } catch (err) {
        console.error('Failed to load session:', err);
        setState(prev => ({ 
          ...prev, 
          error: err instanceof Error ? err.message : 'Failed to load session',
          isLoading: false 
        }));
      }
    };

    loadSession();
  }, []);

  const signIn = useCallback(async (identifier: string = 'bsky.social') => {
    try {
      setState(prev => ({ 
        ...prev, 
        isSigningIn: true, 
        error: null 
      }));
      
      const session = await oauthService.signIn(identifier);
      
      setState(prev => ({ 
        ...prev, 
        session,
        isSigningIn: false 
      }));
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Sign in failed',
        isSigningIn: false 
      }));
      throw err;
    }
  }, []);

  const restoreSession = useCallback(async (did: string) => {
    try {
      setState(prev => ({ 
        ...prev, 
        isLoading: true, 
        error: null 
      }));
      
      const session = await oauthService.restoreSession(did);
      
      setState(prev => ({ 
        ...prev, 
        session,
        isLoading: false 
      }));
    } catch (err) {
      console.error('Session restoration failed:', err);
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Session restoration failed',
        isLoading: false 
      }));
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await oauthService.signOut();
      setState(prev => ({ ...prev, session: null }));
    } catch (err) {
      console.error('Sign out failed:', err);
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Sign out failed' 
      }));
    }
  }, []);

  const makeAuthenticatedRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    return await oauthService.makeAuthenticatedRequest(url, options);
  }, []);

  return {
    session: state.session,
    isLoading: state.isLoading,
    isSigningIn: state.isSigningIn,
    error: state.error,
    signIn,
    signOut,
    restoreSession,
    makeAuthenticatedRequest,
  };
}
