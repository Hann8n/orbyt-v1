import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import type { OrbytProfileRecord } from '../types';

/**
 * Load the com.getorbyt.profile record for any DID (or current user when DID is omitted).
 *
 * Behavior:
 * - Tries getRecord with rkey 'self'.
 * - Falls back to listRecords (limit 1) if the stable rkey isn't present.
 */
export function useOrbytProfile(did?: string) {
  const query = useQuery<OrbytProfileRecord | null>({
    queryKey: ['orbyt-profile', did ?? 'current'],
    queryFn: async () => {
      const targetDid = did ?? (await AtprotoService.getCurrentUserDid());
      if (!targetDid) return null;

      // Cross-PDS: fetch via the target DID's PDS
      const record = await AtprotoService.getOrbytProfileRecordForDid(targetDid);
      return (record as OrbytProfileRecord) ?? null;
    },
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
