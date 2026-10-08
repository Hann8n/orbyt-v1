import { ActorService } from '../api/actor/ActorService';
import { GraphService } from '../api/graph/GraphService';
import { updateOrbytProfileColors, updateProfile } from '../orbyt/profileRecords';
import { NotificationService } from '../api/notification/NotificationService';
import { logger } from '../../utils/logger';
import { useUserStore } from '../../stores/userStore';
import {
  useQuery,
  useMutation,
  useQueryClient,
  skipToken,
  QueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '../../utils/query/queryKeys';
import type {
  ProfileViewWithOrbyt,
  OrbytProfileRecord,
  StatusView,
  ExtendedFeedViewPost,
} from '../api/types';
import { queryClient as globalQueryClient } from '../../utils/query/queryClient';
import { isValidDid } from '../../utils/atproto/uriValidation';

const OPTIMISTIC_FOLLOW_URI_PLACEHOLDER = 'at://placeholder';

export function isLiveStatus(status?: StatusView): boolean {
  if (!status) return false;
  if (status.status !== 'app.bsky.actor.status#live') return false;
  return status.isActive !== false;
}

function getStatusExpirationTime(status?: StatusView): number | null {
  if (!status?.expiresAt) return null;
  try {
    return new Date(status.expiresAt).getTime();
  } catch {
    return null;
  }
}

function getProfileStaleTime(profile: ProfileViewWithOrbyt | null | undefined): number {
  if (!profile?.status) return PROFILE_CACHE_EXPIRY;
  const expirationTime = getStatusExpirationTime(profile.status);
  if (expirationTime) {
    const timeUntilExpiration = expirationTime - Date.now();
    return Math.max(60 * 1000, timeUntilExpiration + 60 * 1000);
  }
  return PROFILE_CACHE_EXPIRY;
}

const profileKeys = queryKeys.profiles;
const PROFILE_CACHE_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * Name, bio and avatar are the network profile's, as Orbyt iOS shows them and
 * as profile edits write them (`app.bsky.actor.profile`). Orbyt adds styling,
 * from the `useOrbytProfile` cache, which never holds up the profile.
 */
function withOrbytRecord(profile: ProfileViewWithOrbyt): ProfileViewWithOrbyt {
  const orbytRecord =
    globalQueryClient.getQueryData<OrbytProfileRecord | null>(
      queryKeys.orbytProfile.byDid(profile.did)
    ) ?? null;
  return { ...profile, orbytRecord };
}

class ProfileService {
  static async getProfileByDid(did: string): Promise<ProfileViewWithOrbyt | null> {
    if (!did || !isValidDid(did)) return null;
    const profile = await ActorService.getProfileByDid(did);
    if (!profile) throw new Error('Failed to fetch profile by DID');
    return withOrbytRecord(profile);
  }

  static async warmProfileCache(
    actors: Array<{ handle?: string; did?: string } | null | undefined>,
    qc: QueryClient = globalQueryClient
  ): Promise<void> {
    const handleToDid = new Map<string, string>();
    const uncachedHandles: string[] = [];
    for (const actor of actors) {
      const handle = actor?.handle?.toLowerCase();
      const did = actor?.did;
      if (!handle || !did) continue;
      const cached = qc.getQueryData<ProfileViewWithOrbyt>(queryKeys.profiles.detail(did));
      if (!cached) {
        qc.setQueryData(queryKeys.profiles.detail(did), actor);
      }
      if ((!cached || !('postsCount' in cached)) && !handleToDid.has(handle)) {
        handleToDid.set(handle, did);
        uncachedHandles.push(handle);
      }
    }
    if (!uncachedHandles.length) return;
    try {
      const profiles = await ActorService.getProfilesInBatch(uncachedHandles);
      for (const profile of profiles) {
        if (profile.did) {
          qc.setQueryData(queryKeys.profiles.detail(profile.did), profile);
        }
      }
    } catch (error) {
      logger.error('Failed to set query data for profiles', error);
    }
  }

  static async getProfile(handle: string): Promise<ProfileViewWithOrbyt | null> {
    if (!handle) return null;
    let cleanHandle = handle.trim().toLowerCase();
    if (cleanHandle.includes('://') || cleanHandle.includes('/')) {
      const parts = cleanHandle.split('/');
      for (const part of parts) {
        if (part.includes('.')) {
          cleanHandle = part;
          break;
        }
      }
    }
    if (cleanHandle !== 'verifier' && cleanHandle !== 'bsky.app' && !cleanHandle.includes('.')) {
      return null;
    }
    const profile = await ActorService.getProfile(cleanHandle);
    if (!profile) throw new Error('Failed to fetch profile by handle');
    return withOrbytRecord(profile);
  }

  static async warmProfileCacheFromFeed(
    feedItems: ExtendedFeedViewPost[],
    qc: QueryClient = globalQueryClient
  ): Promise<void> {
    if (!feedItems.length) return;

    const handleToDid = new Map<string, string>();
    const uncachedHandles: string[] = [];

    for (const item of feedItems) {
      const author = item.post?.author;
      const handle = author?.handle?.toLowerCase();
      const did = author?.did;
      if (!handle || !did) continue;

      const cached = qc.getQueryData<ProfileViewWithOrbyt>(queryKeys.profiles.detail(did));
      if (!cached) {
        qc.setQueryData(queryKeys.profiles.detail(did), author);
      }
      if (!cached || !('postsCount' in cached)) {
        if (!handleToDid.has(handle)) {
          handleToDid.set(handle, did);
          uncachedHandles.push(handle);
        }
      }

      if (
        item.reason &&
        '$type' in item.reason &&
        item.reason.$type === 'app.bsky.feed.defs#reasonRepost'
      ) {
        const by = (item.reason as { by?: { handle?: string; did?: string } }).by;
        const repostHandle = by?.handle?.toLowerCase();
        const repostDid = by?.did;
        if (repostHandle && repostDid && !handleToDid.has(repostHandle)) {
          const repostCached = qc.getQueryData<ProfileViewWithOrbyt>(
            queryKeys.profiles.detail(repostDid)
          );
          if (!repostCached) {
            qc.setQueryData(queryKeys.profiles.detail(repostDid), by);
          }
          if (!repostCached || !('postsCount' in repostCached)) {
            handleToDid.set(repostHandle, repostDid);
            uncachedHandles.push(repostHandle);
          }
        }
      }
    }

    if (!uncachedHandles.length) return;

    try {
      const profiles = await ActorService.getProfilesInBatch(uncachedHandles);
      for (const profile of profiles) {
        if (profile.did) {
          qc.setQueryData(queryKeys.profiles.detail(profile.did), profile);
        }
      }
    } catch (error) {
      logger.error('Failed to set query data for profiles', error);
    }
  }
}

export function useProfileByDid(
  did: string | null | undefined,
  options: {
    refetchOnWindowFocus?: boolean;
    refetchInterval?: number | false;
    refetchIntervalInBackground?: boolean;
    placeholderData?: ProfileViewWithOrbyt | null;
  } = {}
): UseQueryResult<ProfileViewWithOrbyt | null, Error> {
  const queryClient = useQueryClient();
  const cachedProfile = did
    ? queryClient.getQueryData<ProfileViewWithOrbyt>(profileKeys.detail(did))
    : undefined;
  const staleTime = getProfileStaleTime(cachedProfile);

  return useQuery<ProfileViewWithOrbyt | null, Error>({
    queryKey: profileKeys.detail(did ?? ''),
    queryFn: did ? () => ProfileService.getProfileByDid(did) : skipToken,
    staleTime,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnReconnect: false,
    ...options,
  });
}

export function useBatchProfilesByDid(
  dids: (string | null | undefined)[]
): UseQueryResult<ProfileViewWithOrbyt[], Error> {
  const validDids = Array.from(new Set(dids.filter((d): d is string => !!d))).sort();
  const queryKey = [...profileKeys.all, 'batch-by-did', ...validDids] as const;

  return useQuery<ProfileViewWithOrbyt[], Error>({
    queryKey,
    queryFn: validDids.length > 0 ? () => ActorService.getProfilesInBatch(validDids) : skipToken,
    enabled: validDids.length > 0,
    staleTime: PROFILE_CACHE_EXPIRY,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnReconnect: false,
  });
}

export function useProfile(
  handle: string | null | undefined
): UseQueryResult<ProfileViewWithOrbyt | null, Error> {
  const queryClient = useQueryClient();

  return useQuery<ProfileViewWithOrbyt | null, Error>({
    queryKey: queryKeys.profiles.byHandle(handle ?? ''),
    queryFn: handle
      ? async () => {
          const profile = await ProfileService.getProfile(handle);
          if (profile?.did) {
            queryClient.setQueryData(profileKeys.detail(profile.did), profile);
          }
          return profile;
        }
      : skipToken,
    staleTime: PROFILE_CACHE_EXPIRY,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnReconnect: false,
  });
}

export function useFollowMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      did,
      handle,
      isFollowing,
    }: {
      did?: string;
      handle: string;
      isFollowing: boolean;
    }) => {
      const resolvedDid =
        did ||
        (await ProfileService.getProfile(handle)
          .then(p => p?.did)
          .catch(() => undefined));
      if (!resolvedDid) throw new Error('Profile not found or missing DID');

      let followUri: string | undefined;
      if (isFollowing) {
        followUri = await GraphService.follow(resolvedDid);
      } else {
        const cached = queryClient.getQueryData<ProfileViewWithOrbyt>(
          profileKeys.detail(resolvedDid)
        );
        let existingFollowUri = cached?.viewer?.following;
        if (existingFollowUri === OPTIMISTIC_FOLLOW_URI_PLACEHOLDER) existingFollowUri = undefined;
        await GraphService.unfollow(resolvedDid, existingFollowUri);
        followUri = undefined;
      }

      return { handle, isFollowing, did: resolvedDid, followUri };
    },
    onMutate: async ({ did, handle, isFollowing }) => {
      let resolvedDid = did;
      if (!resolvedDid) {
        const profile = await ProfileService.getProfile(handle).catch(() => null);
        resolvedDid = profile?.did;
      }
      if (!resolvedDid) throw new Error('Profile not found or missing DID');

      void queryClient.cancelQueries({ queryKey: profileKeys.detail(resolvedDid) });

      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(resolvedDid)
      );

      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(resolvedDid), {
          ...previousProfile,
          viewer: {
            ...previousProfile.viewer,
            following: isFollowing
              ? previousProfile.viewer?.following || OPTIMISTIC_FOLLOW_URI_PLACEHOLDER
              : undefined,
            followedBy: previousProfile.viewer?.followedBy,
          },
        });
      }

      return { previousProfile, did: resolvedDid };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousProfile && context?.did) {
        queryClient.setQueryData(profileKeys.detail(context.did), context.previousProfile);
      }
    },
    onSuccess: data => {
      if (!data?.did) return;
      queryClient.setQueryData<ProfileViewWithOrbyt | undefined>(
        profileKeys.detail(data.did),
        previousProfile => {
          if (!previousProfile) return previousProfile;
          return {
            ...previousProfile,
            viewer: {
              ...previousProfile.viewer,
              following: data.isFollowing
                ? (data.followUri ?? previousProfile.viewer?.following)
                : undefined,
            },
          };
        }
      );
    },
  });
}

export function useBlockMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      did,
      handle,
      isBlocked,
    }: {
      did: string;
      handle: string;
      isBlocked: boolean;
    }) => {
      if (isBlocked) {
        await GraphService.blockUser(did);
      } else {
        await GraphService.unblockUser(did);
      }
      return { did, handle, isBlocked };
    },
    onMutate: async ({ did, handle: _handle, isBlocked }) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(did) });

      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(did)
      );

      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(did), {
          ...previousProfile,
          viewer: {
            ...previousProfile.viewer,
            blocking: isBlocked
              ? previousProfile.viewer?.blocking || 'at://placeholder'
              : undefined,
            blockingByList: !isBlocked ? undefined : previousProfile.viewer?.blockingByList,
          },
        });
      }

      return { previousProfile, did };
    },
    onError: (_err, { did: _did }, context) => {
      if (context?.previousProfile && context?.did) {
        queryClient.setQueryData(profileKeys.detail(context.did), context.previousProfile);
      }
    },
    onSuccess: (_data, { did }) => {
      queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(did), refetchType: 'inactive' });
    },
  });
}

export function useMuteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      did,
      handle,
      isMuted,
    }: {
      did: string;
      handle: string;
      isMuted: boolean;
    }) => {
      if (isMuted) {
        await GraphService.muteUser(did);
      } else {
        await GraphService.unmuteUser(did);
      }
      return { did, handle, isMuted };
    },
    onMutate: async ({ did, handle: _handle, isMuted }) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(did) });

      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(did)
      );

      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(did), {
          ...previousProfile,
          viewer: {
            ...previousProfile.viewer,
            muted: isMuted,
          },
        });
      }

      return { previousProfile, did };
    },
    onError: (_err, { did: _did }, context) => {
      if (context?.previousProfile && context?.did) {
        queryClient.setQueryData(profileKeys.detail(context.did), context.previousProfile);
      }
    },
    onSuccess: (_, { did }) => {
      queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(did), refetchType: 'active' });
    },
  });
}

interface ProfileUpdates {
  displayName?: string;
  description?: string;
  /** Local image URI for a new avatar. */
  avatar?: string;
  customColors?: {
    backgroundColor: string;
    textColor: string;
  };
}

/** The saved fields as the profile view shows them; names and bios are saved trimmed. */
function profilePatch(updates: ProfileUpdates, avatar?: string): Partial<ProfileViewWithOrbyt> {
  return {
    ...(updates.displayName !== undefined ? { displayName: updates.displayName.trim() } : {}),
    ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
    ...(avatar !== undefined ? { avatar } : {}),
  };
}

/**
 * Save the signed-in account's profile as Orbyt iOS does: the network profile
 * first, then the colors, only when they changed. The edit shows everywhere at
 * once (profile caches, the account switcher) and is rolled back if it fails.
 */
export function useProfileUpdateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updates }: { did: string; handle: string; updates: ProfileUpdates }) => {
      const editsProfile =
        updates.displayName !== undefined ||
        updates.description !== undefined ||
        updates.avatar !== undefined;
      const { avatar } = editsProfile
        ? await updateProfile({
            displayName: updates.displayName,
            description: updates.description,
            avatarUri: updates.avatar,
          })
        : {};
      if (updates.customColors) {
        await updateOrbytProfileColors(updates.customColors);
      }
      return { avatar };
    },
    onMutate: async ({ did, handle, updates }) => {
      const profileKeysToPatch = [profileKeys.detail(did), profileKeys.byHandle(handle)];
      const recordKey = queryKeys.orbytProfile.byDid(did);
      await Promise.all(
        [...profileKeysToPatch, recordKey].map(queryKey => queryClient.cancelQueries({ queryKey }))
      );

      const previousProfiles = profileKeysToPatch.map(
        key => [key, queryClient.getQueryData<ProfileViewWithOrbyt | null>(key)] as const
      );
      const previousRecord = queryClient.getQueryData<OrbytProfileRecord | null>(recordKey);

      const colors = updates.customColors;
      const orbytRecord = colors
        ? { ...(previousRecord ?? { $type: 'com.getorbyt.profile' as const }), colors }
        : undefined;
      const patch = {
        ...profilePatch(updates, updates.avatar),
        ...(orbytRecord ? { orbytRecord } : {}),
      };
      for (const key of profileKeysToPatch) {
        queryClient.setQueryData<ProfileViewWithOrbyt | null>(key, prev =>
          prev ? { ...prev, ...patch } : prev
        );
      }
      if (orbytRecord) {
        queryClient.setQueryData<OrbytProfileRecord | null>(recordKey, orbytRecord);
      }

      return { previousProfiles, previousRecord, recordKey };
    },
    onSuccess: ({ avatar }, { did, handle, updates }) => {
      if (avatar) {
        // The uploaded avatar's CDN URL replaces the local file shown meanwhile.
        for (const key of [profileKeys.detail(did), profileKeys.byHandle(handle)]) {
          queryClient.setQueryData<ProfileViewWithOrbyt | null>(key, prev =>
            prev ? { ...prev, avatar } : prev
          );
        }
      }
      void useUserStore
        .getState()
        .updateAccountProfile(did, profilePatch(updates, avatar))
        .catch(() => {});
      // Later reads refetch the network profile, which serves the edit at once.
      // Colors stay as saved: the Orbyt AppView projects them about a minute
      // behind the PDS, and refetching now would show the old ones.
      void queryClient.invalidateQueries({
        queryKey: profileKeys.detail(did),
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({
        queryKey: profileKeys.byHandle(handle),
        refetchType: 'none',
      });
    },
    onError: (_error, { did }, context) => {
      if (!context) return;
      for (const [key, previous] of context.previousProfiles) {
        queryClient.setQueryData(key, previous);
      }
      queryClient.setQueryData(context.recordKey, context.previousRecord);
      // The profile may have saved before the colors failed: show what was saved.
      void queryClient.invalidateQueries({ queryKey: profileKeys.detail(did) });
    },
  });
}

export function useSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      did,
      preferences,
    }: {
      did: string;
      preferences: { post: boolean; reply: boolean };
    }) => {
      if (!preferences.post && !preferences.reply) {
        await NotificationService.deleteActivitySubscription(did);
        return { did, preferences: null };
      }
      await NotificationService.putActivitySubscription(did, preferences);
      return { did, preferences };
    },
    onMutate: async ({ did, preferences }) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(did) });

      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(did)
      );

      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(did), {
          ...previousProfile,
          viewer: {
            ...previousProfile.viewer,
            activitySubscription: !preferences.post && !preferences.reply ? undefined : preferences,
          },
        });
      }

      return { previousProfile, did };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousProfile && context?.did) {
        queryClient.setQueryData(profileKeys.detail(context.did), context.previousProfile);
      }
    },
    onSuccess: data => {
      if (!data?.did) return;
      queryClient.invalidateQueries({
        queryKey: profileKeys.detail(data.did),
        refetchType: 'inactive',
      });
    },
  });
}

export function useStatusExpirationMonitor(
  profile: ProfileViewWithOrbyt | null | undefined,
  did?: string | null
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.status || profile.status.status !== 'app.bsky.actor.status#live') {
      return undefined;
    }

    const invalidate = () => {
      const targetDid = did || profile.did;
      if (targetDid) {
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(targetDid) });
      }
    };

    if (profile.status.isActive === false) {
      invalidate();
      return undefined;
    }

    const expirationTime = getStatusExpirationTime(profile.status);
    if (expirationTime) {
      const timeUntilExpiration = expirationTime - Date.now() + 60 * 1000;

      if (timeUntilExpiration <= 0) {
        invalidate();
        return undefined;
      }

      const timeoutId = setTimeout(invalidate, timeUntilExpiration);
      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [profile, did, queryClient]);
}

export async function prefetchProfile(
  queryClient: QueryClient,
  identifier: string,
  partialProfile?: {
    did?: string;
    handle?: string;
    displayName?: string;
    avatar?: string;
    description?: string;
    verification?: ProfileViewWithOrbyt['verification'];
    status?: ProfileViewWithOrbyt['status'];
  }
): Promise<void> {
  if (!identifier || !queryClient) return;

  const cleanIdentifier = identifier.trim();
  if (!cleanIdentifier) return;

  const isDid = isValidDid(cleanIdentifier);
  const did = isDid ? cleanIdentifier : partialProfile?.did;

  if (partialProfile && did) {
    const existing = queryClient.getQueryData<ProfileViewWithOrbyt>(profileKeys.detail(did));
    if (!existing) {
      queryClient.setQueryData(profileKeys.detail(did), {
        did,
        handle: partialProfile.handle,
        displayName: partialProfile.displayName,
        avatar: partialProfile.avatar,
        description: partialProfile.description,
        verification: partialProfile.verification,
        status: partialProfile.status,
      } as ProfileViewWithOrbyt);
    }
  }

  if (isDid && did) {
    await queryClient.prefetchQuery({
      queryKey: profileKeys.detail(did),
      queryFn: () => ProfileService.getProfileByDid(did),
      staleTime: PROFILE_CACHE_EXPIRY,
    });
  } else if (!isDid) {
    const profile = await ProfileService.getProfile(cleanIdentifier);
    if (profile?.did) {
      queryClient.setQueryData(profileKeys.detail(profile.did), profile);
    }
  }
}

export default ProfileService;
