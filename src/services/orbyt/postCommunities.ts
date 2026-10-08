/**
 * Which Community a post was published to, for the `/name` label on video
 * cards. Lookups made in the same tick are coalesced into one
 * `com.getorbyt.community.getPostCommunities` request (up to 100 posts), so a
 * feed page costs one call instead of one per card.
 */
import { skipToken, useQuery } from '@tanstack/react-query';

import { QUERY_CONSTANTS } from '@/utils/constants';
import { queryKeys } from '@/utils/query/queryKeys';
import { getPostCommunities } from './communities';

interface PendingLookup {
  resolve: (communityUri: string | null) => void;
  reject: (error: unknown) => void;
}

let pending = new Map<string, PendingLookup[]>();
let scheduled = false;

async function flush(): Promise<void> {
  scheduled = false;
  const batch = pending;
  pending = new Map();
  try {
    const associations = await getPostCommunities(Array.from(batch.keys()));
    for (const [postUri, waiters] of batch) {
      const communityUri = associations.get(postUri) ?? null;
      waiters.forEach(waiter => waiter.resolve(communityUri));
    }
  } catch (error) {
    for (const waiters of batch.values()) {
      waiters.forEach(waiter => waiter.reject(error));
    }
  }
}

function loadPostCommunity(postUri: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const waiters = pending.get(postUri) ?? [];
    waiters.push({ resolve, reject });
    pending.set(postUri, waiters);
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => void flush(), 0);
    }
  });
}

/** The Community URI a post belongs to, or null when it is in none. */
export function usePostCommunity(postUri: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.channels.postCommunity(postUri ?? ''),
    queryFn: postUri ? () => loadPostCommunity(postUri) : skipToken,
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG,
    gcTime: 60 * 60 * 1000,
  });
}
