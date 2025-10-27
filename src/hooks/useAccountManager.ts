/**
 * Simplified Account Manager Hook
 * Streamlined account management using OAuth package features
 */

import { useState, useCallback } from 'react';
import { AtProtoOAuthService } from '../services/auth';
import { analyzeOAuthError } from '../utils/oauthErrorHandler';
import { Agent } from '@atproto/api';
import * as SecureStore from 'expo-secure-store';

export interface Account {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  pdsUrl: string;
  lastUsed: number;
}

export interface AccountManagerState {
  accounts: Account[];
  activeAccountDid: string | null;
  isSwitching: boolean;
  error: string | null;
}

export interface AccountManagerActions {
  addAccount: (session: any, profileData?: any, pdsUrl?: string) => Promise<void>;
  switchAccount: (did: string) => Promise<{ session: any; agent: Agent }>;
  removeAccount: (did: string) => Promise<void>;
  checkAccountValidity: (did: string) => Promise<boolean>;
  clearError: () => void;
}

const STORAGE_KEYS = {
  ACCOUNTS: 'saved_accounts',
  ACTIVE_ACCOUNT: 'active_account_did',
} as const;

export function useAccountManager(): AccountManagerState & AccountManagerActions {
  const [state, setState] = useState<AccountManagerState>({
    accounts: [],
    activeAccountDid: null,
    isSwitching: false,
    error: null,
  });

  const oauthService = AtProtoOAuthService.getInstance();

  const addAccount = useCallback(async (session: any, profileData?: any, pdsUrl?: string) => {
    try {
      const account: Account = {
        did: session.sub,
        handle: profileData?.handle || session.sub,
        displayName: profileData?.displayName,
        avatar: profileData?.avatar,
        pdsUrl: pdsUrl || 'https://bsky.social',
        lastUsed: Date.now(),
      };

      const updatedAccounts = [account, ...state.accounts.filter(a => a.did !== session.sub)];
      
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updatedAccounts));
      await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, account.did);
      
      setState(prev => ({
        ...prev,
        accounts: updatedAccounts,
        activeAccountDid: account.did,
        error: null,
      }));
    } catch (error) {
      const errorInfo = analyzeOAuthError(error);
      setState(prev => ({ ...prev, error: errorInfo.userFriendlyMessage }));
      throw error;
    }
  }, [state.accounts, oauthService]);

  const switchAccount = useCallback(async (did: string) => {
    setState(prev => ({ ...prev, isSwitching: true, error: null }));
    
    try {
      const account = state.accounts.find(acc => acc.did === did);
      if (!account) {
        throw new Error('Account not found');
      }

      // Use OAuth service to get valid session with automatic refresh
      const session = await oauthService.getValidSession(did, account.pdsUrl);
      
      // Create agent for API calls
      const agent = new Agent(session);
      
      // Update active account
      await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, did);
      
      setState(prev => ({
        ...prev,
        activeAccountDid: did,
        isSwitching: false,
        error: null,
      }));
      
      return { session, agent };
    } catch (error) {
      const errorInfo = analyzeOAuthError(error);
      
      setState(prev => ({
        ...prev,
        isSwitching: false,
        error: errorInfo.userFriendlyMessage,
      }));
      
      throw error;
    }
  }, [state.accounts, oauthService]);

  const removeAccount = useCallback(async (did: string) => {
    try {
      const updatedAccounts = state.accounts.filter(acc => acc.did !== did);
      
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updatedAccounts));
      
      if (state.activeAccountDid === did) {
        await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);
      }
      
      setState(prev => ({
        ...prev,
        accounts: updatedAccounts,
        activeAccountDid: prev.activeAccountDid === did ? null : prev.activeAccountDid,
        error: null,
      }));
    } catch (error) {
      const errorInfo = analyzeOAuthError(error);
      setState(prev => ({ ...prev, error: errorInfo.userFriendlyMessage }));
      throw error;
    }
  }, [state.accounts, state.activeAccountDid]);

  const checkAccountValidity = useCallback(async (did: string) => {
    try {
      const account = state.accounts.find(acc => acc.did === did);
      if (!account) return false;
      
      return await oauthService.hasValidSession(did, account.pdsUrl);
    } catch {
      return false;
    }
  }, [state.accounts, oauthService]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    addAccount,
    switchAccount,
    removeAccount,
    checkAccountValidity,
    clearError,
  };
}
