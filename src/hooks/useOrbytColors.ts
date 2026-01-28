/**
 * useOrbytColors - React Query hook for fetching profile colors from orbyt API
 *
 * Provides:
 * - Single DID lookup with 15-minute stale time
 * - Batch prefetch utility for app initialization
 * - Cache invalidation for pull-to-refresh and edit flows
 * - Persistence of current user's colors for instant load on app open
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OrbytColorsService, { type OrbytColorData } from '../services/OrbytColorsService';
import { queryClient } from '../utils/query/queryClient';

// Query key factory for orbyt colors
export const orbytColorKeys = {
  all: ['orbytColors'] as const,
  color: (did: string) => [...orbytColorKeys.all, did] as const,
};

// Storage key for persisting current user's colors
const CURRENT_USER_COLORS_KEY = 'orbyt_current_user_colors';

// Stale time: 15 minutes
const STALE_TIME = 15 * 60 * 1000;

/**
 * Hook to fetch colors for a single DID
 * @param did - The DID to fetch colors for (null to disable)
 * @returns React Query result with color data
 */
export function useOrbytColors(did: string | null | undefined) {
  // Get cached data synchronously for immediate availability
  const initialData = useMemo(() => {
    if (!did) return undefined;
    return queryClient.getQueryData<OrbytColorData | null>(orbytColorKeys.color(did));
  }, [did]);

  return useQuery<OrbytColorData | null, Error>({
    queryKey: did ? orbytColorKeys.color(did) : ['orbytColors', 'disabled'],
    queryFn: () => (did ? OrbytColorsService.fetchColors(did) : null),
    enabled: !!did,
    initialData,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 2, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Persist current user's colors to AsyncStorage for instant load on next app open
 * @param did - User's DID
 * @param data - Color data to persist
 */
export async function persistCurrentUserColors(
  did: string,
  data: OrbytColorData | null
): Promise<void> {
  try {
    if (data) {
      await AsyncStorage.setItem(
        CURRENT_USER_COLORS_KEY,
        JSON.stringify({ did, data, timestamp: Date.now() })
      );
    }
  } catch {
    // Best effort - don't fail if storage fails
  }
}

/**
 * Load persisted colors for current user and populate React Query cache
 * Call this on app start before session restore
 * @param currentUserDid - Current user's DID to validate against persisted data
 */
export async function loadPersistedColors(currentUserDid: string): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(CURRENT_USER_COLORS_KEY);
    if (!stored) return;

    const { did, data, timestamp } = JSON.parse(stored) as {
      did: string;
      data: OrbytColorData;
      timestamp: number;
    };

    // Only use if it's for the same user and not too old (24 hours)
    const isValid = did === currentUserDid && Date.now() - timestamp < 24 * 60 * 60 * 1000;

    if (isValid && data) {
      queryClient.setQueryData(orbytColorKeys.color(did), data, {
        updatedAt: timestamp,
      });
    }
  } catch {
    // Best effort - don't fail if storage fails
  }
}

/**
 * Batch prefetch colors for multiple DIDs
 * Call this on app initialization to warm the cache
 * Persists current user's colors for instant load on next app open
 * @param dids - Array of DIDs to prefetch (max 100), first DID is assumed to be current user
 */
export async function prefetchOrbytColors(dids: string[]): Promise<void> {
  if (!dids || dids.length === 0) return;

  const results = await OrbytColorsService.batchFetchColors(dids);

  // Populate React Query cache for each DID
  Object.entries(results).forEach(([did, data]) => {
    queryClient.setQueryData(orbytColorKeys.color(did), data, {
      updatedAt: Date.now(),
    });
  });

  // Persist current user's colors (first DID in array)
  const currentUserDid = dids[0];
  const currentUserColors = results[currentUserDid];
  if (currentUserColors) {
    await persistCurrentUserColors(currentUserDid, currentUserColors);
  }
}

/**
 * Invalidate colors cache for a single DID
 * Use this for pull-to-refresh or after editing profile
 * @param did - The DID to invalidate
 */
export function invalidateOrbytColors(did: string): void {
  queryClient.invalidateQueries({ queryKey: orbytColorKeys.color(did) });
}

/**
 * Invalidate all orbyt colors cache
 * Use sparingly - prefer single DID invalidation
 */
export function invalidateAllOrbytColors(): void {
  queryClient.invalidateQueries({ queryKey: orbytColorKeys.all });
}

/**
 * Get cached color data synchronously (if available)
 * @param did - The DID to get cached colors for
 * @returns Cached color data or undefined
 */
export function getCachedOrbytColors(did: string): OrbytColorData | null | undefined {
  return queryClient.getQueryData<OrbytColorData | null>(orbytColorKeys.color(did));
}

/**
 * Set colors in cache and persist (used after editing profile)
 * @param did - User's DID
 * @param colors - Color data to set
 */
export async function setAndPersistColors(did: string, colors: OrbytColorData): Promise<void> {
  queryClient.setQueryData(orbytColorKeys.color(did), colors, {
    updatedAt: Date.now(),
  });
  await persistCurrentUserColors(did, colors);
}

// Re-export types for convenience
export type { OrbytColorData } from '../services/OrbytColorsService';
