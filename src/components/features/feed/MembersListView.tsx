import React, { useCallback, useMemo } from 'react';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AtprotoService from '../../../services/api/AtprotoService';
import { Avatar, Icon } from '../../ui/UI';
import { Loading3FillIcon } from '../../ui/Icon';
import { VerificationBadge } from '../badging';
import { Colors, RetryButton } from '../../ui/UI';
import UI from '../../ui/UI';
import { formatHandle } from '../../../utils/formatting/handles';
import { isCurrentUser } from '../../../stores/profileInteractionStore';
import { useUserStore } from '../../../stores/userStore';

// Loading placeholder component for member items
const MemberItemShimmer = () => (
  <View style={styles.memberItem}>
    <View
      style={[
        styles.memberAvatar,
        {
          borderRadius: BORDER_RADIUS.LARGE,
          borderWidth: 0,
          borderColor: 'transparent',
          backgroundColor: Colors.mediumGray,
        },
      ]}
    />
    <View style={styles.memberDetails}>
      <View style={styles.memberNameRow}>
        <View
          style={{
            width: '55%',
            height: 18,
            borderRadius: BORDER_RADIUS.SMALL,
            marginBottom: 0,
            backgroundColor: Colors.mediumGray,
          }}
        />
      </View>
    </View>
  </View>
);

// Shimmer list component
const MembersListShimmer = ({ count = 8 }: { count?: number }) => (
  <View style={styles.container}>
    {Array.from({ length: count }).map((_, index) => (
      <MemberItemShimmer key={`shimmer-${index}`} />
    ))}
  </View>
);

interface Member {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  viewer?: {
    following?: string;
    followedBy?: string;
  };
  isFollowing?: boolean;
}

interface MembersListViewProps {
  channelUri: string;
  backgroundColor?: string;
  textColor?: string;
  headerComponent?: React.ReactNode;
  onMemberPress?: (member: Member) => void;
  onFollowPress?: (member: Member) => void;
  isVisible?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  ListComponent?: React.ComponentType<unknown> | null; // Optional custom list component
}

const MembersListView: React.FC<MembersListViewProps> = ({
  channelUri,
  backgroundColor = Colors.black,
  textColor = Colors.white,
  headerComponent,
  onMemberPress,
  onFollowPress,
  isVisible = true,
  onRefresh,
  isRefreshing = false,
  ListComponent,
}) => {
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useUserStore(state => state.currentUser);

  // Query for channel members (using following list of the channel creator)
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error, refetch } =
    useInfiniteQuery({
      queryKey: ['channelMembers', channelUri],
      queryFn: async ({ pageParam }: { pageParam: string | null }) => {
        // For now, we'll use the channel creator's following list
        // In the future, this could be replaced with actual channel member API

        // Validate channel URI before calling getFeedGenerator
        if (!channelUri || !channelUri.startsWith('at://')) {
          throw new Error('Invalid channel URI');
        }

        const channelDetails = await AtprotoService.getFeedGenerator(channelUri);
        if (!channelDetails?.view?.creator?.did) {
          throw new Error('Channel creator not found');
        }

        const response = await AtprotoService.getFollowing(
          channelDetails.view.creator.did,
          pageParam,
          50
        );

        return {
          members: response.following.map(follow => ({
            did: follow.did,
            handle: follow.handle,
            displayName: follow.displayName,
            avatar: follow.avatar,
            description:
              'description' in follow && typeof follow.description === 'string'
                ? follow.description
                : undefined,
            viewer: follow.viewer,
            isFollowing: !!follow.viewer?.following,
          })),
          cursor: response.cursor,
        };
      },
      getNextPageParam: lastPage => lastPage?.cursor ?? null,
      initialPageParam: null as string | null,
      enabled: !!channelUri && isVisible,
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

  // Flatten all members from all pages
  const members = useMemo(() => {
    return data?.pages.flatMap(page => page.members) || [];
  }, [data]);

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async ({ member }: { member: Member }) => {
      await AtprotoService.follow(member.did);
      return member;
    },
    onMutate: async ({ member }) => {
      // Optimistically update the UI
      queryClient.setQueryData<{ pages: Array<{ members: Member[]; cursor: string | null }> }>(
        ['channelMembers', channelUri],
        oldData => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map(page => ({
              ...page,
              members: page.members.map((m: Member) =>
                m.did === member.did
                  ? { ...m, isFollowing: true, viewer: { ...m.viewer, following: 'true' } }
                  : m
              ),
            })),
          };
        }
      );
    },
    onError: () => {
      // Revert optimistic update on error
      refetch();
    },
    onSettled: async () => {
      // React Query mutations handle cache updates automatically
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async ({ member }: { member: Member }) => {
      await AtprotoService.unfollow(member.did);
      return member;
    },
    onMutate: async ({ member }) => {
      // Optimistically update the UI
      queryClient.setQueryData<{ pages: Array<{ members: Member[]; cursor: string | null }> }>(
        ['channelMembers', channelUri],
        oldData => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map(page => ({
              ...page,
              members: page.members.map((m: Member) =>
                m.did === member.did
                  ? { ...m, isFollowing: false, viewer: { ...m.viewer, following: undefined } }
                  : m
              ),
            })),
          };
        }
      );
    },
    onError: () => {
      // Revert optimistic update on error
      refetch();
    },
    onSettled: async () => {
      // React Query mutations handle cache updates automatically
    },
  });

  // Handle member press
  const handleMemberPress = useCallback(
    (member: Member) => {
      if (onMemberPress) {
        onMemberPress(member);
      } else {
        // Navigate to profile using DID
        const targetDid = member.did?.trim();
        if (!targetDid) return;
        navigation.push({
          pathname: '/profile/[did]',
          params: { did: targetDid },
        });
      }
    },
    [onMemberPress, navigation]
  );

  // Handle follow/unfollow press
  const handleFollowPress = useCallback(
    (member: Member) => {
      // Don't allow following the current user
      if (isCurrentUser(member.did, member.handle, currentUser)) {
        return;
      }

      if (onFollowPress) {
        onFollowPress(member);
      } else {
        // Default follow/unfollow behavior
        if (member.isFollowing) {
          unfollowMutation.mutate({ member });
        } else {
          followMutation.mutate({ member });
        }
      }
    },
    [onFollowPress, unfollowMutation, followMutation, currentUser]
  );

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    try {
      await refetch();
      onRefresh?.();
    } catch (_error: unknown) {
      // ignore
    }
  }, [refetch, onRefresh]);

  // Handle end reached for pagination
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle scroll events to prevent conflicts
  const handleScrollBeginDrag = useCallback(() => {
    // This helps prevent scroll conflicts
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    // This helps prevent scroll conflicts
  }, []);

  // Handle momentum scroll end to prevent stuck scrolling
  const handleMomentumScrollEnd = useCallback(() => {
    // This helps prevent the list from getting stuck
  }, []);

  // FlashList does not require manual ref handling for scroll-to-top here

  // Render member item
  const renderMemberItem = useCallback(
    ({ item: member }: { item: Member }) => {
      const isCurrentUserProfile = isCurrentUser(member.did, member.handle, currentUser);

      return (
        <Pressable style={styles.memberItem} onPress={() => handleMemberPress(member)}>
          <Avatar
            uri={member.avatar}
            type="profile"
            size={40}
            style={[styles.memberAvatar, { borderWidth: 0, borderColor: 'transparent' }]}
          />
          <View style={styles.memberDetails}>
            <View style={styles.memberNameRow}>
              <Text style={styles.memberName} numberOfLines={1}>
                {member.displayName || formatHandle(member.handle)}
              </Text>
              <VerificationBadge handle={member.handle} textSize={14} textColor={Colors.white} />
            </View>
          </View>
          {/* Follow button would be rendered here if needed - check prevents showing for current user */}
          {onFollowPress && !isCurrentUserProfile && (
            <Pressable
              style={[styles.followButton, { borderColor: textColor }]}
              onPress={() => handleFollowPress(member)}
            >
              <Text style={[styles.followButtonText, { color: textColor }]}>
                {member.isFollowing ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          )}
        </Pressable>
      );
    },
    [handleMemberPress, handleFollowPress, onFollowPress, currentUser, textColor]
  );

  // Render loading item
  const renderLoadingItem = useCallback(
    () => (
      <View style={styles.loadingItem}>
        <Loading3FillIcon size={24} color={textColor} />
        <Text style={[styles.loadingText, { color: textColor }]}>Loading more members...</Text>
      </View>
    ),
    [textColor]
  );

  // Render empty state
  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Icon name="users" size={48} color={hexToRGBA(textColor, 0.5)} />
        <Text style={[styles.emptyTitle, { color: textColor }]}>No members found</Text>
        <Text style={[styles.emptyDescription, { color: hexToRGBA(textColor, 0.67) }]}>
          This channel doesn{"'"}t have any members yet.
        </Text>
      </View>
    ),
    [textColor]
  );

  // Render error state
  const renderErrorState = useCallback(
    () => (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={48} color={UI.Colors.STATUS.ERROR} />
        <Text style={[styles.errorTitle, { color: textColor }]}>Failed to load members</Text>
        <Text style={[styles.errorDescription, { color: hexToRGBA(textColor, 0.67) }]}>
          Please try again later.
        </Text>
        <RetryButton onPress={handleRefresh} />
      </View>
    ),
    [textColor, handleRefresh]
  );

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        {headerComponent}
        {renderErrorState()}
      </View>
    );
  }

  // Show shimmer while loading
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        {headerComponent}
        <MembersListShimmer count={8} />
      </View>
    );
  }

  const ListEl = ListComponent || FlashList;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ListEl
        data={members}
        renderItem={renderMemberItem}
        keyExtractor={(item: Member) => item.did}
        ListHeaderComponent={headerComponent ? <View>{headerComponent}</View> : null}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        ListFooterComponent={isFetchingNextPage ? renderLoadingItem : null}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={textColor}
            progressViewOffset={0}
            progressBackgroundColor="transparent"
            colors={[textColor]}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        removeClippedSubviews={false}
        contentContainerStyle={[styles.contentContainer, members.length === 0 && { flex: 1 }]}
        style={styles.list}
      />
    </View>
  );
};

// Helper function for hex to rgba conversion
const hexToRGBA = (hex: string, alpha: number): string => {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map(c => c + c)
      .join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    backgroundColor: Colors.black,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  memberDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  memberName: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 0,
    fontFamily: 'Figtree-Bold',
    flexShrink: 1,
  },
  memberDescription: {
    fontSize: 13,
    fontFamily: 'Figtree-Regular',
    lineHeight: 18,
  },
  followButton: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
  },
  loadingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
});

export default MembersListView;
