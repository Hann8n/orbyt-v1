/**
 * Atproto Core Service
 * Shared functionality for API client and session management
 * This module is imported by namespace services to avoid circular dependencies
 */

import { logger } from '../../utils/logger';
import type { ApiClient, Session } from './types';

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
    // Since we now get the agent from userStore in getApiClient,
    // this method just needs to verify that we have a valid session
    try {
      const { useUserStore } = await import('../../stores/userStore');
      const userStore = useUserStore.getState();
      
      if (userStore.agent && userStore.currentUser?.did) {
        return { did: userStore.currentUser.did, type: 'oauth' };
      }
      
      throw new Error('No valid session found');
    } catch (error) {
      logger.error('Session check failed', error, { component: 'AtprotoCore' });
      throw error;
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
      
      logger.debug('No current user found', { component: 'AtprotoCore' });
      return null;
    } catch (error) {
      logger.error('Error getting current user DID', error, { component: 'AtprotoCore' });
      return null;
    }
  }

  /**
   * Get the API client (OAuth or app password)
   * Gets the current Agent from userStore
   * Returns null if no session is available (instead of throwing)
   */
  static async getApiClient(): Promise<ApiClient> {
    try {
      // Import userStore to get the current agent
      const { useUserStore } = await import('../../stores/userStore');
      const userStore = useUserStore.getState();
      
      // Check if session restoration is in progress
      if (userStore.isAuthenticating || userStore.isSwitchingAccount) {
        throw new Error('Session restoration in progress');
      }
      
      if (userStore.agent) {
        return { api: userStore.agent.api, isOAuth: true };
      }
      
      throw new Error('No API client available');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      // Only log unexpected errors at ERROR level
      logger.error('Error getting API client', error, { component: 'AtprotoCore' });
      throw new Error(errorMsg);
    }
  }
}
