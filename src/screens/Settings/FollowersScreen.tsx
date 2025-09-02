import React, { useState, useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ListScreen from '../../components/ui/ListScreen';
import AtprotoService from '../../services/api/AtprotoService';
import ProfileCache from '../../services/cache/ProfileCache';
import { useCurrentUser } from '../../stores/userStore';

interface Follower {
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

const FollowersScreen: React.FC = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();


  // Query for followers
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['followers', currentUser?.did],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!currentUser?.did) throw new Error('No current user');
      
      const response = await AtprotoService.getFollowers(
        currentUser.did,
        pageParam,
        50
      );
      
      return {
        followers: response.followers.map((follower: any) => ({
          did: follower.did,
          handle: follower.handle,
          displayName: follower.displayName,
          avatar: follower.avatar,
          description: follower.description,
          viewer: follower.viewer,
          isFollowing: !!follower.viewer?.following,
        })),
        cursor: response.cursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage?.cursor ?? null,
    initialPageParam: null as string | null,
    enabled: !!currentUser?.did,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Flatten all followers from all pages
  const followers = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page: any) => page.followers || []);
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
          rootNav.navigate('AuthorProfile', { handle: target });
        }
      });
    }
  }, [navigation, queryClient]);

  return (
    <ListScreen
      title="Your followers"
      data={followers}
      isLoading={isLoading}
      error={error}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      emptyIcon="users"
      emptyTitle="No followers yet"
      emptySubtitle="When people follow you, they'll appear here"
      showFollowButton={true}
      followButtonIcon="user-plus"
      followButtonAction="follow"
      onUserPress={handleProfilePress}
    />
  );
};

export default FollowersScreen;
