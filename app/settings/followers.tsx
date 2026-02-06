import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ListScreen from '../../src/components/ui/ListScreen';
import AtprotoService from '../../src/services/api/AtprotoService';
import { prefetchProfile } from '../../src/services/data/ProfileService';
import { useCurrentUser } from '../../src/stores/userStore';
import type { ProfileViewBasic, FollowersResponse } from '../../src/services/api/types';

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
          followers: response.followers.map((follower: ProfileViewBasic) => ({
            did: follower.did,
            handle: follower.handle,
            displayName: follower.displayName,
            avatar: follower.avatar,
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
    return data.pages.flatMap((page: FollowersResponse) => page.followers || []);
  }, [data]);

  const handleProfilePress = useCallback(
    (did: string) => {
      if (did && did.trim()) {
        const targetDid = did.trim();
        // Find profile data to get handle for prefetch
        const profile = followers.find(p => p.did === targetDid);
        // Prefetch profile with partial data
        prefetchProfile(
          queryClient,
          targetDid,
          profile
            ? {
                did: profile.did,
                handle: profile.handle,
                displayName: profile.displayName,
                avatar: profile.avatar,
              }
            : undefined
        ).finally(() => {
          navigation.navigate({
            pathname: '/profile/[did]',
            params: { did: targetDid },
          });
        });
      }
    },
    [navigation, queryClient, followers]
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
      followButtonAction="follow"
      onUserPress={handleProfilePress}
    />
  );
};

export default FollowersScreen;
