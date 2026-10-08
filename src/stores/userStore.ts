import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageAdapter, storage } from '../utils/storage/storage';
import * as SecureStore from 'expo-secure-store';
import { getAnalytics, setUserId, logLogin, logSignUp } from '@react-native-firebase/analytics';
import { Agent } from '@atproto/api';
import {
  GatewaySessionExpiredError,
  onGatewaySessionExpired,
  restore as restoreGatewaySession,
  signIn as gatewaySignIn,
  signOut as gatewaySignOut,
  type GatewaySession,
} from '../services/auth/gateway';
import { RepoService } from '../services/api/repo/RepoService';
import { isUserCancellation, getErrorMessage } from '../utils/errors/errorHandler';
import { logger } from '../utils/logger';

import { ModerationService } from '../services/moderation/ModerationService';
import type { OrbytProfileRecord, ProfileViewWithOrbyt } from '../services/api/types';
import { isOrbytChannel } from '../utils/channels/orbyt';
import {
  BUILT_IN_CHANNELS,
  legacyChannelsToMigrate,
  planSubscribedChannels,
} from '../utils/channels/subscriptions';
import type { Query } from '@tanstack/react-query';
import { queryClient } from '../utils/query/queryClient';
import { usePostInteractionStore } from './postInteractionStore';
import { queryKeys } from '../utils/query/queryKeys';
import { orbytProfileQueryOptions, warmOrbytProfileCache } from '../services/colors';
import { hydrateOrbytChannels, migrateLegacyChannelUri } from '../services/OrbytChannelsService';
import {
  isCommunityUri,
  joinCommunity,
  leaveCommunity,
  listJoinedCommunities,
} from '../services/orbyt/communities';
import { ensureOrbytActorProfile } from '../services/orbyt/profileRecords';
import { APP_CONSTANTS } from '../utils/constants';
import { setAtprotoSession } from '../services/api/agentBridge';

export type SessionRestoreOutcome = 'ok' | 'reauth_required' | 'transient_failure' | 'cancelled';
export type AuthStatus =
  | 'unknown'
  | 'restoring'
  | 'authenticated'
  | 'unauthenticated'
  | 'reauth_required'
  | 'degraded_transient';

export class AuthFlowError extends Error {
  kind: Exclude<SessionRestoreOutcome, 'ok'>;

  constructor(kind: Exclude<SessionRestoreOutcome, 'ok'>, message?: string) {
    super(message ?? kind);
    this.name = 'AuthFlowError';
    this.kind = kind;
  }
}

function hasAuthoritativeSdkSession(
  oauthSession: GatewaySession | null,
  currentUserDid: string | null
): boolean {
  if (!oauthSession || !currentUserDid) return false;
  return oauthSession.did === currentUserDid;
}

/** A refused gateway token, or an XRPC 401 relayed through it. */
function isSessionRejected(error: unknown): boolean {
  if (error instanceof GatewaySessionExpiredError) return true;
  return (error as { status?: unknown } | null)?.status === 401;
}

function getSessionRestoreOutcome(error: unknown): SessionRestoreOutcome {
  if (error instanceof AuthFlowError) return error.kind;
  if (isSessionRejected(error)) return 'reauth_required';
  if (isUserCancellation(error)) return 'cancelled';
  // Anything else (offline, gateway 5xx, PDS hiccup) keeps the saved session for a retry.
  return 'transient_failure';
}

const restoreSessionLocal = (did: string): Promise<GatewaySession> => restoreGatewaySession(did);

const restoreSessionWithRefresh = (did: string): Promise<GatewaySession> =>
  restoreGatewaySession(did, { verify: true });

// Liquid glass support has been removed; all layout logic uses the non-liquid-glass fallback.
export const isIosLiquidGlassAvailable = false;

function seedCurrentUserProfileCache(
  did: string,
  handle: string,
  profilePatch: Partial<ProfileViewWithOrbyt>
): void {
  const key = queryKeys.profiles.detail(did);
  const existing = queryClient.getQueryData<ProfileViewWithOrbyt>(key);

  const seeded: ProfileViewWithOrbyt = {
    ...(existing ?? {}),
    ...profilePatch,
    did,
    handle,
    orbytRecord: existing?.orbytRecord ?? null,
  };

  queryClient.setQueryData<ProfileViewWithOrbyt>(key, seeded);
}

export interface SavedAccount {
  id: string;
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
  lastUsed: number;
  originalIdentifier: string; // The identifier used during initial authentication
  emailConfirmed?: boolean; // Cached to avoid network getSession() on every cold launch
}

export interface SubscribedChannel {
  uri: string; // Can be either a hashtag feed (e.g., "hashtag:orbyt-channel-art") or feed generator URI (e.g., "at://did:plc:.../app.bsky.feed.generator/...")
  displayName: string;
  description?: string;
  avatar?: string;
  memberCount?: number;
  isOrbytChannel?: boolean; // True if this is an orbyt-managed hashtag feed
  subscribedAt: number;
}

export type FeedBootstrapStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UserState {
  currentUser: {
    did: string | null; // Primary identifier - immutable
    handle: string | null; // Display identifier - can change
    displayName?: string; // Matches ProfileView.displayName (string | undefined)
    avatar?: string; // Matches ProfileView.avatar (string | undefined)
    originalIdentifier: string; // The identifier used during initial authentication
    emailConfirmed?: boolean; // Email confirmation status from API (only set if email scope is available)
  } | null;

  authStatus: AuthStatus;
  isAuthenticating: boolean;
  isInitializingAuth: boolean; // Loading state for initial auth state restoration
  isSwitchingAccount: boolean; // Loading state for account switching
  switchingToHandle: string | null;
  switchingToAvatar?: string | null;
  authError: string | null;
  authErrorCode: 'none' | 'reauth_required' | 'transient_failure';

  savedAccounts: SavedAccount[];
  activeAccountDid: string | null;

  oauthSession: GatewaySession | null;
  agent?: Agent;

  feedDebugOverlayEnabled: boolean;
  profileFeedViewMode: 'list' | 'grid';

  subscribedChannels: SubscribedChannel[];

  feedBootstrapStatus: FeedBootstrapStatus;
  feedBootstrapDid: string | null;

  showEmailVerificationModal: boolean;

  signIn: (identifier: string) => Promise<void>;
  signUp: (identifier: string) => Promise<void>;
  signOut: (clearAllAccounts?: boolean) => Promise<void>;
  restoreSession: (
    did: string,
    skipSettings?: boolean,
    options?: { preserveAuthStateOnFailure?: boolean }
  ) => Promise<void>;

  switchAccount: (did: string) => Promise<void>;
  addAccount: (
    oauthSession: GatewaySession,
    profileData?: { displayName?: string; avatar?: string; handle?: string; did?: string },
    originalIdentifier?: string
  ) => Promise<void>;
  removeAccount: (did: string) => Promise<void>;
  updateAccountProfile: (
    did: string,
    profileData: { displayName?: string; avatar?: string; handle?: string }
  ) => Promise<void>;

  subscribeToChannel: (channelData: {
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    memberCount?: number;
  }) => Promise<void>;
  unsubscribeFromChannel: (uri: string) => Promise<void>;
  isSubscribedToChannel: (uri: string) => boolean;

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

  setFeedDebugOverlayEnabled: (enabled: boolean) => Promise<void>;
  getFeedDebugOverlayEnabled: () => Promise<boolean>;
  setProfileFeedViewMode: (mode: 'list' | 'grid') => Promise<void>;

  setCurrentUser: (user: UserState['currentUser']) => void;
  setAuthenticating: (authenticating: boolean) => void;
  setAuthError: (error: string | null) => void;
  clearAuthError: () => void;

  setShowEmailVerificationModal: (show: boolean) => void;

  clearAllCaches: () => Promise<void>;

  checkSessionHealth: () => Promise<boolean>;
  /** Called by the OAuth client when it deletes a session (refresh failed or token revoked). */
  clearCorruptedSessions: () => Promise<void>;

  initializeUserState: () => Promise<void>;
  loadSavedAccounts: () => Promise<void>;
  bootstrapUserFeedSettings: (did: string) => Promise<boolean>;
  loadUserSpecificSettings: (did: string) => Promise<boolean>;
  loadSubscribedChannels: (
    did: string,
    orbytProfileRecord: OrbytProfileRecord | null
  ) => Promise<boolean>;

  _persistAccountUpdate: (
    did: string,
    updates: Partial<
      Pick<SavedAccount, 'handle' | 'displayName' | 'avatar' | 'emailConfirmed' | 'lastUsed'>
    >
  ) => Promise<void>;
  _restoreSessionBlocking: (
    did: string,
    skipSettings?: boolean,
    options?: { preserveAuthStateOnFailure?: boolean }
  ) => Promise<void>;
}

const STORAGE_KEYS = {
  ACCOUNTS: 'saved_accounts',
  ACTIVE_ACCOUNT: 'active_account_did',
  SUBSCRIBED_CHANNELS: 'subscribed_channels',
  ORBYT_PROFILE_RECORD: 'orbyt_profile_record',
  LEGACY_CHANNELS_MIGRATED: 'legacy_channels_migrated',
} as const;

/** How long a bootstrap waits for the account's membership records before keeping the device list. */
const JOINED_COMMUNITIES_TIMEOUT_MS = 8_000;

/**
 * Following an Orbyt Community is joining it: a `com.getorbyt.community.membership`
 * record in the viewer's repo, which the AppView projects into member counts and
 * viewer state. Best-effort; resolves whether every write succeeded.
 */
const syncCommunityMemberships = async (
  agent: Agent | null | undefined,
  did: string,
  uris: string[],
  join: boolean
): Promise<boolean> => {
  const communityUris = uris.filter(isCommunityUri);
  if (communityUris.length === 0) return true;
  if (!agent) return false;
  const results = await Promise.allSettled(
    communityUris.map(uri =>
      join ? joinCommunity(agent, did, uri) : leaveCommunity(agent, did, uri)
    )
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.warn(join ? 'Failed to join community' : 'Failed to leave community', {
        component: 'userStore',
        community: communityUris[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
  return results.every(result => result.status === 'fulfilled');
};

const getUserScopedKey = (baseKey: string, did: string): string => {
  const sanitizedDid = String(did).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${baseKey}_${sanitizedDid}`;
};

function readSavedChannels(did: string): string | null {
  return storage.getString(getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, did)) ?? null;
}

function applySubscribedChannels(did: string, channels: SubscribedChannel[]): void {
  storage.set(getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, did), JSON.stringify(channels));
  useUserStore.setState({ subscribedChannels: channels });
}

async function listJoinedCommunitiesWithTimeout(agent: Agent, did: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JOINED_COMMUNITIES_TIMEOUT_MS);
  try {
    return await listJoinedCommunities(agent, did, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reconcile the device's channel list with the account's memberships, and
 * migrate the legacy `com.getorbyt.profile#subscribedChannels` list once.
 * Runs off the bootstrap path; the device list is already showing.
 */
async function reconcileSubscribedChannels(
  did: string,
  orbytProfileRecord: OrbytProfileRecord | null
): Promise<void> {
  const agent = useUserStore.getState().agent;
  if (!agent) return;
  const migratedKey = getUserScopedKey(STORAGE_KEYS.LEGACY_CHANNELS_MIGRATED, did);
  const alreadyMigrated = storage.getBoolean(migratedKey) === true;
  const savedAtStart = readSavedChannels(did);

  const joined = await listJoinedCommunitiesWithTimeout(agent, did).catch(error => {
    logger.warn('Joined communities unavailable; keeping device channels', {
      component: 'userStore',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (joined === null || useUserStore.getState().currentUser?.did !== did) return;

  const legacy = legacyChannelsToMigrate({
    alreadyMigrated,
    joined,
    legacy: orbytProfileRecord?.subscribedChannels,
  });
  // Legacy references name a Community; resolving the name needs the directory.
  const directoryReady =
    legacy.length === 0 ||
    (await hydrateOrbytChannels().then(
      () => true,
      () => false
    ));
  if (useUserStore.getState().currentUser?.did !== did) return;

  const savedNow = readSavedChannels(did);
  const { channels, toJoin } = planSubscribedChannels({
    saved: savedNow ? (JSON.parse(savedNow) as SubscribedChannel[]) : [],
    joined,
    legacy: directoryReady ? legacy : [],
    prune: savedNow === savedAtStart,
    migrateUri: migrateLegacyChannelUri,
    now: Date.now(),
  });
  applySubscribedChannels(did, channels);

  const joinedAll = await syncCommunityMemberships(agent, did, toJoin, true);
  // Done once the record was read and its list is joined (or the account already had memberships).
  if (!alreadyMigrated && orbytProfileRecord && directoryReady && joinedAll) {
    storage.set(migratedKey, true);
  }
}

/** Reconciles run one at a time, so a second bootstrap pass sees the first one's result. */
let subscribedChannelsReconcile: Promise<void> = Promise.resolve();

function readCachedOrbytProfileRecord(did: string): OrbytProfileRecord | null {
  try {
    const raw = storage.getString(getUserScopedKey(STORAGE_KEYS.ORBYT_PROFILE_RECORD, did));
    return raw ? (JSON.parse(raw) as OrbytProfileRecord) : null;
  } catch {
    return null;
  }
}

function writeCachedOrbytProfileRecord(did: string, record: OrbytProfileRecord | null): void {
  try {
    const key = getUserScopedKey(STORAGE_KEYS.ORBYT_PROFILE_RECORD, did);
    if (record === null) storage.delete(key);
    else storage.set(key, JSON.stringify(record));
  } catch {
    // ignore
  }
}

type ModerationPrefsSnapshot = NonNullable<
  Awaited<ReturnType<typeof ModerationService.getModerationPrefsAndLabelDefs>>
>;

function seedModerationQueryCache(did: string, snapshot: ModerationPrefsSnapshot | null): void {
  if (snapshot) {
    queryClient.setQueryData(queryKeys.moderation.byUser(did), snapshot);
  }
}

const isEmailVerificationRequired = (currentUser: UserState['currentUser']): boolean => {
  if (!currentUser) return false;
  const hasEmail = currentUser.emailConfirmed !== undefined;
  return hasEmail && currentUser.emailConfirmed === false;
};

const COLORS_PREFETCH_COOLDOWN_MS = 60 * 60 * 1000;

/** Defer following-list Orbyt color batch until feed is ready; throttle to once per hour per DID. */
const scheduleFollowingOrbytColorsAfterFeedReady = (userDid: string) => {
  const lastRunKey = getUserScopedKey('orbyt_colors_prefetch_at', userDid);

  requestIdleCallback(
    () => {
      const runPrefetch = async () => {
        const last = storage.getNumber(lastRunKey);
        if (last !== undefined && Date.now() - last < COLORS_PREFETCH_COOLDOWN_MS) {
          return;
        }
        try {
          const { GraphService } = await import('../services/api/graph/GraphService');
          const followingResponse = await GraphService.getFollowing(userDid, null, 100);
          const dids = followingResponse.following.map((f: { did: string }) => f.did).slice(0, 99);
          if (dids.length > 0) {
            await warmOrbytProfileCache(dids, queryClient);
          }
          storage.set(lastRunKey, Date.now());
        } catch {
          // non-critical prefetch, ignore errors
        }
      };

      const st = useUserStore.getState();
      if (st.feedBootstrapStatus === 'ready' && st.feedBootstrapDid === userDid) {
        runPrefetch();
        return;
      }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        unsub();
      };
      const unsub = useUserStore.subscribe(s => {
        if (s.feedBootstrapStatus === 'ready' && s.feedBootstrapDid === userDid) {
          finish();
          runPrefetch();
        }
      });
      setTimeout(finish, 120_000);
    },
    { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
  );
};

const getFlagKey = (keyBase: string, did: string | null) => (did ? `${keyBase}_${did}` : keyBase);

/** Query roots holding account-independent public data, kept across sign-out and account switch. */
const PUBLIC_QUERY_ROOTS: ReadonlySet<unknown> = new Set([
  queryKeys.auth.all[0],
  queryKeys.channels.all[0],
  queryKeys.klipy.all[0],
  queryKeys.discourse.all[0],
]);

const isAccountScopedQuery = (query: Query): boolean => !PUBLIC_QUERY_ROOTS.has(query.queryKey[0]);

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => {
      const hydrateGatewaySession = async (
        oauthSession: GatewaySession,
        { skipOrbytColors = false }: { skipOrbytColors?: boolean } = {}
      ) => {
        const agent = new Agent(oauthSession);
        const [profile, sessionInfo] = await Promise.all([
          agent.api.app.bsky.actor.getProfile({ actor: oauthSession.did }),
          agent.api.com.atproto.server.getSession(),
          skipOrbytColors
            ? Promise.resolve(null)
            : queryClient
                .fetchQuery(orbytProfileQueryOptions(oauthSession.did))
                .catch((): null => null),
        ]);

        const userProfile = profile.data;
        const { $type: _profileType, ...profileForCache } = userProfile;
        seedCurrentUserProfileCache(
          oauthSession.did,
          userProfile.handle,
          profileForCache as Partial<ProfileViewWithOrbyt>
        );

        const emailConfirmed =
          sessionInfo.data.email !== undefined && sessionInfo.data.email !== null
            ? sessionInfo.data.emailConfirmed
            : undefined;

        return { agent, userProfile, emailConfirmed };
      };

      const applyAuthFailureState = (
        params: {
          clearActiveDid: boolean;
          authError: string | null;
          authStatus?: AuthStatus;
          authErrorCode?: UserState['authErrorCode'];
        } = { clearActiveDid: false, authError: null }
      ) => {
        set({
          authStatus: params.authStatus ?? 'unauthenticated',
          isAuthenticating: false,
          currentUser: null,
          oauthSession: null,
          agent: undefined,
          activeAccountDid: params.clearActiveDid ? null : get().activeAccountDid,
          subscribedChannels: [],
          feedBootstrapStatus: 'error',
          feedBootstrapDid: null,
          authError: params.authError,
          authErrorCode: params.authErrorCode ?? 'none',
        });
      };

      return {
        // Initial state
        currentUser: null,
        authStatus: 'unknown',
        isAuthenticating: false,
        isInitializingAuth: true, // Start as true - will be set to false after initial auth state is loaded
        isSwitchingAccount: false,
        switchingToHandle: null,
        switchingToAvatar: null,
        authError: null,
        authErrorCode: 'none',
        savedAccounts: [],
        activeAccountDid: null,
        oauthSession: null,
        agent: undefined,

        feedDebugOverlayEnabled: false,
        profileFeedViewMode: 'list',

        subscribedChannels: [],

        feedBootstrapStatus: 'idle',
        feedBootstrapDid: null,

        showEmailVerificationModal: false,
        signIn: async (identifier: string) => {
          try {
            set({
              isAuthenticating: true,
              authError: null,
              authErrorCode: 'none',
              authStatus: 'restoring',
            });

            const session = await gatewaySignIn(identifier);

            const { agent, userProfile, emailConfirmed } = await hydrateGatewaySession(session);

            const account: SavedAccount = {
              id: session.did,
              handle: userProfile.handle,
              did: session.did,
              displayName: userProfile.displayName || userProfile.handle,
              avatar: userProfile.avatar,
              lastUsed: Date.now(),
              originalIdentifier: identifier || session.did,
              emailConfirmed, // persist for fast cold-launch restore
            };

            // Update saved accounts list
            const updatedAccounts = [
              account,
              ...get().savedAccounts.filter(a => a.did !== session.did),
            ];

            // Persist to SecureStore
            await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updatedAccounts));
            await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, session.did);

            set({
              currentUser: {
                did: session.did,
                handle: userProfile.handle,
                displayName: userProfile.displayName,
                avatar: userProfile.avatar,
                originalIdentifier: identifier,
                emailConfirmed,
              },
              authStatus: 'authenticated',
              isAuthenticating: false,
              authError: null,
              authErrorCode: 'none',
              agent,
              activeAccountDid: session.did,
              oauthSession: session,
              savedAccounts: updatedAccounts,
              feedBootstrapStatus: 'loading',
              feedBootstrapDid: null,
            });

            setUserId(getAnalytics(), session.did).catch(() => {});
            logLogin(getAnalytics(), { method: 'atproto' }).catch(() => {});

            if (isEmailVerificationRequired(get().currentUser)) {
              set({ showEmailVerificationModal: true });
            }

            requestIdleCallback(
              () => {
                void ensureOrbytActorProfile().catch(() => {});
              },
              { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
            );

            await get().bootstrapUserFeedSettings(session.did);

            scheduleFollowingOrbytColorsAfterFeedReady(session.did);
          } catch (error) {
            // Handle user cancellation silently
            if (isUserCancellation(error)) {
              const stillHasSession = hasAuthoritativeSdkSession(
                get().oauthSession,
                get().currentUser?.did ?? null
              );
              set({
                isAuthenticating: false,
                authError: null,
                authErrorCode: 'none',
                authStatus: stillHasSession ? 'authenticated' : 'unauthenticated',
              });
              return; // Don't throw error for user cancellation
            }

            const errorMessage = getErrorMessage(error);
            set({
              authStatus: 'reauth_required',
              isAuthenticating: false,
              authError: errorMessage,
              authErrorCode: 'reauth_required',
            });
            throw error;
          }
        },

        signUp: async (identifier: string) => {
          try {
            set({
              isAuthenticating: true,
              authError: null,
              authErrorCode: 'none',
              authStatus: 'restoring',
            });

            const session = await gatewaySignIn(identifier, { signUp: true });

            const { agent, userProfile, emailConfirmed } = await hydrateGatewaySession(session);

            const account: SavedAccount = {
              id: session.did,
              handle: userProfile.handle,
              did: session.did,
              displayName: userProfile.displayName || userProfile.handle,
              avatar: userProfile.avatar,
              lastUsed: Date.now(),
              originalIdentifier: identifier || session.did,
              emailConfirmed, // persist for fast cold-launch restore
            };

            // Update saved accounts list
            const updatedAccounts = [
              account,
              ...get().savedAccounts.filter(a => a.did !== session.did),
            ];

            // Persist to SecureStore
            await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updatedAccounts));
            await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, session.did);

            set({
              currentUser: {
                ...userProfile,
                originalIdentifier: identifier || session.did,
                emailConfirmed,
              },
              authStatus: 'authenticated',
              isAuthenticating: false,
              authError: null,
              authErrorCode: 'none',
              agent,
              savedAccounts: updatedAccounts,
              activeAccountDid: session.did,
              oauthSession: session,
              feedBootstrapStatus: 'loading',
              feedBootstrapDid: null,
            });

            setUserId(getAnalytics(), session.did).catch(() => {});
            logSignUp(getAnalytics(), { method: 'atproto' }).catch(() => {});

            requestIdleCallback(
              () => {
                void ensureOrbytActorProfile().catch(() => {});
              },
              { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
            );
            await get().bootstrapUserFeedSettings(session.did);
            scheduleFollowingOrbytColorsAfterFeedReady(session.did);
          } catch (error) {
            if (isUserCancellation(error)) {
              const stillHasSession = hasAuthoritativeSdkSession(
                get().oauthSession,
                get().currentUser?.did ?? null
              );
              set({
                isAuthenticating: false,
                authError: null,
                authErrorCode: 'none',
                authStatus: stillHasSession ? 'authenticated' : 'unauthenticated',
              });
              return;
            }

            const errorMessage = getErrorMessage(error);
            if (isSessionRejected(error)) {
              set({
                authStatus: 'reauth_required',
                isAuthenticating: false,
                authError: errorMessage,
                authErrorCode: 'reauth_required',
              });
              throw error;
            }

            set({
              authStatus: 'degraded_transient',
              isAuthenticating: false,
              authError: errorMessage,
              authErrorCode: 'transient_failure',
            });
            throw error;
          }
        },

        signOut: async (clearAllAccounts: boolean = false) => {
          try {
            set({ isAuthenticating: true });

            const currentDid = get().activeAccountDid;

            const didsToEnd = clearAllAccounts
              ? get().savedAccounts.map(account => account.did)
              : currentDid
                ? [currentDid]
                : [];
            await Promise.allSettled(didsToEnd.map(did => gatewaySignOut(did)));

            await get().clearAllCaches();
            // Notification query keys aren't DID-scoped; never show them to the next account.
            queryClient.clear();

            setUserId(getAnalytics(), null).catch(() => {});

            if (clearAllAccounts) {
              await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCOUNTS);
            }

            await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);

            // Reset state
            set({
              authStatus: 'unauthenticated',
              currentUser: null,
              isAuthenticating: false,
              switchingToHandle: null,
              switchingToAvatar: null,
              authError: null,
              authErrorCode: 'none',
              oauthSession: null,
              agent: undefined, // Use undefined to match API expectations
              activeAccountDid: null,
              savedAccounts: clearAllAccounts ? [] : get().savedAccounts,
              subscribedChannels: [],
              feedBootstrapStatus: 'idle',
              feedBootstrapDid: null,
            });
          } catch (error) {
            logger.error('Error during sign out', error, { component: 'userStore' });
            set({ isAuthenticating: false });
            throw error;
          }
        },

        restoreSession: async (
          did: string,
          skipSettings: boolean = false,
          options?: { preserveAuthStateOnFailure?: boolean }
        ) => {
          set({
            isAuthenticating: true,
            authError: null,
            authErrorCode: 'none',
            authStatus: 'restoring',
          });
          let localSession: GatewaySession;
          try {
            localSession = await restoreSessionLocal(did);
          } catch (localError) {
            const restoreOutcome = getSessionRestoreOutcome(localError);
            if (restoreOutcome === 'reauth_required') {
              if (options?.preserveAuthStateOnFailure) {
                set({ isAuthenticating: false });
              } else {
                applyAuthFailureState({
                  clearActiveDid: true,
                  authError: 'oauth_reauth_required',
                  authStatus: 'reauth_required',
                  authErrorCode: 'reauth_required',
                });
              }
              throw new AuthFlowError('reauth_required', 'oauth_reauth_required');
            }
            // Unreadable keychain entry — fall back to the verified network restore.
            return get()._restoreSessionBlocking(did, skipSettings, options);
          }

          const account = get().savedAccounts.find(a => a.did === did);
          set({
            currentUser: {
              did,
              handle: account?.handle ?? did,
              displayName: account?.displayName,
              avatar: account?.avatar,
              originalIdentifier: account?.originalIdentifier ?? did,
              emailConfirmed: account?.emailConfirmed,
            },
            authStatus: 'authenticated',
            isAuthenticating: false,
            authError: null,
            authErrorCode: 'none',
            agent: new Agent(localSession),
            oauthSession: localSession,
            feedBootstrapStatus: 'loading',
            feedBootstrapDid: null,
          });

          setUserId(getAnalytics(), did).catch(() => {});

          if (!get().activeAccountDid && isEmailVerificationRequired(get().currentUser)) {
            set({ showEmailVerificationModal: true });
          }

          // Seed the React Query profile cache so profile screens render without a loading flash.
          if (account) {
            seedCurrentUserProfileCache(did, account.handle, {
              displayName: account.displayName,
              avatar: account.avatar,
            });
          }

          requestIdleCallback(
            () => {
              void ensureOrbytActorProfile().catch(() => {});
            },
            { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
          );
          scheduleFollowingOrbytColorsAfterFeedReady(did);

          if (!skipSettings) {
            await get().bootstrapUserFeedSettings(did);
          }
        },

        switchAccount: async (did: string) => {
          try {
            const account = get().savedAccounts.find(acc => acc.did === did);
            set({
              authStatus: 'restoring',
              isSwitchingAccount: true,
              switchingToHandle: account?.handle || account?.did || null,
              switchingToAvatar: account?.avatar || null,
            });
            if (!account) {
              logger.error('Account not found for DID', { component: 'userStore', did });
              throw new Error('Account not found');
            }

            const outgoingDid = get().activeAccountDid;
            if (outgoingDid && outgoingDid !== did) {
              void queryClient.cancelQueries({
                predicate: q => {
                  const key = q.queryKey;
                  return Array.isArray(key) && key.includes(outgoingDid);
                },
              });
            }

            await get().clearAllCaches();

            // Update account statuses
            const savedAccounts = get().savedAccounts;
            const accounts = savedAccounts.map(acc => ({
              ...acc,
              lastUsed: acc.did === did ? Date.now() : acc.lastUsed,
            }));

            await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

            // Snapshot so a failed switch can roll back to the prior session.
            const previousState = {
              currentUser: get().currentUser,
              oauthSession: get().oauthSession,
              agent: get().agent,
              activeAccountDid: get().activeAccountDid,
              subscribedChannels: get().subscribedChannels,
            };

            const rollbackToPreviousSessionAfterSwitchFailure = async (): Promise<boolean> => {
              if (!previousState.oauthSession || !previousState.currentUser) {
                return false;
              }
              set({
                currentUser: previousState.currentUser,
                oauthSession: previousState.oauthSession,
                agent: previousState.agent,
                activeAccountDid: previousState.activeAccountDid,
                subscribedChannels: previousState.subscribedChannels,
                authStatus: 'authenticated',
                authError: null,
                authErrorCode: 'none',
                isSwitchingAccount: false,
                switchingToHandle: null,
                switchingToAvatar: null,
              });
              try {
                if (previousState.activeAccountDid) {
                  await SecureStore.setItemAsync(
                    STORAGE_KEYS.ACTIVE_ACCOUNT,
                    previousState.activeAccountDid
                  );
                } else {
                  await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);
                }
              } catch (syncError) {
                logger.warn(
                  'Failed to sync SecureStore active account during account switch rollback',
                  {
                    component: 'userStore',
                    error: syncError instanceof Error ? syncError.message : String(syncError),
                  }
                );
              }
              return true;
            };

            try {
              await get().restoreSession(did, true, { preserveAuthStateOnFailure: true });

              const state = get();
              if (!state.agent) {
                throw new Error('Agent not available after session restore');
              }

              const sessionOk = hasAuthoritativeSdkSession(
                get().oauthSession,
                get().currentUser?.did ?? null
              );
              set({
                savedAccounts: accounts,
                activeAccountDid: did,
                authStatus: sessionOk ? 'authenticated' : 'unauthenticated',
                authErrorCode: 'none',
              });
              await SecureStore.setItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT, did);

              await get().bootstrapUserFeedSettings(did);

              set({ isSwitchingAccount: false, switchingToHandle: null, switchingToAvatar: null });

              requestIdleCallback(
                () => {
                  void ensureOrbytActorProfile().catch(() => {});
                },
                { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
              );

              void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
              void queryClient.invalidateQueries({ queryKey: queryKeys.unread.summary() });
            } catch (restoreErr) {
              const restoreOutcome = getSessionRestoreOutcome(restoreErr);
              if (restoreOutcome === 'reauth_required') {
                logger.error('Session restoration failed for account switch (reauth)', restoreErr, {
                  component: 'userStore',
                  did,
                });
                const rolledBack = await rollbackToPreviousSessionAfterSwitchFailure();
                if (!rolledBack) {
                  applyAuthFailureState({
                    clearActiveDid: true,
                    authError: 'oauth_reauth_required',
                    authStatus: 'reauth_required',
                    authErrorCode: 'reauth_required',
                  });
                }
                throw new AuthFlowError('reauth_required', 'oauth_reauth_required');
              }
              if (restoreOutcome === 'cancelled') {
                const rolledBack = await rollbackToPreviousSessionAfterSwitchFailure();
                if (!rolledBack) {
                  set({
                    isSwitchingAccount: false,
                    switchingToHandle: null,
                    switchingToAvatar: null,
                  });
                }
                throw new AuthFlowError('cancelled', 'oauth_cancelled');
              }
              if (restoreOutcome === 'transient_failure') {
                logger.warn('Session restoration failed for account switch (transient)', {
                  component: 'userStore',
                  did,
                  error: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
                });
              } else {
                logger.error('Session restoration failed for account switch', restoreErr, {
                  component: 'userStore',
                  did,
                });
              }
              const rolledBack = await rollbackToPreviousSessionAfterSwitchFailure();
              if (rolledBack) {
                set({
                  authError: 'oauth_restore_transient_failure',
                  authStatus: 'degraded_transient',
                  authErrorCode: 'transient_failure',
                });
              } else {
                set({
                  isSwitchingAccount: false,
                  switchingToHandle: null,
                  switchingToAvatar: null,
                  authError: 'oauth_restore_transient_failure',
                  authStatus: 'degraded_transient',
                  authErrorCode: 'transient_failure',
                });
              }
              throw new AuthFlowError('transient_failure', 'oauth_restore_transient_failure');
            }
          } catch (error) {
            const hasSession = hasAuthoritativeSdkSession(
              get().oauthSession,
              get().currentUser?.did ?? null
            );
            set({
              isSwitchingAccount: false,
              switchingToHandle: null,
              switchingToAvatar: null,
              authStatus: hasSession ? 'authenticated' : get().authStatus,
            });
            throw error;
          }
        },

        addAccount: async (
          oauthSession: GatewaySession,
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
            const accounts = get().savedAccounts.filter(acc => acc.did !== did);
            await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

            if (isActiveAccount) {
              await get().signOut();
            } else {
              await gatewaySignOut(did);
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
              set(() => ({
                subscribedChannels: updatedChannels,
              }));
            } else {
              // Add new channel/feed
              const newChannel: SubscribedChannel = {
                ...channelData,
                isOrbytChannel: isOrbytChannel(channelData.uri),
                subscribedAt: Date.now(),
              };
              const nextChannels = [...channels, newChannel];
              set(() => ({
                subscribedChannels: nextChannels,
              }));
            }

            // Filter out built-in channels before saving
            const channelsToSave = get().subscribedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );

            // Save to storage
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            storage.set(key, JSON.stringify(channelsToSave));

            await syncCommunityMemberships(get().agent, currentUser.did, [channelData.uri], true);
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

            set(() => ({
              subscribedChannels: updatedChannels,
            }));

            // Save to storage (filter built-ins)
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            const channelsToSave = updatedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );
            storage.set(key, JSON.stringify(channelsToSave));

            await syncCommunityMemberships(get().agent, currentUser.did, [uri], false);
          } catch (error) {
            logger.error('Error unsubscribing from channel', error, { component: 'userStore' });
            throw error;
          }
        },

        isSubscribedToChannel: (uri: string) => {
          if (BUILT_IN_CHANNELS.includes(uri)) {
            return false;
          }
          return get().subscribedChannels.some(ch => ch.uri === uri);
        },

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
            const nextChannels = [...remainingChannels, ...newChannels];
            set(() => ({
              subscribedChannels: nextChannels,
            }));

            // Single storage operation for all changes (filter built-ins)
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            const channelsToSave = get().subscribedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );
            storage.set(key, JSON.stringify(channelsToSave));

            await syncCommunityMemberships(
              get().agent,
              currentUser.did,
              channels.map(channel => channel.uri),
              true
            );
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
            set(() => ({
              subscribedChannels: updatedChannels,
            }));

            // Single storage operation for all changes (filter built-ins)
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            const channelsToSave = updatedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );
            storage.set(key, JSON.stringify(channelsToSave));

            await syncCommunityMemberships(get().agent, currentUser.did, validUris, false);
          } catch (error) {
            logger.error('Error batch unsubscribing from channels', error, {
              component: 'userStore',
            });
            throw error;
          }
        },

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
        setProfileFeedViewMode: async (mode: 'list' | 'grid') => {
          storage.set(getFlagKey('profile_feed_view_mode', get().currentUser?.did ?? null), mode);
          set({ profileFeedViewMode: mode });
        },

        setCurrentUser: user => set({ currentUser: user }),

        setAuthenticating: authenticating => set({ isAuthenticating: authenticating }),
        setAuthError: error => set({ authError: error }),
        clearAuthError: () => set({ authError: null }),

        setShowEmailVerificationModal: show => set({ showEmailVerificationModal: show }),

        clearAllCaches: async () => {
          try {
            usePostInteractionStore.getState().clearInteractions();

            // Viewer state (likes, follows, blocks, DMs, bookmarks) lives under keys that are not
            // DID-scoped, so drop everything except account-independent public data.
            await queryClient.cancelQueries({ predicate: isAccountScopedQuery });
            queryClient.removeQueries({ predicate: isAccountScopedQuery });
          } catch (error) {
            logger.error('Error clearing caches', error, { component: 'userStore' });
          }
        },

        checkSessionHealth: async () => {
          const { agent, currentUser } = get();
          if (!agent || !currentUser?.did) return false;
          try {
            await agent.api.app.bsky.actor.getProfile({ actor: currentUser.did });
            return true;
          } catch (error) {
            if (isSessionRejected(error)) {
              applyAuthFailureState({
                clearActiveDid: true,
                authError: 'oauth_reauth_required',
                authStatus: 'reauth_required',
                authErrorCode: 'reauth_required',
              });
            }
            return false;
          }
        },

        clearCorruptedSessions: async () => {
          try {
            const currentDid = get().activeAccountDid;

            if (currentDid) {
              await gatewaySignOut(currentDid);
            }

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

            applyAuthFailureState({
              clearActiveDid: true,
              authError: null,
              authStatus: 'unauthenticated',
              authErrorCode: 'none',
            });

            await get().clearAllCaches();
          } catch (error) {
            logger.error('Failed to clear corrupted sessions', error, { component: 'userStore' });
            applyAuthFailureState({
              clearActiveDid: true,
              authError: null,
              authStatus: 'degraded_transient',
              authErrorCode: 'transient_failure',
            });
          }
        },

        initializeUserState: async () => {
          set({ isInitializingAuth: true, authStatus: 'restoring', authErrorCode: 'none' });

          // Guard: unblock the splash screen exactly once regardless of exit path
          let splashUnblocked = false;
          const unblockSplash = () => {
            if (!splashUnblocked) {
              splashUnblocked = true;
              set({ isInitializingAuth: false });
            }
          };

          try {
            await get().loadSavedAccounts();

            const activeAccountDid = await SecureStore.getItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT);

            if (activeAccountDid) {
              set({ activeAccountDid });

              const account = get().savedAccounts.find(acc => acc.did === activeAccountDid);

              if (!account) {
                logger.warn('Active account not found in saved accounts', {
                  component: 'userStore',
                });
                set({ activeAccountDid: null, authStatus: 'unauthenticated' });
                unblockSplash();
                return;
              }

              let sessionRestored = false;
              let restoreOutcome: SessionRestoreOutcome = 'transient_failure';
              try {
                // skipSettings=true: bootstrap fires separately below so splash unblocks first
                await get().restoreSession(activeAccountDid, true);
                sessionRestored = true;
                restoreOutcome = 'ok';
              } catch (error) {
                restoreOutcome = getSessionRestoreOutcome(error);
                logger.warn('Session restoration failed during initialization', {
                  component: 'userStore',
                  did: activeAccountDid,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  restoreOutcome,
                });
              }

              unblockSplash();

              if (!sessionRestored) {
                if (restoreOutcome === 'reauth_required') {
                  logger.warn('Session could not be restored, clearing active account', {
                    component: 'userStore',
                    did: activeAccountDid,
                  });
                  await SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT).catch(() => {});
                  set({
                    authStatus: 'reauth_required',
                    currentUser: null,
                    oauthSession: null,
                    agent: undefined,
                    activeAccountDid: null,
                    subscribedChannels: [],
                    feedBootstrapStatus: 'error',
                    feedBootstrapDid: null,
                    authErrorCode: 'reauth_required',
                  });
                } else {
                  logger.warn('Session restore failed transiently; preserving active account DID', {
                    component: 'userStore',
                    did: activeAccountDid,
                  });
                  set({ authStatus: 'degraded_transient', authErrorCode: 'transient_failure' });
                }
              } else {
                // Fire bootstrap in background — feed shows skeleton until ready
                void get().bootstrapUserFeedSettings(activeAccountDid);
              }
            } else {
              set({ authStatus: 'unauthenticated', authErrorCode: 'none' });
            }
          } catch (error) {
            logger.error('Error initializing user state', error, { component: 'userStore' });

            applyAuthFailureState({
              clearActiveDid: true,
              authError: null,
              authStatus: 'degraded_transient',
              authErrorCode: 'transient_failure',
            });
          } finally {
            unblockSplash(); // guard for any unexpected exit path
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
            const migratedAccounts = normalized.map(
              (account: SavedAccount & { pdsUrl?: string }) => {
                if (account.pdsUrl && !account.originalIdentifier) {
                  // For backward compatibility, use handle as originalIdentifier (most common case)
                  return {
                    ...account,
                    originalIdentifier: account.handle || account.did,
                    pdsUrl: undefined, // Remove old field
                  };
                }
                return account;
              }
            );

            set({ savedAccounts: migratedAccounts });
          } catch (error) {
            logger.error('Error loading saved accounts', error, { component: 'userStore' });
            set({ savedAccounts: [] });
          }
        },

        bootstrapUserFeedSettings: async (did: string) => {
          set({ feedBootstrapStatus: 'loading', feedBootstrapDid: null });

          const cachedRecord = readCachedOrbytProfileRecord(did);

          if (cachedRecord !== null) {
            const [settingsLoaded, channelsLoaded] = await Promise.all([
              get().loadUserSpecificSettings(did),
              get().loadSubscribedChannels(did, cachedRecord),
            ]);

            if (get().currentUser?.did === did && settingsLoaded && channelsLoaded) {
              set({ feedBootstrapStatus: 'ready', feedBootstrapDid: did });
            } else if (get().currentUser?.did === did) {
              set({ feedBootstrapStatus: 'error', feedBootstrapDid: did });
            }

            // Background refresh: fetch fresh record, moderation prefs, and channels
            const bgDid = did;
            void Promise.resolve().then(async () => {
              try {
                const agent = get().agent;
                const [freshRecord, modResult] = await Promise.all([
                  RepoService.getOrbytProfileRecordForDid(bgDid)
                    .then(r => r as OrbytProfileRecord | null)
                    .catch((): null => null),
                  ModerationService.getModerationPrefsAndLabelDefs(agent),
                ]);
                writeCachedOrbytProfileRecord(bgDid, freshRecord);
                seedModerationQueryCache(bgDid, modResult);
                await hydrateOrbytChannels().catch(() => {});
                if (get().currentUser?.did !== bgDid) return;
                await Promise.all([
                  get().loadUserSpecificSettings(bgDid),
                  get().loadSubscribedChannels(bgDid, freshRecord),
                ]);
              } catch {
                // best-effort: user already has cached settings
              }
            });

            return true;
          }

          // ── Slow path: first launch or cleared cache ─────────────────────────
          // Fetches everything from network, then caches for next launch.
          try {
            const agent = get().agent;
            const [orbytProfileRecord, modResult] = await Promise.all([
              RepoService.getOrbytProfileRecordForDid(did)
                .then(r => r as OrbytProfileRecord | null)
                .catch((): null => null),
              ModerationService.getModerationPrefsAndLabelDefs(agent),
            ]);

            writeCachedOrbytProfileRecord(did, orbytProfileRecord);
            seedModerationQueryCache(did, modResult);

            // The Community directory loads in the background (Explore, channel names).
            void hydrateOrbytChannels().catch(() => {});
            const [settingsLoaded, channelsLoaded] = await Promise.all([
              get().loadUserSpecificSettings(did),
              get().loadSubscribedChannels(did, orbytProfileRecord),
            ]);

            const bootstrapSucceeded = settingsLoaded && channelsLoaded;

            if (get().currentUser?.did === did && bootstrapSucceeded) {
              set({ feedBootstrapStatus: 'ready', feedBootstrapDid: did });
              return true;
            }

            if (get().currentUser?.did === did) {
              set({ feedBootstrapStatus: 'error', feedBootstrapDid: did });
            }
            return false;
          } catch (error) {
            logger.warn('Failed to bootstrap user feed settings', {
              component: 'userStore',
              did,
              error: error instanceof Error ? error.message : String(error),
            });

            if (get().currentUser?.did === did) {
              set({ feedBootstrapStatus: 'error', feedBootstrapDid: did });
            }
            return false;
          }
        },

        loadUserSpecificSettings: async (did: string) => {
          try {
            const feedDebugOverlayEnabled =
              storage.getBoolean(getFlagKey('feed_debug_overlay_enabled', did)) ?? false;

            // Update state with user-specific settings
            set({ feedDebugOverlayEnabled });
            return true;
          } catch (error) {
            logger.error('Error loading user-specific settings', error, { component: 'userStore' });
            return false;
          }
        },

        loadSubscribedChannels: async (
          did: string,
          orbytProfileRecord: OrbytProfileRecord | null
        ) => {
          try {
            // The device list shows at once; memberships reconcile in the background
            // so the feed bootstrap never waits on the PDS.
            const saved = readSavedChannels(did);
            const { channels } = planSubscribedChannels({
              saved: saved ? (JSON.parse(saved) as SubscribedChannel[]) : [],
              joined: null,
              migrateUri: migrateLegacyChannelUri,
              now: Date.now(),
            });
            applySubscribedChannels(did, channels);

            subscribedChannelsReconcile = subscribedChannelsReconcile
              .then(() => reconcileSubscribedChannels(did, orbytProfileRecord))
              .catch(error => {
                logger.warn('Failed to reconcile subscribed channels', {
                  component: 'userStore',
                  error: error instanceof Error ? error.message : String(error),
                });
              });
            return true;
          } catch (error) {
            logger.error('Error loading subscribed channels', error, { component: 'userStore' });
            set({ subscribedChannels: [] });
            return false;
          }
        },

        _persistAccountUpdate: async (
          did: string,
          updates: Partial<
            Pick<SavedAccount, 'handle' | 'displayName' | 'avatar' | 'emailConfirmed' | 'lastUsed'>
          >
        ) => {
          const accounts = get().savedAccounts;
          const idx = accounts.findIndex(a => a.did === did);
          if (idx === -1) return;
          const updated = accounts.map(a => (a.did === did ? { ...a, ...updates } : a));
          set({ savedAccounts: updated });
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updated));
        },

        _restoreSessionBlocking: async (
          did: string,
          skipSettings: boolean = false,
          options?: { preserveAuthStateOnFailure?: boolean }
        ) => {
          try {
            set({
              isAuthenticating: true,
              authError: null,
              authErrorCode: 'none',
              authStatus: 'restoring',
            });

            const session = await restoreSessionWithRefresh(did);

            const { agent, userProfile, emailConfirmed } = await hydrateGatewaySession(session, {
              skipOrbytColors: true,
            });

            const originalIdentifier =
              get().savedAccounts.find(acc => acc.did === did)?.originalIdentifier ?? did;

            const hadActiveAccount = get().activeAccountDid !== null;

            set({
              currentUser: {
                did: session.did,
                handle: userProfile.handle,
                displayName: userProfile.displayName,
                avatar: userProfile.avatar,
                originalIdentifier,
                emailConfirmed,
              },
              authStatus: 'authenticated',
              isAuthenticating: false,
              authError: null,
              authErrorCode: 'none',
              agent,
              oauthSession: session,
              feedBootstrapStatus: 'loading',
              feedBootstrapDid: null,
            });

            if (!hadActiveAccount && isEmailVerificationRequired(get().currentUser)) {
              set({ showEmailVerificationModal: true });
            }

            // Persist emailConfirmed so next launch can use the fast two-phase path
            await get()._persistAccountUpdate(session.did, {
              emailConfirmed,
              lastUsed: Date.now(),
            });

            // Fetch orbyt profile colors in background (skipped in hydrateGatewaySession above)
            queryClient.fetchQuery(orbytProfileQueryOptions(session.did)).catch(() => {});

            requestIdleCallback(
              () => {
                void ensureOrbytActorProfile().catch(() => {});
              },
              { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
            );
            scheduleFollowingOrbytColorsAfterFeedReady(session.did);

            if (!skipSettings) {
              await get().bootstrapUserFeedSettings(session.did);
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Session restoration failed';
            const restoreOutcome = getSessionRestoreOutcome(error);
            logger.warn('Session restoration failed', {
              component: 'userStore',
              did,
              error: errorMessage,
              restoreOutcome,
            });
            if (restoreOutcome === 'reauth_required') {
              if (options?.preserveAuthStateOnFailure) {
                set({ isAuthenticating: false });
              } else {
                applyAuthFailureState({
                  clearActiveDid: true,
                  authError: 'oauth_reauth_required',
                  authStatus: 'reauth_required',
                  authErrorCode: 'reauth_required',
                });
              }
              throw new AuthFlowError('reauth_required', 'oauth_reauth_required');
            }
            if (restoreOutcome === 'cancelled') {
              if (options?.preserveAuthStateOnFailure) {
                set({ isAuthenticating: false });
              } else {
                set({
                  isAuthenticating: false,
                  authStatus: 'unauthenticated',
                  authErrorCode: 'none',
                });
              }
              throw new AuthFlowError('cancelled', 'oauth_cancelled');
            }
            set({
              isAuthenticating: false,
              authError: errorMessage,
              authStatus: 'degraded_transient',
              authErrorCode: 'transient_failure',
            });
            throw new AuthFlowError('transient_failure', errorMessage);
          }
        },
      };
    },
    {
      name: 'user-store',
      storage: createJSONStorage(() => storageAdapter),
      partialize: state => ({
        savedAccounts: state.savedAccounts,
        activeAccountDid: state.activeAccountDid,
        currentUser: state.currentUser,
        feedDebugOverlayEnabled: state.feedDebugOverlayEnabled,
        profileFeedViewMode: state.profileFeedViewMode,
        subscribedChannels: state.subscribedChannels.filter(
          ch => !BUILT_IN_CHANNELS.includes(ch.uri)
        ),
      }),
      onRehydrateStorage: () => state => {
        if (!state) return;
        const filteredChannels = state.subscribedChannels.filter(
          ch => !BUILT_IN_CHANNELS.includes(ch.uri)
        );
        if (filteredChannels.length !== state.subscribedChannels.length) {
          state.subscribedChannels = filteredChannels;
        }
        // no-op: orbyt profile colors are fetched via react-query, no local cache to load
      },
    }
  )
);

const syncAtprotoBridgeFromUserState = (state: UserState) => {
  setAtprotoSession(state.agent, state.currentUser?.did ?? null);
};

syncAtprotoBridgeFromUserState(useUserStore.getState());
useUserStore.subscribe(syncAtprotoBridgeFromUserState);

// A token the gateway refuses mid-session (signed out elsewhere, revoked) returns to sign-in.
onGatewaySessionExpired(did => {
  if (useUserStore.getState().oauthSession?.did !== did) return;
  queryClient.clear();
  void SecureStore.deleteItemAsync(STORAGE_KEYS.ACTIVE_ACCOUNT).catch(() => {});
  useUserStore.setState({
    authStatus: 'reauth_required',
    authErrorCode: 'reauth_required',
    authError: 'oauth_reauth_required',
    currentUser: null,
    oauthSession: null,
    agent: undefined,
    activeAccountDid: null,
  });
});

export const selectIsSessionValid = (state: UserState): boolean =>
  hasAuthoritativeSdkSession(state.oauthSession, state.currentUser?.did ?? null);

export const useAuth = () => {
  const isAuthenticated = useUserStore(selectIsSessionValid);
  const isAuthenticating = useUserStore(state => state.isAuthenticating);
  const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);
  const authError = useUserStore(state => state.authError);
  const signIn = useUserStore(state => state.signIn);
  const signUp = useUserStore(state => state.signUp);
  const signOut = useUserStore(state => state.signOut);
  const restoreSession = useUserStore(state => state.restoreSession);
  const clearAuthError = useUserStore(state => state.clearAuthError);

  return {
    isAuthenticated,
    isAuthenticating,
    isSwitchingAccount,
    authError,
    signIn,
    signUp,
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
  const clearCorruptedSessions = useUserStore(state => state.clearCorruptedSessions);

  return {
    savedAccounts,
    activeAccountDid,
    switchAccount,
    addAccount,
    removeAccount,
    updateAccountProfile,
    loadSavedAccounts,
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

export const useUserStoreState = () => {
  const agent = useUserStore(state => state.agent);
  const isAuthenticated = useUserStore(selectIsSessionValid);
  const currentUser = useUserStore(state => state.currentUser);
  const isAuthenticating = useUserStore(state => state.isAuthenticating);

  return {
    agent,
    isAuthenticated,
    currentUser,
    isAuthenticating,
  };
};

export const useFeedSettings = () => {
  const feedDebugOverlayEnabled = useUserStore(state => state.feedDebugOverlayEnabled);
  const setFeedDebugOverlayEnabled = useUserStore(state => state.setFeedDebugOverlayEnabled);
  const getFeedDebugOverlayEnabled = useUserStore(state => state.getFeedDebugOverlayEnabled);

  return {
    feedDebugOverlayEnabled,
    setFeedDebugOverlayEnabled,
    getFeedDebugOverlayEnabled,
  };
};
