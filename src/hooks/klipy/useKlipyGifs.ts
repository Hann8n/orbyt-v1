import { useInfiniteQuery } from '@tanstack/react-query';

import {
  KlipyService,
  type KlipyKind,
  type KlipyListResponse,
} from '@/services/klipy/KlipyService';
import { useUserStore } from '@/stores/userStore';
import { queryKeys } from '@/utils/query/queryKeys';

const KLIPY_BASE_URL = 'https://api.klipy.com';
const KLIPY_APP_KEY = 'mxu0qQJj0SZVNXlwUEecUkT5K0zYwBRHLkXWsFOytxzi1JU0S11VpEZiJZ0AIun6';

const klipy = new KlipyService({ baseUrl: KLIPY_BASE_URL, appKey: KLIPY_APP_KEY });

export function useKlipyTrending(kind: KlipyKind) {
  const did = useUserStore(s => s.currentUser?.did) ?? 'anonymous';

  return useInfiniteQuery<KlipyListResponse, Error>({
    queryKey: queryKeys.klipy.media.trending(did, kind),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      klipy.trending({
        customerId: did,
        kind,
        page: pageParam as number,
        perPage: 24,
      }),
    getNextPageParam: last => (last.hasNextPage ? last.page + 1 : undefined),
  });
}

export function useKlipySearch(kind: KlipyKind, q: string) {
  const did = useUserStore(s => s.currentUser?.did) ?? 'anonymous';
  const query = q.trim();

  return useInfiniteQuery<KlipyListResponse, Error>({
    queryKey: queryKeys.klipy.media.search(did, kind, query),
    initialPageParam: 1,
    enabled: query.length > 0,
    queryFn: ({ pageParam }) =>
      klipy.search({
        customerId: did,
        kind,
        query,
        page: pageParam as number,
        perPage: 24,
      }),
    getNextPageParam: last => (last.hasNextPage ? last.page + 1 : undefined),
  });
}

// Backwards-compatible GIF-only hooks
export function useKlipyTrendingGifs() {
  return useKlipyTrending('gif');
}

export function useKlipySearchGifs(q: string) {
  return useKlipySearch('gif', q);
}
