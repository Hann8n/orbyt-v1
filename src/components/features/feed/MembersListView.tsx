import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AtprotoService from '../../../services/api/AtprotoService';
import { Avatar, Icon } from '../../ui/UI';
import VerificationBadge from '../verification/VerificationBadge';
import ProfileCache from '../../../services/cache/ProfileCache';
import { Colors } from '../../ui/UI';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
}

const MembersListView: React.FC<MembersListViewProps> = ({
  channelUri,
  backgroundColor = Colors.BACKGROUND.PRIMARY,
  textColor = Colors.TEXT.PRIMARY,
  headerComponent,
  onMemberPress,
  onFollowPress,
  isVisible = true,
  onRefresh,
  isRefreshing = false,
}) => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Query for channel members (using following list of the channel creator)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['channelMembers', channelUri],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      // For now, we'll use the channel creator's following list
      // In the future, this could be replaced with actual channel member API
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
        members: response.following.map((follow: any) => ({
          did: follow.did,
          handle: follow.handle,
          displayName: follow.displayName,
          avatar: follow.avatar,
          description: follow.description,
          viewer: follow.viewer,
          isFollowing: !!follow.viewer?.following,
        })),
        cursor: response.cursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage?.cursor ?? null,
    initialPageParam: null as string | null,
    enabled: !!channelUri && isVisible,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Flatten all members from all pages
  const members = useMemo(() => {
    return data?.pages.flatMap((page: any) => page.members) || [];
  }, [data]);

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async ({ member }: { member: Member }) => {
      await AtprotoService.follow(member.did);
      return member;
    },
    onMutate: async ({ member }) => {
      // Optimistically update the UI
      queryClient.setQueryData(['channelMembers', channelUri], (oldData: any) => {
        if (!oldData) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            members: page.members.map((m: Member) => 
              m.did === member.did 
                ? { ...m, isFollowing: true, viewer: { ...m.viewer, following: 'true' } }
                : m
            )
          }))
        };
      });
    },
    onError: (_, __, context) => {
      // Revert optimistic update on error
      refetch();
    },
    onSettled: async (member) => {
      if (member) {
        const freshProfile = await AtprotoService.getProfile(member.handle);
        await ProfileCache.updateFollowingStatus(
          member.handle, 
          !!freshProfile?.viewer?.following
        );
      }
    }
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async ({ member }: { member: Member }) => {
      await AtprotoService.unfollow(member.did);
      return member;
    },
    onMutate: async ({ member }) => {
      // Optimistically update the UI
      queryClient.setQueryData(['channelMembers', channelUri], (oldData: any) => {
        if (!oldData) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            members: page.members.map((m: Member) => 
              m.did === member.did 
                ? { ...m, isFollowing: false, viewer: { ...m.viewer, following: undefined } }
                : m
            )
          }))
        };
      });
    },
    onError: (_, __, context) => {
      // Revert optimistic update on error
      refetch();
    },
    onSettled: async (member) => {
      if (member) {
        const freshProfile = await AtprotoService.getProfile(member.handle);
        await ProfileCache.updateFollowingStatus(
          member.handle, 
          !!freshProfile?.viewer?.following
        );
      }
    }
  });

  // Handle member press
  const handleMemberPress = useCallback((member: Member) => {
    if (onMemberPress) {
      onMemberPress(member);
    } else {
      // Navigate to profile
      navigation.navigate('AuthorProfile', { handle: member.handle });
    }
  }, [onMemberPress, navigation]);

  // Handle follow/unfollow press
  const handleFollowPress = useCallback((member: Member) => {
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
  }, [onFollowPress, unfollowMutation, followMutation]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    await refetch();
    onRefresh?.();
  }, [refetch, onRefresh]);

  // Handle end reached for pagination
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Render member item
  const renderMemberItem = useCallback(({ item: member }: { item: Member }) => {
    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => handleMemberPress(member)}
        activeOpacity={0.7}
      >
        <Avatar
          uri={member.avatar}
          type="profile"
          size={40}
          style={styles.memberAvatar}
        />
        <View style={styles.memberDetails}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.displayName || member.handle}
            </Text>
            <VerificationBadge
              handle={member.handle}
              size={12}
              style={styles.verificationBadge}
              textColor={Colors.TEXT.PRIMARY}
            />
          </View>
          <Text style={styles.memberHandle}>
            @{member.handle}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [handleMemberPress]);

  // Render loading item
  const renderLoadingItem = useCallback(() => (
    <View style={styles.loadingItem}>
      <ActivityIndicator size="small" color={textColor} />
      <Text style={[styles.loadingText, { color: textColor }]}>
        Loading more members...
      </Text>
    </View>
  ), [textColor]);

  // Render empty state
  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Icon name="users" size={48} color={hexToRGBA(textColor, 0.5)} />
      <Text style={[styles.emptyTitle, { color: textColor }]}>
        No members found
      </Text>
      <Text style={[styles.emptyDescription, { color: hexToRGBA(textColor, 0.67) }]}>
        This channel doesn't have any members yet.
      </Text>
    </View>
  ), [textColor]);

  // Render error state
  const renderErrorState = useCallback(() => (
    <View style={styles.errorContainer}>
      <Icon name="alert-circle" size={48} color={Colors.STATUS.ERROR} />
      <Text style={[styles.errorTitle, { color: textColor }]}>
        Failed to load members
      </Text>
      <Text style={[styles.errorDescription, { color: hexToRGBA(textColor, 0.67) }]}>
        Please try again later.
      </Text>
      <TouchableOpacity
        style={[styles.retryButton, { borderColor: textColor }]}
        onPress={handleRefresh}
      >
        <Text style={[styles.retryButtonText, { color: textColor }]}>
          Retry
        </Text>
      </TouchableOpacity>
    </View>
  ), [textColor, handleRefresh]);

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        {headerComponent}
        {renderErrorState()}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <FlatList
        data={members}
        renderItem={renderMemberItem}
        keyExtractor={(item) => item.did}
        ListHeaderComponent={headerComponent ? <View>{headerComponent}</View> : null}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        ListFooterComponent={
          isFetchingNextPage ? renderLoadingItem : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={textColor}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: insets.top },
          members.length === 0 && { flex: 1 }
        ]}
        style={styles.list}
      />
    </View>
  );
};

// Helper function for hex to rgba conversion
const hexToRGBA = (hex: string, alpha: number): string => {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
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
  },
  contentContainer: {
    paddingBottom: 20,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.BORDER.PRIMARY,
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER.PRIMARY,
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
    color: Colors.TEXT.PRIMARY,
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  verificationBadge: {
    marginLeft: 4,
  },
  memberHandle: {
    color: Colors.TEXT.LIGHT_GREY,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  memberDescription: {
    fontSize: 13,
    fontFamily: 'Firma-Regular',
    lineHeight: 18,
  },
  followButton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  loadingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Firma-Regular',
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
    fontFamily: 'Firma-SemiBold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    fontFamily: 'Firma-Regular',
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
    fontFamily: 'Firma-SemiBold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
});

export default MembersListView;

