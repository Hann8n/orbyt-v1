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
import { orbytColorKeys, fetchColors, type OrbytColorData } from './OrbytColors';

const STALE_TIME = 5 * 60 * 1000;

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
    return queryClient.getQueryData<OrbytColorData | null>(orbytColorKeys.color(did));
  }, [did]);

  return useQuery<OrbytColorData | null, Error>({
    queryKey: did ? orbytColorKeys.color(did) : ['orbytColors', 'disabled'],
    queryFn: () => (did ? fetchColors(did) : null),
    enabled: !!did,
    initialData,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
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
