import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageAdapter, storage } from '../utils/storage/storage';
import * as SecureStore from 'expo-secure-store';
import { getAnalytics, setUserId, logLogin, logSignUp } from '@react-native-firebase/analytics';
import { Agent } from '@atproto/api';
import { getOAuthClient } from '../services/auth';
import type { OAuthSession } from '@atproto/oauth-client';
import { RepoService } from '../services/api/repo/RepoService';
import { isUserCancellation, getErrorMessage } from '../utils/errors/errorHandler';
import { TokenRevokedError, TokenRefreshError, TokenInvalidError } from '@atproto/oauth-client';
import { logger } from '../utils/logger';

import { ModerationService } from '../services/moderation/ModerationService';
import type { OrbytProfileRecord, ProfileViewWithOrbyt } from '../services/api/types';
import { isOrbytChannel } from '../utils/channels/orbyt';
import { queryClient } from '../utils/query/queryClient';
import { usePostInteractionStore } from './postInteractionStore';
import { queryKeys } from '../utils/query/queryKeys';
import { orbytProfileQueryOptions, warmOrbytProfileCache } from '../services/colors';
import { hydrateOrbytChannels } from '../services/OrbytChannelsService';
import { APP_CONSTANTS, DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI } from '../utils/constants';
import { setAtprotoSession } from '../services/api/agentBridge';
import { Platform } from 'react-native';

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
  oauthSession: OAuthSession | null,
  currentUserDid: string | null
): boolean {
  if (!oauthSession || !currentUserDid) return false;
  return oauthSession.did === currentUserDid;
}

const REQUIRED_OAUTH_SCOPE = 'atproto';

async function assertRequiredOAuthScope(session: OAuthSession): Promise<void> {
  const tokenInfo = await session.getTokenInfo(false);
  const scopes = tokenInfo.scope.split(' ').filter(Boolean);
  if (!scopes.includes(REQUIRED_OAUTH_SCOPE)) {
    throw new Error(`oauth_scope_upgrade_required:${REQUIRED_OAUTH_SCOPE}`);
  }
}

function getSessionRestoreOutcome(error: unknown): SessionRestoreOutcome {
  if (error instanceof AuthFlowError) return error.kind;
  if (
    error instanceof TokenRevokedError ||
    error instanceof TokenRefreshError ||
    error instanceof TokenInvalidError
  )
    return 'reauth_required';
  if (isUserCancellation(error)) return 'cancelled';
  if (error instanceof Error && error.message.startsWith('oauth_scope_upgrade_required:')) {
    return 'reauth_required';
  }

  const errorText = error instanceof Error ? error.message : String(error);
  if (TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(errorText))) {
    return 'transient_failure';
  }

  return 'transient_failure';
}

const TRANSIENT_ERROR_PATTERNS = [
  /network/i,
  /fetch/i,
  /timeout/i,
  /timed out/i,
  /enotfound/i,
  /econnreset/i,
  /econnrefused/i,
  /503/,
  /502/,
  /504/,
];

// Some OAuth client session stores treat refresh tokens as single-use and can error if
// `restore(did)` is called concurrently for the same account. This lock ensures we only
// execute the restore once per DID at a time and share the in-flight result.
const restoreInFlightByDid = new Map<string, Promise<OAuthSession>>();

async function restoreSessionLocal(did: string): Promise<OAuthSession> {
  return getOAuthClient().restore(did, false);
}

function restoreSessionWithRefresh(did: string): Promise<OAuthSession> {
  const existing = restoreInFlightByDid.get(did);
  if (existing) return existing;

  const client = getOAuthClient();
  const promise = (async () => {
    try {
      return await client.restore(did);
    } finally {
      restoreInFlightByDid.delete(did);
    }
  })();

  restoreInFlightByDid.set(did, promise);
  return promise;
}

export const isIosLiquidGlassAvailable =
  Platform.OS === 'ios' && parseFloat(Platform.Version as string) >= 26;

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

const buildFeedSourceFingerprint = (
  algorithmicFeedProvider: string | null,
  subscribedChannels: SubscribedChannel[]
): string => {
  const provider = algorithmicFeedProvider ?? 'none';
  const channelUris = subscribedChannels
    .map(channel => channel.uri)
    .filter(uri => !BUILT_IN_CHANNELS.includes(uri))
    .sort()
    .join(',');
  return `${provider}|${channelUris}`;
};

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

  oauthSession: OAuthSession | null;
  agent?: Agent;

  feedDebugOverlayEnabled: boolean;
  profileFeedViewMode: 'list' | 'grid';

  algorithmicFeedProvider: string | null;

  subscribedChannels: SubscribedChannel[];
  feedSourceFingerprint: string;

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
    oauthSession: OAuthSession,
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

  setAlgorithmicFeedProvider: (uri: string | null) => Promise<void>;
  getAlgorithmicFeedProvider: () => Promise<string | null>;

  setCurrentUser: (user: UserState['currentUser']) => void;
  setAuthenticating: (authenticating: boolean) => void;
  setAuthError: (error: string | null) => void;
  clearAuthError: () => void;

  setShowEmailVerificationModal: (show: boolean) => void;

  clearAllCaches: () => Promise<void>;

  checkSessionHealth: () => Promise<boolean>;
  clearCorruptedSessions: () => Promise<void>;

  initializeUserState: () => Promise<void>;
  loadSavedAccounts: () => Promise<void>;
  bootstrapUserFeedSettings: (did: string) => Promise<boolean>;
  loadUserSpecificSettings: (
    did: string,
    orbytProfileRecord: OrbytProfileRecord | null
  ) => Promise<boolean>;
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
  ALGORITHMIC_FEED_PROVIDER: 'algorithmic_feed_provider',
  ORBYT_PROFILE_RECORD: 'orbyt_profile_record',
} as const;

const BUILT_IN_CHANNELS = ['following', 'your-mix'];

const filterBuiltInChannels = (uris: string[]): string[] => {
  return uris.filter(uri => !BUILT_IN_CHANNELS.includes(uri));
};

const getUserScopedKey = (baseKey: string, did: string): string => {
  const sanitizedDid = String(did).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${baseKey}_${sanitizedDid}`;
};

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

/** Profile record wins when present; otherwise MMKV + default generator URI. */
function resolveAlgorithmicFeedProviderForDid(
  did: string,
  record: OrbytProfileRecord | null
): string | null {
  try {
    const remoteProvider = record?.algorithmicFeedProvider;
    if (remoteProvider !== undefined) {
      const key = getUserScopedKey(STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER, did);
      if (remoteProvider === null) storage.delete(key);
      else storage.set(key, remoteProvider);
      return remoteProvider;
    }
  } catch {
    // fall through to local
  }
  const key = getUserScopedKey(STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER, did);
  const local = storage.getString(key) ?? null;
  return local ?? DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI;
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

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => {
      const hydrateOAuthSession = async (
        oauthSession: OAuthSession,
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
          algorithmicFeedProvider: DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
          subscribedChannels: [],
          feedSourceFingerprint: buildFeedSourceFingerprint(
            DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
            []
          ),
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

        algorithmicFeedProvider: DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,

        subscribedChannels: [],
        feedSourceFingerprint: buildFeedSourceFingerprint(
          DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
          []
        ),

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

            const client = getOAuthClient();
            const session = await client.signIn(identifier);
            await assertRequiredOAuthScope(session);

            const { agent, userProfile, emailConfirmed } = await hydrateOAuthSession(session);

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
                void RepoService.initOrbytProfileIfNeeded().catch(() => {});
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

            const client = getOAuthClient();
            const trimmed = identifier.trim();
            let session: OAuthSession;
            try {
              session = await client.signIn(trimmed, { prompt: 'create' });
            } catch (promptError) {
              const msg = promptError instanceof Error ? promptError.message : String(promptError);
              const isUnsupportedCreatePrompt =
                /invalid_request|Invalid enum|received 'create'|prompt.*create/i.test(msg);
              if (isUnsupportedCreatePrompt) {
                session = await client.signIn(trimmed);
              } else {
                throw promptError;
              }
            }
            await assertRequiredOAuthScope(session);

            const { agent, userProfile, emailConfirmed } = await hydrateOAuthSession(session);

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
                void RepoService.initOrbytProfileIfNeeded().catch(() => {});
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
            if (
              error instanceof TokenRevokedError ||
              error instanceof TokenRefreshError ||
              error instanceof TokenInvalidError
            ) {
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

            if (currentDid) {
              try {
                const client = getOAuthClient();
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

            await get().clearAllCaches();

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
              algorithmicFeedProvider: DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
              subscribedChannels: [],
              feedSourceFingerprint: buildFeedSourceFingerprint(
                DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
                []
              ),
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
          let localSession: OAuthSession;
          try {
            localSession = await restoreSessionLocal(did);
            await assertRequiredOAuthScope(localSession); // reads cached scope, no network
          } catch (localError) {
            const restoreOutcome = getSessionRestoreOutcome(localError);
            if (
              restoreOutcome === 'reauth_required' ||
              (localError instanceof Error &&
                localError.message.startsWith('oauth_scope_upgrade_required:'))
            ) {
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
            // No MMKV session — fall back to the full network restore (first install / cleared data)
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
              void RepoService.initOrbytProfileIfNeeded().catch(() => {});
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
              algorithmicFeedProvider: get().algorithmicFeedProvider,
              feedSourceFingerprint: get().feedSourceFingerprint,
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
                algorithmicFeedProvider: previousState.algorithmicFeedProvider,
                feedSourceFingerprint: previousState.feedSourceFingerprint,
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
                  void RepoService.initOrbytProfileIfNeeded().catch(() => {});
                },
                { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
              );

              void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
              void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
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
            const accounts = get().savedAccounts.filter(acc => acc.did !== did);
            await SecureStore.setItemAsync(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

            if (isActiveAccount) {
              await get().signOut();
            } else {
              try {
                await getOAuthClient().revoke(did);
              } catch {
                // ignore
              }
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
              set(state => ({
                subscribedChannels: updatedChannels,
                feedSourceFingerprint: buildFeedSourceFingerprint(
                  state.algorithmicFeedProvider,
                  updatedChannels
                ),
              }));
            } else {
              // Add new channel/feed
              const newChannel: SubscribedChannel = {
                ...channelData,
                isOrbytChannel: isOrbytChannel(channelData.uri),
                subscribedAt: Date.now(),
              };
              const nextChannels = [...channels, newChannel];
              set(state => ({
                subscribedChannels: nextChannels,
                feedSourceFingerprint: buildFeedSourceFingerprint(
                  state.algorithmicFeedProvider,
                  nextChannels
                ),
              }));
            }

            // Filter out built-in channels before saving
            const channelsToSave = get().subscribedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );

            // Save to storage
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            storage.set(key, JSON.stringify(channelsToSave));

            // Sync subscribed channels to orbyt profile record (best-effort)
            try {
              const urisToSync = filterBuiltInChannels(get().subscribedChannels.map(ch => ch.uri));
              await RepoService.updateOrbytProfileChannels(urisToSync);
            } catch {
              // ignore
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

            set(state => ({
              subscribedChannels: updatedChannels,
              feedSourceFingerprint: buildFeedSourceFingerprint(
                state.algorithmicFeedProvider,
                updatedChannels
              ),
            }));

            // Save to storage (filter built-ins)
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            const channelsToSave = updatedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );
            storage.set(key, JSON.stringify(channelsToSave));

            // Sync subscribed channels to orbyt profile record (best-effort)
            try {
              const urisToSync = filterBuiltInChannels(updatedChannels.map(ch => ch.uri));
              await RepoService.updateOrbytProfileChannels(urisToSync);
            } catch {
              // ignore
            }
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
            set(state => ({
              subscribedChannels: nextChannels,
              feedSourceFingerprint: buildFeedSourceFingerprint(
                state.algorithmicFeedProvider,
                nextChannels
              ),
            }));

            // Single storage operation for all changes (filter built-ins)
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            const channelsToSave = get().subscribedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );
            storage.set(key, JSON.stringify(channelsToSave));

            // Sync subscribed channels to orbyt profile record (best-effort)
            try {
              const urisToSync = filterBuiltInChannels(get().subscribedChannels.map(ch => ch.uri));
              await RepoService.updateOrbytProfileChannels(urisToSync);
            } catch {
              // ignore
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
            set(state => ({
              subscribedChannels: updatedChannels,
              feedSourceFingerprint: buildFeedSourceFingerprint(
                state.algorithmicFeedProvider,
                updatedChannels
              ),
            }));

            // Single storage operation for all changes (filter built-ins)
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, currentUser.did);
            const channelsToSave = updatedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );
            storage.set(key, JSON.stringify(channelsToSave));

            // Sync subscribed channels to orbyt profile record (best-effort)
            try {
              const urisToSync = filterBuiltInChannels(updatedChannels.map(ch => ch.uri));
              await RepoService.updateOrbytProfileChannels(urisToSync);
            } catch {
              // ignore
            }
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

        setAlgorithmicFeedProvider: async (uri: string | null) => {
          try {
            const currentUser = get().currentUser;
            const key = currentUser?.did
              ? getUserScopedKey(STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER, currentUser.did)
              : STORAGE_KEYS.ALGORITHMIC_FEED_PROVIDER;

            if (uri === null) {
              storage.delete(key);
            } else {
              storage.set(key, uri);
            }

            set(state => ({
              algorithmicFeedProvider: uri,
              feedSourceFingerprint: buildFeedSourceFingerprint(uri, state.subscribedChannels),
            }));

            // Sync algorithmic feed provider to orbyt profile record (best-effort)
            try {
              await RepoService.updateOrbytProfileAlgorithmicFeedProvider(uri);
            } catch {
              // ignore
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
            const value = storage.getString(key) ?? null;
            return value ?? DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI;
          } catch (error) {
            logger.error('Error getting algorithmic feed provider', error, {
              component: 'userStore',
            });
            return DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI;
          }
        },

        setCurrentUser: user => set({ currentUser: user }),

        setAuthenticating: authenticating => set({ isAuthenticating: authenticating }),
        setAuthError: error => set({ authError: error }),
        clearAuthError: () => set({ authError: null }),

        setShowEmailVerificationModal: show => set({ showEmailVerificationModal: show }),

        clearAllCaches: async () => {
          try {
            usePostInteractionStore.getState().clearInteractions();

            queryClient.removeQueries({ queryKey: queryKeys.moderation.all });
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
            if (
              error instanceof TokenRevokedError ||
              error instanceof TokenRefreshError ||
              error instanceof TokenInvalidError
            ) {
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
              try {
                const client = getOAuthClient();
                await client.revoke(currentDid);
              } catch (error) {
                logger.debug('Could not revoke corrupted session', {
                  component: 'userStore',
                  did: currentDid,
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
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
                  set({
                    authStatus: 'reauth_required',
                    currentUser: null,
                    oauthSession: null,
                    agent: undefined,
                    activeAccountDid: null,
                    algorithmicFeedProvider: DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
                    subscribedChannels: [],
                    feedSourceFingerprint: buildFeedSourceFingerprint(
                      DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
                      []
                    ),
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
              get().loadUserSpecificSettings(did, cachedRecord),
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
                  get().loadUserSpecificSettings(bgDid, freshRecord),
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

            await hydrateOrbytChannels().catch(() => {});
            const [settingsLoaded, channelsLoaded] = await Promise.all([
              get().loadUserSpecificSettings(did, orbytProfileRecord),
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

        loadUserSpecificSettings: async (
          did: string,
          orbytProfileRecord: OrbytProfileRecord | null
        ) => {
          try {
            const feedDebugOverlayEnabled =
              storage.getBoolean(getFlagKey('feed_debug_overlay_enabled', did)) ?? false;

            const algorithmicFeedProvider = resolveAlgorithmicFeedProviderForDid(
              did,
              orbytProfileRecord
            );

            // Update state with user-specific settings
            set(state => ({
              feedDebugOverlayEnabled,
              algorithmicFeedProvider,
              feedSourceFingerprint: buildFeedSourceFingerprint(
                algorithmicFeedProvider,
                state.subscribedChannels
              ),
            }));
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
            const key = getUserScopedKey(STORAGE_KEYS.SUBSCRIBED_CHANNELS, did);
            const savedChannelsStr = storage.getString(key) ?? null;

            let savedChannels: SubscribedChannel[] = savedChannelsStr
              ? JSON.parse(savedChannelsStr)
              : [];

            savedChannels = savedChannels.filter(ch => !BUILT_IN_CHANNELS.includes(ch.uri));

            const remoteUris: string[] = Array.isArray(orbytProfileRecord?.subscribedChannels)
              ? orbytProfileRecord.subscribedChannels!
              : [];

            if (savedChannels.length === 0 && remoteUris.length > 0) {
              const filteredUris = filterBuiltInChannels(remoteUris);
              if (filteredUris.length > 0) {
                savedChannels = filteredUris.map((uri: string) => ({
                  uri,
                  displayName: '',
                  isOrbytChannel: isOrbytChannel(uri),
                  subscribedAt: Date.now(),
                }));
                storage.set(key, JSON.stringify(savedChannels));
              }
            }

            // Double-check: filter built-ins from state (in case persisted state had them)
            const filteredChannels = savedChannels.filter(
              ch => !BUILT_IN_CHANNELS.includes(ch.uri)
            );

            // Set subscribed channels - no merging, no defaults, just the user's subscriptions
            set(state => ({
              subscribedChannels: filteredChannels,
              feedSourceFingerprint: buildFeedSourceFingerprint(
                state.algorithmicFeedProvider,
                filteredChannels
              ),
            }));

            const urisToSync = filterBuiltInChannels(filteredChannels.map(ch => ch.uri));
            void RepoService.updateOrbytProfileChannels(urisToSync).catch(error => {
              logger.warn('Failed to clean profile record of built-in channels', {
                component: 'userStore',
                error: error instanceof Error ? error.message : String(error),
              });
            });
            return true;
          } catch (error) {
            logger.error('Error loading subscribed channels', error, { component: 'userStore' });
            set(state => ({
              subscribedChannels: [],
              feedSourceFingerprint: buildFeedSourceFingerprint(state.algorithmicFeedProvider, []),
            }));
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
            await assertRequiredOAuthScope(session);

            const { agent, userProfile, emailConfirmed } = await hydrateOAuthSession(session, {
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

            // Fetch orbyt profile colors in background (skipped in hydrateOAuthSession above)
            queryClient.fetchQuery(orbytProfileQueryOptions(session.did)).catch(() => {});

            requestIdleCallback(
              () => {
                void RepoService.initOrbytProfileIfNeeded().catch(() => {});
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
        algorithmicFeedProvider: state.algorithmicFeedProvider,
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
        state.feedSourceFingerprint = buildFeedSourceFingerprint(
          state.algorithmicFeedProvider ?? DEFAULT_ALGORITHMIC_FEED_PROVIDER_URI,
          state.subscribedChannels
        );
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
