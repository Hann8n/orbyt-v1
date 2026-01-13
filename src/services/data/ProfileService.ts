import AtprotoService from '../api/AtprotoService';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryKey,
  UseQueryResult,
} from '@tanstack/react-query';
import { useMemo, useCallback, useEffect } from 'react';
import type {
  ProfileViewWithOrbyt,
  StatusView,
  ProfileView,
  ExtendedFeedViewPost,
  ProfileViewBasic,
} from '../api/types';

/**
 * Check if a StatusView represents an active live status
 * Trusts the API's isActive field - the API already handles expiration checks
 *
 * API schema:
 * - status.status: REQUIRED, must be 'app.bsky.actor.status#live'
 * - status.isActive: Only present if expiration was set (true = active, false = expired)
 *
 * Simple logic: Trust the API. If isActive is present, use it. Otherwise, status is active.
 */
export function isLiveStatus(status?: StatusView): boolean {
  if (!status) return false;
  if (status.status !== 'app.bsky.actor.status#live') return false;

  // Trust API's isActive field - it's only present when expiration is set
  // If present and false, status is expired. If present and true, status is active.
  // If not present, status has no expiration and is active.
  return status.isActive !== false;
}

/**
 * Get the expiration time for a status (if it has one)
 * Returns null if status has no expiration
 * Useful for scheduling cache invalidation/refresh
 */
export function getStatusExpirationTime(status?: StatusView): number | null {
  if (!status?.expiresAt) return null;

  try {
    return new Date(status.expiresAt).getTime();
  } catch {
    return null;
  }
}

/**
 * Check if a profile has stale status
 * Uses API's isActive field - if false, status is expired
 */
export function hasStaleStatus(profile: ProfileViewWithOrbyt | null | undefined): boolean {
  if (!profile?.status) return false;

  // Trust API's isActive - if false, status is expired
  if (profile.status.isActive === false) return true;

  // If expiresAt exists and isActive not set, check if expires soon (within 5 min)
  const expirationTime = getStatusExpirationTime(profile.status);
  if (expirationTime && profile.status.isActive === undefined) {
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
    return expirationTime <= fiveMinutesFromNow;
  }

  return false;
}

/**
 * Calculate optimal staleTime for a profile based on status expiration
 * If profile has a live status that expires, use shorter staleTime
 * Otherwise use default PROFILE_CACHE_EXPIRY
 */
export function getProfileStaleTime(profile: ProfileViewWithOrbyt | null | undefined): number {
  if (!profile?.status) return PROFILE_CACHE_EXPIRY;

  const expirationTime = getStatusExpirationTime(profile.status);
  if (expirationTime) {
    // Use status expiration time + 1 minute buffer, but at least 1 minute
    const timeUntilExpiration = expirationTime - Date.now();
    return Math.max(60 * 1000, timeUntilExpiration + 60 * 1000);
  }

  return PROFILE_CACHE_EXPIRY;
}

// React Query keys as a const to ensure type safety
export const profileKeys = {
  all: ['profiles'] as const,
  lists: () => [...profileKeys.all, 'list'] as const,
  list: (filters: string) => [...profileKeys.lists(), { filters }] as const,
  details: () => [...profileKeys.all, 'detail'] as const,
  detail: (handle: string) => [...profileKeys.details(), handle] as const,
  refresh: (handle: string) => [...profileKeys.detail(handle), 'refresh', Date.now()] as const,
} as const;

// Note: getProfileColors has been moved to src/utils/formatting/colors.ts
// Import it from there instead of using this file

// Make cache expiry public but readonly
export const PROFILE_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

class ProfileService {
  private static currentUserDid: string | null = null;
  private static currentUserHandle: string | null = null;

  // React Query integration
  static getQueryKey(handle: string): QueryKey {
    return profileKeys.detail(handle.toLowerCase());
  }

  // Make CACHE_EXPIRY accessible for React Query hooks
  static get cacheExpiry(): number {
    return PROFILE_CACHE_EXPIRY;
  }

  /**
   * Get profile from React Query cache synchronously
   * @param queryClient - React Query client instance
   * @param handle - Profile handle
   * @returns Profile or null
   */
  static getProfileFromCacheSync(
    queryClient: QueryClient,
    handle: string
  ): ProfileViewWithOrbyt | null {
    if (!handle) return null;
    const queryKey = profileKeys.detail(handle.toLowerCase());
    return queryClient.getQueryData<ProfileViewWithOrbyt>(queryKey) ?? null;
  }

  /**
   * Sets the current user's DID for following status checks
   */
  static setCurrentUserDid(did: string) {
    this.currentUserDid = did;
  }

  /**
   * Gets the current user's DID
   */
  static getCurrentUserDid(): string | null {
    return this.currentUserDid;
  }

  /**
   * Sets the current user's handle for following status checks
   */
  static setCurrentUserHandle(handle: string) {
    this.currentUserHandle = handle;
  }

  /**
   * Gets the current user's handle
   */
  static getCurrentUserHandle(): string | null {
    return this.currentUserHandle;
  }

  /**
   * Get a profile by DID - uses native API with orbyt record included
   * React Query handles caching, this just fetches from API
   */
  static async getProfileByDid(did: string): Promise<ProfileViewWithOrbyt | null> {
    if (!did) return null;

    // Validate that input is actually a DID (starts with "did:")
    if (!did.startsWith('did:')) {
      // This is a handle, not a DID - return null (caller should use getProfile with handle instead)
      return null;
    }

    try {
      // AtprotoService.getProfileByDid already fetches orbyt record in parallel
      return await AtprotoService.getProfileByDid(did);
    } catch (_error) {
      // Return null on error - React Query will handle retries
      return null;
    }
  }

  /**
   * Batch fetch multiple profiles
   * More efficient than individual fetches for 2+ profiles
   * React Query handles caching
   * Orbyt records are fetched in parallel by AtprotoService.getProfilesInBatch
   *
   * @param handles - Array of handles to fetch
   * @returns Array of profiles with orbyt records
   */
  static async batchGetProfiles(handles: string[]): Promise<ProfileViewWithOrbyt[]> {
    if (!handles || handles.length === 0) {
      return [];
    }

    const uniqueHandles = Array.from(
      new Set(handles.map(h => h?.toLowerCase()).filter(h => !!h && typeof h === 'string'))
    );

    // AtprotoService.getProfilesInBatch already fetches orbyt records in parallel
    try {
      return await AtprotoService.getProfilesInBatch(uniqueHandles);
    } catch (_error) {
      return [];
    }
  }

  /**
   * Batch fetch profiles by DIDs
   * Useful when you have DIDs but not handles
   * React Query handles caching
   *
   * @param dids - Array of DIDs to fetch
   * @returns Array of profiles with orbyt records
   */
  static async batchGetProfilesByDid(dids: string[]): Promise<ProfileViewWithOrbyt[]> {
    if (!dids || dids.length === 0) {
      return [];
    }

    const uniqueDids = Array.from(new Set(dids.filter(d => !!d && typeof d === 'string')));

    try {
      // AtprotoService.getProfileByDid already includes orbyt records
      const profiles = await Promise.all(
        uniqueDids.map(did => AtprotoService.getProfileByDid(did).catch(() => null))
      );

      return profiles.filter((p): p is ProfileViewWithOrbyt => p !== null);
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get a profile by handle - uses native API with orbyt record included
   * React Query handles caching, this just fetches from API
   */
  static async getProfile(handle: string): Promise<ProfileViewWithOrbyt | null> {
    if (!handle) return null;

    try {
      // Normalize handle
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

      // Validate handle format
      if (cleanHandle !== 'verifier' && cleanHandle !== 'bsky.app' && !cleanHandle.includes('.')) {
        return null;
      }

      // AtprotoService.getProfile already fetches orbyt record in parallel
      return await AtprotoService.getProfile(cleanHandle);
    } catch (_error) {
      // Return null on error - React Query will handle retries
      return null;
    }
  }

  /**
   * Force refresh a profile by DID - just call getProfileByDid (cache is managed by React Query)
   */
  static async refreshProfileByDid(did: string): Promise<ProfileViewWithOrbyt | null> {
    return this.getProfileByDid(did);
  }

  /**
   * Force refresh a profile by handle - just call getProfile (cache is managed by React Query)
   */
  static async refreshProfile(handle: string): Promise<ProfileViewWithOrbyt | null> {
    return this.getProfile(handle);
  }

  /**
   * Pre-cache a list of profiles from API responses
   * React Query handles caching automatically
   */
  static async cacheProfiles(_profiles: ProfileViewBasic[]): Promise<void> {
    // React Query handles caching automatically - no manual caching needed
    // This method is kept for backwards compatibility but does nothing
  }

  /**
   * Update the following status for a profile
   * Note: This method is deprecated - React Query mutations handle cache updates
   * Keeping for backwards compatibility but no longer updates cache
   */
  static async updateFollowingStatus(
    _handle: string,
    _isFollowing: boolean,
    _isFollowedBy?: boolean
  ): Promise<void> {
    // Note: This method is deprecated - React Query mutations handle cache updates
    // Keeping for backwards compatibility but no longer updates cache
  }

  /**
   * Update the subscription status for a profile
   * Updates MMKV cache - React Query handles invalidation via mutations
   */
  static async updateSubscriptionStatus(did: string, _isSubscribed: boolean): Promise<void> {
    if (!did) return;

    // Note: This method is deprecated - React Query mutations handle cache updates
    // Keeping for backwards compatibility but no longer updates cache
  }

  /**
   * Update the mute status for a profile
   * Note: This method is deprecated - React Query mutations handle cache updates
   */
  static async updateMuteStatus(_did: string, _handle: string, _isMuted: boolean): Promise<void> {
    // Note: This method is deprecated - React Query mutations handle cache updates
    // Keeping for backwards compatibility but no longer updates cache
  }

  /**
   * Update the verification status for a profile
   * @deprecated This method is deprecated - React Query mutations handle cache updates
   * Keeping for backwards compatibility but no longer updates cache
   * Uses actual VerificationState structure from @atproto/api
   */
  static async updateVerification(
    handle: string,
    _verification: {
      verifiedStatus?: 'valid' | 'invalid' | 'none' | string;
      trustedVerifierStatus?: 'valid' | 'invalid' | 'none' | string;
      verifications?: Array<{
        issuer: string;
        uri: string;
        isValid: boolean;
        createdAt?: string;
      }>;
    }
  ): Promise<void> {
    if (!handle) return;

    // Note: This method is deprecated - React Query mutations handle cache updates
    // Keeping for backwards compatibility but no longer updates cache
  }

  /**
   * Apply a server-updated profile response into cache
   * Note: This method is deprecated - React Query handles cache updates
   */
  static async applyServerProfile(
    _handle: string,
    _serverProfile: ProfileViewWithOrbyt
  ): Promise<void> {
    // React Query handles cache updates automatically
    // This method is kept for backwards compatibility but does nothing
  }

  /**
   * Subscribe to profile updates
   * Returns an unsubscribe function
   * Note: React Query handles cache updates automatically, this is for legacy compatibility
   */
  static subscribeToProfileUpdates(_handle: string, _callback: () => void): () => void {
    // React Query handles cache invalidation and updates automatically
    // Return no-op unsubscribe function for legacy compatibility
    return () => {};
  }

  /**
   * Invalidate a specific profile in the cache
   * Note: This method is deprecated - React Query handles cache invalidation
   */
  static async invalidateProfile(_handle: string): Promise<void> {
    // Note: This method is deprecated - React Query handles cache invalidation
  }

  /**
   * Invalidate a specific profile in the cache by DID
   * Note: This method is deprecated - React Query handles cache invalidation
   */
  static async invalidateProfileByDid(_did: string): Promise<void> {
    // Note: This method is deprecated - React Query handles cache invalidation
  }

  /**
   * Clear all cached profiles
   * Note: This method is deprecated - React Query handles cache management
   */
  static async clearCache(): Promise<void> {
    // Note: This method is deprecated - React Query handles cache management
  }

  /**
   * Cleanup method for app lifecycle management
   */
  static cleanup(): void {
    // MMKV handles memory efficiently - no cleanup needed
    // Cache persists automatically
  }

  /**
   * Batch prefetch profiles from feed data
   * This is the most efficient way to prefetch profiles - extracts all unique handles
   * from feed items and prefetches them in one operation
   * @param feedItems - Array of feed items containing author and repostedBy data
   */
  static async batchPrefetchFromFeed(feedItems: ExtendedFeedViewPost[]): Promise<void> {
    if (!feedItems || feedItems.length === 0) return;

    try {
      // Extract all unique handles from feed items
      const uniqueHandles = new Set<string>();

      feedItems.forEach(item => {
        // Handle feed items with post structure
        if (item.post?.author?.handle) {
          uniqueHandles.add(item.post.author.handle.toLowerCase());
        }

        if (item.post?.repostedBy?.handle) {
          uniqueHandles.add(item.post.repostedBy.handle.toLowerCase());
        }

        // Handle reason structure (reposts, pins)
        if (
          item.reason &&
          '$type' in item.reason &&
          item.reason.$type === 'app.bsky.feed.defs#reasonRepost'
        ) {
          const repostReason = item.reason as { by?: { handle?: string } };
          if (repostReason.by?.handle) {
            uniqueHandles.add(repostReason.by.handle.toLowerCase());
          }
        }
      });

      // Convert to array and filter out empty handles
      const handlesToPrefetch = Array.from(uniqueHandles).filter(
        handle => handle && handle.trim() !== ''
      );

      if (handlesToPrefetch.length === 0) {
        return;
      }

      // Process handles in smaller batches to avoid overwhelming the API
      // React Query handles caching, so we just prefetch all handles
      const batchSize = 5;
      for (let i = 0; i < handlesToPrefetch.length; i += batchSize) {
        const batch = handlesToPrefetch.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async handle => {
            try {
              // Prefetch the profile - React Query will cache it
              await this.getProfile(handle);
            } catch (_error: unknown) {
              // ignore
            }
          })
        );
      }
    } catch (_error) {
      // Silently handle errors during batch prefetch
    }
  }

  /**
   * Precache the current user's profile on app launch
   * Uses existing ProfileService methods for simplicity
   */
  static async precacheCurrentUserProfile(): Promise<void> {
    if (!this.currentUserDid) return;

    // Use existing getProfileByDid method - it handles caching automatically
    this.getProfileByDid(this.currentUserDid);
  }
}

// React Query Hooks for ProfileService

/**
 * Hook to fetch and subscribe to profile data by DID (preferred method)
 * React Query cache provides instant data on subsequent renders
 */
export function useProfileByDid(
  did: string | null | undefined
): UseQueryResult<ProfileViewWithOrbyt | null, Error> {
  const queryClient = useQueryClient();

  // Calculate staleTime based on status expiration from React Query cache
  const staleTime = useMemo(() => {
    if (!did) return PROFILE_CACHE_EXPIRY;
    // Read from React Query cache to calculate staleTime
    const cachedProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
      profileKeys.detail(`did_${did}`)
    );
    return getProfileStaleTime(cachedProfile);
  }, [did, queryClient]);

  return useQuery<ProfileViewWithOrbyt | null, Error>({
    queryKey: did ? profileKeys.detail(`did_${did}`) : ['profiles', 'detail', 'did_'],
    queryFn: async () => (did ? ProfileService.getProfileByDid(did) : null),
    enabled: !!did,
    staleTime,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Hook to batch fetch multiple profiles efficiently
 * Deduplicates handles and uses batch API endpoint
 *
 * @param handles - Array of handles to fetch (can contain nulls)
 * @returns React Query result with array of profiles
 */
export function useBatchProfiles(
  handles: (string | null | undefined)[]
): UseQueryResult<ProfileViewWithOrbyt[], Error> {
  const validHandles = useMemo(() => {
    return Array.from(
      new Set(handles.filter((h): h is string => !!h).map(h => h.toLowerCase()))
    ).sort();
  }, [handles]);

  const queryKey = useMemo(
    () => [...profileKeys.all, 'batch', ...validHandles] as const,
    [validHandles]
  );

  return useQuery<ProfileViewWithOrbyt[], Error>({
    queryKey,
    queryFn: async () => {
      if (validHandles.length === 0) return [];
      return ProfileService.batchGetProfiles(validHandles);
    },
    enabled: validHandles.length > 0,
    staleTime: PROFILE_CACHE_EXPIRY,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Hook to batch fetch multiple profiles by DID
 * Useful when you have DIDs but not handles
 *
 * @param dids - Array of DIDs to fetch (can contain nulls)
 * @returns React Query result with array of profiles
 */
export function useBatchProfilesByDid(
  dids: (string | null | undefined)[]
): UseQueryResult<ProfileViewWithOrbyt[], Error> {
  const validDids = useMemo(() => {
    return Array.from(new Set(dids.filter((d): d is string => !!d))).sort();
  }, [dids]);

  const queryKey = useMemo(
    () => [...profileKeys.all, 'batch-by-did', ...validDids] as const,
    [validDids]
  );

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

/**
 * Hook to fetch and subscribe to profile data by handle
 * React Query cache provides instant data on subsequent renders
 */
export function useProfile(
  handle: string | null | undefined
): UseQueryResult<ProfileViewWithOrbyt | null, Error> {
  const queryClient = useQueryClient();

  // Calculate staleTime based on status expiration from React Query cache
  const staleTime = useMemo(() => {
    if (!handle) return PROFILE_CACHE_EXPIRY;
    // Read from React Query cache to calculate staleTime
    const cachedProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
      profileKeys.detail(handle.toLowerCase())
    );
    return getProfileStaleTime(cachedProfile);
  }, [handle, queryClient]);

  return useQuery<ProfileViewWithOrbyt | null, Error>({
    queryKey: handle ? profileKeys.detail(handle.toLowerCase()) : ['profiles', 'detail', ''],
    queryFn: async () => (handle ? ProfileService.getProfile(handle) : null),
    enabled: !!handle,
    staleTime,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Hook to follow/unfollow a profile with optimistic updates
 */
export function useFollowMutation() {
  const queryClient = useQueryClient();
  const updateFollowState = (
    did: string,
    handle: string,
    isFollowing: boolean,
    followUri?: string
  ) => {
    try {
      const { useFollowStore } = require('../../stores/followStore');
      useFollowStore.getState().updateFollowState(did, {
        handle,
        did,
        isFollowing,
        followUri,
      });
    } catch (_error) {
      // Silently fail if store not available
    }
  };

  return useMutation({
    mutationFn: async ({
      handle,
      isFollowing,
      isFollowedBy,
    }: {
      handle: string;
      isFollowing: boolean;
      isFollowedBy?: boolean;
    }) => {
      // Get the profile to get the DID
      const profile = await ProfileService.getProfile(handle);
      if (!profile?.did) {
        throw new Error('Profile not found or missing DID');
      }

      // Make the actual API call
      let followUri: string | undefined;
      if (isFollowing) {
        followUri = await AtprotoService.follow(profile.did);
      } else {
        await AtprotoService.unfollow(profile.did);
        followUri = undefined;
      }

      // Update the cache with the new following status
      await ProfileService.updateFollowingStatus(handle, isFollowing, isFollowedBy);

      // Persist to follow store for navigation
      updateFollowState(profile.did, handle, isFollowing, followUri);

      return { handle, isFollowing, isFollowedBy, did: profile.did, followUri };
    },
    // When mutate is called:
    onMutate: async ({ handle, isFollowing, isFollowedBy }) => {
      // Cancel any outgoing refetches for both handle and DID-based queries
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(handle) });

      // Snapshot the previous values FIRST (before async operations)
      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(handle)
      );
      const did = previousProfile?.did;

      // Update follow store IMMEDIATELY (synchronously) before any async work
      if (did) {
        updateFollowState(did, handle, isFollowing);
        await queryClient.cancelQueries({ queryKey: profileKeys.detail(`did_${did}`) });
      }

      // Get profile to find DID if not in cache (fallback)
      const profile = did
        ? previousProfile
        : await ProfileService.getProfile(handle).catch(() => null);
      const resolvedDid = did || profile?.did;

      if (resolvedDid && !did) {
        await queryClient.cancelQueries({ queryKey: profileKeys.detail(`did_${resolvedDid}`) });
        // Update store if we just got the DID
        updateFollowState(resolvedDid, handle, isFollowing);
      }

      const previousProfileByDid = resolvedDid
        ? queryClient.getQueryData<ProfileViewWithOrbyt>(profileKeys.detail(`did_${resolvedDid}`))
        : null;

      // Optimistically update React Query cache
      // Note: This may be redundant if called from profile screen (which updates cache in button handler),
      // but it's needed for other places that use this mutation (e.g., explore screen)
      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), {
          ...previousProfile,
          viewer: {
            ...previousProfile.viewer,
            following: isFollowing
              ? previousProfile.viewer?.following || 'at://placeholder'
              : undefined,
            followedBy:
              isFollowedBy !== undefined
                ? isFollowedBy
                  ? 'at://placeholder'
                  : undefined
                : previousProfile.viewer?.followedBy,
          },
        });
      }

      if (previousProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${resolvedDid}`), {
          ...previousProfileByDid,
          viewer: {
            ...previousProfileByDid.viewer,
            following: isFollowing
              ? previousProfileByDid.viewer?.following || 'at://placeholder'
              : undefined,
            followedBy:
              isFollowedBy !== undefined
                ? isFollowedBy
                  ? 'at://placeholder'
                  : undefined
                : previousProfileByDid.viewer?.followedBy,
          },
        });
      }

      return { previousProfile, previousProfileByDid, did: resolvedDid };
    },
    // If mutation fails, use context returned from onMutate to roll back
    onError: (_err, { handle }, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), context.previousProfile);
      }

      if (context?.did && context?.previousProfileByDid) {
        queryClient.setQueryData(
          profileKeys.detail(`did_${context.did}`),
          context.previousProfileByDid
        );
      }

      // Revert follow store state
      if (context?.did && context?.previousProfile) {
        const wasFollowing = !!context.previousProfile.viewer?.following;
        updateFollowState(context.did, handle, wasFollowing);
      }
    },
    // Always refetch after error or success to ensure cache consistency
    onSettled: (_, __, { handle }) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
    },
  });
}

/**
 * Hook to block/unblock a profile with optimistic updates
 */
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
      // Make the actual API call
      if (isBlocked) {
        await AtprotoService.blockUser(did);
      } else {
        await AtprotoService.unblockUser(did);
      }

      // Cache is already updated in onMutate, just return success
      return { did, handle, isBlocked };
    },
    // When mutate is called:
    onMutate: async ({ did, handle, isBlocked }) => {
      // Normalize handle to lowercase to match query keys (useProfile uses lowercase)
      const normalizedHandle = handle.toLowerCase();

      // Cancel any outgoing refetches for both handle and DID-based queries
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(normalizedHandle) });
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(`did_${did}`) });

      // Snapshot the previous values
      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(normalizedHandle)
      );
      const previousProfileByDid = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(`did_${did}`)
      );

      // Optimistically update React Query cache
      // When manually blocking/unblocking, clear blockingByList (direct block only)
      const updatedProfile = previousProfile
        ? {
            ...previousProfile,
            viewer: {
              ...previousProfile.viewer,
              blocking: isBlocked
                ? previousProfile.viewer?.blocking || 'at://placeholder'
                : undefined,
              blockingByList: !isBlocked ? undefined : previousProfile.viewer?.blockingByList,
            },
          }
        : null;
      const updatedProfileByDid = previousProfileByDid
        ? {
            ...previousProfileByDid,
            viewer: {
              ...previousProfileByDid.viewer,
              blocking: isBlocked
                ? previousProfileByDid.viewer?.blocking || 'at://placeholder'
                : undefined,
              blockingByList: !isBlocked ? undefined : previousProfileByDid.viewer?.blockingByList,
            },
          }
        : null;

      if (updatedProfile) {
        queryClient.setQueryData(profileKeys.detail(normalizedHandle), updatedProfile);
      }

      if (updatedProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${did}`), updatedProfileByDid);
      }

      return { previousProfile, previousProfileByDid, normalizedHandle };
    },
    // If mutation fails, use context returned from onMutate to roll back
    onError: (_err, { handle, did }, context) => {
      const normalizedHandle = handle.toLowerCase();
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKeys.detail(normalizedHandle), context.previousProfile);
      }

      if (context?.previousProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${did}`), context.previousProfileByDid);
      }
    },
    // Update cache after successful mutation to ensure persisted state
    onSuccess: (_data, { handle, did }) => {
      // Normalize handle to lowercase to match query keys (useProfile uses lowercase)
      const normalizedHandle = handle.toLowerCase();

      // React Query cache is already updated in onMutate
      // No need to sync from MMKV since we're using React Query only
      const handleKey = profileKeys.detail(normalizedHandle);
      const didKey = profileKeys.detail(`did_${did}`);

      // Invalidate feed queries immediately to refresh posts visibility
      queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'active' });

      // Delay profile refetch to ensure server has processed (only inactive queries)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: handleKey, refetchType: 'inactive' });
        queryClient.invalidateQueries({ queryKey: didKey, refetchType: 'inactive' });
      }, 2000);
    },
  });
}

/**
 * Hook to mute/unmute a profile with optimistic updates
 */
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
      // Make the actual API call
      if (isMuted) {
        await AtprotoService.muteUser(did);
      } else {
        await AtprotoService.unmuteUser(did);
      }

      // Note: Cache updates are handled by React Query mutations

      return { did, handle, isMuted };
    },
    // When mutate is called:
    onMutate: async ({ did, handle, isMuted }) => {
      // Cancel any outgoing refetches for both handle and DID-based queries
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(handle) });
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(`did_${did}`) });

      // Snapshot the previous values
      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(handle)
      );
      const previousProfileByDid = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(`did_${did}`)
      );

      // Optimistically update React Query cache
      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), {
          ...previousProfile,
          viewer: {
            ...previousProfile.viewer,
            muted: isMuted,
          },
        });
      }

      if (previousProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${did}`), {
          ...previousProfileByDid,
          viewer: {
            ...previousProfileByDid.viewer,
            muted: isMuted,
          },
        });
      }

      return { previousProfile, previousProfileByDid };
    },
    // If mutation fails, use context returned from onMutate to roll back
    onError: (_err, { handle, did }, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), context.previousProfile);
      }

      if (context?.previousProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${did}`), context.previousProfileByDid);
      }
    },
    // Invalidate queries after successful mutation with delay to ensure server has processed
    onSuccess: (_, { handle, did }) => {
      // Invalidate feed queries immediately to refresh posts visibility
      queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'active' });

      // Delay profile refetch to ensure server has processed the change
      const handleKey = profileKeys.detail(handle);
      const didKey = profileKeys.detail(`did_${did}`);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: handleKey, refetchType: 'active' });
        queryClient.invalidateQueries({ queryKey: didKey, refetchType: 'active' });
      }, 500);
    },
  });
}

/**
 * Hook to update profile colors with React Query integration
 */

/**
 * Hook to update profile information with React Query integration
 */
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
        await AtprotoService.updateOrbytProfileColors(
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
        updatedProfile = await AtprotoService.updateProfile(profileUpdates);
      }

      return { handle, updatedProfile, updatedColors: !!updates.customColors };
    },
    onMutate: async ({ handle, updates }) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(handle) });

      const previousProfile = queryClient.getQueryData<ProfileViewWithOrbyt>(
        profileKeys.detail(handle)
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
                orbytRecord: {
                  ...previousProfile.orbytRecord,
                  $type: 'com.getorbyt.profile',
                  colors: {
                    backgroundColor: updates.customColors.backgroundColor,
                    textColor: updates.customColors.textColor,
                  },
                },
              }
            : {}),
        };

        queryClient.setQueryData(profileKeys.detail(handle), optimistic);
      }

      return { previousProfile };
    },
    onSuccess: ({ updatedProfile, updatedColors }, { handle, updates }) => {
      try {
        // If colors were updated, update orbyt record in cache
        if (updatedColors) {
          const prev = queryClient.getQueryData<ProfileViewWithOrbyt>(profileKeys.detail(handle));

          if (prev && updates.customColors) {
            // Update the profile with new colors in orbyt record
            const updated: ProfileViewWithOrbyt = {
              ...prev,
              orbytRecord: {
                ...prev.orbytRecord,
                $type: 'com.getorbyt.profile',
                colors: {
                  backgroundColor: updates.customColors.backgroundColor,
                  textColor: updates.customColors.textColor,
                },
              },
            };

            // Update React Query cache immediately
            queryClient.setQueryData(profileKeys.detail(handle), updated);
            // Also update DID-based query if we have the DID
            if (prev.did) {
              queryClient.setQueryData(profileKeys.detail(`did_${prev.did}`), updated);
            }
          } else {
            // Fallback: invalidate to trigger refetch
            queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
            if (prev?.did) {
              queryClient.invalidateQueries({ queryKey: profileKeys.detail(`did_${prev.did}`) });
            }
          }
          return;
        }

        if (!updatedProfile) {
          return; // Skip if no profile was updated
        }

        // Merge server-updated fields into the query cache immediately
        const prev = queryClient.getQueryData<ProfileViewWithOrbyt>(profileKeys.detail(handle));

        if (!prev) {
          return; // Skip if no previous data
        }

        // Merge updated profile data
        const merged: ProfileViewWithOrbyt = {
          ...prev,
          ...(updatedProfile as ProfileView),
          orbytRecord: prev.orbytRecord, // Preserve orbyt record
        };

        queryClient.setQueryData(profileKeys.detail(handle), merged);

        // Also invalidate DID-based queries if we know the DID
        if (prev.did) {
          queryClient.invalidateQueries({ queryKey: profileKeys.detail(`did_${prev.did}`) });
        }

        // Still invalidate to ensure freshness against server
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
      } catch {
        // Silently handle errors
      }
    },
    onError: (_error, { handle }, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), context.previousProfile);
      }
    },
  });
}

/**
 * Hook to invalidate profile cache
 */
export function useProfileInvalidation() {
  const queryClient = useQueryClient();

  return useCallback(
    async (handle: string) => {
      // Invalidate React Query cache
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
    },
    [queryClient]
  );
}

/**
 * Hook to monitor and invalidate profiles with expired status
 * Trusts API's isActive field - invalidates immediately if false
 * Schedules invalidation based on expiresAt if provided
 *
 * @param profile - The profile to monitor
 * @param did - Optional DID for DID-based invalidation
 */
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
      if (profile.handle) {
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(profile.handle) });
      }
      if (did || profile.did) {
        queryClient.invalidateQueries({
          queryKey: profileKeys.detail(`did_${did || profile.did}`),
        });
      }
    };

    // If API says status is inactive, invalidate immediately
    if (profile.status.isActive === false) {
      invalidate();
      return undefined;
    }

    // If expiresAt exists, schedule invalidation
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

/**
 * Pre-populate profile cache with partial data before navigation
 * This allows the profile screen to show data immediately without loading state
 *
 * @param queryClient - React Query client instance
 * @param partialProfile - Partial profile data (from post.author, AuthorItem props, etc.)
 * @param handle - Handle to use as cache key (required)
 */
/**
 * Prefetch profile data with optional partial data for instant UI.
 *
 * This function:
 * 1. Sets partial data immediately (if provided) for instant UI feedback
 * 2. Prefetches full profile in background for complete data
 *
 * @param queryClient - React Query client
 * @param identifier - Handle or DID
 * @param partialProfile - Optional partial profile data for instant UI
 * @returns Promise that resolves when prefetch completes (can be ignored for fire-and-forget)
 */
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

  const isDid = cleanIdentifier.startsWith('did:');
  const cleanHandle = isDid ? null : cleanIdentifier.toLowerCase();
  const did = isDid ? cleanIdentifier : partialProfile?.did;

  // Step 1: Set partial data immediately for instant UI (if provided and cache is missing)
  if (partialProfile && cleanHandle) {
    const existing = queryClient.getQueryData<ProfileViewWithOrbyt>(
      profileKeys.detail(cleanHandle)
    );

    if (!existing) {
      const partialProfileData: Partial<ProfileViewWithOrbyt> = {
        did: did || '',
        handle: cleanHandle,
        displayName: partialProfile.displayName,
        avatar: partialProfile.avatar,
        description: partialProfile.description,
        verification: partialProfile.verification,
        status: partialProfile.status,
      };

      if (partialProfileData.did || partialProfileData.handle) {
        queryClient.setQueryData(
          profileKeys.detail(cleanHandle),
          partialProfileData as ProfileViewWithOrbyt
        );
      }
    }
  }

  // Step 2: Prefetch full profile in background (always, to ensure complete data)
  if (isDid && did) {
    await queryClient.prefetchQuery({
      queryKey: profileKeys.detail(`did_${did}`),
      queryFn: () => ProfileService.getProfileByDid(did),
      staleTime: PROFILE_CACHE_EXPIRY,
    });
  } else if (cleanHandle) {
    await queryClient.prefetchQuery({
      queryKey: profileKeys.detail(cleanHandle),
      queryFn: () => ProfileService.getProfile(cleanHandle),
      staleTime: PROFILE_CACHE_EXPIRY,
    });
  }
}

/**
 * Clean up all existing profile color records for the current user
 */
// Legacy cleanup removed: profileColors record is no longer used.

export default ProfileService;
