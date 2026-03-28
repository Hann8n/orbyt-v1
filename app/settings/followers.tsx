import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ListScreen from '@/components/ui/ListScreen';
import AtprotoService from '@/services/api/AtprotoService';
import { prefetchProfile } from '@/services/data/ProfileService';
import { useCurrentUser } from '@/stores/userStore';
import type { ProfileViewBasic, FollowersResponse } from '@/services/api/types';

const FollowersScreen: React.FC = () => {
  const { t } = useTranslation();
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation({ fallbackTab: 'home' });
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
          goToProfile(targetDid);
        });
      }
    },
    [goToProfile, queryClient, followers]
  );

  return (
    <ListScreen
      title={t('settings.yourFollowers')}
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
      emptyTitle={t('settings.noFollowersYet')}
      emptySubtitle={t('settings.followersEmpty')}
      showFollowButton={true}
      followButtonAction="follow"
      onUserPress={handleProfilePress}
    />
  );
};

export default FollowersScreen;
