import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ListScreen from '../../src/components/ui/ListScreen';
import AtprotoService from '../../src/services/api/AtprotoService';
import ProfileCache from '../../src/services/cache/ProfileCache';
import { useCurrentUser } from '../../src/stores/userStore';

interface Following {
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

const FollowingScreen: React.FC = () => {
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();


  // Query for following
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['following', currentUser?.did],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!currentUser?.did) throw new Error('No current user');
      
      const response = await AtprotoService.getFollowing(
        currentUser.did,
        pageParam,
        50
      );
      
      return {
        following: response.following.map((following: any) => ({
          did: following.did,
          handle: following.handle,
          displayName: following.displayName,
          avatar: following.avatar,
          description: following.description,
          viewer: following.viewer,
          isFollowing: !!following.viewer?.following,
        })),
        cursor: response.cursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage?.cursor ?? null,
    initialPageParam: null as string | null,
    enabled: !!currentUser?.did,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Flatten all following from all pages
  const following = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page: any) => page.following || []);
  }, [data]);



  const handleProfilePress = useCallback((handle: string) => {
    if (handle && handle.trim()) {
      queryClient.prefetchQuery({
        queryKey: ProfileCache.getQueryKey(handle.trim()),
        queryFn: () => ProfileCache.getProfile(handle.trim()),
        staleTime: ProfileCache.cacheExpiry,
      }).finally(() => {
        const target = handle.trim();
        if (target) {
          let rootNav: any = navigation as any;
          while (rootNav?.getParent?.()) {
            rootNav = rootNav.getParent();
          }
          navigation.push({
            pathname: '/profile/[did]',
            params: { did: target }
          });
        }
      });
    }
  }, [navigation, queryClient]);

  return (
    <ListScreen
      title="People you follow"
      data={following}
      isLoading={isLoading}
      error={error}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      emptyIcon="user-plus"
      emptyTitle="Not following anyone yet"
      emptySubtitle="When you follow people, they'll appear here"
      showFollowButton={true}
      followButtonIcon="user-check"
      followButtonAction="unfollow"
      onUserPress={handleProfilePress}
    />
  );
};

export default FollowingScreen;
