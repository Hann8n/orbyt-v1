/**
 * useOrbytColors - Profile colors from orbyt API (api.getorbyt.com)
 *
 * API: GET /v1/colors/:did → OrbytColorData | null (404 = no orbyt profile).
 *      POST /v1/colors body { dids: string[] } → Record<did, OrbytColorData | null>.
 * Data: { textColor, backgroundColor, joinedAt, isBeta }. Cached by DID in React Query.
 *
 * Colors are also attached to profiles when fetching (ActorService); useAvatarProfileRing
 * reads from profile.orbytColors so lists get colors in one profile fetch.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { storage } from '../utils/storage';
import OrbytColorsService, { type OrbytColorData } from '../services/OrbytColorsService';
import { queryClient } from '../utils/query/queryClient';
import { getProfileColors, pickLighterHex } from '../utils/formatting/colors';
import { useProfileByDid } from '../services/data/ProfileService';

// Query key factory for orbyt colors
export const orbytColorKeys = {
  all: ['orbytColors'] as const,
  color: (did: string) => [...orbytColorKeys.all, did] as const,
};

// Storage key for persisting current user's colors
export const CURRENT_USER_COLORS_KEY = 'orbyt_current_user_colors';

const PERSISTED_COLORS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Stale time: 5 min so cache refreshes sooner and other users' color changes propagate
const STALE_TIME = 5 * 60 * 1000;

/**
 * Synchronously read persisted orbyt colors for a DID from storage.
 * Used at app start so UI can show colors before any async fetch.
 */
export function getPersistedColorsSync(did: string): OrbytColorData | null {
  try {
    const stored = storage.getString(CURRENT_USER_COLORS_KEY);
    if (!stored) return null;
    const {
      did: storedDid,
      data,
      timestamp,
    } = JSON.parse(stored) as {
      did: string;
      data: OrbytColorData;
      timestamp: number;
    };
    if (storedDid !== did || Date.now() - timestamp > PERSISTED_COLORS_MAX_AGE_MS || !data)
      return null;
    return data;
  } catch {
    return null;
  }
}

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
    gcTime: STALE_TIME * 2, // Keep in cache for 10 min after last read
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Persist current user's colors to MMKV for instant load on next app open
 * @param did - User's DID
 * @param data - Color data to persist
 */
export function persistCurrentUserColors(did: string, data: OrbytColorData | null): void {
  try {
    if (data) {
      storage.set(CURRENT_USER_COLORS_KEY, JSON.stringify({ did, data, timestamp: Date.now() }));
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
export function loadPersistedColors(currentUserDid: string): void {
  try {
    const stored = storage.getString(CURRENT_USER_COLORS_KEY);
    if (!stored) return;

    const { did, data, timestamp } = JSON.parse(stored) as {
      did: string;
      data: OrbytColorData;
      timestamp: number;
    };

    const isValid = did === currentUserDid && Date.now() - timestamp < PERSISTED_COLORS_MAX_AGE_MS;

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
 * @deprecated Colors are now included when fetching profiles (ActorService). Use
 * useAvatarProfileRing(did) which reads from profile.orbytColors. Kept for one-off
 * prefetch at app init only (userStore).
 */
export function usePrefetchOrbytColors(dids: string[] | null | undefined): void {
  const stableKey = useMemo(
    () => (dids?.length ? [...new Set(dids)].slice(0, 100).sort().join(',') : ''),
    [dids]
  );
  useEffect(() => {
    if (!stableKey) return;
    prefetchOrbytColors(stableKey.split(',')).catch(() => {});
  }, [stableKey]);
}

/**
 * Batch prefetch colors for multiple DIDs (one POST vs N GETs).
 * Used at app init (userStore) and by usePrefetchOrbytColors when a list has DIDs.
 * Returns the current user's color data when first DID is the current user (for instant store update).
 */
export async function prefetchOrbytColors(
  dids: string[],
  currentUserDid?: string | null
): Promise<OrbytColorData | null> {
  if (!dids || dids.length === 0) return null;

  const results = await OrbytColorsService.batchFetchColors(dids);

  Object.entries(results).forEach(([did, data]) => {
    queryClient.setQueryData(orbytColorKeys.color(did), data, {
      updatedAt: Date.now(),
    });
  });

  const firstDid = dids[0];
  const currentUserColors = results[firstDid] ?? null;
  if (currentUserColors && (currentUserDid == null || firstDid === currentUserDid)) {
    persistCurrentUserColors(firstDid, currentUserColors);
  }
  return currentUserDid ? (results[currentUserDid] ?? null) : currentUserColors;
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

/** Props to pass to Avatar for profile ring (showRing + ringColor + profileColors) */
export interface AvatarProfileRingProps {
  showRing: boolean;
  ringColor?: string;
  profileColors?: {
    backgroundColor: string;
    foregroundColor: string;
    textColor: string;
  };
}

/**
 * Hook that returns Avatar-ready profile ring props (ring color + profile colors).
 * Uses profile data (profile.orbytColors) so colors come from the same fetch as the profile;
 * no separate color requests for lists.
 */
export function useAvatarProfileRing(did: string | null | undefined): AvatarProfileRingProps {
  const { data: profile } = useProfileByDid(did);
  const orbytColors = profile?.orbytColors;
  return useMemo(() => {
    const profileColors = getProfileColors(orbytColors);
    const ringColor =
      pickLighterHex(profileColors.backgroundColor, profileColors.foregroundColor) || undefined;
    return {
      showRing: !!did,
      ringColor,
      profileColors: {
        backgroundColor: profileColors.backgroundColor,
        foregroundColor: profileColors.foregroundColor,
        textColor: profileColors.foregroundColor,
      },
    };
  }, [did, orbytColors]);
}

/**
 * Set colors in cache and persist (used after editing profile)
 * @param did - User's DID
 * @param colors - Color data to set
 */
export function setAndPersistColors(did: string, colors: OrbytColorData): void {
  queryClient.setQueryData(orbytColorKeys.color(did), colors, {
    updatedAt: Date.now(),
  });
  persistCurrentUserColors(did, colors);
}

// Re-export types for convenience
export type { OrbytColorData } from '../services/OrbytColorsService';
