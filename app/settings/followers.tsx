import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ListScreen from '../../src/components/ui/ListScreen';
import AtprotoService from '../../src/services/api/AtprotoService';
import { prefetchProfile } from '../../src/services/data/ProfileService';
import { useCurrentUser } from '../../src/stores/userStore';

const FollowersScreen: React.FC = () => {
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  // Query for followers
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } =
    useInfiniteQuery({
      queryKey: ['followers', currentUser?.did],
      queryFn: async ({ pageParam }: { pageParam: string | null }) => {
        if (!currentUser?.did) throw new Error('No current user');

        const response = await AtprotoService.getFollowers(currentUser.did, pageParam, 50);

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
      getNextPageParam: lastPage => lastPage?.cursor ?? null,
      initialPageParam: null as string | null,
      enabled: !!currentUser?.did,
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

  // Flatten all followers from all pages
  const followers = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page: any) => page.followers || []);
  }, [data]);

  const handleProfilePress = useCallback(
    (handle: string) => {
      if (handle && handle.trim()) {
        const target = handle.trim();
        // Prefetch profile (no partial data needed here)
        prefetchProfile(queryClient, target).finally(() => {
          let rootNav: any = navigation as any;
          while (rootNav?.getParent?.()) {
            rootNav = rootNav.getParent();
          }
          navigation.push({
            pathname: '/profile/[did]',
            params: { did: target },
          });
        });
      }
    },
    [navigation, queryClient]
  );

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
