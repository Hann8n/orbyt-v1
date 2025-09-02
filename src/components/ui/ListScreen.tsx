import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import { Avatar, Icon } from './UI';
import ListHeader from './ListHeader';
import VerificationBadge from '../features/verification/VerificationBadge';
import { useFollowMutation } from '../../services/cache/ProfileCache';

interface User {
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

interface ListScreenProps {
  title: string;
  data: User[];
  isLoading: boolean;
  error: any;
  onEndReached?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  emptyIcon: string;
  emptyTitle: string;
  emptySubtitle: string;
  showFollowButton?: boolean;
  followButtonIcon?: string;
  followButtonAction?: 'follow' | 'unfollow' | 'unblock' | 'unmute';
  onUserPress?: (handle: string) => void;
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
  followButtonIcon = 'user-plus',
  followButtonAction = 'follow',
  onUserPress,
  onActionPress,
}) => {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const [actionUsers, setActionUsers] = useState<Set<string>>(new Set());
  const followMutation = useFollowMutation();

  const handleUserPress = useCallback((handle: string) => {
    if (onUserPress) {
      onUserPress(handle);
    }
  }, [onUserPress]);

  const handleFollowAction = useCallback((user: User) => {
    if (user.handle) {
      // Handle follow/unfollow actions
      if (followButtonAction === 'follow' || followButtonAction === 'unfollow') {
        const isFollowing = followButtonAction === 'follow' ? true : false;
        
        followMutation.mutate({
          handle: user.handle,
          isFollowing
        });
      } else if (onActionPress) {
        // Handle unblock/unmute actions
        onActionPress(user);
      }
      
      // Add to action users set for visual feedback
      setActionUsers(prev => new Set(prev).add(user.handle || user.did));
      
      // Remove after 3 seconds
      setTimeout(() => {
        setActionUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(user.handle || user.did);
          return newSet;
        });
      }, 3000);
    }
  }, [followMutation, followButtonAction, onActionPress]);

  const renderUser = useCallback(({ item }: { item: User }) => (
    <View style={styles.profileItem}>
      <TouchableOpacity
        style={styles.profileTouchable}
        onPress={() => handleUserPress(item.handle)}
      >
        <Avatar 
          uri={item.avatar} 
          type="profile" 
          size={40} 
          ringColor="transparent" 
          style={styles.profileImage} 
        />
        <View style={styles.profileContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.displayName} numberOfLines={1}>
              {item.displayName || item.handle || 'Unknown user'}
            </Text>
            {item.handle && item.handle.trim() && item.handle.length > 0 && (
              <VerificationBadge 
                handle={item.handle.trim()} 
                textSize={14} 
                textColor={Colors.white} 
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
      {showFollowButton && (
        <TouchableOpacity
          style={[
            styles.followButton,
            actionUsers.has(item.handle || item.did) && styles.actionButton
          ]}
          onPress={() => handleFollowAction(item)}
        >
          {actionUsers.has(item.handle || item.did) ? (
            <Icon 
              name={followButtonAction === 'follow' ? 'checkmark' : 
                    followButtonAction === 'unfollow' ? 'user-plus' :
                    followButtonAction === 'unblock' ? 'checkmark' :
                    followButtonAction === 'unmute' ? 'checkmark' : 'checkmark'} 
              size={16} 
              color={Colors.lightGray} 
            />
          ) : (
            <Icon 
              name={followButtonIcon} 
              size={16} 
              color={Colors.lightGray} 
            />
          )}
        </TouchableOpacity>
      )}
    </View>
  ), [handleUserPress, handleFollowAction, showFollowButton, followButtonIcon, followButtonAction, actionUsers]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Icon name={emptyIcon} size={48} color={Colors.lightGray} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>{emptyTitle}</Text>
      <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
    </View>
  ), [emptyIcon, emptyTitle, emptySubtitle]);

  const renderLoading = useCallback(() => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={Colors.lightGray} />
      <Text style={styles.loadingText}>Loading {title.toLowerCase()}...</Text>
    </View>
  ), [title]);

  const renderError = useCallback(() => (
    <View style={styles.errorContainer}>
      <Icon name="alert-circle" size={48} color={Colors.lightGray} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>Failed to load {title.toLowerCase()}</Text>
      <Text style={styles.emptySubtitle}>
        Please check your connection and try again
      </Text>
    </View>
  ), [title]);

  const renderListHeader = useCallback(() => (
    <ListHeader 
      mode="sheet"
      title={title}
      showCloseButton
              onClosePress={() => navigation.back()}
      applySafeAreaTop={false}
      style={{ marginHorizontal: -5 }}
    />
  ), [title, navigation]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.black }]}>
        <FlashList
          data={[]}
          renderItem={() => null}
          keyExtractor={() => 'loading'}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderLoading}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: insets.bottom + 20 }
          ]}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.black }]}>
        <FlashList
          data={[]}
          renderItem={() => null}
          keyExtractor={() => 'error'}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderError}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: insets.bottom + 20 }
          ]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.black }]}>
      <FlashList
        data={data}
        renderItem={renderUser}
        keyExtractor={(item) => item.did}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderListHeader}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && onEndReached) {
            onEndReached();
          }
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: insets.bottom + 20 }
        ]}
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
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  profileTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  profileContent: {
    flex: 1,
    justifyContent: 'center',
  },
  displayName: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  handleText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  followButton: {
    width: 32,
    height: 32,
    borderWidth: 3,
    borderColor: Colors.lightGray,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    borderColor: Colors.red,
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
    fontFamily: 'Firma-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
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
    fontFamily: 'Firma-Medium',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  retryButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 24,
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
});

export default ListScreen;
