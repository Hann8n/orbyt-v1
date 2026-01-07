import { useMemo } from 'react';
import { useProfileByDid } from '../services/data/ProfileService';
import { useUserStore } from '../stores/userStore';

/**
 * Load the com.getorbyt.profile record for any DID (or current user when DID is omitted).
 * Reads from React Query cache.
 */
export function useOrbytProfile(did?: string) {
  const currentUser = useUserStore(state => state.currentUser);
  const targetDid = did ?? currentUser?.did ?? null;

  // Read from React Query cache - data is already fetched with profile using listRecords
  const { data: cachedProfile } = useProfileByDid(targetDid);

  const record = useMemo(() => {
    if (!targetDid) return null;
    return cachedProfile?.orbytProfileRecord ?? null;
  }, [targetDid, cachedProfile]);

  return {
    record,
    colors: record?.colors ?? null,
    subscribedChannels: record?.subscribedChannels ?? [],
    joinDate: record?.joinDate,
    updatedAt: record?.updatedAt,
  };
}

export default useOrbytProfile;
