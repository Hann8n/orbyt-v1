import * as SecureStore from 'expo-secure-store';
import { AtpAgent } from '@atproto/api';
import AtprotoService from '../api/AtprotoService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedAccount {
  id: string;
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
  lastUsed: number;
  isActive: boolean;
}

export interface AccountCredentials {
  did: string; // Use DID as the primary authentication identifier
  appPassword: string;
}

class AccountManager {
  private static ACCOUNTS_KEY = 'saved_accounts';
  private static ACTIVE_ACCOUNT_KEY = 'active_account_id';
  private static CREDENTIALS_PREFIX = 'account_credentials_';

  /**
   * Save a new account or update existing one
   */
  static async saveAccount(
    handle: string, 
    appPassword: string, 
    displayName?: string, 
    avatar?: string
  ): Promise<SavedAccount> {
    try {
      // First, validate the credentials by attempting to login
      const tempAgent = new AtpAgent({ service: 'https://bsky.social' });
      const loginResponse = await tempAgent.login({
        identifier: handle,
        password: appPassword,
      });

      const did = loginResponse.data.did;
      const correctHandle = loginResponse.data.handle; // Use the handle from the API response
      const accountId = this.generateAccountId(correctHandle, did);

      // Get existing accounts
      const accounts = await this.getSavedAccounts();
      
      // Check if account already exists (by DID to handle email vs handle cases)
      const existingAccountIndex = accounts.findIndex(acc => acc.did === did);
      
      const accountData: SavedAccount = {
        id: accountId,
        handle: correctHandle, // Use the correct handle from API
        did,
        displayName: displayName || correctHandle,
        avatar,
        lastUsed: Date.now(),
        isActive: true
      };

      if (existingAccountIndex >= 0) {
        // Update existing account
        accounts[existingAccountIndex] = accountData;
      } else {
        // Add new account
        accounts.push(accountData);
      }

      // Deactivate all other accounts
      accounts.forEach(acc => {
        if (acc.id !== accountId) {
          acc.isActive = false;
        }
      });

      // Save accounts list
      await SecureStore.setItemAsync(this.ACCOUNTS_KEY, JSON.stringify(accounts));
      
      // Save credentials securely using DID for authentication
      await SecureStore.setItemAsync(
        this.CREDENTIALS_PREFIX + accountId,
        JSON.stringify({ 
          did: did, // Use DID for authentication
          appPassword
        })
      );

      // Set as active account
      await SecureStore.setItemAsync(this.ACTIVE_ACCOUNT_KEY, accountId);

      return accountData;
    } catch (error) {
      console.error('Error saving account:', error);
      throw new Error('Invalid credentials. Please check your handle and app password.');
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

      // Get credentials for the target account
      const credentialsStr = await SecureStore.getItemAsync(this.CREDENTIALS_PREFIX + accountId);
      if (!credentialsStr) {
        throw new Error('Account credentials not found');
      }

      const credentials: AccountCredentials = JSON.parse(credentialsStr);

      // Login with the target account using DID for authentication
      await AtprotoService.login(credentials.did, credentials.appPassword);

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
      } catch (profileError) {
        console.warn('Failed to refresh profile data during account switch:', profileError);
      }

      return targetAccount;
    } catch (error) {
      // console.error('Error switching account:', error);
      throw error;
    }
  }

  /**
   * Remove an account
   */
  static async removeAccount(accountId: string): Promise<void> {
    try {
      const accounts = await this.getSavedAccounts();
      const filteredAccounts = accounts.filter(acc => acc.id !== accountId);
      
      // Save updated accounts list
      await SecureStore.setItemAsync(this.ACCOUNTS_KEY, JSON.stringify(filteredAccounts));
      
      // Remove credentials
      await SecureStore.deleteItemAsync(this.CREDENTIALS_PREFIX + accountId);

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
   * Get account credentials (for internal use)
   */
  static async getAccountCredentials(accountId: string): Promise<AccountCredentials | null> {
    try {
      const credentialsStr = await SecureStore.getItemAsync(this.CREDENTIALS_PREFIX + accountId);
      return credentialsStr ? JSON.parse(credentialsStr) : null;
    } catch (error) {
      console.error('Error getting account credentials:', error);
      return null;
    }
  }

  /**
   * Generate a unique account ID
   * Sanitizes the handle to ensure it's valid for SecureStore keys
   */
  private static generateAccountId(handle: string, did: string): string {
    // Sanitize handle to be valid for SecureStore keys
    // Replace invalid characters with underscores
    const sanitizedHandle = handle.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${sanitizedHandle}_${did.slice(-8)}`;
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
      
      // Remove all credentials
      for (const account of accounts) {
        await SecureStore.deleteItemAsync(this.CREDENTIALS_PREFIX + account.id);
      }
      
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