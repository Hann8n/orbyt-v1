import { useMemo } from 'react';
import ProfileCache from '../services/cache/ProfileCache';
import type { OrbytProfileRecord } from '../types';
import { useUserStore } from '../stores/userStore';

/**
 * Load the com.getorbyt.profile record for any DID (or current user when DID is omitted).
 * Simple hook that reads directly from cached profile data.
 */
export function useOrbytProfile(did?: string) {
  const currentUser = useUserStore(state => state.currentUser);
  const targetDid = did ?? currentUser?.did ?? null;
  
  // Read directly from cached profile - data is already fetched with profile using listRecords
  const record = useMemo(() => {
    if (!targetDid) return null;
    const cachedProfile = ProfileCache.getProfileFromCacheSyncByDid(targetDid);
    return cachedProfile?.orbytProfileRecord ?? null;
  }, [targetDid]);

  return {
    record,
    colors: record?.colors ?? null,
    subscribedChannels: record?.subscribedChannels ?? [],
    joinDate: record?.joinDate,
    updatedAt: record?.updatedAt,
  };
}

export default useOrbytProfile;
