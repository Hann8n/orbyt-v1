import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { View, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import ChannelHeader from '@/components/layout/header/ChannelHeader';
import TabNavigation, { TabOption } from '@/components/layout/header/TabNavigation';
import DetailScreenOverlay from '@/components/layout/detail/DetailScreenOverlay';
import {
  ProfileChannelFeedLayout,
  ProfileChannelFeedLoadingScreen,
  ProfileChannelErrorScreen,
  PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET,
  PROFILE_CHANNEL_FEED_PAGER_DEFAULTS,
  PROFILE_CHANNEL_TAB_NAVIGATION_DEFAULTS,
} from '@/components/layout/detail/ProfileChannelFeedLayout';
import { HeaderActionButton } from '@/components/layout/header/UniversalHeader';
import FeedPager from '@/components/features/feed/FeedPager';
import { Colors } from '@/theme';

import { useChannelColors, useChannel } from '@/services/data/ChannelService';
import { queryKeys } from '@/utils/query/queryKeys';
import ProfileService from '@/services/data/ProfileService';
import { useUserStore } from '@/stores/userStore';
import { extractColorsFromImage, darkenColor, hexToRGBA } from '@/utils/formatting/colors';
import { useVisibilityRouteIsActive } from '@/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEffectiveTopInset } from '@/utils/device/screen';
import { isOrbytChannel, getChannelByUri, channelToHashtag } from '@/utils/channels/orbyt';
import { logger } from '@/utils/logger';
import type { ViewMode } from '@/types';
import type { FeedPagerRef } from '@/utils/navigation/tabRefs';
import { useQueryClient } from '@tanstack/react-query';
import type { CachedChannel } from '@/services/data/ChannelService';

type ChannelCategoryTab = 'top' | 'latest';

const Channel: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const isRouteFocused = useVisibilityRouteIsActive('channel');
  const uriParam = (params.id as string) || '';
  const uri = uriParam ? decodeURIComponent(uriParam) : '';

  const [categoryTabState, setCategoryTabState] = useState<{
    uri: string;
    tab: ChannelCategoryTab;
  }>({
    uri,
    tab: 'top',
  });

  const {
    data: channelData,
    isLoading: isLoadingChannel,
    isFetching: isChannelFetching,
    error: channelError,
    refetch: refetchChannel,
  } = useChannel(uri || '');

  const { colors: channelColors } = useChannelColors(uri || '');

  const viewMode = useUserStore(state => state.profileFeedViewMode);
  const setProfileFeedViewMode = useUserStore(state => state.setProfileFeedViewMode);
  const setViewMode = (mode: ViewMode) => void setProfileFeedViewMode(mode);

  const insets = useSafeAreaInsets();
  const topInset = getEffectiveTopInset(insets.top);
  const defaultTop = topInset + PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET;
  const overlayScrollProgressSV = useSharedValue(0);
  const actionButtonsTop = defaultTop;
  const showBackButton = !!uri;

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      overlayScrollProgressSV.value,
      [0, 0.5, 0.95],
      [1, 1, 0],
      Extrapolate.CLAMP
    ),
  }));

  const backIconPrimaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(overlayScrollProgressSV.value, [0, 1], [1, 0], Extrapolate.CLAMP),
  }));

  const backIconSecondaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(overlayScrollProgressSV.value, [0, 1], [0, 1], Extrapolate.CLAMP),
  }));

  const baseBackTextColor = channelColors.textColor || Colors.neutral[50];
  const channelPagerRef = useRef<FeedPagerRef | null>(null);

  const activeCategoryTab = categoryTabState.uri === uri ? categoryTabState.tab : 'top';

  const isCategoryChannel = (() => {
    if (!uri || !isOrbytChannel(uri)) return false;
    const channel = getChannelByUri(uri);
    return channel?.isPostable !== false;
  })();

  const hashtagOption = isCategoryChannel ? channelToHashtag(uri) : null;
  const categorySourceFeeds = isCategoryChannel && hashtagOption
    ? { top: `${hashtagOption}:top`, latest: `${hashtagOption}:latest` }
    : { top: uri || '', latest: uri || '' };

  const channelPagerFeeds = (() => {
    if (!uri) return [''];
    if (!isCategoryChannel) return [uri];
    return [categorySourceFeeds.top, categorySourceFeeds.latest];
  })();

  const currentChannelFeed = (() => {
    if (!uri) return '';
    if (!isCategoryChannel) return uri;
    return activeCategoryTab === 'top' ? categorySourceFeeds.top : categorySourceFeeds.latest;
  })();

  const queryOptions = {
    enabled: Boolean(
      channelData && uri && (uri.startsWith('hashtag:') || uri.startsWith('at://'))
    ),
  };

  // Back-fill colors for stale cache entries that pre-date color extraction in ChannelService.
  // New fetches always include colors, so this only fires for old cached data.
  useEffect(() => {
    if (!channelData?.avatar || channelData.channelColors) return;

    extractColorsFromImage(channelData.avatar)
      .then(colors => {
        queryClient.setQueryData<CachedChannel>(
          queryKeys.channels.detail(channelData.uri),
          prev => {
            if (!prev) return prev;
            return {
              ...prev,
              channelColors: {
                backgroundColor: darkenColor(colors.backgroundColor, 0.5),
                foregroundColor: '#FFFFFF',
                accentColor: colors.accentColor || Colors.black,
                statusBarStyle: 'light' as const,
              },
            };
          }
        );
      })
      .catch(error => {
        logger.error('Error extracting channel colors', error, { component: 'Channel' });
      });
  }, [channelData?.uri, channelData?.avatar, channelData?.channelColors, queryClient]);

  useEffect(() => {
    if (channelData?.creator?.handle) {
      ProfileService.getProfile(channelData.creator.handle).catch(error => {
        logger.warn('Error preloading channel creator profile', { component: 'Channel', error });
      });
    }
  }, [channelData?.creator?.handle]);

  const channelHeaderData = (() => {
    if (!channelData) return null;

    let description = channelData.description || '';
    if (isOrbytChannel(uri)) {
      const orbytChannel = getChannelByUri(uri);
      if (orbytChannel?.description) {
        description = orbytChannel.description;
      }
    }

    return {
      id: uri,
      uri,
      name: channelData.displayName || t('settings.untitledChannel'),
      description,
      avatar: channelData.avatar || '',
      likeCount: channelData.likeCount || 0,
      isOwner: false,
      creator: channelData.creator,
    };
  })();

  const handleDelete = () => {
    if (channelHeaderData?.id) {
      router.back();
    }
  };

  const headerActions = channelHeaderData?.isOwner
    ? [
        {
          id: 'delete',
          label: t('common.delete'),
          icon: 'trash' as const,
          onPress: handleDelete,
          variant: 'danger' as const,
        },
      ]
    : [];

  const refreshChannelMetadata = async () => {
    try {
      await refetchChannel();
    } catch (error) {
      logger.error('Error during refresh', error, { component: 'Channel' });
    }
  };

  const showErrorScreen = !!channelError && !isChannelFetching;

  const tabOptions: TabOption[] = [
    { id: 'top', label: t('channel.trending') },
    { id: 'latest', label: t('channel.new') },
  ];

  const tabNavigation = !isCategoryChannel ? null : (
    <TabNavigation
      tabs={tabOptions}
      activeTab={activeCategoryTab}
      onTabPress={tabId => {
        const id = tabId as ChannelCategoryTab;
        setCategoryTabState({ uri, tab: id });
        channelPagerRef.current?.setPage(id === 'top' ? 0 : 1);
      }}
      textColor={channelColors.textColor || Colors.neutral[50]}
      inactiveTextColor={hexToRGBA(channelColors.textColor || Colors.neutral[50], 0.65)}
      backgroundColor="transparent"
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      {...PROFILE_CHANNEL_TAB_NAVIGATION_DEFAULTS}
    />
  );

  const headerComponent = (
    <View style={styles.headerContainer} pointerEvents="box-none">
      <ChannelHeader
        channel={channelHeaderData}
        applySafeArea
        contentScrollProgressSV={overlayScrollProgressSV}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showViewToggle={!isCategoryChannel}
      >
        {tabNavigation}
      </ChannelHeader>
    </View>
  );

  const isLoading = isLoadingChannel && !channelData;
  return (
    <ProfileChannelFeedLayout backgroundColor={Colors.black}>
      <DetailScreenOverlay
        showBackButton={showBackButton}
        actionButtonsTop={actionButtonsTop}
        onBackPress={() => router.back()}
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
                backgroundColor={Colors.black}
              />
            ))}
          </View>
        )}
      </DetailScreenOverlay>

      {showErrorScreen ? (
        <ProfileChannelErrorScreen
          title={t('channel.notFound')}
          subtitle={t('channel.retrieveFailed')}
          onRetry={refreshChannelMetadata}
          onGoBack={() => router.back()}
        />
      ) : isLoading ? (
        <ProfileChannelFeedLoadingScreen backgroundColor={Colors.black} />
      ) : (
        <FeedPager
          ref={channelPagerRef}
          feedOptions={channelPagerFeeds}
          userDid={channelData?.did}
          currentFeed={currentChannelFeed}
          onFeedChange={feed => {
            if (!isCategoryChannel) return;
            setCategoryTabState({
              uri,
              tab: feed === categorySourceFeeds.top ? 'top' : 'latest',
            });
          }}
          {...PROFILE_CHANNEL_FEED_PAGER_DEFAULTS}
          pullToRefreshEnabled
          onPullToRefreshExtra={refreshChannelMetadata}
          queryOptions={queryOptions}
          isVisible={isRouteFocused}
          headerComponent={headerComponent}
          backgroundColor={Colors.black}
          secondaryColor={channelColors.textColor}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          contentScrollProgressOutput={overlayScrollProgressSV}
        />
      )}
    </ProfileChannelFeedLayout>
  );
};

Channel.displayName = 'Channel';

const styles = StyleSheet.create({
  headerContainer: {
    minHeight: 280,
    backgroundColor: Colors.transparent,
    marginBottom: 0,
    paddingBottom: 0,
  },
  overlayActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
});

export default Channel;
