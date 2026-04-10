/**
 * Hooks for profile colors.
 * useOrbytColors: fetch colors for a DID (React Query).
 * useAvatarProfileRing: ring props from profile.orbytColors (no extra fetch).
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryClient } from '../../utils/query/queryClient';
import {
  getProfileColors,
  getTabBarActiveTintFromProfile,
  type ProfileColorScheme,
} from '../../utils/formatting/colors';
import { useProfileByDid } from '../data/ProfileService';
import { useUserStore } from '../../stores/userStore';
import {
  getOrbytColorKey,
  getOrbytColorQueryOptions,
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
      getPersistedColorsSync(did) ??
      undefined
    );
  }, [did]);

  return useQuery<OrbytColorData | null, Error>({
    ...(did
      ? getOrbytColorQueryOptions(did)
      : {
          queryKey: ['orbyt', 'colors', 'disabled'] as const,
          queryFn: () => Promise.resolve(null),
        }),
    enabled: !!did,
    initialData,
  });
}

/** Tab bar / shell: derived from React Query Orbyt colors for the signed-in user (no Zustand color copy). */
export function useCurrentUserOrbytShellColors(): {
  profileColors: ProfileColorScheme | null;
  activeTint: string;
} {
  const did = useUserStore(s => s.currentUser?.did);
  const { data: orbyt } = useOrbytColors(did);

  return useMemo(() => {
    const profileColors = orbyt ? getProfileColors(orbyt) : null;
    return {
      profileColors,
      activeTint: getTabBarActiveTintFromProfile(profileColors),
    };
  }, [orbyt]);
}

export function useAvatarProfileRing(did: string | null | undefined): AvatarProfileRingProps {
  const { data: profile } = useProfileByDid(did);
  const orbytColors = profile?.orbytColors;

  return useMemo(() => {
    const profileColors = getProfileColors(orbytColors);
    return {
      showRing: !!did,
      ringColor: profileColors.textColor,
      profileColors: {
        backgroundColor: profileColors.backgroundColor,
        foregroundColor: profileColors.foregroundColor,
        textColor: profileColors.textColor,
      },
    };
  }, [did, orbytColors]);
}
