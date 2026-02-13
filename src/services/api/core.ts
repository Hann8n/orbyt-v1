/**
 * Atproto Core Service
 * Shared functionality for API client and session management
 * This module is imported by namespace services to avoid circular dependencies
 */

import type { ApiClient, Session } from './types';
import type { Agent } from '@atproto/api';

/**
 * Small helper to wait until the userStore finishes auth/switching and exposes an agent.
 * This prevents request spam and avoids throwing during session transitions.
 */
async function waitForAgent(timeoutMs: number = 6000): Promise<Agent | null> {
  const { useUserStore } = await import('../../stores/userStore');
  const start = Date.now();

  return new Promise(resolve => {
    const checkAndResolve = (state = useUserStore.getState()) => {
      if (state.agent) {
        unsubscribe();
        // Return Agent directly - agent.api is deprecated, use agent directly
        resolve(state.agent);
        return;
      }

      const elapsed = Date.now() - start;
      const readyState = !state.isAuthenticating && !state.isSwitchingAccount;
      if (readyState || elapsed >= timeoutMs) {
        unsubscribe();
        resolve(null);
      }
    };

    const unsubscribe = useUserStore.subscribe(checkAndResolve);
    // Immediate check in case agent already exists
    checkAndResolve();
  });
}

/**
 * Core service providing shared API client and session management
 * This is imported by namespace services instead of AtprotoService to avoid cycles
 */
export class AtprotoCore {
  /**
   * Ensures a valid session exists (OAuth or app password)
   * This optimized version prevents duplicate session checks when multiple
   * queries fire at once
   */
  static async ensureSession(): Promise<Session> {
    try {
      const { useUserStore } = await import('../../stores/userStore');
      const state = useUserStore.getState();

      if (state.agent && state.currentUser?.did) {
        return { did: state.currentUser.did, type: 'oauth' };
      }

      // Wait briefly if a session is being restored/switched
      const waited = await waitForAgent();
      if (waited && useUserStore.getState().currentUser?.did) {
        return { did: useUserStore.getState().currentUser!.did!, type: 'oauth' };
      }

      throw new Error('No valid session found');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMsg);
    }
  }

  /**
   * Get the current user's DID from session (OAuth or app password)
   */
  static async getCurrentUserDid(): Promise<string | null> {
    try {
      const { useUserStore } = await import('../../stores/userStore');
      const userStore = useUserStore.getState();

      if (userStore.currentUser?.did) {
        return userStore.currentUser.did;
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Get the API client (OAuth or app password)
   * Gets the current Agent from userStore
   * OAuthSession.fetchHandler automatically refreshes tokens via getTokenSet('auto')
   * Returns null if no session is available (instead of throwing)
   */
  static async getApiClient(): Promise<ApiClient> {
    try {
      const { useUserStore } = await import('../../stores/userStore');
      const state = useUserStore.getState();

      if (state.agent) {
        // Use agent directly - agent.api is deprecated but still works for compatibility
        return { api: state.agent.api, isOAuth: true };
      }

      // Wait for the session to finish restoring/switching before failing
      const waited = await waitForAgent();
      if (waited) {
        return { api: waited.api, isOAuth: true };
      }

      throw new Error('No API client available');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMsg);
    }
  }
}
