import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import type { OrbytProfileRecord } from '../types';
import { useUserStore } from '../stores/userStore';

/**
 * Load the com.getorbyt.profile record for any DID (or current user when DID is omitted).
 *
 * Behavior:
 * - Tries getRecord with rkey 'self'.
 * - Falls back to listRecords (limit 1) if the stable rkey isn't present.
 */
export function useOrbytProfile(did?: string) {
  // Get current user from store instead of API call
  const currentUser = useUserStore(state => state.currentUser);
  const currentUserDid = currentUser?.did ?? null;
  
  const query = useQuery<OrbytProfileRecord | null>({
    queryKey: ['orbyt-profile', did ?? currentUserDid ?? 'current'],
    queryFn: async () => {
      const targetDid = did ?? currentUserDid;
      if (!targetDid) return null;

      // Cross-PDS: fetch via the target DID's PDS
      const record = await AtprotoService.getOrbytProfileRecordForDid(targetDid);
      return (record as OrbytProfileRecord) ?? null;
    },
    enabled: !!did || !!currentUserDid, // Only run if we have a DID (either provided or from store)
    staleTime: 60_000,
  });

  return {
    record: query.data ?? null,
    colors: query.data?.colors ?? null,
    subscribedChannels: query.data?.subscribedChannels ?? [],
    joinDate: query.data?.joinDate,
    updatedAt: query.data?.updatedAt,
    ...query,
  };
}

export default useOrbytProfile;
