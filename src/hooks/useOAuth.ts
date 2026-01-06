/**
 * Simplified OAuth Hook
 * Leverages @atproto/oauth-client-expo package features for cleaner OAuth management
 */

import { useState, useCallback } from 'react';
import { AtProtoOAuthService } from '../services/auth';
import { analyzeOAuthError, handleOAuthError } from '../utils/errors/oauth';

export interface OAuthState {
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  error: string | null;
  session: any | null;
}

export interface OAuthActions {
  signIn: (identifier: string) => Promise<void>;
  signOut: () => Promise<void>;
  restoreSession: (did: string, pdsUrl?: string) => Promise<void>;
  clearError: () => void;
}

export function useOAuth(): OAuthState & OAuthActions {
  const [state, setState] = useState<OAuthState>({
    isAuthenticated: false,
    isAuthenticating: false,
    error: null,
    session: null,
  });

  const oauthService = AtProtoOAuthService.getInstance();

  const signIn = useCallback(
    async (identifier: string) => {
      setState(prev => ({ ...prev, isAuthenticating: true, error: null }));

      try {
        const session = await oauthService.signIn(identifier);

        setState({
          isAuthenticated: true,
          isAuthenticating: false,
          error: null,
          session,
        });
      } catch (error) {
        const errorInfo = analyzeOAuthError(error);

        setState({
          isAuthenticated: false,
          isAuthenticating: false,
          error: errorInfo.userFriendlyMessage,
          session: null,
        });

        // Don't throw for user cancellations
        if (!errorInfo.isUserCancellation) {
          throw error;
        }
      }
    },
    [oauthService]
  );

  const signOut = useCallback(async () => {
    setState(prev => ({ ...prev, isAuthenticating: true }));

    try {
      await oauthService.signOut();

      setState({
        isAuthenticated: false,
        isAuthenticating: false,
        error: null,
        session: null,
      });
    } catch (error) {
      handleOAuthError(error, 'sign out');

      setState({
        isAuthenticated: false,
        isAuthenticating: false,
        error: 'Failed to sign out',
        session: null,
      });
    }
  }, [oauthService]);

  const restoreSession = useCallback(
    async (did: string, pdsUrl?: string) => {
      setState(prev => ({ ...prev, isAuthenticating: true, error: null }));

      try {
        const session = await oauthService.getValidSession(did, pdsUrl);

        setState({
          isAuthenticated: true,
          isAuthenticating: false,
          error: null,
          session,
        });
      } catch (error) {
        const errorInfo = analyzeOAuthError(error);

        setState({
          isAuthenticated: false,
          isAuthenticating: false,
          error: errorInfo.userFriendlyMessage,
          session: null,
        });

        throw error;
      }
    },
    [oauthService]
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    signIn,
    signOut,
    restoreSession,
    clearError,
  };
}
