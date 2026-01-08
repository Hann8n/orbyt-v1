import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, StyleSheet, Dimensions, Pressable, Text } from 'react-native';
// Use plain FlashList via FeedRenderer; no adapter/converter
import { useRouter, useLocalSearchParams } from 'expo-router';

import ChannelHeader from '../../src/components/layout/header/ChannelHeader';
import TabNavigation, { TabOption } from '../../src/components/layout/header/TabNavigation';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { Colors } from '../../src/components/ui/UI';

import {
  useChannelColors,
  useChannel,
  useChannelColorsMutation,
  default as ChannelService,
} from '../../src/services/data/ChannelService';
import ProfileService from '../../src/services/data/ProfileService';
import { extractColorsFromImage } from '../../src/utils/formatting/colors';
import Icon, { Loading3FillIcon, BackArrowIcon } from '../../src/components/ui/Icon';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
import { isOrbytChannel, getChannelByUri, channelToHashtag } from '../../src/utils/channels/orbyt';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import type { ViewMode } from '../../src/types';

const Channel: React.FC = memo(() => {
  const router = useRouter();
  const params = useLocalSearchParams();
  useVisibilityRouteTracker('channel');
  const isRouteFocused = useVisibilityRouteIsActive('channel');
  const insets = useSafeAreaInsets();

  // Get the channel URI from the route parameters (decode for safety)
  const uriParam = (params.id as string) || '';
  const uri = uriParam ? decodeURIComponent(uriParam) : '';

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<0 | 1>(0); // 0 = top, 1 = latest

  // Use channel cache system
  const {
    data: channelData,
    isLoading: isLoadingChannel,
    error: channelError,
    refetch: refetchChannel,
  } = useChannel(uri || '');

  // Force refresh channel data to get experimental flag if not present
  useEffect(() => {
    if (uri && channelData && channelData.isExperimental === undefined) {
      const invalidateAndRefetch = async () => {
        try {
          await ChannelService.invalidateChannel(uri);
          refetchChannel();
        } catch (error) {
          console.error('Error invalidating channel cache:', error);
        }
      };
      invalidateAndRefetch();
    }
  }, [uri, channelData, refetchChannel]);

  const { colors: channelColors } = useChannelColors(uri || '');
  const colorsMutation = useChannelColorsMutation();

  // Shared scroll progress for header fade/dim (0 = top, 1 = fully faded)
  const headerScrollProgress = useSharedValue(0);

  const overlayTop = (typeof insets?.top === 'number' ? insets.top : 0) + 5;

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Check if this is a category channel (hashtag feed) - postable Orbyt channels
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
        console.error('Error extracting/saving channel colors:', error);
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
        console.warn('Error preloading channel creator profile:', error);
      });
    }
  }, [channelData?.creator?.handle]);

  // Force refresh channel data to get subscriber count if not available
  useEffect(() => {
    if (uri && channelData && !channelData.subscriberCount) {
      const forceRefresh = async () => {
        try {
          await ChannelService.forceRefreshChannel(uri);
          refetchChannel();
        } catch (error) {
          console.error('Error force refreshing channel:', error);
        }
      };
      forceRefresh();
    }
  }, [uri, channelData, refetchChannel]);

  // Prepare channel data for header
  const channelHeaderData = useMemo(() => {
    if (!channelData) return null;

    const likeCount = channelData.likeCount || 0;

    // For Orbyt channels, ensure description comes from orbytChannels if not in cache
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
      isExperimental: channelData.isExperimental,
      creator: channelData.creator || null,
    };
  }, [channelData, uri]);

  // Handle back press
  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  // Handle refresh - refreshes both channel metadata and feed
  // FeedRenderer will handle feed refresh automatically when isRefreshing is true
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refresh channel metadata first
      await refetchChannel();
      // Feed refresh is handled by FeedRenderer's useEffect when isRefreshing is true
    } catch (error) {
      console.error('Error during refresh:', error);
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
        textColor={channelColors.textColor || Colors.white}
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
        showBackButton={false}
        onBackPress={handleBackPress}
        applySafeArea={true}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showViewToggle={!isCategoryChannel} // Hide view toggle in ChannelHeader when tabs are shown
        headerScrollProgress={headerScrollProgress}
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
      {/* Overlay back button row to match profile screen */}
      <View style={[styles.overlayRow, { top: overlayTop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBackPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.overlayBackButton}
        >
          <BackArrowIcon size={30} color={Colors.white} />
        </Pressable>
      </View>

      {showErrorScreen ? (
        renderErrorScreen()
      ) : channelDataForFeed && feedOption ? (
        <FeedRenderer
          feedOption={feedOption}
          userDid={channelDataForFeed?.did}
          headerComponent={headerComponent}
          backgroundColor={Colors.black}
          secondaryColor={channelColors.textColor}
          isRefreshing={refreshing}
          onRefresh={onRefresh}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onVerticalScroll={scrollY => {
            // Map first 250px of scroll into 0 -> 1 progress (more gradual), same as profile
            const clamped = Math.max(0, Math.min(1, scrollY / 250));
            headerScrollProgress.value = clamped;
          }}
          queryOptions={queryOptions}
          isVisible={isRouteFocused}
        />
      ) : (
        <FeedRenderer
          feedOption=""
          userDid={undefined}
          headerComponent={headerComponent}
          backgroundColor={Colors.black}
          secondaryColor={channelColors.textColor}
          isRefreshing={refreshing}
          onRefresh={onRefresh}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onVerticalScroll={scrollY => {
            const clamped = Math.max(0, Math.min(1, scrollY / 250));
            headerScrollProgress.value = clamped;
          }}
          queryOptions={{ enabled: false }}
          isVisible={isRouteFocused}
        />
      )}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Loading3FillIcon size={48} color={Colors.white} />
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
    backgroundColor: 'transparent',
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
    color: Colors.white,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
  errorSubtext: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
  },
  errorButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    marginTop: 20,
    minWidth: 150,
  },
  errorButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: Colors.mediumGray,
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
  overlayRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
  },
  overlayBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Channel;
