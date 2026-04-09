/**
 * Hooks for profile colors.
 * useOrbytColors: fetch colors for a DID (React Query).
 * useAvatarProfileRing: ring props from profile.orbytColors (no extra fetch).
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryClient } from '../../utils/query/queryClient';
import { getProfileColors, pickLighterHex } from '../../utils/formatting/colors';
import { useProfileByDid } from '../data/ProfileService';
import {
  fetchColors,
  ORBYT_COLOR_STALE_TIME_MS,
  ORBYT_COLOR_GC_TIME_MS,
  getOrbytColorKey,
  getPersistedColorsSync,
  type OrbytColorData,
} from './OrbytColors';

export interface AvatarProfileRingProps {
  showRing: boolean;
  ringColor?: string;
  profileColors?: {
    backgroundColor: string;
    foregroundColor: string;
    textColor: string;
  };
}

export function useOrbytColors(did: string | null | undefined) {
  const initialData = useMemo(() => {
    if (!did) return undefined;
    return (
      queryClient.getQueryData<OrbytColorData | null>(getOrbytColorKey(did)) ??
      getPersistedColorsSync(did)
    );
  }, [did]);

  return useQuery<OrbytColorData | null, Error>({
    queryKey: did ? getOrbytColorKey(did) : ['orbyt', 'colors', 'disabled'],
    queryFn: ({ signal }) => (did ? fetchColors(did, signal) : null),
    enabled: !!did,
    staleTime: ORBYT_COLOR_STALE_TIME_MS,
    gcTime: ORBYT_COLOR_GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    initialData,
  });
}

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
