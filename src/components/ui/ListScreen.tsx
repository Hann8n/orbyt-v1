import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../utils/constants';
import { Colors } from './UI';
import { Icon } from './UI';
import { Loading3FillIcon, MinusFillIcon } from './Icon';
import ListHeader from './ListHeader';
import AuthorItem from './AuthorItem';
import { useFollowMutation } from '../../services/data/ProfileService';
import { isCurrentUser } from '../../stores/profileInteractionStore';
import { useUserStore } from '../../stores/userStore';

interface User {
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
  isChannel?: boolean;
  uri?: string;
}

interface ListScreenProps {
  title: string;
  data: User[];
  isLoading: boolean;
  error: Error | null;
  onEndReached?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  emptyIcon: string;
  emptyTitle: string;
  emptySubtitle: string;
  showFollowButton?: boolean;
  followButtonAction?: 'follow' | 'unfollow' | 'unblock' | 'unmute';
  onUserPress?: (did: string) => void;
  onActionPress?: (user: User) => void;
}

const ListScreen: React.FC<ListScreenProps> = ({
  title,
  data,
  isLoading,
  error,
  onEndReached,
  hasNextPage,
  isFetchingNextPage,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  showFollowButton = true,
  followButtonAction = 'follow',
  onUserPress,
  onActionPress,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const followMutation = useFollowMutation();
  const currentUser = useUserStore(state => state.currentUser);

  const handleUserPress = useCallback(
    (did: string) => {
      if (onUserPress) {
        onUserPress(did);
      }
    },
    [onUserPress]
  );

  const handleFollowPress = useCallback(
    (user: User) => {
      if (user.handle) {
        // Handle follow/unfollow actions
        if (followButtonAction === 'follow' || followButtonAction === 'unfollow') {
          const isFollowing = followButtonAction === 'follow' ? true : false;

          followMutation.mutate({
            did: user.did,
            handle: user.handle,
            isFollowing,
          });
        } else if (onActionPress) {
          // Handle unblock/unmute actions
          onActionPress(user);
        }
      }
    },
    [followMutation, followButtonAction, onActionPress]
  );

  const renderUser = useCallback(
    ({ item }: { item: User }) => {
      const isCurrentUserProfile = isCurrentUser(item.did, item.handle, currentUser);
      const shouldShowFollowButton = showFollowButton && !isCurrentUserProfile;
      const isFollowing = item.isFollowing || !!item.viewer?.following;
      const isActionButton = followButtonAction === 'unblock' || followButtonAction === 'unmute';

      return (
        <View style={styles.userItemContainer}>
          <AuthorItem
            handle={item.handle}
            did={item.did}
            displayName={item.displayName}
            avatar={item.avatar}
            size="large"
            showArrow={false}
            showFollowButton={shouldShowFollowButton && !isActionButton}
            isFollowing={isFollowing}
            onFollowPress={() => handleFollowPress(item)}
            backgroundColor={Colors.transparent}
            nameFontWeight="Figtree-SemiBold"
            customFontSize={16}
            style={styles.authorItem}
            onPress={() => handleUserPress(item.did)}
          />
          {shouldShowFollowButton && isActionButton && (
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.8 }]}
              onPress={() => handleFollowPress(item)}
            >
              <MinusFillIcon size={16} color={Colors.black} />
            </Pressable>
          )}
        </View>
      );
    },
    [handleUserPress, handleFollowPress, showFollowButton, followButtonAction, currentUser]
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Icon name={emptyIcon} size={48} color={Colors.lightGray} style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
      </View>
    ),
    [emptyIcon, emptyTitle, emptySubtitle]
  );

  const renderLoading = useCallback(
    () => (
      <View style={styles.loadingContainer}>
        <Loading3FillIcon size={48} color={Colors.lightGray} />
        <Text style={styles.loadingText}>Loading {title.toLowerCase()}...</Text>
      </View>
    ),
    [title]
  );

  const renderError = useCallback(
    () => (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={48} color={Colors.lightGray} style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>Failed to load {title.toLowerCase()}</Text>
        <Text style={styles.emptySubtitle}>Please check your connection and try again</Text>
      </View>
    ),
    [title]
  );

  const renderListHeader = useCallback(
    () => (
      <ListHeader
        mode="sheet"
        title={title}
        showCloseButton
        onClosePress={() => router.back()}
        applySafeAreaTop={false}
        backgroundColor={Colors.black}
        titleIndent={true}
      />
    ),
    [title, router]
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.black }]}>
        {renderListHeader()}
        <FlashList
          data={[]}
          renderItem={() => null}
          keyExtractor={() => 'loading'}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderLoading}
          contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 20 }]}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.black }]}>
        {renderListHeader()}
        <FlashList
          data={[]}
          renderItem={() => null}
          keyExtractor={() => 'error'}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderError}
          contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 20 }]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.black }]}>
      {renderListHeader()}
      <FlashList
        data={data}
        renderItem={renderUser}
        keyExtractor={item => item.did}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && onEndReached) {
            onEndReached();
          }
        }}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 20 }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    paddingTop: 0,
  },
  userItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 0,
    borderRadius: 0,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderWidth: 0,
    borderColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.8,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontFamily: 'Figtree-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
});

export default ListScreen;
