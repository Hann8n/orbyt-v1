/**
 * Unified User State Management
 * Combines user store and account manager functionality
 * Centralizes all user-related state using DIDs as primary identifiers
 * Integrates with @atproto/oauth-client-expo for OAuth session management
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
// Note: Using individual selectors instead of shallow comparison for better performance
import { storageAdapter, storageHelpers, storage } from '../utils/storage/storage';
import * as SecureStore from 'expo-secure-store';
import { Agent } from '@atproto/api';
import { AtProtoOAuthService } from '../services/auth';
import type { OAuthSession } from '@atproto/oauth-client';
import ProfileService from '../services/data/ProfileService';
import { AtprotoService } from '../services/api/AtprotoService';
import { isUserCancellation, getErrorMessage } from '../utils/errors/errorHandler';
import { analyzeOAuthError } from '../utils/errors/oauth';
import { logger } from '../utils/logger';

import { ModerationService } from '../services/moderation/ModerationService';
import type { OrbytProfileRecord } from '../services/api/types';
import { isOrbytChannel } from '../utils/channels/orbyt';
import { queryClient } from '../utils/query/queryClient';
import { usePostInteractionStore } from './postInteractionStore';
import { queryKeys } from '../utils/query/queryKeys';
import { prefetchOrbytColors, loadPersistedColors } from '../hooks/useOrbytColors';
import { ALGORITHMIC_FEED_PROVIDERS, APP_CONSTANTS } from '../utils/constants';

// Note: FeedService is no longer needed here - React Query handles all feed caching

/**
 * Prefetch Orbyt colors for a user and their following (non-blocking)
 * Called after sign in or session restore to warm the cache
 */
async function prefetchColorsForUser(userDid: string): Promise<void> {
  try {
    const { GraphService } = await import('../services/api/graph/GraphService');
    const followingResponse = await GraphService.getFollowing(userDid, null, 100);
    const followingDids = followingResponse.following.map(f => f.did);
    const dids = [userDid, ...followingDids].slice(0, 100);
    await prefetchOrbytColors(dids);
  } catch (error) {
    logger.warn('Failed to prefetch Orbyt colors', {
      component: 'userStore',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

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

// Subscribed channel/feed types
export interface SubscribedChannel {
  uri: string; // Can be either a hashtag feed (e.g., "hashtag:orbyt-channel-art") or feed generator URI (e.g., "at://did:plc:.../app.bsky.feed.generator/...")
  displayName: string;
  description?: string;
  avatar?: string;
  memberCount?: number;
  isOrbytChannel?: boolean; // True if this is an Orbyt-managed hashtag feed
  subscribedAt: number;
}

// User state types - DID-centric design
interface UserState {
  // Current user information - DID is the primary identifier
  // Uses API structure directly: ProfileView uses string | undefined for optional fields
  currentUser: {
    did: string | null; // Primary identifier - immutable
    handle: string | null; // Display identifier - can change
    displayName?: string; // Matches ProfileView.displayName (string | undefined)
    avatar?: string; // Matches ProfileView.avatar (string | undefined)
    originalIdentifier: string; // The identifier used during initial authentication
    emailConfirmed?: boolean; // Email confirmation status from API (only set if email scope is available)
  } | null;

  // Authentication state
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  isInitializingAuth: boolean; // Loading state for initial auth state restoration
  isSwitchingAccount: boolean; // Loading state for account switching
  switchingToHandle: string | null;
  switchingToAvatar?: string | null;
  authError: string | null;

  // Account management - using DIDs for all operations
  savedAccounts: SavedAccount[];
  activeAccountDid: string | null;

  // Session state - following @atproto/oauth-client-expo patterns
  oauthSession: OAuthSession | null;
  agent?: Agent; // Matches API expectations (Agent | undefined)

  // User-specific settings - scoped by DID
  feedDebugOverlayEnabled: boolean;
  nativeTabsEnabled: boolean; // Experimental: Use native tabs instead of custom JavaScript tab bar
  modalProfileEnabled: boolean; // Labs: Enable modal profile presentation with pull-to-dismiss

  // Algorithmic feed provider - scoped by DID
  algorithmicFeedProvider: string | null; // Feed URI or null for none

  // Subscribed channels - scoped by DID
  subscribedChannels: SubscribedChannel[];

  // Email verification modal state
  showEmailVerificationModal: boolean;

  // Actions
  // Authentication
  signIn: (identifier: string) => Promise<void>;
  signOut: (clearAllAccounts?: boolean) => Promise<void>;
  restoreSession: (did: string) => Promise<void>;

  // Account management
  switchAccount: (did: string, onComplete?: () => void) => Promise<void>;
  addAccount: (
    oauthSession: OAuthSession,
    profileData?: { displayName?: string; avatar?: string; handle?: string; did?: string },
    originalIdentifier?: string
  ) => Promise<void>;
  removeAccount: (did: string) => Promise<void>;
  updateAccountProfile: (
    did: string,
    profileData: { displayName?: string; avatar?: string; handle?: string }
  ) => Promise<void>;

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

  // Batch operations for efficiency
  batchSubscribeToChannels: (
    channels: Array<{
      uri: string;
      displayName: string;
      description?: string;
      avatar?: string;
      memberCount?: number;
    }>
  ) => Promise<void>;
  batchUnsubscribeFromChannels: (uris: string[]) => Promise<void>;

  // Feed settings
  setFeedDebugOverlayEnabled: (enabled: boolean) => Promise<void>;
  getFeedDebugOverlayEnabled: () => Promise<boolean>;
  setNativeTabsEnabled: (enabled: boolean) => Promise<void>;
  getNativeTabsEnabled: () => Promise<boolean>;
  setModalProfileEnabled: (enabled: boolean) => Promise<void>;
  getModalProfileEnabled: () => Promise<boolean>;

  // Algorithmic feed provider
  setAlgorithmicFeedProvider: (uri: string | null) => Promise<void>;
  getAlgorithmicFeedProvider: () => Promise<string | null>;

  // State management
  setCurrentUser: (user: UserState['currentUser']) => void;
  setAuthenticating: (authenticating: boolean) => void;
  setAuthError: (error: string | null) => void;
  clearAuthError: () => void;

  // Email verification modal management
  setShowEmailVerificationModal: (show: boolean) => void;

  // Data invalidation
  invalidateAllUserData: () => Promise<void>;
  clearAllCaches: () => Promise<void>;

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
  SUBSCRIBED_CHANNELS: 'subscribed_channels',
  ALGORITHMIC_FEED_PROVIDER: 'algorithmic_feed_provider',
} as const;

// Built-in channels that are always available but never in subscribed channels
const BUILT_IN_CHANNELS = ['following', 'your-mix'];

// Helper to filter out built-in channels
const filterBuiltInChannels = (uris: string[]): string[] => {
  return uris.filter(uri => !BUILT_IN_CHANNELS.includes(uri));
};

// Helper function to get user-scoped storage key
const getUserScopedKey = (baseKey: string, did: string): string => {
  const sanitizedDid = String(did).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${baseKey}_${sanitizedDid}`;
};

// Helper to check if email verification is required
// Returns true if user has email but it's not confirmed
export const isEmailVerificationRequired = (currentUser: UserState['currentUser']): boolean => {
  if (!currentUser) return false;
  const hasEmail = currentUser.emailConfirmed !== undefined;
  return hasEmail && currentUser.emailConfirmed === false;
};

// Helper to defer orbyt profile initialization (non-critical, improves startup performance)
const deferOrbytProfileInit = (context: string = 'userStore') => {
  requestIdleCallback(
    async () => {
      try {
        await AtprotoService.initOrbytProfileIfNeeded();
      } catch (error) {
        logger.debug(`Failed to initialize orbyt profile (${context})`, {
          component: 'userStore',
          error,
        });
      }
    },
    { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
  );
};

// Helper to get storage key for boolean flags (scoped by user DID)
const getFlagKey = (keyBase: string, did: string | null) => (did ? `${keyBase}_${did}` : keyBase);

// Create the unified user store with persistence
export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentUser: null,
      isAuthenticated: false,
      isAuthenticating: false,
      isInitializingAuth: true, // Start as true - will be set to false after initial auth state is loaded
      isSwitchingAccount: false,
      switchingToHandle: null,
      switchingToAvatar: null,
      authError: null,
      savedAccounts: [],
      activeAccountDid: null,
      oauthSession: null,
      agent: undefined,

      // Feed settings
      feedDebugOverlayEnabled: false, // Keep disabled by default, user can enable manually
      nativeTabsEnabled: false, // Default to custom JavaScript tab bar
      modalProfileEnabled: false, // Labs feature - disabled by default

      // Algorithmic feed provider - default to Videos For You
      algorithmicFeedProvider: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri,

      // Subscribed channels
      subscribedChannels: [],

      // Email verification modal state
      showEmailVerificationModal: false,

      // Authentication actions
      signIn: async (identifier: string) => {
        try {
          set({ isAuthenticating: true, authError: null });

          const oauthService = AtProtoOAuthService.getInstance();
          const client = await oauthService.getClient();
          const session = await client.signIn(identifier);

          // Create agent from session - Agent accepts OAuthSession directly
          const agent = new Agent(session);

          // Get user profile and email verification status in parallel
          const [profile, sessionInfo] = await Promise.all([
            agent.api.app.bsky.actor.getProfile({
              actor: session.did,
            }),
            agent.api.com.atproto.server.getSession(),
          ]);

          const userProfile = profile.data;
          // Only set emailConfirmed if email exists (has scope). Leave undefined if no email scope.
          // Use API field name directly: emailConfirmed
          const emailConfirmed =
            sessionInfo.data.email !== undefined && sessionInfo.data.email !== null
              ? sessionInfo.data.emailConfirmed
              : undefined;

          // Create account object
          const account: SavedAccount = {
            id: session.did,
            handle: userProfile.handle,
            did: session.did,
            displayName: userProfile.displayName || userProfile.handle,
            avatar: userProfile.avatar,
            lastUsed: Date.now(),
            originalIdentifier: identifier || session.did,
          };

          // Update saved accounts list
          const updatedAccounts = [
            account,
            ...get().savedAccounts.filter(a => a.did !== session.did),
          ];

          // Persist to SecureStore
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updatedAccounts));
          await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, session.did);

          // Update state
          set({
            currentUser: {
              did: session.did,
              handle: userProfile.handle,
              displayName: userProfile.displayName, // Use API structure directly
              avatar: userProfile.avatar, // Use API structure directly
              originalIdentifier: identifier,
              emailConfirmed,
            },
            isAuthenticated: true,
            isAuthenticating: false,
            authError: null,
            agent: agent,
            activeAccountDid: session.did,
            oauthSession: session,
            savedAccounts: updatedAccounts,
          });

          // Show email verification modal once on initial login for unverified users
          const newCurrentUser: UserState['currentUser'] = {
            did: session.did,
            handle: userProfile.handle,
            displayName: userProfile.displayName,
            avatar: userProfile.avatar,
            originalIdentifier: identifier,
            emailConfirmed,
          };
          if (isEmailVerificationRequired(newCurrentUser)) {
            set({ showEmailVerificationModal: true });
          }

          // Initialize orbyt profile record (join date, baseline colors/channels)
          // Defer until after interactions complete to improve startup performance
          deferOrbytProfileInit('signIn');

          // Prefetch Orbyt colors for current user and followed users (non-blocking)
          prefetchColorsForUser(session.did);
        } catch (error) {
          // Handle user cancellation silently
          if (isUserCancellation(error)) {
            set({ isAuthenticating: false, authError: null });
            return; // Don't throw error for user cancellation
          }

          const errorMessage = getErrorMessage(error);
          set({
            isAuthenticating: false,
            authError: errorMessage,
          });
          throw error;
        }
      },

      signOut: async (clearAllAccounts: boolean = false) => {
        try {
          set({ isAuthenticating: true });

          const currentDid = get().activeAccountDid;
          const oauthService = AtProtoOAuthService.getInstance();

          if (currentDid) {
            try {
              const client = await oauthService.getClient();
              await client.revoke(currentDid);
            } catch (error) {
              // Log but don't fail - session may already be invalid
              logger.warn('Failed to revoke session during sign out', {
                component: 'userStore',
                did: currentDid,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }

          // Clear all user data
          await get().invalidateAllUserData();

          // Only clear the OAuth client instance if clearing all accounts
          // For single account sign out, keep the client so other accounts remain accessible
          if (clearAllAccounts) {
            oauthService.clearClient();
            await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCOUNTS);
          }

          // Clear active account - user has logged out
          await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);

          // Reset state
          set({
            currentUser: null,
            isAuthenticated: false,
            isAuthenticating: false,
            switchingToHandle: null,
            switchingToAvatar: null,
            authError: null,
            oauthSession: null,
            agent: undefined, // Use undefined to match API expectations
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

          // Load persisted colors immediately for instant profile display
          await loadPersistedColors(did);

          const oauthService = AtProtoOAuthService.getInstance();
          const client = await oauthService.getClient();
          const session = await client.restore(did);

          // Create agent from session - Agent accepts OAuthSession directly
          const agent = new Agent(session);

          // Get user profile and email verification status in parallel
          const [profile, sessionInfo] = await Promise.all([
            agent.api.app.bsky.actor.getProfile({
              actor: session.did,
            }),
            agent.api.com.atproto.server.getSession(),
          ]);

          const userProfile = profile.data;
          // Only set emailConfirmed if email exists (has scope). Leave undefined if no email scope.
          // Use API field name directly: emailConfirmed
          const emailConfirmed =
            sessionInfo.data.email !== undefined && sessionInfo.data.email !== null
              ? sessionInfo.data.emailConfirmed
              : undefined;

          // Get original identifier from account
          const accounts = get().savedAccounts;
          const account = accounts.find(acc => acc.did === did);
          const originalIdentifier = account?.originalIdentifier ?? did;

          // Update state
          set({
            currentUser: {
              did: session.did,
              handle: userProfile.handle,
              displayName: userProfile.displayName, // Use API structure directly
              avatar: userProfile.avatar, // Use API structure directly
              originalIdentifier: originalIdentifier,
              emailConfirmed,
            },
            isAuthenticated: true,
            isAuthenticating: false,
            authError: null,
            agent: agent,
            oauthSession: session,
          });

          // Show email verification modal once on initial login for unverified users
          // Only show on first-time restore (not account switch) - check if we already have an active account
          const newCurrentUser: UserState['currentUser'] = {
            did: session.did,
            handle: userProfile.handle,
            displayName: userProfile.displayName,
            avatar: userProfile.avatar,
            originalIdentifier: originalIdentifier,
            emailConfirmed,
          };
          const existingActiveAccount = get().activeAccountDid;
          if (existingActiveAccount === null && isEmailVerificationRequired(newCurrentUser)) {
            set({ showEmailVerificationModal: true });
          }

          // Moderation prefs are now loaded via React Query (useModerationSettings hook)
          // No need to hydrate from MMKV - React Query handles caching

          // Initialize orbyt profile record (join date, baseline colors/channels)
          // Defer until after interactions complete to improve startup performance
          deferOrbytProfileInit('restoreSession');

          // Prefetch Orbyt colors for current user and followed users (non-blocking)
          prefetchColorsForUser(session.did);

          // Load and clean subscribed channels after session restore
          // This ensures built-in channels are removed from both state and profile record
          // Already non-blocking (Promise.all not awaited), so no need to defer further
          Promise.all([
            get().loadUserSpecificSettings(session.did),
            get().loadSubscribedChannels(session.did),
          ]).catch(error => {
            logger.warn('Failed to load some user settings after session restore', {
              component: 'userStore',
              error: error.message,
            });
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Session restoration failed';

          // Use universal OAuth error analysis - package throws appropriate errors
          const errorInfo = analyzeOAuthError(error);

          if (errorInfo.requiresReauth) {
            // Session expiration is expected behavior, log as warning (not error)
            logger.warn('Session expired, re-authentication required', {
              component: 'userStore',
              did,
            });
            set({
              isAuthenticating: false,
              isAuthenticated: false,
              currentUser: null,
              oauthSession: null,
              agent: undefined,
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
            agent: undefined,
            activeAccountDid: null,
          });
          throw error;
        }
      },

      // Account management actions
      switchAccount: async (did: string, onComplete?: () => void) => {
        try {
          const account = get().savedAccounts.find(acc => acc.did === did);
          set({
            isSwitchingAccount: true,
            switchingToHandle: account?.handle || account?.did || null,
            switchingToAvatar: account?.avatar || null,
          });

          if (!account) {
            logger.error('Account not found for DID', { component: 'userStore', did });
            throw new Error('Account not found');
          }

          // Clear all caches before switching - this ensures no stale data from previous account
          await get().clearAllCaches();

          // Update account statuses
          const savedAccounts = get().savedAccounts;
          const accounts = savedAccounts.map(acc => ({
            ...acc,
            lastUsed: acc.did === did ? Date.now() : acc.lastUsed,
          }));

          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, did);

          // Restore session for the new account
          // The OAuth client package handles session switching internally via restore()
          // No need to manually clear the client - it manages multiple sessions by DID
          try {
            await get().restoreSession(did);

            // Verify agent is set before proceeding
            const state = get();
            if (!state.agent) {
              throw new Error('Agent not available after session restore');
            }

            // Update state - keep isSwitchingAccount true until data is loaded
            set({
              savedAccounts: accounts,
              activeAccountDid: did,
            });

            // Load user-specific data and wait for it to complete
            // Settings are needed for feed rendering (algorithmicFeedProvider, subscribedChannels)
            await Promise.all([
              get().loadUserSpecificSettings(did),
              get().loadSubscribedChannels(did),
            ]).catch(error => {
              logger.warn('Failed to load some user settings', {
                component: 'userStore',
                error: error.message,
              });
            });

            // Set isSwitchingAccount to false AFTER settings are loaded
            // This ensures feeds have correct settings before they start fetching
            set({ isSwitchingAccount: false, switchingToHandle: null, switchingToAvatar: null });

            // Initialize orbyt profile record now that API client is ready
            // Defer until after interactions complete to improve account switch performance
            deferOrbytProfileInit('switchAccount');

            // Invalidate ALL React Query queries to trigger fresh data fetch for the new account
            // This ensures feeds, profiles, channels, and all user-specific data refreshes
            // Feeds will now be enabled (because isSwitchingAccount is false) and can fetch successfully
            queryClient.invalidateQueries();
          } catch (restoreErr) {
            logger.error('Session restoration failed for account switch', restoreErr, {
              component: 'userStore',
              did,
            });

            // Use universal OAuth error analysis
            const errorInfo = analyzeOAuthError(restoreErr);

            // Clear the user state
            set({
              isAuthenticated: false,
              currentUser: null,
              oauthSession: null,
              agent: undefined,
              isSwitchingAccount: false,
              switchingToHandle: null,
              switchingToAvatar: null,
              activeAccountDid: null,
            });

            if (errorInfo.requiresReauth) {
              // Throw a specific error that the UI can handle to redirect to login
              throw new Error('oauth_reauth_required');
            } else {
              throw new Error('Session expired - please sign in again');
            }
          }

          // Call completion callback if provided
          if (onComplete) {
            onComplete();
          }
        } catch (error) {
          set({ isSwitchingAccount: false, switchingToHandle: null, switchingToAvatar: null });
          throw error;
        }
      },

      addAccount: async (
        oauthSession: OAuthSession,
        profileData?: { displayName?: string; avatar?: string; handle?: string; did?: string },
        originalIdentifier?: string
      ) => {
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
            displayName: profileData?.displayName,
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
            const client = await oauthService.getClient();
            await client.revoke(did);
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

      updateAccountProfile: async (
        did: string,
        profileData: { displayName?: string; avatar?: string; handle?: string }
      ) => {
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
              currentUser: state.currentUser
                ? {
                    ...state.currentUser,
                    displayName: profileData.displayName ?? state.currentUser.displayName,
                    avatar: profileData.avatar ?? state.currentUser.avatar,
                    handle: profileData.handle || state.currentUser.handle,
                  }
                : null,
            }));
          }

          // Update state
          set({ savedAccounts: accounts });
        } catch (error) {
          logger.error('Error updating account profile', error, { component: 'userStore' });
          throw error;
        }
      },

      // Channel/feed subscription management
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

          // Don't allow subscribing to built-in channels
          if (BUILT_IN_CHANNELS.includes(channelData.uri)) {
            throw new Error('Cannot subscribe to built-in channels');
          }

          const channels = get().subscribedChannels;

          // Check if already subscribed
          const existingIndex = channels.findIndex(ch => ch.uri === channelData.uri);

          if (existingIndex >= 0) {
            // Update existing channel/feed
            const updatedChannels = [...channels];
            updatedChannels[existingIndex] = {
              ...updatedChannels[existingIndex],
              ...channelData,
              isOrbytChannel: isOrbytChannel(channelData.uri),
              subscribedAt: Date.now(),
            };
            set({ subscribedChannels: updatedChannels });
          } else {
            // Add new channel/feed
            const newChannel: SubscribedChannel = {
              ...channelData,
              isOrbytChannel: isOrbytChannel(channelData.uri),
              subscribedAt: Date.now(),
            };
            set({ subscribedChannels: [...channels, newChannel] });
          }

          // Filter out built-in channels before saving
          const channelsToSave = get().subscribedChannels.filter(
            ch => !BUILT_IN_CHANNELS.includes(ch.uri)
          );

          // Save to storage
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          await storageHelpers.setItem(key, JSON.stringify(channelsToSave));

          // Sync subscribed channels to orbyt profile record (best-effort)
          try {
            const urisToSync = filterBuiltInChannels(get().subscribedChannels.map(ch => ch.uri));
            await AtprotoService.updateOrbytProfileChannels(urisToSync);
          } catch {
            // Best-effort sync, ignore errors
          }
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

          // Don't allow unsubscribing from built-in channels
          if (BUILT_IN_CHANNELS.includes(uri)) {
            throw new Error('Cannot unsubscribe from built-in channels');
          }

          const channels = get().subscribedChannels;
          const updatedChannels = channels.filter(ch => ch.uri !== uri);

          set({ subscribedChannels: updatedChannels });

          // Save to storage (filter built-ins)
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          const channelsToSave = updatedChannels.filter(ch => !BUILT_IN_CHANNELS.includes(ch.uri));
          await storageHelpers.setItem(key, JSON.stringify(channelsToSave));

          // Sync subscribed channels to orbyt profile record (best-effort)
          try {
            const urisToSync = filterBuiltInChannels(updatedChannels.map(ch => ch.uri));
            await AtprotoService.updateOrbytProfileChannels(urisToSync);
          } catch {
            // Best-effort sync, ignore errors
          }
        } catch (error) {
          logger.error('Error unsubscribing from channel', error, { component: 'userStore' });
          throw error;
        }
      },

      isSubscribedToChannel: (uri: string) => {
        // Built-in channels are always "available" but not in subscribed channels
        if (BUILT_IN_CHANNELS.includes(uri)) {
          return false;
        }
        return get().subscribedChannels.some(ch => ch.uri === uri);
      },

      // Batch operations for efficiency
      batchSubscribeToChannels: async (
        channels: Array<{
          uri: string;
          displayName: string;
          description?: string;
          avatar?: string;
          memberCount?: number;
        }>
      ) => {
        try {
          const currentUser = get().currentUser;
          if (!currentUser?.did) {
            throw new Error('No active user');
          }

          const currentChannels = get().subscribedChannels;
          const newChannels: SubscribedChannel[] = [];
          const processedUris = new Set<string>();

          // Process all channels in batch
          for (const channelData of channels) {
            processedUris.add(channelData.uri);
            const existingIndex = currentChannels.findIndex(ch => ch.uri === channelData.uri);

            if (existingIndex >= 0) {
              // Update existing channel/feed
              newChannels.push({
                ...currentChannels[existingIndex],
                ...channelData,
                isOrbytChannel: isOrbytChannel(channelData.uri),
                subscribedAt: Date.now(),
              });
            } else {
              // Add new channel/feed
              newChannels.push({
                ...channelData,
                isOrbytChannel: isOrbytChannel(channelData.uri),
                subscribedAt: Date.now(),
              });
            }
          }

          // Filter out channels that were processed (to avoid duplicates)
          const remainingChannels = currentChannels.filter(ch => !processedUris.has(ch.uri));

          // Update state with remaining channels + new/updated channels
          set({ subscribedChannels: [...remainingChannels, ...newChannels] });

          // Single storage operation for all changes (filter built-ins)
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          const channelsToSave = get().subscribedChannels.filter(
            ch => !BUILT_IN_CHANNELS.includes(ch.uri)
          );
          await storageHelpers.setItem(key, JSON.stringify(channelsToSave));

          // Sync subscribed channels to orbyt profile record (best-effort)
          try {
            const urisToSync = filterBuiltInChannels(get().subscribedChannels.map(ch => ch.uri));
            await AtprotoService.updateOrbytProfileChannels(urisToSync);
          } catch {
            // Best-effort sync, ignore errors
          }
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

          // Filter out built-in channels - can't unsubscribe from them
          const validUris = uris.filter(uri => !BUILT_IN_CHANNELS.includes(uri));

          const currentChannels = get().subscribedChannels;
          // Filter out unsubscribed channels
          const updatedChannels = currentChannels.filter(ch => !validUris.includes(ch.uri));
          set({ subscribedChannels: updatedChannels });

          // Single storage operation for all changes (filter built-ins)
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
          const channelsToSave = updatedChannels.filter(ch => !BUILT_IN_CHANNELS.includes(ch.uri));
          await storageHelpers.setItem(key, JSON.stringify(channelsToSave));

          // Sync subscribed channels to orbyt profile record (best-effort)
          try {
            const urisToSync = filterBuiltInChannels(updatedChannels.map(ch => ch.uri));
            await AtprotoService.updateOrbytProfileChannels(urisToSync);
          } catch {
            // Best-effort sync, ignore errors
          }
        } catch (error) {
          logger.error('Error batch unsubscribing from channels', error, {
            component: 'userStore',
          });
          throw error;
        }
      },

      // Feed settings actions - simplified boolean flag methods
      setFeedDebugOverlayEnabled: async (enabled: boolean) => {
        storage.set(
          getFlagKey('feed_debug_overlay_enabled', get().currentUser?.did ?? null),
          enabled
        );
        set({ feedDebugOverlayEnabled: enabled });
      },
      getFeedDebugOverlayEnabled: async () =>
        storage.getBoolean(
          getFlagKey('feed_debug_overlay_enabled', get().currentUser?.did ?? null)
        ) ?? false,
      setNativeTabsEnabled: async (enabled: boolean) => {
        storage.set(getFlagKey('native_tabs_enabled', get().currentUser?.did ?? null), enabled);
        set({ nativeTabsEnabled: enabled });
      },
      getNativeTabsEnabled: async () =>
        storage.getBoolean(getFlagKey('native_tabs_enabled', get().currentUser?.did ?? null)) ??
        false,
      setModalProfileEnabled: async (enabled: boolean) => {
        storage.set(getFlagKey('modal_profile_enabled', get().currentUser?.did ?? null), enabled);
        set({ modalProfileEnabled: enabled });
      },
      getModalProfileEnabled: async () =>
        storage.getBoolean(getFlagKey('modal_profile_enabled', get().currentUser?.did ?? null)) ??
        false,

      // Algorithmic feed provider actions
      setAlgorithmicFeedProvider: async (uri: string | null) => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did
            ? getUserScopedKey(STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER, currentUser.did)
            : STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER;

          if (uri === null) {
            await storageHelpers.removeItem(key);
          } else {
            await storageHelpers.setItem(key, uri);
          }

          set({ algorithmicFeedProvider: uri });

          // Sync algorithmic feed provider to orbyt profile record (best-effort)
          try {
            await AtprotoService.updateOrbytProfileAlgorithmicFeedProvider(uri);
          } catch {
            // Best-effort sync, ignore errors
          }

          // Remove all cached your-mix queries and refetch with new provider
          const currentUserDid = get().currentUser?.did;
          if (currentUserDid) {
            queryClient.removeQueries({
              queryKey: queryKeys.feed.byUser('your-mix', currentUserDid),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.feed.byUser('your-mix', currentUserDid),
              refetchType: 'active',
            });
          }
        } catch (error) {
          logger.error('Error setting algorithmic feed provider', error, {
            component: 'userStore',
          });
          throw error;
        }
      },

      getAlgorithmicFeedProvider: async () => {
        try {
          const currentUser = get().currentUser;
          const key = currentUser?.did
            ? getUserScopedKey(STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER, currentUser.did)
            : STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER;
          const value = await storageHelpers.getItem(key);
          // Default to Bluesky Video if not set
          return value ?? ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri;
        } catch (error) {
          logger.error('Error getting algorithmic feed provider', error, {
            component: 'userStore',
          });
          return ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri;
        }
      },

      // State management actions
      setCurrentUser: user => set({ currentUser: user }),
      setAuthenticating: authenticating => set({ isAuthenticating: authenticating }),
      setAuthError: error => set({ authError: error }),
      clearAuthError: () => set({ authError: null }),

      // Email verification modal management
      setShowEmailVerificationModal: show => set({ showEmailVerificationModal: show }),

      // Data invalidation actions
      invalidateAllUserData: async () => {
        try {
          // Clear all caches
          await get().clearAllCaches();
        } catch (error) {
          logger.error('Error invalidating user data', error, { component: 'userStore' });
        }
      },

      clearAllCaches: async () => {
        try {
          // Clear React Query cache (single source of truth for all data)
          queryClient.clear();

          // Clear post interaction cache
          usePostInteractionStore.getState().clearInteractions();

          // Clear follow state cache
          const { useFollowStore } = await import('./followStore');
          useFollowStore.getState().clearFollows();

          // Clear profile interaction flags
          const { useProfileInteractionStore } = await import('./profileInteractionStore');
          useProfileInteractionStore.getState().clearAll();

          // Clear moderation prefs/labelDefs so next account gets fresh data
          // Moderation prefs are managed by React Query - invalidate cache on logout
          queryClient.removeQueries({ queryKey: queryKeys.moderation.all });

          // Note: All data caching is now handled by React Query
          // Custom caches (ProfileCache, ChannelCache, AtprotoService) have been removed
        } catch (error) {
          logger.error('Error clearing caches', error, { component: 'userStore' });
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
            const agent = get().agent;
            const userDid = get().currentUser?.did;
            if (agent && userDid) {
              // Try to make a simple API call to verify the session is still valid
              await agent.api.app.bsky.actor.getProfile({
                actor: userDid,
              });
              isHealthy = true;
            }
          } catch {
            // Session is invalid
            isHealthy = false;
          }

          // If both session types are unhealthy, sign out the user
          if (!isHealthy && get().isAuthenticated) {
            set({
              isAuthenticated: false,
              currentUser: null,
              oauthSession: null,
              agent: undefined,
              activeAccountDid: null,
            });
          }

          return isHealthy;
        } catch (error) {
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
          const client = await oauthService.getClient();

          // Use the package's restore method for validation
          try {
            const session = await client.restore(did);
            return !!session;
          } catch (error) {
            logger.debug('Session validation failed for DID', {
              component: 'userStore',
              did,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
          }
        } catch (error) {
          logger.error('Account session validity check failed', error, { component: 'userStore' });
          return false;
        }
      },

      clearCorruptedSessions: async () => {
        try {
          const currentDid = get().activeAccountDid;
          const oauthService = AtProtoOAuthService.getInstance();

          // Try to revoke the current session if we have one
          // This is a best-effort cleanup for corrupted sessions
          if (currentDid) {
            try {
              const client = await oauthService.getClient();
              await client.revoke(currentDid);
            } catch (error) {
              // If revoke fails (session already corrupted), that's okay
              logger.debug('Could not revoke corrupted session', {
                component: 'userStore',
                did: currentDid,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }

          // Clear OAuth client instance to force recreation on next use
          // This is acceptable for corrupted sessions as we need a fresh client
          oauthService.clearClient();

          // Clear secure storage items related to sessions
          try {
            await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);
            // Don't delete all accounts, just clear the active account
          } catch (storageError) {
            logger.warn('Error clearing secure storage', {
              component: 'userStore',
              error: storageError,
            });
          }

          // Clear state
          set({
            isAuthenticated: false,
            currentUser: null,
            oauthSession: null,
            agent: undefined,
            activeAccountDid: null,
          });

          // Clear all caches
          await get().clearAllCaches();
        } catch (error) {
          logger.error('Failed to clear corrupted sessions', error, { component: 'userStore' });

          // Still try to reset the state even if other cleanup fails
          set({
            isAuthenticated: false,
            currentUser: null,
            oauthSession: null,
            agent: undefined,
            activeAccountDid: null,
          });
        }
      },

      // Initialization actions
      initializeUserState: async () => {
        // Set loading state at start
        set({ isInitializingAuth: true });

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
            } catch {
              // Session restoration failed - will be handled below
            }

            // If no session could be restored, clear the active account
            if (!sessionRestored) {
              set({
                isAuthenticated: false,
                currentUser: null,
                oauthSession: null,
                agent: undefined,
                activeAccountDid: null,
              });
            } else {
              // Initialize subscription store in background after interactions complete
              requestIdleCallback(
                async () => {
                  try {
                    const { useSubscriptionStore } = await import('./subscriptionStore');
                    await useSubscriptionStore.getState().initialize();
                  } catch {
                    // Silent failure - subscriptions are not critical
                  }
                },
                { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
              );
            }
          }
        } catch (error) {
          logger.error('Error initializing user state', error, { component: 'userStore' });

          // Clear state to be safe
          set({
            isAuthenticated: false,
            currentUser: null,
            oauthSession: null,
            agent: undefined,
            activeAccountDid: null,
          });
        } finally {
          // Always set loading to false when done
          set({ isInitializingAuth: false });
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
          const migratedAccounts = normalized.map((account: SavedAccount & { pdsUrl?: string }) => {
            if (account.pdsUrl && !account.originalIdentifier) {
              // For backward compatibility, use handle as originalIdentifier (most common case)
              return {
                ...account,
                originalIdentifier: account.handle || account.did,
                pdsUrl: undefined, // Remove old field
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
          const feedDebugOverlayEnabled = await get().getFeedDebugOverlayEnabled();
          const nativeTabsEnabled = await get().getNativeTabsEnabled();
          const modalProfileEnabled = await get().getModalProfileEnabled();

          // Record-first backfill: Load algorithmic feed provider from profile record first
          let algorithmicFeedProvider: string | null = null;
          try {
            const record = await AtprotoService.getOrbytProfileRecordForDid(did);
            // Use API structure directly - OrbytProfileRecord.algorithmicFeedProvider is string | null | undefined
            const remoteProvider = (record as OrbytProfileRecord)?.algorithmicFeedProvider;

            // If profile record has a value, use it (even if null)
            if (remoteProvider !== undefined) {
              algorithmicFeedProvider = remoteProvider;
              // Save to local storage for faster access next time
              const key = getUserScopedKey(STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER, did);
              if (algorithmicFeedProvider === null) {
                await storageHelpers.removeItem(key);
              } else {
                await storageHelpers.setItem(key, algorithmicFeedProvider);
              }
            } else {
              // No value in profile record, try local storage
              algorithmicFeedProvider = await get().getAlgorithmicFeedProvider();
            }
          } catch {
            // Fallback to local storage if profile record fetch fails
            algorithmicFeedProvider = await get().getAlgorithmicFeedProvider();
          }

          const currentUser = get().currentUser;
          const agent = get().agent;
          const modResult = await ModerationService.getModerationPrefsAndLabelDefs(agent);
          if (modResult && currentUser?.did) {
            const { queryClient } = await import('../utils/query/queryClient');
            const { queryKeys } = await import('../utils/query/queryKeys');
            queryClient.setQueryData(queryKeys.moderation.byUser(currentUser.did), modResult);
          }

          // Update state with user-specific settings
          set({
            feedDebugOverlayEnabled,
            nativeTabsEnabled,
            modalProfileEnabled,
            algorithmicFeedProvider,
          });
        } catch (error) {
          logger.error('Error loading user-specific settings', error, { component: 'userStore' });
        }
      },

      loadSubscribedChannels: async (did: string) => {
        try {
          // Load user-specific channel subscriptions
          const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, did);
          const savedChannelsStr = await storageHelpers.getItem(key);

          let savedChannels: SubscribedChannel[] = savedChannelsStr
            ? JSON.parse(savedChannelsStr)
            : [];

          // Filter out any built-in channels that might have been saved in old data
          savedChannels = savedChannels.filter(ch => !BUILT_IN_CHANNELS.includes(ch.uri));

          // Always check and clean profile record, even if we have local channels
          // This ensures built-ins are removed from the profile record
          try {
            const record = await AtprotoService.getOrbytProfileRecordForDid(did);
            // Use API structure directly - OrbytProfileRecord.subscribedChannels is string[] | undefined
            const remoteUris: string[] = Array.isArray(
              (record as OrbytProfileRecord)?.subscribedChannels
            )
              ? (record as OrbytProfileRecord).subscribedChannels!
              : [];

            // Record-first backfill: if no local channels, load from Orbyt profile record
            if ((!savedChannels || savedChannels.length === 0) && remoteUris.length > 0) {
              // Filter out built-in channels from profile record
              const filteredUris = filterBuiltInChannels(remoteUris);

              if (filteredUris.length > 0) {
                savedChannels = filteredUris.map((uri: string) => ({
                  uri,
                  displayName: '',
                  isOrbytChannel: isOrbytChannel(uri),
                  subscribedAt: Date.now(),
                }));
                await storageHelpers.setItem(key, JSON.stringify(savedChannels));
              }
            }
          } catch {
            // Fallback to local storage if profile record fetch fails
          }

          // Double-check: filter built-ins from state (in case persisted state had them)
          const filteredChannels = savedChannels.filter(ch => !BUILT_IN_CHANNELS.includes(ch.uri));

          // Set subscribed channels - no merging, no defaults, just the user's subscriptions
          set({ subscribedChannels: filteredChannels });

          // Always clean up profile record - remove built-ins and sync clean channels
          // This ensures the profile record is cleaned even if it previously had built-ins
          try {
            const urisToSync = filterBuiltInChannels(filteredChannels.map(ch => ch.uri));
            // Always update to ensure profile record is clean (removes built-ins if they exist)
            await AtprotoService.updateOrbytProfileChannels(urisToSync);
          } catch (error) {
            logger.warn('Failed to clean profile record of built-in channels', {
              component: 'userStore',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } catch (error) {
          logger.error('Error loading subscribed channels', error, { component: 'userStore' });
          set({ subscribedChannels: [] });
        }
      },
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => storageAdapter),
      partialize: state => ({
        // Only persist non-sensitive data
        savedAccounts: state.savedAccounts,
        activeAccountDid: state.activeAccountDid,
        feedDebugOverlayEnabled: state.feedDebugOverlayEnabled,
        nativeTabsEnabled: state.nativeTabsEnabled,
        algorithmicFeedProvider: state.algorithmicFeedProvider,
        // Filter out built-in channels before persisting
        subscribedChannels: state.subscribedChannels.filter(
          ch => !BUILT_IN_CHANNELS.includes(ch.uri)
        ),
      }),
      onRehydrateStorage: () => state => {
        // Clean up any built-in channels from persisted state on rehydration
        if (state) {
          const filteredChannels = state.subscribedChannels.filter(
            ch => !BUILT_IN_CHANNELS.includes(ch.uri)
          );
          if (filteredChannels.length !== state.subscribedChannels.length) {
            state.subscribedChannels = filteredChannels;
          }
        }
      },
    }
  )
);

// Convenience hooks - optimized with individual selectors to prevent over-subscription
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
  const batchSubscribeToChannels = useUserStore(state => state.batchSubscribeToChannels);
  const batchUnsubscribeFromChannels = useUserStore(state => state.batchUnsubscribeFromChannels);

  return {
    subscribedChannels,
    subscribeToChannel,
    unsubscribeFromChannel,
    isSubscribedToChannel,
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
  const feedDebugOverlayEnabled = useUserStore(state => state.feedDebugOverlayEnabled);
  const nativeTabsEnabled = useUserStore(state => state.nativeTabsEnabled);
  const modalProfileEnabled = useUserStore(state => state.modalProfileEnabled);
  const setFeedDebugOverlayEnabled = useUserStore(state => state.setFeedDebugOverlayEnabled);
  const setNativeTabsEnabled = useUserStore(state => state.setNativeTabsEnabled);
  const setModalProfileEnabled = useUserStore(state => state.setModalProfileEnabled);
  const getFeedDebugOverlayEnabled = useUserStore(state => state.getFeedDebugOverlayEnabled);
  const getNativeTabsEnabled = useUserStore(state => state.getNativeTabsEnabled);
  const getModalProfileEnabled = useUserStore(state => state.getModalProfileEnabled);

  return {
    feedDebugOverlayEnabled,
    nativeTabsEnabled,
    modalProfileEnabled,
    setFeedDebugOverlayEnabled,
    setNativeTabsEnabled,
    setModalProfileEnabled,
    getFeedDebugOverlayEnabled,
    getNativeTabsEnabled,
    getModalProfileEnabled,
  };
};

// Hook for algorithmic feed provider settings
export const useAlgorithmicFeedProvider = () => {
  const algorithmicFeedProvider = useUserStore(state => state.algorithmicFeedProvider);
  const setAlgorithmicFeedProvider = useUserStore(state => state.setAlgorithmicFeedProvider);
  const getAlgorithmicFeedProvider = useUserStore(state => state.getAlgorithmicFeedProvider);

  return {
    algorithmicFeedProvider,
    setAlgorithmicFeedProvider,
    getAlgorithmicFeedProvider,
  };
};

// Hook for automatically syncing ProfileCache with userStore
export const useProfileCacheSync = () => {
  const currentUser = useUserStore(state => state.currentUser);

  useEffect(() => {
    if (currentUser?.did) {
      ProfileService.setCurrentUserDid(currentUser.did);
    }
    if (currentUser?.handle) {
      ProfileService.setCurrentUserHandle(currentUser.handle);
    }
  }, [currentUser?.did, currentUser?.handle]);

  return { currentUser };
};

// Hook for precaching current user profile on app launch
export const useProfilePrecache = () => {
  const currentUser = useUserStore(state => state.currentUser);

  useEffect(() => {
    if (currentUser?.did) {
      ProfileService.precacheCurrentUserProfile();
    }
  }, [currentUser?.did]);
};

// Hook for moderation functionality
export const useModeration = () => {
  const agent = useUserStore(state => state.agent);
  const currentUser = useUserStore(state => state.currentUser);

  return {
    getModerationPrefs: async () => {
      const r = await ModerationService.getModerationPrefsAndLabelDefs(agent);
      return r?.moderationPrefs ?? null;
    },
    saveModerationPrefs: async (prefs: import('@atproto/api').ModerationPrefs) => {
      if (!agent) {
        throw new Error('No agent available. Please ensure you are logged in.');
      }
      return ModerationService.saveModerationPrefs(prefs, agent, currentUser?.did ?? undefined);
    },
  };
};
