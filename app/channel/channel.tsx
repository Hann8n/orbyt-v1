import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, StyleSheet, Dimensions, Pressable, Text, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import ChannelHeader from '../../src/components/layout/header/ChannelHeader';
import TabNavigation, { TabOption } from '../../src/components/layout/header/TabNavigation';
import DetailScreenOverlay from '../../src/components/layout/detail/DetailScreenOverlay';
import { HeaderActionButton } from '../../src/components/layout/header/UniversalHeader';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { Colors } from '../../src/theme';

import {
  useChannelColors,
  useChannel,
  useChannelColorsMutation,
} from '../../src/services/data/ChannelService';
import ProfileService from '../../src/services/data/ProfileService';
import { extractColorsFromImage } from '../../src/utils/formatting/colors';
import Icon from '../../src/components/ui/Icon';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
import { useDetailScreenOverlay } from '../../src/hooks/useDetailScreenOverlay';
import { isOrbytChannel, getChannelByUri, channelToHashtag } from '../../src/utils/channels/orbyt';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../src/utils/logger';
import type { ListFeedViewRef, ViewMode } from '../../src/types';

const Channel: React.FC = memo(() => {
  const router = useRouter();
  const params = useLocalSearchParams();
  useVisibilityRouteTracker('channel');
  const isRouteFocused = useVisibilityRouteIsActive('channel');
  const insets = useSafeAreaInsets();

  const uriParam = (params.id as string) || '';
  const uri = uriParam ? decodeURIComponent(uriParam) : '';

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  const {
    data: channelData,
    isLoading: isLoadingChannel,
    error: channelError,
    refetch: refetchChannel,
  } = useChannel(uri || '');

  const { colors: channelColors } = useChannelColors(uri || '');
  const colorsMutation = useChannelColorsMutation();

  const defaultTop = (typeof insets?.top === 'number' ? insets.top : 0) + 5;
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const overlayScrollProgressSV = useSharedValue(0);
  const contentScrollProgressSV = viewMode === 'list' ? overlayScrollProgressSV : undefined;
  const {
    isModal,
    headerPaddingTop,
    actionButtonsTop,
    showBackButton,
    overlayAnimatedStyle,
    backIconPrimaryStyle,
    backIconSecondaryStyle,
  } = useDetailScreenOverlay(uri, defaultTop, contentScrollProgressSV);
  const baseBackTextColor = channelColors.textColor || Colors.neutral[50];
  const channelFeedRef = useRef<ListFeedViewRef | null>(null);
  // Check if this is a category channel (hashtag feed) - postable orbyt channels
  const isCategoryChannel = useMemo(() => {
    if (!uri || !isOrbytChannel(uri)) return false;
    const channel = getChannelByUri(uri);
    return channel?.isPostable !== false; // Default to true, only false for non-postable channels
  }, [uri]);

  // Construct feed options for tabs (only for category channels)
  const feedOptions = useMemo(() => {
    if (!isCategoryChannel || !uri) {
      return { top: uri || '', latest: uri || '' };
    }

    const hashtagOption = channelToHashtag(uri);
    if (!hashtagOption) {
      return { top: uri, latest: uri };
    }

    return {
      top: `${hashtagOption}:top`,
      latest: `${hashtagOption}:latest`,
    };
  }, [isCategoryChannel, uri]);

  // Get current feed option based on active tab
  const feedOption = useMemo(() => {
    if (!isCategoryChannel) {
      return uri || '';
    }
    return activeTab === 0 ? feedOptions.top : feedOptions.latest;
  }, [isCategoryChannel, uri, activeTab, feedOptions]);

  const channelDataForFeed = channelData;

  // Memoized query options - enabled when route focused and feedOption is available
  // For category channels, only enable the active tab
  const queryOptions = useMemo(
    () => ({
      enabled: Boolean(
        isRouteFocused &&
        feedOption &&
        (feedOption.startsWith('hashtag:') || feedOption.startsWith('at://'))
      ),
      refetchOnWindowFocus: true,
      refetchInterval: isRouteFocused ? 3 * 60 * 1000 : (false as const),
      refetchIntervalInBackground: false,
    }),
    [isRouteFocused, feedOption]
  );

  // Extract and save channel colors if needed
  const extractAndSaveColors = useCallback(
    async (channelUri: string, avatarUrl: string) => {
      try {
        const colors = await extractColorsFromImage(avatarUrl);
        colorsMutation.mutate({
          uri: channelUri,
          backgroundColor: colors.backgroundColor,
          foregroundColor: colors.foregroundColor,
        });
      } catch (error) {
        logger.error('Error extracting/saving channel colors', error, { component: 'Channel' });
      }
    },
    [colorsMutation]
  );

  // Extract colors when channel data is available
  useEffect(() => {
    if (channelData && channelData.avatar && !channelData.channelColors) {
      extractAndSaveColors(channelData.uri, channelData.avatar);
    }
  }, [channelData, extractAndSaveColors]);

  // Preload channel creator profile when channel data is available
  useEffect(() => {
    if (channelData?.creator?.handle) {
      ProfileService.getProfile(channelData.creator.handle).catch(error => {
        logger.warn('Error preloading channel creator profile', { component: 'Channel', error });
      });
    }
  }, [channelData?.creator?.handle]);

  // Force refresh channel data to get subscriber count if not available
  // Note: Channel data is now fetched via React Query; avoid bespoke force-refresh helpers.

  // Prepare channel data for header
  const channelHeaderData = useMemo(() => {
    if (!channelData) return null;

    const likeCount = channelData.likeCount || 0;

    // For orbyt channels, ensure description comes from orbytChannels if not in cache
    let description = channelData.description || '';
    if (isOrbytChannel(uri)) {
      const orbytChannel = getChannelByUri(uri);
      if (orbytChannel?.description) {
        description = orbytChannel.description;
      }
    }

    return {
      id: uri,
      uri: uri,
      name: channelData.displayName || 'Untitled Channel',
      description: description,
      avatar: channelData.avatar || '',
      likeCount,
      isOwner: false,
      creator: channelData.creator || null,
    };
  }, [channelData, uri]);

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleGrabHandlePress = useCallback(() => {
    channelFeedRef.current?.scrollToTop();
  }, []);

  const handleDelete = useCallback(() => {
    if (channelHeaderData?.id) {
      router.back();
    }
  }, [channelHeaderData?.id, router]);

  const headerActions = useMemo(() => {
    if (channelHeaderData?.isOwner) {
      return [
        {
          id: 'delete',
          label: 'Delete',
          icon: 'trash' as const,
          onPress: handleDelete,
          variant: 'danger' as const,
        },
      ];
    }
    return [];
  }, [channelHeaderData?.isOwner, handleDelete]);

  // Refresh channel metadata from server.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchChannel();
    } catch (error) {
      logger.error('Error during refresh', error, { component: 'Channel' });
    } finally {
      // Reset refreshing state after a delay to show the refresh animation
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    }
  }, [refetchChannel]);

  const showErrorScreen = !!channelError && !refreshing;

  const renderErrorScreen = () => (
    <View
      style={[styles.errorContainer, { backgroundColor: channelColors.backgroundColor || '#000' }]}
    >
      <Icon
        name="user-x"
        size={48}
        color={channelColors.textColor || '#fff'}
        style={styles.errorIcon}
      />
      <Text style={[styles.errorText, { color: channelColors.textColor || '#fff' }]}>
        Channel Not Found
      </Text>
      <Text style={styles.errorSubtext}>{"We couldn't retrieve this channel information"}</Text>
      <Pressable
        style={[styles.errorButton, { borderColor: (channelColors.textColor || '#fff') + '44' }]}
        onPress={onRefresh}
      >
        <Text style={[styles.errorButtonText, { color: channelColors.textColor || '#fff' }]}>
          Try Again
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.errorButton,
          styles.secondaryButton,
          { borderColor: (channelColors.textColor || '#fff') + '44' },
        ]}
        onPress={() => router.back()}
      >
        <Text style={[styles.errorButtonText, { color: channelColors.textColor || '#fff' }]}>
          Go Back
        </Text>
      </Pressable>
    </View>
  );

  // Tab options for category channels
  const tabOptions: TabOption[] = useMemo(
    () => [
      { id: 'top', label: 'Trending' },
      { id: 'latest', label: 'New' },
    ],
    []
  );

  // Tab navigation component for category channels (passed as children to ChannelHeader)
  const tabNavigation = useMemo(() => {
    if (!isCategoryChannel) return null;

    return (
      <TabNavigation
        tabs={tabOptions}
        activeTab={activeTab === 0 ? 'top' : 'latest'}
        onTabPress={tabId => setActiveTab(tabId === 'top' ? 0 : 1)}
        textColor={channelColors.textColor || Colors.neutral[50]}
        backgroundColor="transparent"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showViewToggle={true} // TabNavigation handles view toggle for category channels
        dropdown={true} // Use dropdown mode
      />
    );
  }, [isCategoryChannel, tabOptions, activeTab, channelColors.textColor, viewMode, setViewMode]);

  const headerComponent = (
    <View style={styles.headerContainer} pointerEvents="box-none">
      <ChannelHeader
        channel={channelHeaderData}
        applySafeArea={!isModal}
        headerStyle={headerPaddingTop ? { paddingTop: headerPaddingTop } : undefined}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showViewToggle={!isCategoryChannel}
        contentFadeDisabled={viewMode === 'grid'}
        dimOverlayDisabled={viewMode === 'grid'}
      >
        {tabNavigation}
      </ChannelHeader>
    </View>
  );

  const isLoading = isLoadingChannel && !channelDataForFeed;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: Colors.black,
        },
      ]}
    >
      <DetailScreenOverlay
        isModal={isModal}
        showBackButton={showBackButton}
        actionButtonsTop={actionButtonsTop}
        onBackPress={handleBackPress}
        onGrabHandlePress={handleGrabHandlePress}
        backIconColor={baseBackTextColor}
        backIconPrimaryStyle={backIconPrimaryStyle}
        backIconSecondaryStyle={backIconSecondaryStyle}
        overlayAnimatedStyle={overlayAnimatedStyle}
      >
        {headerActions.length > 0 && (
          <View style={styles.overlayActionsContainer}>
            {headerActions.map(action => (
              <HeaderActionButton
                key={action.id}
                action={action}
                textColor={channelColors.textColor || Colors.neutral[50]}
                backgroundColor={channelColors.backgroundColor || Colors.black}
              />
            ))}
          </View>
        )}
      </DetailScreenOverlay>

      {showErrorScreen ? (
        renderErrorScreen()
      ) : (
        <FeedRenderer
          ref={channelFeedRef}
          feedOption={channelDataForFeed && feedOption ? feedOption : ''}
          userDid={channelDataForFeed?.did}
          headerComponent={headerComponent}
          backgroundColor={Colors.black}
          secondaryColor={channelColors.textColor}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          queryOptions={channelDataForFeed && feedOption ? queryOptions : { enabled: false }}
          isVisible={isRouteFocused}
          contentScrollProgressOutput={viewMode === 'list' ? overlayScrollProgressSV : undefined}
          isModal={isModal}
        />
      )}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      )}
    </View>
  );
});

Channel.displayName = 'Channel';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: Colors.black,
    overflow: 'hidden',
  },
  headerContainer: {
    minHeight: 280,
    backgroundColor: Colors.transparent,
    marginBottom: 0,
    paddingBottom: 0,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    height: Dimensions.get('window').height,
  },
  errorIcon: {
    marginBottom: 16,
    opacity: 0.8,
  },
  errorText: {
    color: Colors.neutral[50],
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Figtree-Medium',
  },
  errorSubtext: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
  },
  errorButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    marginTop: 20,
    minWidth: 150,
  },
  errorButtonText: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
  secondaryButton: {
    backgroundColor: Colors.transparent,
    borderColor: Colors.neutral[600],
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  overlayActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
});

export default Channel;
