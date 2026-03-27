import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import ListScreen from '@/components/ui/ListScreen';
import AtprotoService from '@/services/api/AtprotoService';
import { prefetchProfile } from '@/services/data/ProfileService';
import { useCurrentUser } from '@/stores/userStore';
import type { ProfileViewBasic } from '@/services/api/types';

interface FollowingPage {
  following: Array<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    viewer?: {
      following?: string;
    };
    isFollowing?: boolean;
  }>;
  cursor: string | null;
}

const FollowingScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  // Query for following
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } =
    useInfiniteQuery({
      queryKey: ['following', currentUser?.did],
      queryFn: async ({ pageParam }: { pageParam: string | null }) => {
        if (!currentUser?.did) throw new Error('No current user');

        const response = await AtprotoService.getFollowing(currentUser.did, pageParam, 50);

        return {
          following: response.following.map((following: ProfileViewBasic) => ({
            did: following.did,
            handle: following.handle,
            displayName: following.displayName,
            avatar: following.avatar,
            viewer: following.viewer,
            isFollowing: !!following.viewer?.following,
          })),
          cursor: response.cursor,
        };
      },
      getNextPageParam: lastPage => lastPage?.cursor ?? null,
      initialPageParam: null as string | null,
      enabled: !!currentUser?.did,
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

  // Flatten all following from all pages
  const following = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page: FollowingPage) => page.following || []);
  }, [data]);

  const handleProfilePress = useCallback(
    (did: string) => {
      if (did && did.trim()) {
        const targetDid = did.trim();
        // Find profile data to get handle for prefetch
        const profile = following.find(p => p.did === targetDid);
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
    [navigation, queryClient, following]
  );

  return (
    <ListScreen
      title={t('settings.peopleYouFollow')}
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
      emptyTitle={t('settings.noFollowingYet')}
      emptySubtitle={t('settings.followingEmpty')}
      showFollowButton={true}
      followButtonAction="unfollow"
      onUserPress={handleProfilePress}
    />
  );
};

export default FollowingScreen;
