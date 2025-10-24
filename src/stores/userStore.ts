/**
 * Unified User State Management
 * Combines user store and account manager functionality
 * Centralizes all user-related state using DIDs as primary identifiers
 * Integrates with @atproto/oauth-client-expo for OAuth session management
 */
import React, { useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Agent } from '@atproto/api';
import { ExpoOAuthClient } from '@atproto/oauth-client-expo';
import { AtProtoOAuthService, OAuthSession } from '../services/auth';
import ProfileCache, { CachedProfile } from '../services/cache/ProfileCache';
import ChannelCache from '../services/cache/ChannelCache';
import { AtprotoService } from '../services/api/AtprotoService';
import { isUserCancellation, getErrorMessage, shouldShowError } from '../utils/errorHandler';
import { analyzeOAuthError } from '../utils/oauthErrorHandler';
import { logger } from '../utils/logger';

import { ModerationService } from '../services/ModerationService';

// Account types
export interface SavedAccount {
  id: string;
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
  lastUsed: number;
  originalIdentifier: string; // The identifier used during initial authentication
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
    originalIdentifier: string | null; // The identifier used during initial authentication
  } | null;
  
  // Authentication state
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  isSwitchingAccount: boolean; // Loading state for account switching
  authError: string | null;
  
  // Account management - using DIDs for all operations
  savedAccounts: SavedAccount[];
  activeAccountDid: string | null;
  
  // Session state - following @atproto/oauth-client-expo patterns
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
  signIn: (identifier: string) => Promise<void>;
  signOut: (clearAllAccounts?: boolean) => Promise<void>;
  restoreSession: (did: string) => Promise<void>;
  
  // Account management
  switchAccount: (did: string, onComplete?: () => void) => Promise<void>;
  addAccount: (oauthSession: OAuthSession, profileData?: any, originalIdentifier?: string) => Promise<void>;
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
  clearCorruptedSessions: () => Promise<void>;
  
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
      signIn: async (identifier: string) => {
        try {
          set({ isAuthenticating: true, authError: null });
          
          const oauthService = AtProtoOAuthService.getInstance();
          const session = await oauthService.signIn(identifier);
          
          // Create agent from session
          const agent = new Agent(session);
          
          // Get user profile
          const profile = await agent.api.app.bsky.actor.getProfile({
            actor: session.sub
          });
          
          const userProfile = profile.data;
          
          // Create account object
          const account: SavedAccount = {
            id: session.sub,
            handle: userProfile.handle,
            did: session.sub,
            displayName: userProfile.displayName || userProfile.handle,
            avatar: userProfile.avatar,
            lastUsed: Date.now(),
            originalIdentifier: identifier
          };
          
          // Update saved accounts list
          const updatedAccounts = [account, ...get().savedAccounts.filter(a => a.did !== session.sub)];
          
          // Persist to SecureStore
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updatedAccounts));
          await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, session.sub);
          
          // Update state
          set({
            currentUser: {
              did: session.sub,
              handle: userProfile.handle,
              displayName: userProfile.displayName || userProfile.handle,
              avatar: userProfile.avatar,
              originalIdentifier: identifier
            },
            isAuthenticated: true,
            isAuthenticating: false,
            authError: null,
            agent: agent,
            activeAccountDid: session.sub,
            oauthSession: session,
            savedAccounts: updatedAccounts
          });
          
          // Cache the profile
          await ProfileCache.cacheProfiles([userProfile]);
          
        } catch (error) {
          // Handle user cancellation silently
          if (isUserCancellation(error)) {
            set({ isAuthenticating: false, authError: null });
            return; // Don't throw error for user cancellation
          }
          
          const errorMessage = getErrorMessage(error);
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
          logger.error('Error during sign out', error, { component: 'userStore' });
          set({ isAuthenticating: false });
          throw error;
        }
      },
      
      restoreSession: async (did: string) => {
        try {
          set({ isAuthenticating: true, authError: null });
          
          const oauthService = AtProtoOAuthService.getInstance();
          
          // Use the improved session validation with automatic refresh
          const session = await oauthService.getValidSession(did);
          
          // Create agent from session
          const agent = new Agent(session);
          
          // Get user profile - use the session's sub (DID) as the actor
          const profile = await agent.api.app.bsky.actor.getProfile({
            actor: session.sub
          });
          
          const userProfile = profile.data;
          
          // Get original identifier from account
          const accounts = get().savedAccounts;
          const account = accounts.find(acc => acc.did === did);
          const originalIdentifier = account?.originalIdentifier || did;
          
          // Update state
          set({
            currentUser: {
              did: session.sub,
              handle: userProfile.handle,
              displayName: userProfile.displayName || userProfile.handle,
              avatar: userProfile.avatar,
              originalIdentifier: originalIdentifier,
            },
            isAuthenticated: true,
            isAuthenticating: false,
            authError: null,
            agent: agent,
            oauthSession: session
          });
          
          // Cache the profile
          await ProfileCache.cacheProfiles([userProfile]);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Session restoration failed';
          
          // Use universal OAuth error analysis
          const errorInfo = analyzeOAuthError(error);
          
          if (errorInfo.requiresReauth) {
            // Session expiration is expected behavior, log as warning
            logger.warn('Session expired, re-authentication required', { component: 'userStore', did });
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
          logger.error('Session restoration failed', error, { component: 'userStore', did });
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
        
        try {
          set({ isSwitchingAccount: true });
          
          const account = get().savedAccounts.find(acc => acc.did === did);
          if (!account) {
            logger.error('Account not found for DID', { component: 'userStore', did });
            throw new Error('Account not found');
          }
          
          // Clear all caches before switching
          await get().clearAllCaches();
          
          // Update account statuses
          const savedAccounts = get().savedAccounts;
          const accounts = savedAccounts.map(acc => ({
            ...acc,
            lastUsed: acc.did === did ? Date.now() : acc.lastUsed,
          }));
          
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, did);
          
          // Try to restore session for the new account
          try {
            await get().restoreSession(did);
          } catch (restoreErr) {
            const restoreMsg = restoreErr instanceof Error ? restoreErr.message : '';
            logger.error('Session restoration failed for account switch', restoreErr, { component: 'userStore', did });
            
            // Use universal OAuth error analysis
            const errorInfo = analyzeOAuthError(restoreErr);
            
            // Clear the user state
            set({ 
              isAuthenticated: false,
              currentUser: null,
              oauthSession: null,
              agent: null,
              isSwitchingAccount: false,
              activeAccountDid: null,
            });
            
            if (errorInfo.requiresReauth) {
              // Throw a specific error that the UI can handle to redirect to login
              throw new Error('oauth_reauth_required');
            } else {
              throw new Error('Session expired - please sign in again');
            }
          }
          
          // Update state
          set({ 
            savedAccounts: accounts,
            activeAccountDid: did,
            isSwitchingAccount: false,
          });
          
          // Load user-specific data
          Promise.all([
            get().loadUserSpecificSettings(did),
            get().loadSubscribedChannels(did),
            get().refreshDeveloperAccess()
          ]).catch(error => {
            logger.warn('Failed to load some user settings', { component: 'userStore', error: error.message });
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
      
      addAccount: async (oauthSession: OAuthSession, profileData?: any, originalIdentifier?: string) => {
        try {
          const accounts = get().savedAccounts;
          
          // Check if account already exists
          const existingAccountIndex = accounts.findIndex(acc => acc.did === oauthSession.did);
          
          // Use provided original identifier or fallback to DID
          const accountOriginalIdentifier = originalIdentifier || oauthSession.did;
          
          const account: SavedAccount = {
            id: oauthSession.did, // Use DID directly as account ID
            handle: profileData?.handle || oauthSession.did,
            did: oauthSession.did,
            displayName: profileData?.displayName || null,
            avatar: profileData?.avatar,
            lastUsed: Date.now(),
            originalIdentifier: accountOriginalIdentifier,
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
          
          // Update lastUsed for the current account
          accounts.forEach(acc => {
            if (acc.did === account.did) {
              acc.lastUsed = Date.now();
            }
          });
          
          // Save accounts
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, account.did);
          
          // Update state
          set({ savedAccounts: accounts, activeAccountDid: account.did });
          
        } catch (error) {
          logger.error('Error adding account', error, { component: 'userStore' });
          throw error;
        }
      },
      
      removeAccount: async (did: string) => {
        try {
          const isActiveAccount = get().activeAccountDid === did;
          
          // If this is the active account, clean up the OAuth session first
          if (isActiveAccount) {
            const oauthService = AtProtoOAuthService.getInstance();
            await oauthService.removeSession(did);
          }
          
          // Remove from saved accounts
          const accounts = get().savedAccounts.filter(acc => acc.did !== did);
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          
          if (isActiveAccount) {
            // If this was the active account, sign out completely
            await get().signOut();
          } else {
            // Just update the accounts list
            set({ savedAccounts: accounts });
          }
          
        } catch (error) {
          logger.error('Error removing account', error, { component: 'userStore' });
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
          logger.error('Error updating account profile', error, { component: 'userStore' });
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
          logger.error('Error subscribing to channel', error, { component: 'userStore' });
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
          logger.error('Error unsubscribing from channel', error, { component: 'userStore' });
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
           logger.error('Error restoring default channel', error, { component: 'userStore' });
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
            logger.error('Error getting available default channels', error, { component: 'userStore' });
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
            logger.error('Error reordering channels', error, { component: 'userStore' });
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
          logger.error('Error batch subscribing to channels', error, { component: 'userStore' });
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
          logger.error('Error batch unsubscribing from channels', error, { component: 'userStore' });
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
          logger.error('Error setting feed mixing strategy', error, { component: 'userStore' });
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
          logger.error('Error setting experimental feeds enabled', error, { component: 'userStore' });
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
          logger.error('Error setting feed debug overlay enabled', error, { component: 'userStore' });
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
          logger.error('Error getting feed mixing strategy', error, { component: 'userStore' });
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
          logger.error('Error getting experimental feeds enabled', error, { component: 'userStore' });
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
          logger.error('Error getting feed debug overlay enabled', error, { component: 'userStore' });
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
          logger.error('Error invalidating user data', error, { component: 'userStore' });
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
          logger.error('Error clearing caches', error, { component: 'userStore' });
        }
      },
      
      // Moderation integration
      getModerationOpts: async () => {
        try {
          const moderationSettings = await ModerationService.getModerationSettings();
          return moderationSettings;
        } catch (error) {
          logger.error('Error getting moderation options', error, { component: 'userStore' });
          return {};
        }
      },
      
      // Session management
      checkSessionHealth: async () => {
        try {
          const currentUser = get().currentUser;
          
          if (!currentUser?.did) {
            return false;
          }
          
          // Check if we have a valid agent
          let isHealthy = false;
          
          try {
            if (get().agent && get().currentUser?.did) {
              // Try to make a simple API call to verify the session is still valid
              await get().agent!.api.app.bsky.actor.getProfile({
                actor: get().currentUser!.did
              });
              isHealthy = true;
            }
          } catch (oauthError) {
            // Session is invalid
            isHealthy = false;
          }
          
          
          // If both session types are unhealthy, sign out the user
          if (!isHealthy && get().isAuthenticated) {
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
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Session health check failed', error, { component: 'userStore' });
          return false;
        }
      },

      checkAccountSessionValidity: async (did: string) => {
        try {
          const account = get().savedAccounts.find(acc => acc.did === did);
          
          if (!account) {
            logger.error('Account not found for DID', { component: 'userStore', did });
            return false;
          }
          
          const oauthService = AtProtoOAuthService.getInstance();
          
          // Use the improved session validation
          try {
            const session = await oauthService.getValidSession(did);
            return !!session;
          } catch (error) {
            logger.debug('Session validation failed for DID', { component: 'userStore', did, error: error instanceof Error ? error.message : 'Unknown error' });
            return false;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Account session validity check failed', error, { component: 'userStore' });
          return false;
        }
      },

      clearCorruptedSessions: async () => {
        try {
          
          // Clear OAuth sessions
          const oauthService = AtProtoOAuthService.getInstance();
          await oauthService.signOut();
          
          
          // Clear secure storage items related to sessions
          try {
            await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);
            // Don't delete all accounts, just clear the active account
          } catch (storageError) {
            logger.warn('Error clearing secure storage', { component: 'userStore', error: storageError });
          }
          
          // Clear state
          set({
            isAuthenticated: false,
            currentUser: null,
            oauthSession: null,
            agent: null,
            activeAccountDid: null,
          });
          
          // Clear all caches
          await get().clearAllCaches();
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Failed to clear corrupted sessions', error, { component: 'userStore' });
          
          // Still try to reset the state even if other cleanup fails
          set({
            isAuthenticated: false,
            currentUser: null,
            oauthSession: null,
            agent: null,
            activeAccountDid: null,
          });
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
            
            // Get account details
            const accounts = get().savedAccounts;
            const account = accounts.find(acc => acc.did === activeAccountDid);
            
            if (!account) {
              logger.warn('Active account not found in saved accounts', { component: 'userStore' });
              set({ activeAccountDid: null });
              return;
            }
            
            // Try to restore session
            let sessionRestored = false;
            
            // First try OAuth session
            try {
              await get().restoreSession(activeAccountDid);
              sessionRestored = true;
            } catch (oauthError) {
              const errorMessage = oauthError instanceof Error ? oauthError.message : 'OAuth session restoration failed';
              
            }
            
            // If no session could be restored, clear the active account
            if (!sessionRestored) {
              set({ 
                isAuthenticated: false,
                currentUser: null,
                oauthSession: null,
                agent: null,
                activeAccountDid: null,
              });
            } else {
              // Check developer access
              await get().refreshDeveloperAccess();
            }
          } else {
          }
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Error initializing user state', error, { component: 'userStore' });
          
          // Clear state to be safe
          set({ 
            isAuthenticated: false,
            currentUser: null,
            oauthSession: null,
            agent: null,
            activeAccountDid: null,
          });
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
          // Load accounts without isActive flag (determined by activeAccountDid)
          const normalized = Array.isArray(accounts) ? accounts : [];
          
          // Migration: Convert old accounts with pdsUrl to new originalIdentifier format
          const migratedAccounts = normalized.map((account: any) => {
            if (account.pdsUrl && !account.originalIdentifier) {
              // For backward compatibility, use handle as originalIdentifier (most common case)
              return {
                ...account,
                originalIdentifier: account.handle || account.did,
                pdsUrl: undefined // Remove old field
              };
            }
            return account;
          });
          
          set({ savedAccounts: migratedAccounts });
        } catch (error) {
          logger.error('Error loading saved accounts', error, { component: 'userStore' });
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
          logger.error('Error loading user-specific settings', error, { component: 'userStore' });
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
              logger.warn('Migration from v1 to v2 failed', { component: 'userStore', error: migrationError });
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
          logger.error('Error loading subscribed channels', error, { component: 'userStore' });
          set({ subscribedChannels: DEFAULT_CHANNELS });
        }
      },
      
      // Developer access management
      refreshDeveloperAccess: async () => {
        try {
          const { agent, currentUser, developerListUri, developerCacheTimestamp } = get();
          
          if (!agent || !currentUser?.did) {
            logger.warn('No agent or current user for developer access check', { component: 'userStore' });
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
              logger.error('Error fetching developer list', error, { component: 'userStore' });
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
          logger.error('Error refreshing developer access', error, { component: 'userStore' });
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
  const checkAccountSessionValidity = useUserStore(state => state.checkAccountSessionValidity);
  const clearCorruptedSessions = useUserStore(state => state.clearCorruptedSessions);
  
  return {
    savedAccounts,
    activeAccountDid,
    switchAccount,
    addAccount,
    removeAccount,
    updateAccountProfile,
    loadSavedAccounts,
    checkAccountSessionValidity,
    clearCorruptedSessions,
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
