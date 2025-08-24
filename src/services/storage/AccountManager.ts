import * as SecureStore from 'expo-secure-store';
import { AtpAgent } from '@atproto/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AtProtoOAuthService, OAuthSession } from '../auth';

export interface SavedAccount {
  id: string;
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
  lastUsed: number;
  isActive: boolean;
  pdsUrl?: string; // Store PDS URL for OAuth accounts
}

class AccountManager {
  private static ACCOUNTS_KEY = 'saved_accounts';
  private static ACTIVE_ACCOUNT_KEY = 'active_account_id';

  /**
   * Save an OAuth account
   */
  static async saveOAuthAccount(
    oauthSession: OAuthSession, 
    displayName?: string, 
    avatar?: string,
    handle?: string
  ): Promise<SavedAccount> {
    try {
      console.log('[AccountManager] Saving OAuth account, session:', oauthSession);
      const accounts = await this.getSavedAccounts();
      
      // Check if account already exists
      const existingAccountIndex = accounts.findIndex(acc => acc.did === oauthSession.did);
      
      // Generate a sanitized ID for OAuth accounts
      const sanitizedDid = oauthSession.did.replace(/[^a-zA-Z0-9._-]/g, '_');
      const accountId = `oauth_${sanitizedDid}`;
      
      // Use the provided handle or fall back to DID if no handle is available
      const accountHandle = handle || oauthSession.did;
      
      const account: SavedAccount = {
        id: accountId, // Use sanitized ID for SecureStore compatibility
        handle: accountHandle,
        did: oauthSession.did,
        displayName: displayName || 'OAuth User',
        avatar: avatar,
        lastUsed: Date.now(),
        isActive: true,

        pdsUrl: 'https://bsky.social',
      };

      console.log('[AccountManager] Creating account object:', account);

      if (existingAccountIndex >= 0) {
        // Update existing account with new information
        const existingAccount = accounts[existingAccountIndex];
        accounts[existingAccountIndex] = {
          ...existingAccount,
          ...account,
          // Preserve existing display name and avatar if new ones aren't provided
          displayName: displayName || existingAccount.displayName,
          avatar: avatar || existingAccount.avatar,
          handle: handle || existingAccount.handle,
          lastUsed: Date.now(),
        };
      } else {
        // Add new account
        accounts.push(account);
      }

      // Set all other accounts as inactive
      accounts.forEach(acc => {
        acc.isActive = acc.id === account.id;
      });

      // Save accounts
      await SecureStore.setItemAsync(this.ACCOUNTS_KEY, JSON.stringify(accounts));
      await SecureStore.setItemAsync(this.ACTIVE_ACCOUNT_KEY, account.id);

      console.log('[AccountManager] OAuth account saved:', account.did);
      return account;
    } catch (error) {
      console.error('[AccountManager] Error saving OAuth account:', error);
      throw error;
    }
  }

  /**
   * Get all saved accounts
   */
  static async getSavedAccounts(): Promise<SavedAccount[]> {
    try {
      const accountsStr = await SecureStore.getItemAsync(this.ACCOUNTS_KEY);
      if (!accountsStr) return [];
      
      const accounts = JSON.parse(accountsStr);
      
      // Check if any accounts have invalid IDs and clear them
      const hasInvalidAccounts = accounts.some((acc: SavedAccount) => 
        acc.id.includes('@') || acc.id.includes(' ') || acc.id.includes('+')
      );
      
      if (hasInvalidAccounts) {
        // console.log('Found accounts with invalid IDs, clearing all accounts...');
        await this.clearAllAccounts();
        return [];
      }
      
      // Migrate legacy accounts that don't have pdsUrl
      let needsSave = false;
      const migratedAccounts = accounts.map((acc: SavedAccount) => {
        if (!acc.pdsUrl) {
          needsSave = true;
          return {
            ...acc,
            pdsUrl: 'https://bsky.social'
          };
        }
        return acc;
      });
      
      // Migrate accounts that have invalid IDs (DIDs with colons)
      const needsIdMigration = migratedAccounts.some((acc: SavedAccount) => 
        acc.id.includes(':')
      );
      
      if (needsIdMigration) {
        needsSave = true;
        migratedAccounts.forEach((acc: SavedAccount) => {
          if (acc.id.includes(':')) {
            // Generate proper sanitized ID for accounts
            const sanitizedDid = acc.did.replace(/[^a-zA-Z0-9._-]/g, '_');
            acc.id = `oauth_${sanitizedDid}`;
          }
        });
      }
      
      if (needsSave) {
        await SecureStore.setItemAsync(this.ACCOUNTS_KEY, JSON.stringify(migratedAccounts));
        return migratedAccounts;
      }
      
      return accounts;
    } catch (error) {
      console.error('Error getting saved accounts:', error);
      return [];
    }
  }

  /**
   * Get the currently active account
   */
  static async getActiveAccount(): Promise<SavedAccount | null> {
    try {
      const activeAccountId = await SecureStore.getItemAsync(this.ACTIVE_ACCOUNT_KEY);
      if (!activeAccountId) return null;

      const accounts = await this.getSavedAccounts();
      return accounts.find(acc => acc.id === activeAccountId) || null;
    } catch (error) {
      console.error('Error getting active account:', error);
      return null;
    }
  }

  /**
   * Switch to a different account
   */
  static async switchAccount(accountId: string): Promise<SavedAccount> {
    try {
      const accounts = await this.getSavedAccounts();
      const targetAccount = accounts.find(acc => acc.id === accountId);
      
      if (!targetAccount) {
        throw new Error('Account not found');
      }

      // For OAuth accounts, try to restore the session
      const oauthService = AtProtoOAuthService.getInstance();
      try {
        await oauthService.restoreSession(targetAccount.did);
        console.log('[AccountManager] OAuth session restored for DID:', targetAccount.did);
      } catch (error) {
        console.warn('[AccountManager] Failed to restore OAuth session, user needs to re-authenticate:', error);
        throw new Error('OAuth session expired. Please sign in again.');
      }

      // Update account statuses
      accounts.forEach(acc => {
        acc.isActive = acc.id === accountId;
        if (acc.id === accountId) {
          acc.lastUsed = Date.now();
        }
      });

      // Save updated accounts
      await SecureStore.setItemAsync(this.ACCOUNTS_KEY, JSON.stringify(accounts));
      
      // Set as active account
      await SecureStore.setItemAsync(this.ACTIVE_ACCOUNT_KEY, accountId);

      // Try to refresh profile data for the switched account
      try {
        const ProfileCache = (await import('../cache/ProfileCache')).default;
        const freshProfile = await ProfileCache.refreshProfile(targetAccount.handle);
        if (freshProfile) {
          await this.updateAccountProfile(accountId, {
            displayName: freshProfile.displayName,
            avatar: freshProfile.avatar,
            handle: freshProfile.handle,
          });
        }
      } catch (error) {
        console.warn('Failed to refresh profile for switched account:', error);
      }

      return targetAccount;
    } catch (error) {
      console.error('Error switching account:', error);
      throw error;
    }
  }

  /**
   * Remove an account
   */
  static async removeAccount(accountId: string): Promise<void> {
    try {
      const accounts = await this.getSavedAccounts();
      const targetAccount = accounts.find(acc => acc.id === accountId);
      
      if (!targetAccount) {
        throw new Error('Account not found');
      }
      
      const filteredAccounts = accounts.filter(acc => acc.id !== accountId);
      
      // Save updated accounts list
      await SecureStore.setItemAsync(this.ACCOUNTS_KEY, JSON.stringify(filteredAccounts));
      
      // If this was the active account, clear active account
      const activeAccountId = await SecureStore.getItemAsync(this.ACTIVE_ACCOUNT_KEY);
      if (activeAccountId === accountId) {
        await SecureStore.deleteItemAsync(this.ACTIVE_ACCOUNT_KEY);
      }
    } catch (error) {
      console.error('Error removing account:', error);
      throw error;
    }
  }

  /**
   * Check if user has multiple accounts
   */
  static async hasMultipleAccounts(): Promise<boolean> {
    const accounts = await this.getSavedAccounts();
    return accounts.length > 1;
  }



  /**
   * Update account information with fresh profile data
   */
  static async updateAccountProfile(accountId: string, profileData: {
    displayName?: string;
    avatar?: string;
    handle?: string;
  }): Promise<void> {
    try {
      const accounts = await this.getSavedAccounts();
      const accountIndex = accounts.findIndex(acc => acc.id === accountId);
      
      if (accountIndex >= 0) {
        // Update the account with fresh profile data
        accounts[accountIndex] = {
          ...accounts[accountIndex],
          displayName: profileData.displayName || accounts[accountIndex].displayName,
          avatar: profileData.avatar || accounts[accountIndex].avatar,
          handle: profileData.handle || accounts[accountIndex].handle,
        };
        
        // Save updated accounts
        await SecureStore.setItemAsync(this.ACCOUNTS_KEY, JSON.stringify(accounts));
      }
    } catch (error) {
      console.error('Error updating account profile:', error);
    }
  }

  static async getFeedMixingStrategy(): Promise<'chronological' | 'engagement' | 'diversity' | 'weighted'> {
    try {
      const strategy = await AsyncStorage.getItem('feedMixingStrategy');
      return (strategy as 'chronological' | 'engagement' | 'diversity' | 'weighted') || 'weighted';
    } catch (error) {
      console.error('Error getting feed mixing strategy:', error);
      return 'weighted';
    }
  }

  static async setFeedMixingStrategy(strategy: 'chronological' | 'engagement' | 'diversity' | 'weighted'): Promise<void> {
    try {
      await AsyncStorage.setItem('feedMixingStrategy', strategy);
    } catch (error) {
      console.error('Error setting feed mixing strategy:', error);
    }
  }

  /**
   * Get experimental feeds setting
   */
  static async getExperimentalFeedsEnabled(): Promise<boolean> {
    try {
      const value = await SecureStore.getItemAsync('experimental_feeds_enabled');
      return value === null ? true : value === 'true'; // Default to true
    } catch (error) {
      console.error('Error getting experimental feeds setting:', error);
      return true; // Default to true
    }
  }

  /**
   * Set experimental feeds setting
   */
  static async setExperimentalFeedsEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync('experimental_feeds_enabled', enabled.toString());
    } catch (error) {
      console.error('Error setting experimental feeds setting:', error);
    }
  }

  /**
   * Get feed debug overlay setting
   */
  static async getFeedDebugOverlayEnabled(): Promise<boolean> {
    try {
      const value = await SecureStore.getItemAsync('feed_debug_overlay_enabled');
      return value === 'true' ? true : false; // Default to false
    } catch (error) {
      console.error('Error getting feed debug overlay setting:', error);
      return false; // Default to false
    }
  }

  /**
   * Set feed debug overlay setting
   */
  static async setFeedDebugOverlayEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync('feed_debug_overlay_enabled', enabled.toString());
    } catch (error) {
      console.error('Error setting feed debug overlay setting:', error);
    }
  }


  /**
   * Clear all saved accounts (for logout)
   */
  static async clearAllAccounts(): Promise<void> {
    try {
      const accounts = await this.getSavedAccounts();
      
      // Clear accounts list and active account
      await SecureStore.deleteItemAsync(this.ACCOUNTS_KEY);
      await SecureStore.deleteItemAsync(this.ACTIVE_ACCOUNT_KEY);
    } catch (error) {
      console.error('Error clearing all accounts:', error);
      throw error;
    }
  }
}

export default AccountManager; 