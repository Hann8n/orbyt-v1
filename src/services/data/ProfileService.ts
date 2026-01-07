import { storage } from '../../utils/storage/storage';
import AtprotoService from '../api/AtprotoService';
import { getStatusBarStyle, DEFAULT_PROFILE_COLORS } from '@/utils/formatting/colors';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryKey,
  UseQueryResult,
} from '@tanstack/react-query';
import { useMemo, useCallback, useEffect } from 'react';
import type { OrbytProfileRecord } from '../../types';
import type { ProfileView, ProfileViewDetailed, ListViewBasic, StatusView } from '../api/types';

export interface CachedProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  isSubscribed?: boolean; // Activity subscription status
  isBlocked?: boolean; // Moderation flag: user is blocked (from viewer.blocking or viewer.blockingByList)
  blockingByList?: ListViewBasic; // List that blocks this user (if blocked by list)
  isMuted?: boolean; // Moderation flag: user is muted (from viewer.muted)
  hasCustomColors?: boolean; // Flag to indicate if colors are custom or extracted
  profileColors?: {
    backgroundColor: string;
    foregroundColor: string;
    statusBarStyle: 'light' | 'dark';
    lighterColor?: string; // Pre-calculated lighter color for performance
  };
  orbytProfileRecord?: OrbytProfileRecord | null; // Full com.getorbyt.profile record
  verification?: {
    isVerified: boolean;
    verifiedBy?: string; // DID of the verifier
    verifierHandle?: string; // Handle of the verifier
    verifiedAt?: string; // ISO date string
    isOfficial?: boolean; // Whether this is an official Bluesky verification
    status?: string; // Verification status (valid, etc.)
    trustedVerifierStatus?: string; // Trusted verifier status (active, none)
    verifications?: Array<{
      issuer: string; // DID of the verifier
      uri: string; // Verification URI
      isValid: boolean; // Whether the verification is valid
      createdAt: string; // ISO date string
    }>;
  };
  status?: StatusView; // Direct from API, no transformation
  lastUpdated: number; // timestamp
}

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
 * Check if a cached profile has stale status
 * Uses API's isActive field - if false, status is expired
 */
export function hasStaleStatus(profile: CachedProfile | null | undefined): boolean {
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
export function getProfileStaleTime(profile: CachedProfile | null | undefined): number {
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

// Type for profile colors
export interface ProfileColorScheme {
  backgroundColor: string;
  foregroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  statusBarStyle: 'light' | 'dark';
}

// Helper to calculate brightness of a color
function getBrightness(hex: string): number {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Helper to get the lighter color between two colors
function getLighterColor(color1: string, color2: string): string {
  return getBrightness(color1) > getBrightness(color2) ? color1 : color2;
}

// Helper to extract colors from profile data
export function getProfileColors(profile: CachedProfile | null | undefined): ProfileColorScheme {
  return {
    backgroundColor: profile?.profileColors?.backgroundColor || '#000000',
    foregroundColor: profile?.profileColors?.foregroundColor || '#CFD6E8',
    textColor: profile?.profileColors?.foregroundColor || '#CFD6E8',
    primaryColor: profile?.profileColors?.backgroundColor || '#000000',
    secondaryColor: profile?.profileColors?.foregroundColor || '#CFD6E8',
    statusBarStyle: profile?.profileColors?.statusBarStyle || 'light',
  };
}

// Make cache expiry public but readonly
export const PROFILE_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

class ProfileService {
  private static CACHE_KEY_PREFIX = 'profile_cache_';
  private static currentUserDid: string | null = null;
  private static currentUserHandle: string | null = null;

  /**
   * Test mode: Set to true to inject fake live status for all profiles
   * This is for testing the live status feature UI
   *
   * To enable: Change `false` to `true` below
   * When enabled, all profiles will show as live with test data including:
   * - Live indicator on avatars
   * - Live stream info in bottom sheet
   * - Test stream title, description, thumbnail, and link
   */

  /**
   * Transform Bsky API profile response to CachedProfile format
   * Uses pre-fetched orbyt profile record to avoid additional API call
   * Extracts moderation flags (blocked/muted) directly from ProfileView.viewer
   */
  private static async transformApiProfile(
    apiProfile: ProfileView | ProfileViewDetailed,
    did?: string,
    orbytProfileRecord?: OrbytProfileRecord | null
  ): Promise<CachedProfile> {
    const targetDid = did || apiProfile.did;
    let record: OrbytProfileRecord | null = orbytProfileRecord ?? null;

    // If record wasn't pre-fetched, fetch it now using listRecords (fallback for handle-based fetches)
    if (record === undefined) {
      const records = await AtprotoService.getProfileRecordsForDid(targetDid);
      record = records.orbytRecord as OrbytProfileRecord | null;
    }

    // Extract colors from record - always set profileColors (defaults if no custom colors)
    const hasCustomColors = !!(record?.colors?.backgroundColor && record?.colors?.textColor);
    const baseColors = hasCustomColors
      ? {
          backgroundColor: record!.colors!.backgroundColor,
          foregroundColor: record!.colors!.textColor,
          statusBarStyle: getStatusBarStyle(record!.colors!.backgroundColor),
        }
      : DEFAULT_PROFILE_COLORS;

    // Calculate lighter color once for performance
    const lighterColor = getLighterColor(baseColors.backgroundColor, baseColors.foregroundColor);

    const profileColors = {
      ...baseColors,
      lighterColor,
    };

    // Extract relationship data from viewer
    const isFollowing = apiProfile.viewer ? !!apiProfile.viewer.following : undefined;
    const isFollowedBy = apiProfile.viewer ? !!apiProfile.viewer.followedBy : undefined;
    const isSubscribed = apiProfile.viewer?.activitySubscription ? true : undefined;

    // Extract moderation flags directly from ProfileView.viewer (Atproto types)
    // viewer.blocking is a string (URI) if blocked directly, null/undefined otherwise
    // viewer.blockingByList is a ListViewBasic if blocked by list, undefined otherwise
    // viewer.muted is a boolean if muted, undefined otherwise
    const isBlocked = apiProfile.viewer
      ? !!(apiProfile.viewer.blocking || apiProfile.viewer.blockingByList)
      : undefined;
    const blockingByList = apiProfile.viewer?.blockingByList;
    const isMuted = apiProfile.viewer?.muted ?? undefined;

    // Extract verification data
    let verification: CachedProfile['verification'] = { isVerified: false };
    if (apiProfile.verification) {
      const isVerified =
        apiProfile.verification.verifiedStatus === 'valid' ||
        apiProfile.verification.trustedVerifierStatus === 'valid' ||
        (apiProfile.verification.verifications &&
          apiProfile.verification.verifications.length > 0 &&
          apiProfile.verification.verifications.some((v: any) => v.isValid));

      if (isVerified) {
        verification = {
          isVerified: true,
          status: apiProfile.verification.verifiedStatus || 'valid',
          trustedVerifierStatus: apiProfile.verification.trustedVerifierStatus || 'none',
          verifications: apiProfile.verification.verifications || [],
          verifiedBy: apiProfile.verification.verifications?.[0]?.issuer || 'bsky.app',
          verifierHandle:
            apiProfile.verification.trustedVerifierStatus === 'valid' ? 'Verifier' : 'bsky.app',
          verifiedAt:
            apiProfile.verification.verifications?.[0]?.createdAt || new Date().toISOString(),
          isOfficial: apiProfile.verification.trustedVerifierStatus !== 'valid',
        };
      }
    }

    // Store status directly from API - no transformation needed
    const status: StatusView | undefined = apiProfile.status;

    return {
      did: apiProfile.did,
      handle: apiProfile.handle,
      displayName: apiProfile.displayName,
      avatar: apiProfile.avatar,
      description: apiProfile.description,
      isFollowing,
      isFollowedBy,
      isSubscribed,
      isBlocked,
      blockingByList,
      isMuted,
      hasCustomColors,
      profileColors,
      orbytProfileRecord: record,
      verification,
      status,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Save profile to MMKV cache (synchronous)
   */
  static saveProfileToCache(profile: CachedProfile): void {
    try {
      const didKey = `${this.CACHE_KEY_PREFIX}did_${profile.did}`;
      const handleKey = `${this.CACHE_KEY_PREFIX}${profile.handle.toLowerCase()}`;

      const profileJson = JSON.stringify(profile);
      storage.set(didKey, profileJson);
      storage.set(handleKey, profileJson);
    } catch {
      // Silently fail
    }
  }

  // React Query integration
  static getQueryKey(handle: string): QueryKey {
    return profileKeys.detail(handle.toLowerCase());
  }

  // Make CACHE_EXPIRY accessible for React Query hooks
  static get cacheExpiry(): number {
    return PROFILE_CACHE_EXPIRY;
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
   * Get a profile from MMKV cache by DID synchronously (for React Query placeholderData)
   * Uses MMKV for instant synchronous reads
   */
  static getProfileFromCacheSyncByDid(did: string): CachedProfile | null {
    if (!did) return null;

    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}did_${did}`;
      const cached = storage.getString(cacheKey);
      if (cached) {
        const profile = JSON.parse(cached) as CachedProfile;
        if (this.isCacheValid(profile)) {
          return profile;
        }
      }
    } catch {
      // Silently fail
    }
    return null;
  }

  /**
   * Get a profile from MMKV cache by handle synchronously (for React Query placeholderData)
   * Uses MMKV for instant synchronous reads
   */
  static getProfileFromCacheSync(handle: string): CachedProfile | null {
    if (!handle) return null;

    try {
      // Clean handle format
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

      const cacheKey = `${this.CACHE_KEY_PREFIX}${cleanHandle}`;
      const cached = storage.getString(cacheKey);
      if (cached) {
        const profile = JSON.parse(cached) as CachedProfile;
        if (this.isCacheValid(profile)) {
          return profile;
        }
      }
    } catch {
      // Silently fail
    }
    return null;
  }

  /**
   * Get a profile by DID - simplified to use Bsky API directly
   * React Query handles caching, this just fetches and transforms
   * Fetches profile data and both records together using listRecords
   */
  static async getProfileByDid(did: string): Promise<CachedProfile | null> {
    if (!did) return null;

    // Validate that input is actually a DID (starts with "did:")
    // If it's a handle, return null to prevent fetching with wrong method and overwriting colors
    if (!did.startsWith('did:')) {
      // This is a handle, not a DID - return null (caller should use getProfile with handle instead)
      // Returning null prevents fetching with wrong identifier which would overwrite colors with defaults
      return null;
    }

    try {
      // Fetch profile data (for viewer/verification) and both records in parallel
      const [apiProfile, records] = await Promise.all([
        AtprotoService.getProfileByDid(did),
        AtprotoService.getProfileRecordsForDid(did),
      ]);

      if (!apiProfile) return null;

      // Transform API response to CachedProfile with pre-fetched records
      const profile = await this.transformApiProfile(
        apiProfile,
        did,
        records.orbytRecord as OrbytProfileRecord | null
      );
      // Save to MMKV for sync reads (placeholderData)
      this.saveProfileToCache(profile);

      return profile;
    } catch (_error) {
      // Return stale cache if available
      const cached = this.getProfileFromCacheSyncByDid(did);
      return cached;
    }
  }

  /**
   * Batch fetch and cache multiple profiles
   * Checks cache first, only fetches missing profiles from API
   * More efficient than individual fetches for 2+ profiles
   *
   * @param handles - Array of handles to fetch
   * @returns Array of cached profiles
   */
  static async batchGetProfiles(handles: string[]): Promise<CachedProfile[]> {
    if (!handles || handles.length === 0) {
      return [];
    }

    const uniqueHandles = Array.from(
      new Set(handles.map(h => h?.toLowerCase()).filter(h => !!h && typeof h === 'string'))
    );

    // Check cache first
    const cached: CachedProfile[] = [];
    const needsFetch: string[] = [];

    for (const handle of uniqueHandles) {
      const cached_profile = await this.getProfileFromCache(handle);
      if (cached_profile && this.isCacheValid(cached_profile)) {
        cached.push(cached_profile);
      } else {
        needsFetch.push(handle);
      }
    }

    // If all in cache, return early
    if (needsFetch.length === 0) {
      return cached;
    }

    // Fetch missing profiles in batch
    try {
      const profiles = await AtprotoService.getProfilesInBatch(needsFetch);

      // Transform and cache each profile with records
      const cachedProfiles: CachedProfile[] = [];
      for (const profile of profiles) {
        if (profile?.handle && profile?.did) {
          try {
            // Fetch records for colors
            const records = await AtprotoService.getProfileRecordsForDid(profile.did);
            const transformed = await this.transformApiProfile(
              profile,
              profile.did,
              records.orbytRecord as OrbytProfileRecord | null
            );
            this.saveProfileToCache(transformed);
            cachedProfiles.push(transformed);
          } catch {
            // Skip failed profiles
          }
        }
      }

      return [...cached, ...cachedProfiles];
    } catch (_error) {
      // Return what we got from cache at least
      return cached;
    }
  }

  /**
   * Batch fetch profiles by DIDs
   * Useful when you have DIDs but not handles
   *
   * @param dids - Array of DIDs to fetch
   * @returns Array of cached profiles
   */
  static async batchGetProfilesByDid(dids: string[]): Promise<CachedProfile[]> {
    if (!dids || dids.length === 0) {
      return [];
    }

    const uniqueDids = Array.from(new Set(dids.filter(d => !!d && typeof d === 'string')));

    const cached: CachedProfile[] = [];
    const needsFetch: string[] = [];

    for (const did of uniqueDids) {
      const cached_profile = this.getProfileFromCacheSyncByDid(did);
      if (cached_profile && this.isCacheValid(cached_profile)) {
        cached.push(cached_profile);
      } else {
        needsFetch.push(did);
      }
    }

    if (needsFetch.length === 0) {
      return cached;
    }

    try {
      const profiles = await Promise.all(
        needsFetch.map(did => AtprotoService.getProfileByDid(did).catch(() => null))
      );

      const results: CachedProfile[] = [];
      for (const profile of profiles) {
        if (profile?.handle && profile?.did) {
          try {
            // Fetch records for colors
            const records = await AtprotoService.getProfileRecordsForDid(profile.did);
            const transformed = await this.transformApiProfile(
              profile,
              profile.did,
              records.orbytRecord as OrbytProfileRecord | null
            );
            this.saveProfileToCache(transformed);
            results.push(transformed);
          } catch {
            // Skip failed profiles
          }
        }
      }

      return [...cached, ...results];
    } catch (_error) {
      return cached;
    }
  }

  /**
   * Get a profile by handle - simplified to use Bsky API directly
   * React Query handles caching, this just fetches and transforms
   */
  static async getProfile(handle: string): Promise<CachedProfile | null> {
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

      // Fetch profile from API using Bsky SDK
      const apiProfile = await AtprotoService.getProfile(cleanHandle);
      if (!apiProfile) return null;

      // Fetch records in parallel with profile data (for colors)
      const records = await AtprotoService.getProfileRecordsForDid(apiProfile.did);

      // Transform API response to CachedProfile with pre-fetched records
      const profile = await this.transformApiProfile(
        apiProfile,
        apiProfile.did,
        records.orbytRecord as OrbytProfileRecord | null
      );
      // Save to MMKV for sync reads (placeholderData)
      this.saveProfileToCache(profile);

      return profile;
    } catch (_error) {
      // Return stale cache if available
      const cached = this.getProfileFromCacheSync(handle);
      return cached;
    }
  }

  /**
   * Force refresh a profile by DID - just call getProfileByDid (cache is managed by React Query)
   */
  static async refreshProfileByDid(did: string): Promise<CachedProfile | null> {
    return this.getProfileByDid(did);
  }

  /**
   * Force refresh a profile by handle - just call getProfile (cache is managed by React Query)
   */
  static async refreshProfile(handle: string): Promise<CachedProfile | null> {
    return this.getProfile(handle);
  }

  /**
   * Pre-cache a list of profiles from API responses
   * Transforms and saves profiles to MMKV for instant access
   */
  static async cacheProfiles(profiles: any[]): Promise<void> {
    if (!profiles || profiles.length === 0) return;

    try {
      // Process profiles in parallel
      await Promise.all(
        profiles.map(async profile => {
          if (!profile?.handle || !profile?.did) return;

          try {
            // Check if already cached and valid
            const cached = this.getProfileFromCacheSyncByDid(profile.did);
            if (cached && this.isCacheValid(cached)) {
              return;
            }

            // Transform and save
            // Fetch records for colors
            const records = await AtprotoService.getProfileRecordsForDid(profile.did);
            const transformed = await this.transformApiProfile(
              profile,
              profile.did,
              records.orbytRecord as OrbytProfileRecord | null
            );
            this.saveProfileToCache(transformed);
          } catch {
            // Silently handle errors
          }
        })
      );
    } catch {
      // Silently handle errors
    }
  }

  /**
   * Update the following status for a profile
   * Updates MMKV cache - React Query handles invalidation via mutations
   */
  static async updateFollowingStatus(
    handle: string,
    isFollowing: boolean,
    isFollowedBy?: boolean
  ): Promise<void> {
    if (!handle) return;

    try {
      const cachedProfile = this.getProfileFromCacheSync(handle);
      if (cachedProfile) {
        cachedProfile.isFollowing = isFollowing;
        if (isFollowedBy !== undefined) {
          cachedProfile.isFollowedBy = isFollowedBy;
        }
        cachedProfile.lastUpdated = Date.now();
        this.saveProfileToCache(cachedProfile);
      }
    } catch {
      // Silently handle errors
    }
  }

  /**
   * Update the subscription status for a profile
   * Updates MMKV cache - React Query handles invalidation via mutations
   */
  static async updateSubscriptionStatus(did: string, isSubscribed: boolean): Promise<void> {
    if (!did) return;

    try {
      const cachedProfile = this.getProfileFromCacheSyncByDid(did);
      if (cachedProfile) {
        cachedProfile.isSubscribed = isSubscribed;
        cachedProfile.lastUpdated = Date.now();
        this.saveProfileToCache(cachedProfile);
      }
    } catch {
      // Silently handle errors
    }
  }

  /**
   * Update the mute status for a profile
   * Updates MMKV cache - React Query handles invalidation via mutations
   */
  static async updateMuteStatus(did: string, handle: string, isMuted: boolean): Promise<void> {
    if (!did || !handle) return;

    try {
      const cachedProfile =
        this.getProfileFromCacheSyncByDid(did) || this.getProfileFromCacheSync(handle);
      if (cachedProfile) {
        cachedProfile.isMuted = isMuted;
        cachedProfile.lastUpdated = Date.now();
        this.saveProfileToCache(cachedProfile);
      }
    } catch {
      // Silently handle errors
    }
  }

  /**
   * Update the verification status for a profile
   */
  static async updateVerification(
    handle: string,
    verification: {
      isVerified: boolean;
      verifiedBy?: string;
      verifierHandle?: string;
      verifiedAt?: string;
      isOfficial?: boolean;
      status?: string;
      trustedVerifierStatus?: string;
      verifications?: Array<{
        issuer: string;
        uri: string;
        isValid: boolean;
        createdAt: string;
      }>;
    }
  ): Promise<void> {
    if (!handle) return;

    try {
      const cachedProfile = this.getProfileFromCacheSync(handle);
      if (cachedProfile) {
        cachedProfile.verification = verification;
        cachedProfile.lastUpdated = Date.now();
        this.saveProfileToCache(cachedProfile);
      }
    } catch {
      // Silently handle errors
    }
  }

  /**
   * Apply a server-updated profile response into cache
   * Extracts moderation flags (blocked/muted) from ProfileView.viewer
   */
  static async applyServerProfile(
    handle: string,
    serverProfile: ProfileView | ProfileViewDetailed
  ): Promise<void> {
    if (!handle || !serverProfile) return;

    try {
      const normalizedHandle = (serverProfile.handle || handle).toLowerCase();
      const cachedProfile = this.getProfileFromCacheSync(normalizedHandle);

      const isFollowing = serverProfile.viewer
        ? !!serverProfile.viewer.following
        : cachedProfile?.isFollowing;
      const isFollowedBy = serverProfile.viewer
        ? !!serverProfile.viewer.followedBy
        : cachedProfile?.isFollowedBy;

      // Extract moderation flags directly from ProfileView.viewer (Atproto types)
      const isBlocked = serverProfile.viewer
        ? !!(serverProfile.viewer.blocking || serverProfile.viewer.blockingByList)
        : cachedProfile?.isBlocked;
      const blockingByList = serverProfile.viewer?.blockingByList ?? cachedProfile?.blockingByList;
      const isMuted = serverProfile.viewer?.muted ?? cachedProfile?.isMuted;

      const merged: CachedProfile = {
        did: serverProfile.did || cachedProfile?.did || '',
        handle: serverProfile.handle || cachedProfile?.handle || normalizedHandle,
        displayName: serverProfile.displayName ?? cachedProfile?.displayName,
        avatar: serverProfile.avatar ?? cachedProfile?.avatar,
        description: serverProfile.description ?? cachedProfile?.description,
        isFollowing,
        isFollowedBy,
        isBlocked,
        blockingByList,
        isMuted,
        // Preserve profileColors and other cached data that isn't in server response
        profileColors: cachedProfile?.profileColors,
        hasCustomColors: cachedProfile?.hasCustomColors,
        verification: cachedProfile?.verification,
        orbytProfileRecord: cachedProfile?.orbytProfileRecord,
        isSubscribed: cachedProfile?.isSubscribed,
        lastUpdated: Date.now(),
      };
      this.saveProfileToCache(merged);
    } catch {
      // Silently handle errors
    }
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
   * Get a profile directly from the cache by handle (async wrapper for sync method)
   */
  private static async getProfileFromCache(handle: string): Promise<CachedProfile | null> {
    return this.getProfileFromCacheSync(handle);
  }

  /**
   * Check if cached data is still valid (not expired)
   */
  private static isCacheValid(profile: CachedProfile): boolean {
    if (!profile) return false;
    const now = Date.now();
    return now - profile.lastUpdated < this.cacheExpiry;
  }

  /**
   * Generate a consistent cache key for a DID
   */
  private static getCacheKeyByDid(did: string): string {
    return `${this.CACHE_KEY_PREFIX}did_${did}`;
  }

  /**
   * Generate a consistent cache key for a handle (legacy)
   */
  private static getCacheKey(handle: string): string {
    return `${this.CACHE_KEY_PREFIX}${handle.toLowerCase()}`;
  }

  /**
   * Invalidate a specific profile in the cache
   * Removes from MMKV for React Query to refetch
   */
  static async invalidateProfile(handle: string): Promise<void> {
    if (!handle) return;

    try {
      const normalizedHandle = handle.toLowerCase();
      const cacheKey = this.getCacheKey(normalizedHandle);
      storage.delete(cacheKey);
    } catch (_error) {
      // Silently handle errors
    }
  }

  /**
   * Invalidate a specific profile in the cache by DID
   */
  static async invalidateProfileByDid(did: string): Promise<void> {
    if (!did) return;

    try {
      const cacheKey = this.getCacheKeyByDid(did);
      storage.delete(cacheKey);
    } catch (_error) {
      // Silently handle errors
    }
  }

  /**
   * Clear all cached profiles
   */
  static async clearCache(): Promise<void> {
    try {
      const allKeys = storage.getAllKeys();
      allKeys.forEach(key => {
        if (key.startsWith(this.CACHE_KEY_PREFIX)) {
          storage.delete(key);
        }
      });
    } catch {
      // Silently fail
    }
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
  static async batchPrefetchFromFeed(feedItems: any[]): Promise<void> {
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

        // Handle direct author structure (for search results and notifications)
        if (item.author?.handle) {
          uniqueHandles.add(item.author.handle.toLowerCase());
        }

        // Handle notification structure
        if (item.reason?.by?.handle) {
          uniqueHandles.add(item.reason.by.handle.toLowerCase());
        }
      });

      // Convert to array and filter out empty handles
      const handlesToPrefetch = Array.from(uniqueHandles).filter(
        handle => handle && handle.trim() !== ''
      );

      if (handlesToPrefetch.length === 0) {
        return;
      }

      // Filter out already cached profiles
      const uncachedHandles = handlesToPrefetch.filter(handle => {
        const cached = this.getProfileFromCacheSync(handle);
        return !cached || !this.isCacheValid(cached);
      });

      if (uncachedHandles.length === 0) {
        return;
      }

      // Process handles in smaller batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < uncachedHandles.length; i += batchSize) {
        const batch = uncachedHandles.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async handle => {
            try {
              // Check if already cached first
              const cached = this.getProfileFromCacheSync(handle);
              if (cached && this.isCacheValid(cached)) {
                return; // Already cached and valid
              }

              // Fetch and cache the profile
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
 * Uses placeholderData for instant UI from MMKV cache
 */
export function useProfileByDid(
  did: string | null | undefined
): UseQueryResult<CachedProfile | null, Error> {
  // Get cached profile to calculate dynamic staleTime based on status expiration
  const cachedProfile = useMemo(() => {
    if (!did) return null;
    return ProfileService.getProfileFromCacheSyncByDid(did);
  }, [did]);

  // Calculate staleTime based on status expiration
  const staleTime = useMemo(() => {
    return getProfileStaleTime(cachedProfile);
  }, [cachedProfile]);

  return useQuery<CachedProfile | null, Error>({
    queryKey: did ? profileKeys.detail(`did_${did}`) : ['profiles', 'detail', 'did_'],
    queryFn: async () => (did ? ProfileService.getProfileByDid(did) : null),
    enabled: !!did,
    staleTime,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // Use placeholderData for instant UI - reads from MMKV synchronously
    // Always use cached version to ensure colors are present during refetches
    placeholderData: () => {
      if (!did) return null;
      return ProfileService.getProfileFromCacheSyncByDid(did);
    },
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
): UseQueryResult<CachedProfile[], Error> {
  const validHandles = useMemo(() => {
    return Array.from(
      new Set(handles.filter((h): h is string => !!h).map(h => h.toLowerCase()))
    ).sort();
  }, [handles]);

  const queryKey = useMemo(
    () => [...profileKeys.all, 'batch', ...validHandles] as const,
    [validHandles]
  );

  return useQuery<CachedProfile[], Error>({
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
): UseQueryResult<CachedProfile[], Error> {
  const validDids = useMemo(() => {
    return Array.from(new Set(dids.filter((d): d is string => !!d))).sort();
  }, [dids]);

  const queryKey = useMemo(
    () => [...profileKeys.all, 'batch-by-did', ...validDids] as const,
    [validDids]
  );

  return useQuery<CachedProfile[], Error>({
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
 * Uses placeholderData for instant UI from MMKV cache
 */
export function useProfile(
  handle: string | null | undefined
): UseQueryResult<CachedProfile | null, Error> {
  // Get cached profile to calculate dynamic staleTime based on status expiration
  const cachedProfile = useMemo(() => {
    if (!handle) return null;
    return ProfileService.getProfileFromCacheSync(handle);
  }, [handle]);

  // Calculate staleTime based on status expiration
  const staleTime = useMemo(() => {
    return getProfileStaleTime(cachedProfile);
  }, [cachedProfile]);

  return useQuery<CachedProfile | null, Error>({
    queryKey: handle ? profileKeys.detail(handle.toLowerCase()) : ['profiles', 'detail', ''],
    queryFn: async () => (handle ? ProfileService.getProfile(handle) : null),
    enabled: !!handle,
    staleTime,
    gcTime: PROFILE_CACHE_EXPIRY * 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // Use placeholderData for instant UI - reads from MMKV synchronously
    // Always use cached version to ensure colors are present during refetches
    placeholderData: () => {
      if (!handle) return null;
      return ProfileService.getProfileFromCacheSync(handle);
    },
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
      const previousProfile = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));
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
        ? queryClient.getQueryData<CachedProfile>(profileKeys.detail(`did_${resolvedDid}`))
        : null;

      // Optimistically update React Query cache
      // Note: This may be redundant if called from profile screen (which updates cache in button handler),
      // but it's needed for other places that use this mutation (e.g., explore screen)
      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), {
          ...previousProfile,
          isFollowing,
          ...(isFollowedBy !== undefined ? { isFollowedBy } : {}),
        });
      }

      if (previousProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${resolvedDid}`), {
          ...previousProfileByDid,
          isFollowing,
          ...(isFollowedBy !== undefined ? { isFollowedBy } : {}),
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
        updateFollowState(context.did, handle, context.previousProfile.isFollowing ?? false);
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
      const previousProfile = queryClient.getQueryData<CachedProfile>(
        profileKeys.detail(normalizedHandle)
      );
      const previousProfileByDid = queryClient.getQueryData<CachedProfile>(
        profileKeys.detail(`did_${did}`)
      );

      // Optimistically update React Query cache
      // When manually blocking/unblocking, clear blockingByList (direct block only)
      const updatedProfile = previousProfile
        ? {
            ...previousProfile,
            isBlocked,
            blockingByList: !isBlocked ? undefined : previousProfile.blockingByList,
            lastUpdated: Date.now(),
          }
        : null;
      const updatedProfileByDid = previousProfileByDid
        ? {
            ...previousProfileByDid,
            isBlocked,
            blockingByList: !isBlocked ? undefined : previousProfileByDid.blockingByList,
            lastUpdated: Date.now(),
          }
        : null;

      if (updatedProfile) {
        queryClient.setQueryData(profileKeys.detail(normalizedHandle), updatedProfile);
        // Immediately save to MMKV for persistence
        ProfileService.saveProfileToCache(updatedProfile);
      }

      if (updatedProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${did}`), updatedProfileByDid);
        // Immediately save to MMKV for persistence
        ProfileService.saveProfileToCache(updatedProfileByDid);
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

      // Sync React Query cache from MMKV to ensure consistency (cache already updated in onMutate)
      const handleKey = profileKeys.detail(normalizedHandle);
      const didKey = profileKeys.detail(`did_${did}`);

      const persistedProfile = ProfileService.getProfileFromCacheSync(handle);
      const persistedProfileByDid = ProfileService.getProfileFromCacheSyncByDid(did);

      // Ensure React Query cache matches persisted MMKV state
      if (persistedProfile) {
        queryClient.setQueryData(handleKey, persistedProfile);
      }
      if (persistedProfileByDid) {
        queryClient.setQueryData(didKey, persistedProfileByDid);
      }

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

      // Update the cache with the new mute status
      await ProfileService.updateMuteStatus(did, handle, isMuted);

      return { did, handle, isMuted };
    },
    // When mutate is called:
    onMutate: async ({ did, handle, isMuted }) => {
      // Cancel any outgoing refetches for both handle and DID-based queries
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(handle) });
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(`did_${did}`) });

      // Snapshot the previous values
      const previousProfile = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));
      const previousProfileByDid = queryClient.getQueryData<CachedProfile>(
        profileKeys.detail(`did_${did}`)
      );

      // Optimistically update React Query cache
      if (previousProfile) {
        queryClient.setQueryData(profileKeys.detail(handle), {
          ...previousProfile,
          isMuted,
        });
      }

      if (previousProfileByDid) {
        queryClient.setQueryData(profileKeys.detail(`did_${did}`), {
          ...previousProfileByDid,
          isMuted,
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

        // Immediately apply to local cache for fast UI reflection
        try {
          await ProfileService.applyServerProfile(handle, updatedProfile);
        } catch (_error) {
          // Continue even if this fails
        }
      }

      return { handle, updatedProfile, updatedColors: !!updates.customColors };
    },
    onMutate: async ({ handle, updates }) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.detail(handle) });

      const previousProfile = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));

      // Optimistically update the query cache
      if (previousProfile) {
        const optimistic: CachedProfile = {
          ...previousProfile,
          ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.avatar !== undefined ? { avatar: updates.avatar } : {}),
          ...(updates.customColors
            ? {
                hasCustomColors: true, // Mark as having custom colors
                profileColors: {
                  backgroundColor: updates.customColors.backgroundColor,
                  foregroundColor: updates.customColors.textColor,
                  statusBarStyle: getStatusBarStyle(updates.customColors.backgroundColor),
                  lighterColor: getLighterColor(
                    updates.customColors.backgroundColor,
                    updates.customColors.textColor
                  ),
                },
              }
            : {}),
          lastUpdated: Date.now(),
        };
        queryClient.setQueryData(profileKeys.detail(handle), optimistic);
      }

      return { previousProfile };
    },
    onSuccess: ({ updatedProfile, updatedColors }, { handle, updates }) => {
      // If colors were updated, save to cache immediately
      if (updatedColors) {
        const prev = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));
        if (prev && updates.customColors) {
          // Update the cached profile with new colors
          const updated: CachedProfile = {
            ...prev,
            hasCustomColors: true,
            profileColors: {
              backgroundColor: updates.customColors.backgroundColor,
              foregroundColor: updates.customColors.textColor,
              statusBarStyle: getStatusBarStyle(updates.customColors.backgroundColor),
              lighterColor: getLighterColor(
                updates.customColors.backgroundColor,
                updates.customColors.textColor
              ),
            },
            lastUpdated: Date.now(),
          };
          // Save to MMKV cache
          ProfileService.saveProfileToCache(updated);
          // Update React Query cache immediately - don't invalidate to avoid refetch before server has processed
          queryClient.setQueryData(profileKeys.detail(handle), updated);
          // Also update DID-based query if we have the DID
          if (prev.did) {
            queryClient.setQueryData(profileKeys.detail(`did_${prev.did}`), updated);
          }

          // Note: We don't invalidate here because:
          // 1. We've already saved the new colors to cache
          // 2. We've updated React Query cache optimistically
          // 3. The server needs time to process the update
          // 4. Invalidating immediately would trigger a refetch that might get stale data
          // The cache will be refreshed naturally on next navigation or manual refresh
        } else {
          // Fallback: invalidate to trigger refetch
          queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
          if (prev?.did) {
            queryClient.invalidateQueries({ queryKey: profileKeys.detail(`did_${prev.did}`) });
          }
        }
        return;
      }

      if (!updatedProfile) return; // Skip if no profile was updated

      // Merge server-updated fields into the query cache immediately
      const prev = queryClient.getQueryData<CachedProfile>(profileKeys.detail(handle));
      if (!prev) return; // Skip if no previous data

      // Extract moderation flags from updatedProfile.viewer (Atproto types)
      const isBlocked = updatedProfile?.viewer
        ? !!(updatedProfile.viewer.blocking || updatedProfile.viewer.blockingByList)
        : prev.isBlocked;
      const blockingByList = updatedProfile?.viewer?.blockingByList ?? prev.blockingByList;
      const isMuted = updatedProfile?.viewer?.muted ?? prev.isMuted;

      const merged: CachedProfile = {
        ...prev,
        did: updatedProfile?.did ?? prev.did,
        handle: updatedProfile?.handle ?? prev.handle,
        displayName: updatedProfile?.displayName ?? prev.displayName,
        avatar: updatedProfile?.avatar ?? prev.avatar,
        description: updatedProfile?.description ?? prev.description,
        isFollowing: updatedProfile?.viewer ? !!updatedProfile.viewer.following : prev.isFollowing,
        isFollowedBy: updatedProfile?.viewer
          ? !!updatedProfile.viewer.followedBy
          : prev.isFollowedBy,
        isBlocked,
        blockingByList,
        isMuted,
        // Preserve custom colors flag if we updated colors
        hasCustomColors: updates.customColors ? true : prev.hasCustomColors,
        // Explicitly preserve profileColors to prevent them from being lost
        profileColors: prev.profileColors,
        orbytProfileRecord: prev.orbytProfileRecord,
        verification: prev.verification,
        isSubscribed: prev.isSubscribed,
        lastUpdated: Date.now(),
      };
      queryClient.setQueryData(profileKeys.detail(handle), merged);

      // Also invalidate DID-based queries if we know the DID
      if (prev.did) {
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(`did_${prev.did}`) });
      }

      // Still invalidate to ensure freshness against server
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(handle) });
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
      await ProfileService.invalidateProfile(handle);
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
  profile: CachedProfile | null | undefined,
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
    verification?: CachedProfile['verification'];
  }
): Promise<void> {
  if (!identifier || !queryClient) return;

  const cleanIdentifier = identifier.trim();
  if (!cleanIdentifier) return;

  const isDid = cleanIdentifier.startsWith('did:');
  const cleanHandle = isDid ? null : cleanIdentifier.toLowerCase();
  const did = isDid ? cleanIdentifier : partialProfile?.did;

  // Step 1: Set partial data immediately for instant UI (if provided and cache is stale/missing)
  if (partialProfile && cleanHandle) {
    const existing = queryClient.getQueryData<CachedProfile>(profileKeys.detail(cleanHandle));
    const isStale = existing && Date.now() - existing.lastUpdated > PROFILE_CACHE_EXPIRY;

    if (!existing || isStale) {
      const partialCachedProfile: Partial<CachedProfile> = {
        did: did || existing?.did || '',
        handle: cleanHandle,
        displayName: partialProfile.displayName || existing?.displayName,
        avatar: partialProfile.avatar || existing?.avatar,
        description: partialProfile.description || existing?.description,
        verification: partialProfile.verification || existing?.verification,
        lastUpdated: Date.now(),
        // Preserve existing relationship data if available
        isFollowing: existing?.isFollowing,
        isFollowedBy: existing?.isFollowedBy,
        isSubscribed: existing?.isSubscribed,
        profileColors: existing?.profileColors,
        hasCustomColors: existing?.hasCustomColors,
      };

      if (partialCachedProfile.did || partialCachedProfile.handle) {
        queryClient.setQueryData(
          profileKeys.detail(cleanHandle),
          partialCachedProfile as CachedProfile
        );

        // Also save to MMKV for sync reads
        if (partialCachedProfile.did) {
          ProfileService.saveProfileToCache(partialCachedProfile as CachedProfile);
        }
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
