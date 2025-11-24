import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import { useCurrentUser } from '../stores/userStore';

export interface UserListItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  viewer?: {
    following?: string;
  };
  isFollowing?: boolean;
}

type UserListType = 'followers' | 'following';

interface UseUserListOptions {
  type: UserListType;
  pageSize?: number;
}

export const useUserList = ({ type, pageSize = 50 }: UseUserListOptions) => {
  const { currentUser } = useCurrentUser();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: [type, currentUser?.did],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!currentUser?.did) throw new Error('No current user');
      
      const fetchFn = type === 'followers' 
        ? AtprotoService.getFollowers 
        : AtprotoService.getFollowing;
      
      const response = await fetchFn(currentUser.did, pageParam, pageSize);
      
      const userKey = type === 'followers' ? 'followers' : 'following';
      
      return {
        users: response[userKey].map((user: any) => ({
          did: user.did,
          handle: user.handle,
          displayName: user.displayName,
          avatar: user.avatar,
          description: user.description,
          viewer: user.viewer,
          isFollowing: !!user.viewer?.following,
        })),
        cursor: response.cursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage?.cursor ?? null,
    initialPageParam: null as string | null,
    enabled: !!currentUser?.did,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const users = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page: any) => page.users || []);
  }, [data]);

  return {
    users,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  };
};
