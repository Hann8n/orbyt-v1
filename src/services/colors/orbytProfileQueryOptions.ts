import { queryOptions, skipToken, useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { QUERY_CONSTANTS } from '@/utils/constants';
import { queryKeys } from '@/utils/query/queryKeys';
import { fetchOrbytPublicJson } from '@/services/orbyt/orbytPublicFetch';
import type { OrbytProfileRecord } from '@/services/api/types';

const ORBYT_PROFILE_GC_TIME = 24 * 60 * 60 * 1000;

interface ColorResponse {
  textColor: string | null;
  backgroundColor: string | null;
  fontPreference: string | null;
  joinedAt: string;
  isBeta: boolean;
}

function toRecord(r: ColorResponse): OrbytProfileRecord {
  return {
    $type: 'com.getorbyt.profile',
    colors:
      r.backgroundColor && r.textColor
        ? { backgroundColor: r.backgroundColor, textColor: r.textColor }
        : null,
    joinDate: r.joinedAt ?? undefined,
  };
}

async function fetchOrbytProfileColors(did: string): Promise<OrbytProfileRecord | null> {
  const result = await fetchOrbytPublicJson<ColorResponse | null>(
    `https://api.getorbyt.com/v1/colors/${encodeURIComponent(did)}`
  );
  return result ? toRecord(result) : null;
}

export async function warmOrbytProfileCache(dids: string[], qc: QueryClient): Promise<void> {
  if (!dids.length) return;
  const uncached = dids.filter(
    did => qc.getQueryData(queryKeys.orbytProfile.byDid(did)) === undefined
  );
  if (!uncached.length) return;

  const result = await fetchOrbytPublicJson<Record<string, ColorResponse | null>>(
    'https://api.getorbyt.com/v1/colors',
    { method: 'POST', body: JSON.stringify({ dids: uncached }) }
  );

  for (const did of uncached) {
    const entry = result[did];
    qc.setQueryData(queryKeys.orbytProfile.byDid(did), entry ? toRecord(entry) : null);
  }
}

export function orbytProfileQueryOptions(did: string | null | undefined) {
  return queryOptions({
    queryKey: queryKeys.orbytProfile.byDid(did ?? ''),
    queryFn: did ? () => fetchOrbytProfileColors(did) : skipToken,
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG,
    gcTime: ORBYT_PROFILE_GC_TIME,
    enabled: !!did,
  });
}

export function useOrbytProfile(did: string | null | undefined) {
  return useQuery(orbytProfileQueryOptions(did));
}
