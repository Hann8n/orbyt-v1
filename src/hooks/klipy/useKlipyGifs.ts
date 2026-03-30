import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';

import { getKlipyLocale, getKlipyService } from '@/services/klipy/klipyConfig';
import type { KlipyKind, KlipyListResponse } from '@/services/klipy/KlipyService';
import { useUserStore } from '@/stores/userStore';
import { queryKeys } from '@/utils/query/queryKeys';

const AD_MIN = 50;
const AD_MAX_HEIGHT = 250;

export function useKlipyTrending(kind: KlipyKind) {
  const did = useUserStore(s => s.currentUser?.did) ?? 'anonymous';
  const { width } = useWindowDimensions();
  const adDimensions = useMemo(
    () => ({
      adMinWidth: AD_MIN,
      adMaxWidth: Math.round(width),
      adMinHeight: AD_MIN,
      adMaxHeight: AD_MAX_HEIGHT,
    }),
    [width]
  );

  return useInfiniteQuery<KlipyListResponse, Error>({
    queryKey: queryKeys.klipy.media.trending(did, kind),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getKlipyService().trending({
        customerId: did,
        kind,
        page: pageParam as number,
        perPage: 24,
        locale: getKlipyLocale(),
        ...adDimensions,
      }),
    getNextPageParam: last => (last.hasNextPage ? last.page + 1 : undefined),
  });
}

export function useKlipySearch(kind: KlipyKind, q: string) {
  const did = useUserStore(s => s.currentUser?.did) ?? 'anonymous';
  const query = q.trim();
  const { width } = useWindowDimensions();
  const adDimensions = useMemo(
    () => ({
      adMinWidth: AD_MIN,
      adMaxWidth: Math.round(width),
      adMinHeight: AD_MIN,
      adMaxHeight: AD_MAX_HEIGHT,
    }),
    [width]
  );

  return useInfiniteQuery<KlipyListResponse, Error>({
    queryKey: queryKeys.klipy.media.search(did, kind, query),
    initialPageParam: 1,
    enabled: query.length > 0,
    queryFn: ({ pageParam }) =>
      getKlipyService().search({
        customerId: did,
        kind,
        query,
        page: pageParam as number,
        perPage: 24,
        locale: getKlipyLocale(),
        ...adDimensions,
      }),
    getNextPageParam: last => (last.hasNextPage ? last.page + 1 : undefined),
  });
}
