import { ActorService } from '../api/actor/ActorService';
import { GraphService } from '../api/graph/GraphService';
import { RepoService } from '../api/repo/RepoService';
import { NotificationService } from '../api/notification/NotificationService';
import {
  useQuery,
  useMutation,
  useQueryClient,
  skipToken,
  QueryClient,
  QueryKey,
  UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '../../utils/query/queryKeys';
import type {
  ProfileViewWithOrbyt,
  StatusView,
  ProfileView,
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

class ProfileService {
  private static currentUserDid: string | null = null;
  private static currentUserHandle: string | null = null;

  static getQueryKey(did: string): QueryKey {
    return profileKeys.detail(did);
  }

  static get cacheExpiry(): number {
    return PROFILE_CACHE_EXPIRY;
  }

  static setCurrentUserDid(did: string) {
    this.currentUserDid = did;
  }

  static getCurrentUserDid(): string | null {
    return this.currentUserDid;
  }

  static setCurrentUserHandle(handle: string) {
    this.currentUserHandle = handle;
  }

  static getCurrentUserHandle(): string | null {
    return this.currentUserHandle;
  }

  static async getProfileByDid(did: string): Promise<ProfileViewWithOrbyt | null> {
    if (!did) return null;

    if (!isValidDid(did)) {
      return null;
    }

    const profile = await ActorService.getProfileByDid(did);
    if (!profile) {
      throw new Error('Failed to fetch profile by DID');
    }

    return profile;
  }

  static async batchGetProfiles(handles: string[]): Promise<ProfileViewWithOrbyt[]> {
    if (!handles || handles.length === 0) {
      return [];
    }

    const uniqueHandles = Array.from(
      new Set(handles.map(h => h?.toLowerCase()).filter(h => !!h && typeof h === 'string'))
    );

    try {
      return await ActorService.getProfilesInBatch(uniqueHandles);
    } catch (_error) {
      return [];
    }
  }

  static async batchGetProfilesByDid(dids: string[]): Promise<ProfileViewWithOrbyt[]> {
    if (!dids || dids.length === 0) return [];
    const uniqueDids = Array.from(new Set(dids.filter((d): d is string => !!d)));
    try {
      return await ActorService.getProfilesInBatch(uniqueDids);
    } catch {
      return [];
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
    if (!profile) {
      throw new Error('Failed to fetch profile by handle');
    }

    return profile;
  }

  static async warmProfileCacheFromFeed(
    feedItems: ExtendedFeedViewPost[],
    qc: QueryClient = globalQueryClient
  ): Promise<void> {
    if (!feedItems.length) return;

    const handleToDid = new Map<string, string>();
    const uncachedHandles: string[] = [];

    for (const item of feedItems) {
      const handle = item.post?.author?.handle?.toLowerCase();
      const did = item.post?.author?.did;
      if (!handle || !did) continue;
      if (qc.getQueryData(queryKeys.profiles.detail(did))) continue;
      if (!handleToDid.has(handle)) {
        handleToDid.set(handle, did);
        uncachedHandles.push(handle);
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
          if (!qc.getQueryData(queryKeys.profiles.detail(repostDid))) {
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
    } catch {
    }
  }

  static async precacheCurrentUserProfile(qc: QueryClient = globalQueryClient): Promise<void> {
    if (!this.currentUserDid) return;
    await qc.prefetchQuery({
      queryKey: profileKeys.detail(this.currentUserDid),
      queryFn: () => ProfileService.getProfileByDid(this.currentUserDid!),
      staleTime: PROFILE_CACHE_EXPIRY,
    });
  }
}

export function useProfileByDid(
  did: string | null | undefined,
  options: {
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
    refetchOnReconnect?: boolean;
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
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? true,
    refetchOnMount: options.refetchOnMount ?? false,
    refetchOnReconnect: options.refetchOnReconnect ?? false,
    refetchInterval: options.refetchInterval,
    refetchIntervalInBackground: options.refetchIntervalInBackground ?? false,
    placeholderData: options.placeholderData,
  });
}

export function useBatchProfilesByDid(
  dids: (string | null | undefined)[]
): UseQueryResult<ProfileViewWithOrbyt[], Error> {
  const validDids = Array.from(new Set(dids.filter((d): d is string => !!d))).sort();
  const queryKey = [...profileKeys.all, 'batch-by-did', ...validDids] as const;

  return useQuery<ProfileViewWithOrbyt[], Error>({
    queryKey,
    queryFn: async () => {
      if (validDids.length === 0) return [];
      return ProfileService.batchGetProfilesByDid(validDids);
    },
    enabled: validDids.length > 0,
    staleTime: PROFILE_CACHE_EXPIRY,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
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
    refetchOnWindowFocus: false,
    refetchOnMount: false,
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
      // Invalidate feed queries immediately to refresh posts visibility
      queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'active' });

      // Delay profile refetch to ensure server has processed (only inactive queries)
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: profileKeys.detail(did),
          refetchType: 'inactive',
        });
      }, 2000);
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
      // Invalidate feed queries immediately to refresh posts visibility
      queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'active' });

      // Delay profile refetch to ensure server has processed the change
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(did), refetchType: 'active' });
      }, 500);
    },
  });
}

export function useProfileUpdateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      handle,
      updates,
    }: {
      handle: string;
      updates: {
        displayName?: string;
        description?: string;
        avatar?: string;
        customColors?: {
          backgroundColor: string;
          textColor: string;
        };
      };
    }) => {
      // Handle custom colors - update orbyt profile record
      if (updates.customColors) {
        await RepoService.updateOrbytProfileColors(
          updates.customColors.backgroundColor,
          updates.customColors.textColor
        );
      }

      // Create a copy of updates without customColors for AtprotoService
      const profileUpdates = {
        displayName: updates.displayName,
        description: updates.description,
        avatar: updates.avatar,
      };

      // Only call updateProfile if there are non-color updates
      let updatedProfile;
      if (
        updates.displayName !== undefined ||
        updates.description !== undefined ||
        updates.avatar !== undefined
      ) {
        updatedProfile = await ActorService.updateProfile(profileUpdates);
      }

      return { handle, updatedProfile, updatedColors: !!updates.customColors };
    },
    onMutate: async ({ handle, updates }) => {
      // Get profile to find DID (API always provides DID)
      const profile = await ProfileService.getProfile(handle).catch(() => null);
      const did = profile?.did;
      if (!did) {
        throw new Error('Profile not found or missing DID');
      }

      await queryClient.cancelQueries({ queryKey: profileKeys.detail(did) });

      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(did)
      );

      // Optimistically update the query cache
      if (previousProfile) {
        const optimistic: ProfileViewWithOrbyt = {
          ...previousProfile,
          ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.avatar !== undefined ? { avatar: updates.avatar } : {}),
          ...(updates.customColors
            ? {
                orbytColors: {
                  backgroundColor: updates.customColors.backgroundColor,
                  textColor: updates.customColors.textColor,
                  joinedAt: previousProfile.orbytColors?.joinedAt ?? new Date().toISOString(),
                  isBeta: previousProfile.orbytColors?.isBeta ?? false,
                },
              }
            : {}),
        };

        queryClient.setQueryData(profileKeys.detail(did), optimistic);
      }

      return { previousProfile, did };
    },
    onSuccess: ({ updatedProfile, updatedColors }, { updates }, context) => {
      try {
        const did = context?.did;
        if (!did) return;

        // If colors were updated, update orbyt record in cache
        if (updatedColors) {
          const prev = queryClient.getQueryData<ProfileViewWithOrbyt>(profileKeys.detail(did));

          if (prev && updates.customColors) {
            // Update the profile with new colors in the centralized orbytColors field
            const updated: ProfileViewWithOrbyt = {
              ...prev,
              orbytColors: {
                backgroundColor: updates.customColors.backgroundColor,
                textColor: updates.customColors.textColor,
                joinedAt: prev.orbytColors?.joinedAt ?? new Date().toISOString(),
                isBeta: prev.orbytColors?.isBeta ?? false,
              },
            };

            // Update React Query cache immediately
            queryClient.setQueryData(profileKeys.detail(did), updated);
          } else {
            // Fallback: invalidate to trigger refetch
            queryClient.invalidateQueries({ queryKey: profileKeys.detail(did) });
          }
          return;
        }

        if (!updatedProfile) {
          return; // Skip if no profile was updated
        }

        // Merge server-updated fields into the query cache immediately
        const prev = queryClient.getQueryData<ProfileViewWithOrbyt>(profileKeys.detail(did));

        if (!prev) {
          return; // Skip if no previous data
        }

        // Merge updated profile data
        const merged: ProfileViewWithOrbyt = {
          ...prev,
          ...(updatedProfile as ProfileView),
          orbytRecord: prev.orbytRecord, // Preserve orbyt record
        };

        queryClient.setQueryData(profileKeys.detail(did), merged);

        // Still invalidate to ensure freshness against server
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(did) });
      } catch {
        // Silently handle errors
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousProfile && context?.did) {
        queryClient.setQueryData(profileKeys.detail(context.did), context.previousProfile);
      }
    },
  });
}

/**
 * Hook to update activity subscription with React Query integration
 * React Query cache is the single source of truth for subscription state
 */
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
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(data.did), refetchType: 'inactive' });
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
      const timeUntilExpiration = expirationTime - Date.now() + 60 * 1000; // 1 min buffer

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
      const partialProfileData: Partial<ProfileViewWithOrbyt> = {
        did,
        handle: partialProfile.handle,
        displayName: partialProfile.displayName,
        avatar: partialProfile.avatar,
        description: partialProfile.description,
        verification: partialProfile.verification,
        status: partialProfile.status,
      };

      queryClient.setQueryData(profileKeys.detail(did), partialProfileData as ProfileViewWithOrbyt);
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
