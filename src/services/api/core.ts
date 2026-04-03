/**
 * Atproto Core Service
 * Shared functionality for API client and session management
 * This module is imported by namespace services to avoid circular dependencies
 */

import type { ApiClient, Session } from './types';
import type { Agent } from '@atproto/api';

import { getAtprotoBridge } from './agentBridge';

/**
 * Wait until userStore exposes an agent (session restore / account switch).
 * Dynamic import is isolated here — not on the getApiClient hot path.
 */
async function waitForAgent(timeoutMs: number = 6000): Promise<Agent | null> {
  const { agent: bridged } = getAtprotoBridge();
  if (bridged) return bridged;

  const { useUserStore } = await import('../../stores/userStore');
  const start = Date.now();

  return new Promise(resolve => {
    const checkAndResolve = (state = useUserStore.getState()) => {
      const fromBridge = getAtprotoBridge().agent;
      if (fromBridge) {
        unsubscribe();
        resolve(fromBridge);
        return;
      }
      if (state.agent) {
        unsubscribe();
        resolve(state.agent);
        return;
      }

      const elapsed = Date.now() - start;
      const readyState = !state.isAuthenticating && !state.isSwitchingAccount;
      if (readyState || elapsed >= timeoutMs) {
        unsubscribe();
        resolve(getAtprotoBridge().agent);
      }
    };

    const unsubscribe = useUserStore.subscribe(checkAndResolve);
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
      const { agent, did } = getAtprotoBridge();
      if (agent && did) {
        return { did, type: 'oauth' };
      }

      await waitForAgent();
      const after = getAtprotoBridge();
      if (after.agent && after.did) {
        return { did: after.did, type: 'oauth' };
      }

      throw new Error('No valid session found');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMsg);
    }
  }

  /**
   * Current user DID from the session bridge (OAuth). Synchronous mirror of store state.
   */
  static getCurrentUserDid(): string | null {
    return getAtprotoBridge().did;
  }

  /**
   * Get the API client (OAuth or app password)
   * Gets the current Agent from userStore
   * OAuthSession.fetchHandler automatically refreshes tokens via getTokenSet('auto')
   * Returns null if no session is available (instead of throwing)
   */
  static async getApiClient(): Promise<ApiClient> {
    try {
      const { agent } = getAtprotoBridge();

      if (agent) {
        return { api: agent.api, isOAuth: true };
      }

      const resolved = await waitForAgent();
      if (resolved) {
        return { api: resolved.api, isOAuth: true };
      }

      throw new Error('No API client available');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMsg);
    }
  }
}
