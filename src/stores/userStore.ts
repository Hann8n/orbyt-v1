/**
 * Unified User State Management
 * Combines user store and account manager functionality
 * Centralizes all user-related state using DIDs as primary identifiers
 * Integrates with expo-atproto-auth for OAuth session management
 */
import React, { useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Agent } from '@atproto/api';
import { ExpoOAuthClient } from 'expo-atproto-auth';
import { AtProtoOAuthService, OAuthSession } from '../services/auth';
import ProfileCache from '../services/cache/ProfileCache';
import ChannelCache from '../services/cache/ChannelCache';

import { ModerationService } from '../services/ModerationService';

// Account types
export interface SavedAccount {
  id: string;
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
  lastUsed: number;
  isActive: boolean;
  pdsUrl: string; // Required field for PDS support
}

// Subscribed channel types
export interface SubscribedChannel {
  uri: string;
  displayName: string;
  description?: string;
  avatar?: string;
  memberCount?: number;
  isDefault?: boolean;
  order: number;
  subscribedAt: number;
}

// User state types - DID-centric design
interface UserState {
  // Current user information - DID is the primary identifier
  currentUser: {
    did: string | null; // Primary identifier - immutable
    handle: string | null; // Display identifier - can change
    displayName: string | null;
    avatar: string | null;
    pdsUrl: string | null; // PDS URL for the current user
  } | null;
  
  // Authentication state
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  isSwitchingAccount: boolean; // Loading state for account switching
  authError: string | null;
  
  // Account management - using DIDs for all operations
  savedAccounts: SavedAccount[];
  activeAccountDid: string | null;
  
  // Session state - following expo-atproto-auth patterns
  oauthSession: OAuthSession | null;
  agent: Agent | null;
  
  // User-specific settings - scoped by DID
  feedMixingStrategy: 'chronological' | 'engagement' | 'diversity' | 'weighted';
  experimentalFeedsEnabled: boolean;
  feedDebugOverlayEnabled: boolean;
  
  // Subscribed channels - scoped by DID
  subscribedChannels: SubscribedChannel[];
  
  // Developer access - gated by Bluesky list membership
  isDeveloper: boolean;
  developerListUri: string;
  developerMembersCache: string[]; // Cached DIDs from the developer list
  developerCacheTimestamp: number | null;
  
  // Actions
  // Authentication
  signIn: (identifier: string, pdsUrl?: string) => Promise<void>;
  signOut: (clearAllAccounts?: boolean) => Promise<void>;
  restoreSession: (did: string, pdsUrl?: string) => Promise<void>;
  
  // Account management
  switchAccount: (did: string, onComplete?: () => void) => Promise<void>;
  addAccount: (oauthSession: OAuthSession, profileData?: any, pdsUrl?: string) => Promise<void>;
  removeAccount: (did: string) => Promise<void>;
  updateAccountProfile: (did: string, profileData: any) => Promise<void>;
  
  // Channel subscription management
  subscribeToChannel: (channelData: {
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    memberCount?: number;
  }) => Promise<void>;
  unsubscribeFromChannel: (uri: string) => Promise<void>;
  isSubscribedToChannel: (uri: string) => boolean;
  restoreDefaultChannel: (uri: string) => Promise<void>;
  getAvailableDefaultChannels: () => Promise<SubscribedChannel[]>;
  reorderChannels: (reorderedChannels: SubscribedChannel[]) => Promise<void>;
  
  // Batch operations for efficiency
  batchSubscribeToChannels: (channels: Array<{
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    memberCount?: number;
  }>) => Promise<void>;
  batchUnsubscribeFromChannels: (uris: string[]) => Promise<void>;
  
  // Developer access management
  refreshDeveloperAccess: () => Promise<void>;
  checkDeveloperAccess: () => boolean;
  
  // Feed settings
  setFeedMixingStrategy: (strategy: 'chronological' | 'engagement' | 'diversity' | 'weighted') => Promise<void>;
  setExperimentalFeedsEnabled: (enabled: boolean) => Promise<void>;
  setFeedDebugOverlayEnabled: (enabled: boolean) => Promise<void>;
  getFeedMixingStrategy: () => Promise<'chronological' | 'engagement' | 'diversity' | 'weighted'>;
  getExperimentalFeedsEnabled: () => Promise<boolean>;
  getFeedDebugOverlayEnabled: () => Promise<boolean>;
  
  // State management
  setCurrentUser: (user: UserState['currentUser']) => void;
  setAuthenticating: (authenticating: boolean) => void;
  setAuthError: (error: string | null) => void;
  clearAuthError: () => void;
  
  // Data invalidation
  invalidateAllUserData: () => Promise<void>;
  clearAllCaches: () => Promise<void>;
  
  // Moderation integration
  getModerationOpts: () => Promise<any>;
  
  // Session management
  checkSessionHealth: () => Promise<boolean>;
  checkAccountSessionValidity: (did: string) => Promise<boolean>;
  
  // Initialization
  initializeUserState: () => Promise<void>;
  loadSavedAccounts: () => Promise<void>;
  loadUserSpecificSettings: (did: string) => Promise<void>;
  loadSubscribedChannels: (did: string) => Promise<void>;
}

// Storage keys
const STORAGE_KEYS = {
  ACCOUNTS: 'saved_accounts',
  ACTIVE_ACCOUNT: 'active_account_did',
  SUBSCRIBED_CHANNELS: 'subscribed_channels_v2', // Updated to v2 for AsyncStorage
  REMOVED_DEFAULTS: 'removed_default_channels_v2', // Updated to v2 for AsyncStorage
  DEVELOPER_MEMBERS: 'developer_members_cache',
} as const;

// Developer list URI - the Bluesky list that defines developer access
const DEVELOPER_LIST_URI = 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.graph.list/3lzjpulbx4e2r';
const DEVELOPER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Default channels
const DEFAULT_CHANNELS = [
  { uri: 'following', displayName: 'Following', isDefault: true, order: 0, subscribedAt: Date.now() },
  { uri: 'yourMix', displayName: 'Your Mix', isDefault: true, order: 1, subscribedAt: Date.now() },
];

// Helper function to get user-scoped storage key
const getUserScopedKey = (baseKey: string, did: string): string => {
  const sanitizedDid = String(did).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${baseKey}_${sanitizedDid}`;
};

// Create the unified user store with persistence
export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentUser: null,
      isAuthenticated: false,
      isAuthenticating: false,
      isSwitchingAccount: false,
      authError: null,
      savedAccounts: [],
      activeAccountDid: null,
      oauthSession: null,
      agent: null,
      
      // Feed settings
      feedMixingStrategy: 'weighted',
      experimentalFeedsEnabled: true,
      feedDebugOverlayEnabled: false,
      
      // Subscribed channels
      subscribedChannels: [],
      
      // Developer access
      isDeveloper: false,
      developerListUri: DEVELOPER_LIST_URI,
      developerMembersCache: [],
      developerCacheTimestamp: null,
      
      // Authentication actions
      signIn: async (identifier: string, pdsUrl?: string) => {
        try {
          set({ isAuthenticating: true, authError: null });
          
          const oauthService = AtProtoOAuthService.getInstance();
          const session = await oauthService.signIn(identifier, pdsUrl);
          
          // Get the actual OAuth session and create agent
          const oauthSession = await oauthService.getCurrentOAuthSession();
          const agent = await oauthService.getCurrentAgent();
          
          // Fetch profile data using the OAuth service
          let profileData = null;
          try {
            console.log('[userStore] Fetching profile data for new session');
            profileData = await oauthService.getCurrentUserProfile();
            
            if (profileData) {
              await ProfileCache.cacheProfiles([profileData]);
              console.log('[userStore] Profile data fetched and cached successfully');
            }
          } catch (profileError) {
            console.warn('[userStore] Failed to fetch profile data during sign-in:', {
              did: session.did,
              error: profileError instanceof Error ? profileError.message : 'Unknown error'
            });
            // Continue without profile data - we'll try again later
          }
          
          // Save account with PDS URL
          await get().addAccount(session, profileData, pdsUrl);
          
          // Update state immediately
          set({
            currentUser: {
              did: session.did,
              handle: profileData?.handle || null,
              displayName: profileData?.displayName || null,
              avatar: profileData?.avatar || null,
              pdsUrl: pdsUrl || 'https://bsky.social',
            },
            isAuthenticated: true,
            isAuthenticating: false,
            authError: null,
            oauthSession,
            agent,
            activeAccountDid: session.did,
          });
          
          // Load user-specific data asynchronously
          Promise.all([
            get().loadUserSpecificSettings(session.did),
            get().loadSubscribedChannels(session.did),
            get().refreshDeveloperAccess()
          ]).catch(error => {
            console.warn('[userStore] Failed to load some user settings:', error);
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
          set({ 
            isAuthenticating: false, 
            authError: errorMessage 
          });
          throw error;
        }
      },
      
      signOut: async (clearAllAccounts: boolean = false) => {
        try {
          set({ isAuthenticating: true });
          
          // Clear all user data
          await get().invalidateAllUserData();
          
          // Sign out from OAuth service
          const oauthService = AtProtoOAuthService.getInstance();
          await oauthService.signOut();
          
          // Clear active account - user has logged out
          await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);
          
          // Clear all accounts if requested
          if (clearAllAccounts) {
            await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCOUNTS);
          }
          
          // Reset state
          set({
            currentUser: null,
            isAuthenticated: false,
            isAuthenticating: false,
            authError: null,
            oauthSession: null,
            agent: null,
            activeAccountDid: null,
            savedAccounts: clearAllAccounts ? [] : get().savedAccounts,
            subscribedChannels: [],
          });
          
          
        } catch (error) {
          console.error('Error during sign out:', error);
          set({ isAuthenticating: false });
          throw error;
        }
      },
      
      restoreSession: async (did: string, pdsUrl?: string) => {
        console.log('[userStore] === RESTORE SESSION START ===');
        console.log('[userStore] DID:', did);
        console.log('[userStore] PDS URL:', pdsUrl);
        
        try {
          set({ isAuthenticating: true, authError: null });
          
          console.log('[userStore] Getting OAuth service instance...');
          const oauthService = AtProtoOAuthService.getInstance();
          
          console.log('[userStore] Calling OAuth service restoreSession...');
          const session = await oauthService.restoreSession(did, pdsUrl);
          console.log('[userStore] OAuth service restoreSession completed');
          
          console.log('[userStore] Getting OAuth session and agent...');
          const oauthSession = await oauthService.getCurrentOAuthSession();
          const agent = await oauthService.getCurrentAgent();
          console.log('[userStore] OAuth session and agent retrieved');
          
          // Fetch profile data using the OAuth service
          let profileData = null;
          try {
            console.log('[userStore] Fetching profile data for restored session');
            profileData = await oauthService.getCurrentUserProfile();
            
            if (profileData) {
              await ProfileCache.cacheProfiles([profileData]);
              console.log('[userStore] Profile data fetched successfully');
            }
          } catch (profileError) {
            console.warn('[userStore] Failed to fetch profile data during restore:', profileError);
            
            // Fallback to cached profile data
            profileData = await ProfileCache.getProfileByDid(did);
            
            // If still no profile data, create a basic one from account data
            if (!profileData) {
              const accounts = get().savedAccounts;
              const account = accounts.find(acc => acc.did === did);
              if (account) {
                profileData = {
                  did: account.did,
                  handle: account.handle,
                  displayName: account.displayName,
                  avatar: account.avatar,
                  lastUpdated: Date.now(),
                };
              }
            }
          }
          
          // Update account profile if we have fresh data
          if (profileData) {
            await get().updateAccountProfile(did, profileData);
          }
          
          // Get PDS URL from account or use default
          const accounts = get().savedAccounts;
          const account = accounts.find(acc => acc.did === did);
          const accountPDS = account?.pdsUrl || 'https://bsky.social';
          
          // Update state
          const currentUser = {
            did: session.did,
            handle: profileData?.handle || session.did,
            displayName: profileData?.displayName || null,
            avatar: profileData?.avatar || null,
            pdsUrl: pdsUrl || accountPDS,
          };
          
          set({
            currentUser,
            isAuthenticated: true,
            isAuthenticating: false,
            oauthSession,
            agent,
            activeAccountDid: did,
          });
          
          // Load user-specific data
          await get().loadUserSpecificSettings(did);
          await get().loadSubscribedChannels(did);
          
          // Check developer access
          await get().refreshDeveloperAccess();
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Session restoration failed';
          
          console.error('[userStore] ❌ RESTORE SESSION FAILED');
          console.error('[userStore] DID:', did);
          console.error('[userStore] PDS URL:', pdsUrl);
          console.error('[userStore] Error message:', errorMessage);
          console.error('[userStore] Error stack:', error instanceof Error ? error.stack : 'No stack');
          console.error('[userStore] Full error object:', error);
          
          // Normalize to actionable error for callers (switchAccount)
          if (errorMessage.includes('oauth_reauth_required')) {
            // Session expiration is expected behavior, log as warning
            console.warn('[userStore] Session expired, re-authentication required for DID:', did);
            set({ 
              isAuthenticating: false,
              isAuthenticated: false,
              currentUser: null,
              oauthSession: null,
              agent: null,
              activeAccountDid: null,
            });
            throw new Error('oauth_reauth_required');
          }
          
          // Only log as error for unexpected failures
          console.error('[userStore] Unexpected session restoration failure:', {
            did,
            pdsUrl,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
          });
          set({ 
            isAuthenticating: false,
            isAuthenticated: false,
            authError: errorMessage,
            currentUser: null,
            oauthSession: null,
            agent: null,
            activeAccountDid: null,
          });
          throw error;
        }
      },
      
      // Account management actions
      switchAccount: async (did: string, onComplete?: () => void) => {
        console.log('[userStore] === SWITCH ACCOUNT START ===');
        console.log('[userStore] Target DID:', did);
        
        try {
          set({ isSwitchingAccount: true });
          
          console.log('[userStore] Clearing all caches...');
          await get().clearAllCaches();
          
          console.log('[userStore] Getting saved accounts...');
          const savedAccounts = get().savedAccounts;
          console.log('[userStore] Found', savedAccounts.length, 'saved accounts');
          
          // Update account statuses
          const accounts = savedAccounts.map(acc => ({
            ...acc,
            isActive: acc.did === did,
            lastUsed: acc.did === did ? Date.now() : acc.lastUsed,
          }));
          
          console.log('[userStore] Saving updated accounts...');
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, did);
          
          // Try to restore session for the new account
          try {
            const account = accounts.find(acc => acc.did === did);
            const accountPDS = account?.pdsUrl;
            console.log('[userStore] Found account for DID:', account?.handle, 'PDS:', accountPDS);
            
            console.log('[userStore] Attempting to restore session...');
            await get().restoreSession(did, accountPDS);
            console.log('[userStore] Session restoration successful');
          } catch (restoreErr) {
            const restoreMsg = restoreErr instanceof Error ? restoreErr.message : '';
            console.error('[userStore] ❌ Session restoration failed for account switch:', {
              did,
              error: restoreMsg,
              stack: restoreErr instanceof Error ? restoreErr.stack : undefined
            });
            
            // Don't try to re-authenticate automatically - this requires user interaction
            // Instead, clear the user state and require manual re-authentication
            set({ 
              isAuthenticated: false,
              currentUser: null,
              oauthSession: null,
              agent: null,
            });
            
            // Throw a specific error that the UI can handle
            throw new Error('Session expired - please sign in again');
          }
          
          // Update state
          set({ 
            savedAccounts: accounts,
            activeAccountDid: did,
            isSwitchingAccount: false,
          });
          
          // Call completion callback if provided
          if (onComplete) {
            onComplete();
          }
          
        } catch (error) {
          set({ isSwitchingAccount: false });
          throw error;
        }
      },
      
      addAccount: async (oauthSession: OAuthSession, profileData?: any, pdsUrl?: string) => {
        try {
          const accounts = get().savedAccounts;
          
          // Check if account already exists
          const existingAccountIndex = accounts.findIndex(acc => acc.did === oauthSession.did);
          
          // Use provided PDS URL or default
          const accountPDS = pdsUrl || 'https://bsky.social';
          
          const account: SavedAccount = {
            id: oauthSession.did, // Use DID directly as account ID
            handle: profileData?.handle || oauthSession.did,
            did: oauthSession.did,
            displayName: profileData?.displayName || null,
            avatar: profileData?.avatar,
            lastUsed: Date.now(),
            isActive: true,
            pdsUrl: accountPDS,
          };
          

          
          if (existingAccountIndex >= 0) {
            // Update existing account
            accounts[existingAccountIndex] = {
              ...accounts[existingAccountIndex],
              ...account,
              displayName: profileData?.displayName || accounts[existingAccountIndex].displayName,
              avatar: profileData?.avatar || accounts[existingAccountIndex].avatar,
              handle: profileData?.handle || accounts[existingAccountIndex].handle,
              lastUsed: Date.now(),
            };
          } else {
            // Add new account
            accounts.push(account);
          }
          
          // Set all other accounts as inactive
          accounts.forEach(acc => {
            acc.isActive = acc.did === account.did;
          });
          
          // Save accounts
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, account.did);
          
          // Update state
          set({ savedAccounts: accounts, activeAccountDid: account.did });
          
        } catch (error) {
          console.error('Error adding account:', error);
          throw error;
        }
      },
      
      removeAccount: async (did: string) => {
        try {
          const accounts = get().savedAccounts.filter(acc => acc.did !== did);
          
          // Save updated accounts
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          
          // If this was the active account, sign out
          if (get().activeAccountDid === did) {
            await get().signOut();
          } else {
            // Update state
            set({ savedAccounts: accounts });
          }
        } catch (error) {
          console.error('Error removing account:', error);
          throw error;
        }
      },
      
      updateAccountProfile: async (did: string, profileData: any) => {
        try {
          
          const accounts = get().savedAccounts.map(acc => 
            acc.did === did 
              ? {
                  ...acc,
                  displayName: profileData.displayName || acc.displayName,
                  avatar: profileData.avatar || acc.avatar,
                  handle: profileData.handle || acc.handle,
                }
              : acc
          );
          
          // Save updated accounts
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          
          // Update current user if this is the active account
          if (get().activeAccountDid === did) {
            set(state => ({
              currentUser: state.currentUser ? {
                ...state.currentUser,
                displayName: profileData.displayName || state.currentUser.displayName,
                avatar: profileData.avatar || state.currentUser.avatar,
                handle: profileData.handle || state.currentUser.handle,
              } : null
            }));
          }
          
          // Update state
          set({ savedAccounts: accounts });
        } catch (error) {
          console.error('Error updating account profile:', error);
          throw error;
        }
      },
      
      // Channel subscription management
      subscribeToChannel: async (channelData: {
        uri: string;
        displayName: string;
        description?: string;
        avatar?: string;
        memberCount?: number;
      }) => {
        try {
          const currentUser = get().currentUser;
          if (!currentUser?.did) {
            throw new Error('No active user');
          }
          
          const channels = get().subscribedChannels;
          
          // Check if already subscribed
          const existingIndex = channels.findIndex(ch => ch.uri === channelData.uri);
          
          if (existingIndex >= 0) {
            // Update existing channel
            const updatedChannels = [...channels];
            updatedChannels[existingIndex] = {
              ...updatedChannels[existingIndex],
              ...channelData,
              subscribedAt: Date.now(),
            };
            set({ subscribedChannels: updatedChannels });
          } else {
            // Add new channel
            const newChannel: SubscribedChannel = {
              ...channelData,
              isDefault: false,
              order: channels.length,
              subscribedAt: Date.now(),
            };
            set({ subscribedChannels: [...channels, newChannel] });
          }
          
          // Save to storage using AsyncStorage
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          const savedChannels = get().subscribedChannels.filter(ch => !ch.isDefault);
          await AsyncStorage.setItem(key, JSON.stringify(savedChannels));
          
        } catch (error) {
          console.error('Error subscribing to channel:', error);
          throw error;
        }
      },
      
      unsubscribeFromChannel: async (uri: string) => {
        try {
          const currentUser = get().currentUser;
          if (!currentUser?.did) {
            throw new Error('No active user');
          }
          
          // Check if this is a default channel
          const isDefaultChannel = DEFAULT_CHANNELS.some(ch => ch.uri === uri);
          
          if (isDefaultChannel) {
            // For default channels, add to removed defaults list
            const removedKey = getUserScopedKey(STORAGE_KEYS.REMOVED_DEFAULTS, currentUser.did);
            const removedDefaultsStr = await AsyncStorage.getItem(removedKey);
            const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
            
            if (!removedDefaults.includes(uri)) {
              removedDefaults.push(uri);
              await AsyncStorage.setItem(removedKey, JSON.stringify(removedDefaults));
            }
          }
          
          const channels = get().subscribedChannels.filter(ch => ch.uri !== uri);
          set({ subscribedChannels: channels });
          
          // Save to storage using AsyncStorage
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          const savedChannels = channels.filter(ch => !ch.isDefault);
          await AsyncStorage.setItem(key, JSON.stringify(savedChannels));
          
        } catch (error) {
          console.error('Error unsubscribing from channel:', error);
          throw error;
        }
      },
      
      isSubscribedToChannel: (uri: string) => {
        return get().subscribedChannels.some(ch => ch.uri === uri);
      },
      
             restoreDefaultChannel: async (uri: string) => {
         try {
           const currentUser = get().currentUser;
           if (!currentUser?.did) {
             throw new Error('No active user');
           }
           
           const defaultChannel = DEFAULT_CHANNELS.find(ch => ch.uri === uri);
           if (!defaultChannel) {
             throw new Error('Default channel not found');
           }
           
           const channels = get().subscribedChannels;
           const existingIndex = channels.findIndex(ch => ch.uri === uri);
           
           if (existingIndex >= 0) {
             // Update existing channel to be default
             const updatedChannels = [...channels];
             updatedChannels[existingIndex] = {
               ...updatedChannels[existingIndex],
               isDefault: true,
             };
             set({ subscribedChannels: updatedChannels });
           } else {
             // Add default channel
             set({ subscribedChannels: [...channels, defaultChannel] });
           }
           
           // Remove from removed defaults
           const removedKey = getUserScopedKey(STORAGE_KEYS.REMOVED_DEFAULTS, currentUser.did);
           const removedDefaultsStr = await AsyncStorage.getItem(removedKey);
           if (removedDefaultsStr) {
             const removedDefaults = JSON.parse(removedDefaultsStr);
             const updatedRemoved = removedDefaults.filter((removedUri: string) => removedUri !== uri);
             await AsyncStorage.setItem(removedKey, JSON.stringify(updatedRemoved));
           }
           
         } catch (error) {
           console.error('Error restoring default channel:', error);
           throw error;
         }
       },
       
               getAvailableDefaultChannels: async () => {
          try {
            const currentUser = get().currentUser;
            if (!currentUser?.did) {
              return [];
            }
            
            // Get current subscribed channels
            const currentChannels = get().subscribedChannels;
            const currentChannelUris = currentChannels.map(ch => ch.uri);
            
            // Return default channels that are not currently subscribed
            return DEFAULT_CHANNELS.filter(ch => !currentChannelUris.includes(ch.uri));
          } catch (error) {
            console.error('Error getting available default channels:', error);
            return [];
          }
        },

        reorderChannels: async (reorderedChannels: SubscribedChannel[]) => {
          try {
            const currentUser = get().currentUser;
            if (!currentUser?.did) {
              throw new Error('No active user');
            }
            
            // Update the order field for each channel based on its position in the array
            const updatedChannels = reorderedChannels.map((channel, index) => ({
              ...channel,
              order: index,
            }));
            
            set({ subscribedChannels: updatedChannels });
            
            // Save to storage (only non-default channels) using AsyncStorage
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            const savedChannels = updatedChannels.filter(ch => !ch.isDefault);
            await AsyncStorage.setItem(key, JSON.stringify(savedChannels));
            
            // Save channel order separately for all channels (including defaults)
            const channelOrderKey = getUserScopedKey('channel_order_v2', currentUser.did);
            const channelOrder = updatedChannels.map(ch => ({ uri: ch.uri, order: ch.order }));
            await AsyncStorage.setItem(channelOrderKey, JSON.stringify(channelOrder));
            
          } catch (error) {
            console.error('Error reordering channels:', error);
            throw error;
          }
        },
      
      // Batch operations for efficiency
      batchSubscribeToChannels: async (channels: Array<{
        uri: string;
        displayName: string;
        description?: string;
        avatar?: string;
        memberCount?: number;
      }>) => {
        try {
          const currentUser = get().currentUser;
          if (!currentUser?.did) {
            throw new Error('No active user');
          }
          
          const currentChannels = get().subscribedChannels;
          const newChannels: SubscribedChannel[] = [];
          
          // Process all channels in batch
          for (const channelData of channels) {
            const existingIndex = currentChannels.findIndex(ch => ch.uri === channelData.uri);
            
            if (existingIndex >= 0) {
              // Update existing channel
              newChannels.push({
                ...currentChannels[existingIndex],
                ...channelData,
                subscribedAt: Date.now(),
              });
            } else {
              // Add new channel
              newChannels.push({
                ...channelData,
                isDefault: false,
                order: currentChannels.length + newChannels.length,
                subscribedAt: Date.now(),
              });
            }
          }
          
          // Update state with all new channels
          set({ subscribedChannels: [...currentChannels, ...newChannels] });
          
          // Single storage operation for all changes
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          const savedChannels = get().subscribedChannels.filter(ch => !ch.isDefault);
          await AsyncStorage.setItem(key, JSON.stringify(savedChannels));
          
        } catch (error) {
          console.error('Error batch subscribing to channels:', error);
          throw error;
        }
      },
      
      batchUnsubscribeFromChannels: async (uris: string[]) => {
        try {
          const currentUser = get().currentUser;
          if (!currentUser?.did) {
            throw new Error('No active user');
          }
          
          const currentChannels = get().subscribedChannels;
          const removedDefaults: string[] = [];
          
          // Process all unsubscriptions
          for (const uri of uris) {
            const isDefaultChannel = DEFAULT_CHANNELS.some(ch => ch.uri === uri);
            if (isDefaultChannel) {
              removedDefaults.push(uri);
            }
          }
          
          // Update removed defaults if any
          if (removedDefaults.length > 0) {
            const removedKey = getUserScopedKey(STORAGE_KEYS.REMOVED_DEFAULTS, currentUser.did);
            const existingRemovedStr = await AsyncStorage.getItem(removedKey);
            const existingRemoved: string[] = existingRemovedStr ? JSON.parse(existingRemovedStr) : [];
            const updatedRemoved = [...new Set([...existingRemoved, ...removedDefaults])];
            await AsyncStorage.setItem(removedKey, JSON.stringify(updatedRemoved));
          }
          
          // Filter out unsubscribed channels
          const updatedChannels = currentChannels.filter(ch => !uris.includes(ch.uri));
          set({ subscribedChannels: updatedChannels });
          
          // Single storage operation for all changes
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          const savedChannels = updatedChannels.filter(ch => !ch.isDefault);
          await AsyncStorage.setItem(key, JSON.stringify(savedChannels));
          
        } catch (error) {
          console.error('Error batch unsubscribing from channels:', error);
          throw error;
        }
      },
      
      // Feed settings actions
      setFeedMixingStrategy: async (strategy: 'chronological' | 'engagement' | 'diversity' | 'weighted') => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did ? `feed_mixing_strategy_${currentUser.did}` : 'feed_mixing_strategy';
          await AsyncStorage.setItem(key, strategy);
          set({ feedMixingStrategy: strategy });
        } catch (error) {
          console.error('Error setting feed mixing strategy:', error);
          throw error;
        }
      },
      
      setExperimentalFeedsEnabled: async (enabled: boolean) => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did ? `experimental_feeds_enabled_${currentUser.did}` : 'experimental_feeds_enabled';
          await AsyncStorage.setItem(key, enabled.toString());
          set({ experimentalFeedsEnabled: enabled });
        } catch (error) {
          console.error('Error setting experimental feeds enabled:', error);
          throw error;
        }
      },
      
      setFeedDebugOverlayEnabled: async (enabled: boolean) => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did ? `feed_debug_overlay_enabled_${currentUser.did}` : 'feed_debug_overlay_enabled';
          await AsyncStorage.setItem(key, enabled.toString());
          set({ feedDebugOverlayEnabled: enabled });
        } catch (error) {
          console.error('Error setting feed debug overlay enabled:', error);
          throw error;
        }
      },
      
      getFeedMixingStrategy: async () => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did ? `feed_mixing_strategy_${currentUser.did}` : 'feed_mixing_strategy';
          const strategy = await AsyncStorage.getItem(key);
          return (strategy as 'chronological' | 'engagement' | 'diversity' | 'weighted') || 'weighted';
        } catch (error) {
          console.error('Error getting feed mixing strategy:', error);
          return 'weighted';
        }
      },
      
      getExperimentalFeedsEnabled: async () => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did ? `experimental_feeds_enabled_${currentUser.did}` : 'experimental_feeds_enabled';
          const value = await AsyncStorage.getItem(key);
          return value === null ? true : value === 'true';
        } catch (error) {
          console.error('Error getting experimental feeds enabled:', error);
          return true;
        }
      },
      
      getFeedDebugOverlayEnabled: async () => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did ? `feed_debug_overlay_enabled_${currentUser.did}` : 'feed_debug_overlay_enabled';
          const value = await AsyncStorage.getItem(key);
          return value === 'true';
        } catch (error) {
          console.error('Error getting feed debug overlay enabled:', error);
          return false;
        }
      },
      
      // State management actions
      setCurrentUser: (user) => set({ currentUser: user }),
      setAuthenticating: (authenticating) => set({ isAuthenticating: authenticating }),
      setAuthError: (error) => set({ authError: error }),
      clearAuthError: () => set({ authError: null }),
      
      // Data invalidation actions
      invalidateAllUserData: async () => {
        try {
          // Clear all caches
          await get().clearAllCaches();
          
          // Clear current feed
          // feedService.clearCurrentFeed(); // This line is removed
          // feedService.clearFeedCache(); // This line is removed
          
        } catch (error) {
          console.error('Error invalidating user data:', error);
        }
      },
      
      clearAllCaches: async () => {
        try {
          await Promise.all([
            ProfileCache.clearCache(),
            ChannelCache.clearCache(),

            ModerationService.clearModerationCache(),
          ]);
          
        } catch (error) {
          console.error('Error clearing caches:', error);
        }
      },
      
      // Moderation integration
      getModerationOpts: async () => {
        try {
          const moderationSettings = await ModerationService.getModerationSettings();
          return moderationSettings;
        } catch (error) {
          console.error('Error getting moderation options:', error);
          return {};
        }
      },
      
      // Session management
      checkSessionHealth: async () => {
        try {
          const oauthService = AtProtoOAuthService.getInstance();
          const isHealthy = await oauthService.isSessionHealthy();
          
          if (!isHealthy && get().isAuthenticated) {
            console.log('[userStore] Session is unhealthy, signing out user');
            set({ 
              isAuthenticated: false,
              currentUser: null,
              oauthSession: null,
              agent: null,
              activeAccountDid: null,
            });
          }
          
          return isHealthy;
        } catch (error) {
          console.error('[userStore] Session health check failed:', error);
          return false;
        }
      },

      checkAccountSessionValidity: async (did: string) => {
        try {
          const oauthService = AtProtoOAuthService.getInstance();
          const account = get().savedAccounts.find(acc => acc.did === did);
          const pdsUrl = account?.pdsUrl;
          
          return await oauthService.hasValidSession(did, pdsUrl);
        } catch (error) {
          console.error('[userStore] Account session validity check failed:', error);
          return false;
        }
      },
      
      // Initialization actions
      initializeUserState: async () => {
        try {
          // Load saved accounts
          await get().loadSavedAccounts();
          
          // Check for active account
          const activeAccountDid = await SecureStore.getItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);
          
          if (activeAccountDid) {
            set({ activeAccountDid });
            
            // Try to restore session with account's PDS
            const accounts = get().savedAccounts;
            const account = accounts.find(acc => acc.did === activeAccountDid);
            const accountPDS = account?.pdsUrl;
            
            try {
              console.log('[userStore] Attempting to restore session for active account:', activeAccountDid);
              await get().restoreSession(activeAccountDid, accountPDS);
              console.log('[userStore] Successfully restored session for active account');
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Session restoration failed';
              
              if (errorMessage.includes('oauth_reauth_required')) {
                console.log('[userStore] Session expired for active account, user needs to re-authenticate');
              } else {
                console.warn('[userStore] Failed to restore session for active account:', {
                  did: activeAccountDid,
                  pdsUrl: accountPDS,
                  error: errorMessage
                });
              }
              
              // Session expired or failed, user needs to re-authenticate
              set({ 
                isAuthenticated: false,
                currentUser: null,
                oauthSession: null,
                agent: null,
                activeAccountDid: null,
              });
            }
          }
        } catch (error) {
          console.error('[userStore] Error initializing user state:', error);
        }
      },
      
      loadSavedAccounts: async () => {
        try {
          const accountsStr = await SecureStore.getItemAsync(STORAGE_KEYS.ACCOUNTS);
          if (!accountsStr) {
            set({ savedAccounts: [] });
            return;
          }
          
          const accounts = JSON.parse(accountsStr);
          // Normalize isActive based on persisted ACTIVE_ACCOUNT to avoid stale flags
          const activeDid = await SecureStore.getItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);
          const normalized = Array.isArray(accounts)
            ? accounts.map((acc: SavedAccount) => ({
                ...acc,
                isActive: activeDid ? acc.did === activeDid : !!acc.isActive,
              }))
            : [];
          set({ savedAccounts: normalized, activeAccountDid: activeDid || null });
        } catch (error) {
          console.error('Error loading saved accounts:', error);
          set({ savedAccounts: [] });
        }
      },
      
      loadUserSpecificSettings: async (did: string) => {
        try {
          // Load user-specific feed settings
          const feedMixingStrategy = await get().getFeedMixingStrategy();
          const experimentalFeedsEnabled = await get().getExperimentalFeedsEnabled();
          const feedDebugOverlayEnabled = await get().getFeedDebugOverlayEnabled();
          
          // Load user-specific moderation settings
          const moderationSettings = await ModerationService.getModerationSettings();
          
          // Sync moderation settings with Bluesky API
          await ModerationService.syncModerationSettings(get().agent);
          
          // Update state with user-specific settings
          set({ 
            feedMixingStrategy,
            experimentalFeedsEnabled,
            feedDebugOverlayEnabled,
          });
          
        } catch (error) {
          console.error('Error loading user-specific settings:', error);
        }
      },
      
      loadSubscribedChannels: async (did: string) => {
        try {
          // Load user-specific channel subscriptions
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, did);
          const removedKey = getUserScopedKey(STORAGE_KEYS.REMOVED_DEFAULTS, did);
          const orderKey = getUserScopedKey('channel_order_v2', did);
          
          // Try AsyncStorage first (v2), fallback to SecureStore (v1) for migration
          let savedChannelsStr = await AsyncStorage.getItem(key);
          let removedDefaultsStr = await AsyncStorage.getItem(removedKey);
          let channelOrderStr = await AsyncStorage.getItem(orderKey);
          
          // Migration from v1 to v2: if not found in AsyncStorage, try SecureStore
          if (!savedChannelsStr) {
            try {
              const v1Key = getUserScopedKey('subscribed_channels_v1', did);
              const v1RemovedKey = getUserScopedKey('removed_default_channels_v1', did);
              const v1OrderKey = getUserScopedKey('channel_order_v1', did);
              
              savedChannelsStr = await SecureStore.getItemAsync(v1Key);
              removedDefaultsStr = await SecureStore.getItemAsync(v1RemovedKey);
              channelOrderStr = await SecureStore.getItemAsync(v1OrderKey);
              
              // If found in v1, migrate to v2
              if (savedChannelsStr || removedDefaultsStr || channelOrderStr) {
                if (savedChannelsStr) await AsyncStorage.setItem(key, savedChannelsStr);
                if (removedDefaultsStr) await AsyncStorage.setItem(removedKey, removedDefaultsStr);
                if (channelOrderStr) await AsyncStorage.setItem(orderKey, channelOrderStr);
              }
            } catch (migrationError) {
              console.warn('[userStore] Migration from v1 to v2 failed:', migrationError);
            }
          }
          
          const savedChannels: SubscribedChannel[] = savedChannelsStr ? JSON.parse(savedChannelsStr) : [];
          const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
          const channelOrder: { uri: string; order: number }[] = channelOrderStr ? JSON.parse(channelOrderStr) : [];
          
          // Combine default channels (excluding removed ones) with saved channels
          const defaultChannels = DEFAULT_CHANNELS.filter(ch => !removedDefaults.includes(ch.uri));
          const allChannels = [...defaultChannels, ...savedChannels];
          
          // Apply saved channel order if available
          let sortedChannels = allChannels;
          if (channelOrder.length > 0) {
            // Create a map of URI to order for quick lookup
            const orderMap = new Map(channelOrder.map(item => [item.uri, item.order]));
            
            // Sort channels based on saved order, with fallback to original order
            sortedChannels = allChannels.sort((a, b) => {
              const orderA = orderMap.get(a.uri) ?? a.order;
              const orderB = orderMap.get(b.uri) ?? b.order;
              return orderA - orderB;
            });
            
            // Update the order field to match the sorted positions
            sortedChannels = sortedChannels.map((channel, index) => ({
              ...channel,
              order: index,
            }));
          } else {
            // No saved order, just sort by existing order field
            sortedChannels = allChannels.sort((a, b) => a.order - b.order);
          }
          
          set({ subscribedChannels: sortedChannels });
          
        } catch (error) {
          console.error('Error loading subscribed channels:', error);
          set({ subscribedChannels: DEFAULT_CHANNELS });
        }
      },
      
      // Developer access management
      refreshDeveloperAccess: async () => {
        try {
          const { agent, currentUser, developerListUri, developerCacheTimestamp } = get();
          
          if (!agent || !currentUser?.did) {
            console.warn('[userStore] No agent or current user for developer access check');
            set({ isDeveloper: false });
            return;
          }
          
          // Check if cache is still valid (24 hours)
          const now = Date.now();
          if (developerCacheTimestamp && (now - developerCacheTimestamp) < DEVELOPER_CACHE_TTL) {
            // Use cached data
            const cachedMembers = get().developerMembersCache;
            const isDeveloper = cachedMembers.includes(currentUser.did);
            set({ isDeveloper });
            return;
          }
          
          // Fetch fresh data from the developer list
          const allMembers: string[] = [];
          let cursor: string | undefined;
          
          do {
            try {
              const response = await agent.api.app.bsky.graph.getList({
                list: developerListUri,
                limit: 100,
                cursor,
              });
              
              const members = response.data.items.map((item: any) => item.subject.did);
              allMembers.push(...members);
              cursor = response.data.cursor;
            } catch (error) {
              console.error('[userStore] Error fetching developer list:', error);
              // On error, use cached data if available, otherwise deny access
              const cachedMembers = get().developerMembersCache;
              const isDeveloper = cachedMembers.length > 0 ? cachedMembers.includes(currentUser.did) : false;
              set({ isDeveloper });
              return;
            }
          } while (cursor);
          
          // Update cache
          await AsyncStorage.setItem(STORAGE_KEYS.DEVELOPER_MEMBERS, JSON.stringify(allMembers));
          
          // Check if current user is in the developer list
          const isDeveloper = allMembers.includes(currentUser.did);
          
          set({
            isDeveloper,
            developerMembersCache: allMembers,
            developerCacheTimestamp: now,
          });
          
          
        } catch (error) {
          console.error('[userStore] Error refreshing developer access:', error);
          // On error, deny access by default
          set({ isDeveloper: false });
        }
      },
      
      checkDeveloperAccess: () => {
        return get().isDeveloper;
      },
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist non-sensitive data
        savedAccounts: state.savedAccounts,
        activeAccountDid: state.activeAccountDid,
        feedMixingStrategy: state.feedMixingStrategy,
        experimentalFeedsEnabled: state.experimentalFeedsEnabled,
        feedDebugOverlayEnabled: state.feedDebugOverlayEnabled,
        subscribedChannels: state.subscribedChannels,
        isDeveloper: state.isDeveloper,
        developerMembersCache: state.developerMembersCache,
        developerCacheTimestamp: state.developerCacheTimestamp,
      }),
    }
  )
);

// Convenience hooks
export const useAuth = () => {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const isAuthenticating = useUserStore(state => state.isAuthenticating);
  const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);
  const authError = useUserStore(state => state.authError);
  const signIn = useUserStore(state => state.signIn);
  const signOut = useUserStore(state => state.signOut);
  const restoreSession = useUserStore(state => state.restoreSession);
  const clearAuthError = useUserStore(state => state.clearAuthError);
  
  return {
    isAuthenticated,
    isAuthenticating,
    isSwitchingAccount,
    authError,
    signIn,
    signOut,
    restoreSession,
    clearAuthError,
  };
};

export const useCurrentUser = () => {
  const currentUser = useUserStore(state => state.currentUser);
  const setCurrentUser = useUserStore(state => state.setCurrentUser);
  
  return {
    currentUser,
    setCurrentUser,
  };
};

export const useAccountManagement = () => {
  const savedAccounts = useUserStore(state => state.savedAccounts);
  const activeAccountDid = useUserStore(state => state.activeAccountDid);
  const switchAccount = useUserStore(state => state.switchAccount);
  const addAccount = useUserStore(state => state.addAccount);
  const removeAccount = useUserStore(state => state.removeAccount);
  const updateAccountProfile = useUserStore(state => state.updateAccountProfile);
  const loadSavedAccounts = useUserStore(state => state.loadSavedAccounts);
  
  return {
    savedAccounts,
    activeAccountDid,
    switchAccount,
    addAccount,
    removeAccount,
    updateAccountProfile,
    loadSavedAccounts,
  };
};

export const useChannelSubscriptions = () => {
  const subscribedChannels = useUserStore(state => state.subscribedChannels);
  const subscribeToChannel = useUserStore(state => state.subscribeToChannel);
  const unsubscribeFromChannel = useUserStore(state => state.unsubscribeFromChannel);
  const isSubscribedToChannel = useUserStore(state => state.isSubscribedToChannel);
  const restoreDefaultChannel = useUserStore(state => state.restoreDefaultChannel);
  const getAvailableDefaultChannels = useUserStore(state => state.getAvailableDefaultChannels);
  const reorderChannels = useUserStore(state => state.reorderChannels);
  const batchSubscribeToChannels = useUserStore(state => state.batchSubscribeToChannels);
  const batchUnsubscribeFromChannels = useUserStore(state => state.batchUnsubscribeFromChannels);
  
  return {
    subscribedChannels,
    subscribeToChannel,
    unsubscribeFromChannel,
    isSubscribedToChannel,
    restoreDefaultChannel,
    getAvailableDefaultChannels,
    reorderChannels,
    batchSubscribeToChannels,
    batchUnsubscribeFromChannels,
  };
};


// Hook for accessing the agent directly
export const useAgent = () => {
  const agent = useUserStore(state => state.agent);
  const oauthSession = useUserStore(state => state.oauthSession);
  
  return {
    agent,
    oauthSession,
  };
};

// Hook for accessing user store state directly
export const useUserStoreState = () => {
  const agent = useUserStore(state => state.agent);
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const currentUser = useUserStore(state => state.currentUser);
  const isAuthenticating = useUserStore(state => state.isAuthenticating);
  
  return {
    agent,
    isAuthenticated,
    currentUser,
    isAuthenticating,
  };
};

// Hook for feed settings
export const useFeedSettings = () => {
  const feedMixingStrategy = useUserStore(state => state.feedMixingStrategy);
  const experimentalFeedsEnabled = useUserStore(state => state.experimentalFeedsEnabled);
  const feedDebugOverlayEnabled = useUserStore(state => state.feedDebugOverlayEnabled);
  const setFeedMixingStrategy = useUserStore(state => state.setFeedMixingStrategy);
  const setExperimentalFeedsEnabled = useUserStore(state => state.setExperimentalFeedsEnabled);
  const setFeedDebugOverlayEnabled = useUserStore(state => state.setFeedDebugOverlayEnabled);
  const getFeedMixingStrategy = useUserStore(state => state.getFeedMixingStrategy);
  const getExperimentalFeedsEnabled = useUserStore(state => state.getExperimentalFeedsEnabled);
  const getFeedDebugOverlayEnabled = useUserStore(state => state.getFeedDebugOverlayEnabled);
  
  return {
    feedMixingStrategy,
    experimentalFeedsEnabled,
    feedDebugOverlayEnabled,
    setFeedMixingStrategy,
    setExperimentalFeedsEnabled,
    setFeedDebugOverlayEnabled,
    getFeedMixingStrategy,
    getExperimentalFeedsEnabled,
    getFeedDebugOverlayEnabled,
  };
};

// Hook for automatically syncing ProfileCache with userStore
export const useProfileCacheSync = () => {
  const currentUser = useUserStore(state => state.currentUser);
  
  useEffect(() => {
    if (currentUser?.did) {
      ProfileCache.setCurrentUserDid(currentUser.did);
    }
    if (currentUser?.handle) {
      ProfileCache.setCurrentUserHandle(currentUser.handle);
    }
  }, [currentUser?.did, currentUser?.handle]);
  
  return { currentUser };
};

// Hook for precaching current user profile on app launch
export const useProfilePrecache = () => {
  const currentUser = useUserStore(state => state.currentUser);
  
  useEffect(() => {
    if (currentUser?.did) {
      ProfileCache.precacheCurrentUserProfile();
    }
  }, [currentUser?.did]);
};

// Hook for moderation functionality
export const useModeration = () => {
  const getModerationOpts = useUserStore(state => state.getModerationOpts);
  const agent = useUserStore(state => state.agent);
  
  return {
    getModerationOpts,
    moderatePost: ModerationService.moderatePost,
    moderateProfile: ModerationService.moderateProfile,
    moderateNotification: ModerationService.moderateNotification,
    getModerationSettings: ModerationService.getModerationSettings,
    saveModerationSettings: async (settings: any) => {
      if (!agent) {
        throw new Error('No agent available. Please ensure you are logged in.');
      }
      return ModerationService.saveModerationSettings(settings, agent);
    },
    syncModerationSettings: async () => {
      if (!agent) {
        throw new Error('No agent available. Please ensure you are logged in.');
      }
      return ModerationService.syncModerationSettings(agent);
    },
    clearModerationCache: ModerationService.clearModerationCache,
  };
};
