import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import ProfileCache, { profileKeys } from '../../../services/cache/ProfileCache';
import { Avatar, Icon, Colors } from '../../../components/ui/UI';
import { Loading3FillIcon } from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight } from '../../../utils/helpers';

// Import radar.gif for empty notifications state
const RadarGif = require('../../../assets/radar.gif');

// Custom empty state for notifications
const EmptyNotifications = () => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyContent}>
      <Image source={RadarGif} style={styles.radarGif} />
       <Text style={styles.emptyText}>no recent notifications</Text>
    </View>
  </View>
);

const NotificationLoading = () => (
  <View style={styles.loadingContainer}>
    <Loading3FillIcon size={48} color={Colors.white} />
  </View>
);

// Helper function to check if a notification is video-related or profile-related
const isVideoOrProfileNotification = (notification: any): boolean => {
  if (!notification) return false;
  
  const { reason, record, post } = notification;
  
  // Profile-related: follow notifications
  if (reason === 'follow') {
    return true;
  }
  
  // Check video-related post records
  const hasVideoContent = (record: any): boolean => {
    return record?.embed?.images?.length > 0 || 
           record?.embed?.media?.type === 'video';
  };
  
  // Check if post or embedding entity contains video
  const hasVideoEmbed = post?.embed?.images?.length > 0 || 
                        post?.embed?.media?.type === 'video' ||
                        hasVideoContent(record) || 
                        post?.embed?.record?.embed?.images?.length > 0 ||
                        post?.embed?.record?.embed?.media?.type === 'video';
  
  // Video interaction notifications: likes, reposts, replies to videos, quotes
  if (['like', 'repost', 'reply', 'quote'].includes(reason) && hasVideoEmbed) {
    return true;
  }
  
  // Mentions in video captions
  if (reason === 'mention' && hasVideoEmbed) {
    return true;
  }
  
  return false;
};

const NotificationsTab: React.FC = () => {
  const navigation = useRouter();
  const [isScrolling, setIsScrolling] = useState(false);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Initialize current user for ProfileCache on mount
  useEffect(() => {
    const initializeCache = async () => {
      try {
        const currentUser = await AtprotoService.getCurrentUser();
        if (currentUser?.did) {
          ProfileCache.setCurrentUserHandle(currentUser.handle);
        }
      } catch (error) {
      }
    };
    
    initializeCache();
  }, []);

  // Improved infinite query implementation with filtering
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['notifications', 'video-profile'],
    queryFn: async ({ pageParam }) => {
      const response = await AtprotoService.listNotifications(pageParam as string | null);
      
      // Filter notifications server-side if possible
      const filteredResponse = {
        notifications: response.notifications.filter(isVideoOrProfileNotification),
        cursor: response.cursor
      };
      
      return filteredResponse;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Flatten notifications from all pages
  const notifications = useMemo(() => {
    return data?.pages.flatMap(page => page.notifications) || [];
  }, [data]);
  
  // Batch prefetch all author profiles for better performance
  useEffect(() => {
    if (notifications.length > 0) {
      // Extract all unique profiles from notifications and batch prefetch them
      ProfileCache.batchPrefetchFromFeed(notifications).catch(error => {
      });
    }
  }, [notifications]);

  const renderNotificationContent = useCallback(({ item }: { item: any }) => {
    const { reason, author, post } = item;
    
    let actionText = '';
    switch (reason) {
      case 'like':
        actionText = 'liked your post';
        break;
      case 'repost':
        actionText = 'reshared your post';
        break;
      case 'follow':
        actionText = 'followed you';
        break;
      case 'mention':
        actionText = 'mentioned you';
        break;
      case 'reply':
        actionText = 'replied to your post';
        break;
      default:
        actionText = `performed action: ${reason}`;
    }

    return (
      <TouchableOpacity
        style={styles.notificationItem}
        onPress={() => {
          if (author?.handle) {
            const handle = author.handle.trim();
            // Prefetch profile using React Query before navigation
            queryClient.prefetchQuery({
              queryKey: profileKeys.detail(handle),
              queryFn: () => ProfileCache.getProfile(handle),
              staleTime: ProfileCache.cacheExpiry
                                    }).finally(() => {
                          // Navigate regardless of prefetch success
                          const target = handle.trim();
                          if (target) { navigation.push(`/profile/${target}`); }
                        });
          }
        }}
      >
        <Avatar
          uri={author?.avatar}
          type="profile"
          size={40}
          style={styles.profileImage}
        />
        <View style={styles.notificationContent}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={styles.authorName}>
              {author.displayName || author.handle || 'Unknown user'}
            </Text>
            {author.handle && (
              <VerificationBadge 
                handle={author.handle} 
                textSize={14} 
                textColor={Colors.white}
              />
            )}
          </View>
          <Text style={styles.actionText}>
            {actionText}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  const handleScrollBeginDrag = useCallback(() => {
    setIsScrolling(true);
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    setTimeout(() => setIsScrolling(false), 200);
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    setTimeout(() => setIsScrolling(false), 100);
  }, []);

  // Improved preloadNextPage logic similar to CommentSection
  const preloadNextPage = useCallback(
    (currentOffset: number, contentHeight: number, containerHeight: number) => {
      const isCloseToBottom = (contentHeight - currentOffset - containerHeight) / contentHeight < 0.25;
      if (isCloseToBottom && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  // Optimized viewabilityConfig
  const viewabilityConfig = useMemo(
    () => ({
      viewAreaCoveragePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    []
  );

  // Create loading items for initial load
  const loadingItems = useMemo(() => {
    return Array(1).fill(0); // Just show one loading spinner
  }, []);

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <EmptyFeed 
          type="no-connection" 
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.listContainer}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: bottomNavBarHeight + 5,
      }}
      data={isLoading ? loadingItems : notifications}
      renderItem={isLoading ? () => <NotificationLoading /> : renderNotificationContent}
      keyExtractor={(item, index) => isLoading ? `loading-${index}` : item.uri || `notification-${index}`}
      onScroll={({ nativeEvent }) => {
        const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
        preloadNextPage(contentOffset.y, contentSize.height, layoutMeasurement.height);
      }}
      scrollEventThrottle={16}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={async () => {
            try {
              await refetch();
            } catch (error) {
            }
          }}
          tintColor={Colors.white}
        />
      }
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={Platform.OS === 'android'}
      maxToRenderPerBatch={10}
      windowSize={21}
      initialNumToRender={15}
      updateCellsBatchingPeriod={30}
      maintainVisibleContentPosition={{ 
        minIndexForVisible: 0, 
        autoscrollToTopThreshold: undefined 
      }}
      viewabilityConfig={viewabilityConfig}
      ListEmptyComponent={!isLoading ? (
        <EmptyNotifications />
      ) : null}
      ListFooterComponent={isFetchingNextPage ? (
        <View style={styles.loadingMoreContainer}>
          <Loading3FillIcon size={24} color={Colors.white} />
        </View>
      ) : null}
    />
  );
};

export default NotificationsTab;

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  authorName: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
  },
  actionText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  errorContainer: {
    flex: 1,
    padding: 20,
  },
  loadingMoreContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100, // Space below header
    paddingBottom: 100, // Space above bottom nav bar
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  emptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarGif: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
});
