import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../src/services/api/AtprotoService';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import ProfileCache, { profileKeys } from '../../src/services/cache/ProfileCache';
import { Avatar, Icon, Colors } from '../../src/components/ui/UI';
import { NotificationIcon } from '../../src/components/ui/Icon';
import VerificationBadge from '../../src/components/features/verification/VerificationBadge';
import { getBottomNavBarHeight } from '../../src/utils/helpers';
 

const NotificationShimmer = () => (
  <View style={styles.notificationItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.profileImage, { borderWidth: 0, borderColor: 'transparent' }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.notificationContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: '40%', height: 16, marginBottom: 4, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: '55%', height: 16, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
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


const NotificationScreen: React.FC = () => {
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
        console.error('Error initializing profile cache:', error);
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

  // No automatic refresh on focus - only on first load and manual refresh

  // Flatten notifications from all pages
  const notifications = useMemo(() => {
    return data?.pages.flatMap(page => page.notifications) || [];
  }, [data]);
  
  // Batch prefetch all author profiles for better performance
  useEffect(() => {
    if (notifications.length > 0) {
      // Extract all unique profiles from notifications and batch prefetch them
      ProfileCache.batchPrefetchFromFeed(notifications).catch(error => {
        console.warn('Error batch prefetching notification profiles:', error);
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

  // Create shimmer placeholders based on estimated count
  const shimmerItems = useMemo(() => {
    return Array(15).fill(0);
  }, []);

  // Header component for the list
  const ListHeaderComponent = () => (
    <View style={styles.listHeader}>
      <NotificationIcon 
        size={24} 
        color={Colors.white} 
      />
      <Text style={styles.header}>activity</Text>
    </View>
  );

  if (isError) {
    return (
      <View style={[styles.container, Platform.OS === 'android' ? { paddingTop: 0 } : null]}>
        <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

        {/* Status bar gradient overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.3)', 'transparent']}
          locations={[0, 0.7, 1]}
          style={[styles.topGradient, { top: 0, height: insets.top + 30 }]}
          pointerEvents="none"
        />

        <View style={[styles.errorContainer, { paddingTop: insets.top + 20, paddingBottom: bottomNavBarHeight }]}>
          <ListHeaderComponent />
          <View style={styles.errorContent}>
            <Text style={styles.errorText}>
              something went wrong loading notifications.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryButtonText}>try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, Platform.OS === 'android' ? { paddingTop: 0 } : null]}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

      {/* Status bar gradient overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.3)', 'transparent']}
        locations={[0, 0.7, 1]}
        style={[styles.topGradient, { top: 0, height: insets.top + 30 }]}
        pointerEvents="none"
      />
      
      {/* Content */}
      <FlatList
        style={styles.listContainer}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: bottomNavBarHeight + 5,
        }}
        data={isLoading ? shimmerItems : notifications}
        renderItem={isLoading ? () => <NotificationShimmer /> : renderNotificationContent}
        keyExtractor={(item, index) => isLoading ? `shimmer-${index}` : item.uri || `notification-${index}`}
        ListHeaderComponent={() => (
          <View style={{ paddingTop: insets.top + 10 }}>
            <ListHeaderComponent />
          </View>
        )}
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
                console.error('Failed to refetch notifications:', error);
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
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>no video activity yet</Text>
          </View>
        ) : null}
        ListFooterComponent={isFetchingNextPage ? (
          <View style={styles.loadingMoreContainer}>
            <ActivityIndicator size="small" color={Colors.white} />
          </View>
        ) : null}
      />
    </View>
  );
};

export default NotificationScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  topGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 100,
    zIndex: 5,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 10,
  },
  header: {
    color: Colors.white,
    fontSize: 30,
    fontFamily: 'Firma-Bold',
    marginLeft: 8,
  },
  headerIcon: {
    width: 24,
    height: 24,
  },
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
  errorContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: Colors.white,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'Firma-Medium',
  },
  retryButton: {
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.LARGE,
  },
  retryButtonText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-Bold',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
  loadingMoreContainer: {
    padding: 20,
    alignItems: 'center',
  },
});

