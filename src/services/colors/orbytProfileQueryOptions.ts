import { queryOptions, skipToken, useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { QUERY_CONSTANTS } from '@/utils/constants';
import { queryKeys } from '@/utils/query/queryKeys';
import { orbytPublicQuery, OrbytXrpcError } from '@/services/orbyt/orbytApi';
import type { OrbytProfileRecord } from '@/services/api/types';

const ORBYT_PROFILE_GC_TIME = 24 * 60 * 60 * 1000;
/** `com.getorbyt.actor.getProfiles` accepts at most 25 actors per call. */
const GET_PROFILES_MAX = 25;

/** `com.getorbyt.actor.defs#profileView` (the fields this client reads). */
interface OrbytProfileView {
  did: string;
  isOrbytUser: boolean;
  joinedAt?: string;
  isBeta?: boolean;
  colors?: { backgroundColor: string; textColor: string };
}

/** Accounts known only from the network have no Orbyt styling: cache null. */
function toRecord(view: OrbytProfileView | undefined): OrbytProfileRecord | null {
  if (!view?.isOrbytUser) return null;
  return {
    $type: 'com.getorbyt.profile',
    colors:
      view.colors?.backgroundColor && view.colors?.textColor
        ? { backgroundColor: view.colors.backgroundColor, textColor: view.colors.textColor }
        : null,
    joinDate: view.joinedAt,
  };
}

async function fetchOrbytProfileColors(did: string): Promise<OrbytProfileRecord | null> {
  try {
    const view = await orbytPublicQuery<OrbytProfileView>('com.getorbyt.actor.getProfile', {
      actor: did,
    });
    return toRecord(view);
  } catch (error) {
    if (error instanceof OrbytXrpcError && error.error === 'ProfileNotFound') return null;
    throw error;
  }
}

export async function warmOrbytProfileCache(dids: string[], qc: QueryClient): Promise<void> {
  if (!dids.length) return;
  const uncached = Array.from(new Set(dids)).filter(
    did => qc.getQueryData(queryKeys.orbytProfile.byDid(did)) === undefined
  );
  if (!uncached.length) return;

  for (let i = 0; i < uncached.length; i += GET_PROFILES_MAX) {
    const batch = uncached.slice(i, i + GET_PROFILES_MAX);
    const { profiles } = await orbytPublicQuery<{ profiles?: OrbytProfileView[] }>(
      'com.getorbyt.actor.getProfiles',
      { actors: batch }
    );
    const byDid = new Map((profiles ?? []).map(profile => [profile.did, profile]));
    for (const did of batch) {
      qc.setQueryData(queryKeys.orbytProfile.byDid(did), toRecord(byDid.get(did)));
    }
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
