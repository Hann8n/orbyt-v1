import { queryOptions, skipToken, useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { QUERY_CONSTANTS } from '@/utils/constants';
import { queryKeys } from '@/utils/query/queryKeys';
import { orbytPublicQuery, OrbytXrpcError } from '@/services/orbyt/orbytApi';
import type { OrbytProfileRecord } from '@/services/api/types';

const ORBYT_PROFILE_GC_TIME = 24 * 60 * 60 * 1000;
/** `com.getorbyt.actor.getProfiles` accepts at most 25 actors per call. */
const GET_PROFILES_MAX = 25;

/**
 * `com.getorbyt.actor.defs#profileView`: Orbyt profile fields win, anything
 * absent is filled from the network profile.
 */
interface OrbytActorView {
  did: string;
  isOrbytUser: boolean;
  handle?: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  avatarVideo?: string;
  banner?: string;
  joinedAt?: string;
  isBeta?: boolean;
  showNetworkLink?: boolean;
  colors?: { backgroundColor: string; textColor: string };
  followersCount?: number;
  followsCount?: number;
}

/** Accounts known only from the network have no Orbyt styling: cache null. */
function toOrbytProfileRecord(view: OrbytActorView | null | undefined): OrbytProfileRecord | null {
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

async function fetchOrbytActor(did: string): Promise<OrbytActorView | null> {
  try {
    return await orbytPublicQuery<OrbytActorView>('com.getorbyt.actor.getProfile', {
      actor: did,
    });
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
    const { profiles } = await orbytPublicQuery<{ profiles?: OrbytActorView[] }>(
      'com.getorbyt.actor.getProfiles',
      { actors: batch }
    );
    const byDid = new Map((profiles ?? []).map(profile => [profile.did, profile]));
    for (const did of batch) {
      qc.setQueryData(queryKeys.orbytProfile.byDid(did), toOrbytProfileRecord(byDid.get(did)));
    }
  }
}

/** Profile styling (`colors`, join date) projected from `com.getorbyt.profile`. */
export function orbytProfileQueryOptions(did: string | null | undefined) {
  return queryOptions({
    queryKey: queryKeys.orbytProfile.byDid(did ?? ''),
    queryFn: did ? async () => toOrbytProfileRecord(await fetchOrbytActor(did)) : skipToken,
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG,
    gcTime: ORBYT_PROFILE_GC_TIME,
    enabled: !!did,
  });
}

export function useOrbytProfile(did: string | null | undefined) {
  return useQuery(orbytProfileQueryOptions(did));
}
