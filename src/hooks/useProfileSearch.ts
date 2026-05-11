import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { queryKeys } from '../utils/query/queryKeys';
import { ActorService } from '../services/api/actor/ActorService';

export interface UserProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface UseProfileSearchOptions {
  enabled?: boolean;
  staleTime?: number;
}

export const useProfileSearch = (
  searchQuery: string,
  options: UseProfileSearchOptions = {}
) => {
  const { enabled = true, staleTime = 30 * 1000 } = options;

  return useInfiniteQuery<
    { profiles: UserProfile[]; cursor: string | null },
    Error,
    InfiniteData<{ profiles: UserProfile[]; cursor: string | null }, string | null>,
    ReturnType<typeof queryKeys.search.profiles>,
    string | null
  >({
    queryKey: queryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return ActorService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: lastPage => lastPage?.cursor ?? null,
    initialPageParam: null,
    enabled: enabled && !!searchQuery && searchQuery.trim().length > 0,
    staleTime,
  });
};
