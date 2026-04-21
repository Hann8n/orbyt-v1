import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
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
  ProfileChannelFeedLoadingOverlay,
  ProfileChannelErrorScreen,
  PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET,
  PROFILE_CHANNEL_FEED_PAGER_DEFAULTS,
  PROFILE_CHANNEL_TAB_NAVIGATION_DEFAULTS,
} from '@/components/layout/detail/ProfileChannelFeedLayout';
import { HeaderActionButton } from '@/components/layout/header/UniversalHeader';
import FeedPager from '@/components/features/feed/FeedPager';
import { Colors } from '@/theme';

import {
  useChannelColors,
  useChannel,
  useChannelColorsMutation,
} from '@/services/data/ChannelService';
import ProfileService from '@/services/data/ProfileService';
import { useUserStore } from '@/stores/userStore';
import { extractColorsFromImage, hexToRGBA } from '@/utils/formatting/colors';
import { useVisibilityRouteIsActive } from '@/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEffectiveTopInset } from '@/utils/device/screen';
import { isOrbytChannel, getChannelByUri, channelToHashtag } from '@/utils/channels/orbyt';
import { logger } from '@/utils/logger';
import type { ViewMode } from '@/types';
import type { FeedPagerRef } from '@/utils/navigation/tabRefs';
type ChannelCategoryTab = 'top' | 'latest';

const Channel: React.FC = memo(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
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
  const colorsMutation = useChannelColorsMutation();

  const viewMode = useUserStore(state => state.profileFeedViewMode);
  const setProfileFeedViewMode = useUserStore(state => state.setProfileFeedViewMode);
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      void setProfileFeedViewMode(mode);
    },
    [setProfileFeedViewMode]
  );

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

  const handleCategoryTabChange = useCallback(
    (tab: ChannelCategoryTab) => {
      setCategoryTabState({ uri, tab });
    },
    [uri]
  );

  const isCategoryChannel = useMemo(() => {
    if (!uri || !isOrbytChannel(uri)) return false;
    const channel = getChannelByUri(uri);
    return channel?.isPostable !== false;
  }, [uri]);

  const categorySourceFeeds = useMemo(() => {
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

  const channelPagerFeeds = useMemo(() => {
    if (!uri) return [''];
    if (!isCategoryChannel) return [uri];
    return [categorySourceFeeds.top, categorySourceFeeds.latest];
  }, [uri, isCategoryChannel, categorySourceFeeds.top, categorySourceFeeds.latest]);

  const currentChannelFeed = useMemo(() => {
    if (!uri) return '';
    if (!isCategoryChannel) return uri;
    return activeCategoryTab === 'top' ? categorySourceFeeds.top : categorySourceFeeds.latest;
  }, [
    uri,
    isCategoryChannel,
    activeCategoryTab,
    categorySourceFeeds.top,
    categorySourceFeeds.latest,
  ]);

  const channelDataForFeed = channelData;

  const queryOptions = useMemo(
    () => ({
      enabled: Boolean(
        channelDataForFeed && uri && (uri.startsWith('hashtag:') || uri.startsWith('at://'))
      ),
    }),
    [channelDataForFeed, uri]
  );

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

  useEffect(() => {
    if (channelData && channelData.avatar && !channelData.channelColors) {
      extractAndSaveColors(channelData.uri, channelData.avatar);
    }
  }, [channelData, extractAndSaveColors]);

  useEffect(() => {
    if (channelData?.creator?.handle) {
      ProfileService.getProfile(channelData.creator.handle).catch(error => {
        logger.warn('Error preloading channel creator profile', { component: 'Channel', error });
      });
    }
  }, [channelData?.creator?.handle]);

  const channelHeaderData = useMemo(() => {
    if (!channelData) return null;

    const likeCount = channelData.likeCount || 0;

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
      name: channelData.displayName || t('settings.untitledChannel'),
      description: description,
      avatar: channelData.avatar || '',
      likeCount,
      isOwner: false,
      creator: channelData.creator || null,
    };
  }, [channelData, uri, t]);

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

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
          label: t('common.delete'),
          icon: 'trash' as const,
          onPress: handleDelete,
          variant: 'danger' as const,
        },
      ];
    }
    return [];
  }, [channelHeaderData?.isOwner, handleDelete, t]);

  const refreshChannelMetadata = useCallback(async () => {
    try {
      await refetchChannel();
    } catch (error) {
      logger.error('Error during refresh', error, { component: 'Channel' });
    }
  }, [refetchChannel]);

  const showErrorScreen = !!channelError && !isChannelFetching;

  const renderErrorScreen = () => (
    <ProfileChannelErrorScreen
      title={t('channel.notFound')}
      subtitle={t('channel.retrieveFailed')}
      onRetry={refreshChannelMetadata}
      onGoBack={() => router.back()}
    />
  );

  const tabOptions: TabOption[] = useMemo(
    () => [
      { id: 'top', label: t('channel.trending') },
      { id: 'latest', label: t('channel.new') },
    ],
    [t]
  );

  const tabNavigation = useMemo(() => {
    if (!isCategoryChannel) return null;

    return (
      <TabNavigation
        tabs={tabOptions}
        activeTab={activeCategoryTab}
        onTabPress={tabId => {
          const id = tabId as ChannelCategoryTab;
          handleCategoryTabChange(id);
          const index = id === 'top' ? 0 : 1;
          channelPagerRef.current?.setPage(index);
        }}
        textColor={channelColors.textColor || Colors.neutral[50]}
        inactiveTextColor={hexToRGBA(channelColors.textColor || Colors.neutral[50], 0.65)}
        backgroundColor="transparent"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        {...PROFILE_CHANNEL_TAB_NAVIGATION_DEFAULTS}
      />
    );
  }, [
    isCategoryChannel,
    tabOptions,
    activeCategoryTab,
    handleCategoryTabChange,
    channelColors.textColor,
    viewMode,
    setViewMode,
  ]);

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

  const isLoading = isLoadingChannel && !channelDataForFeed;

  return (
    <ProfileChannelFeedLayout backgroundColor={Colors.black}>
      <DetailScreenOverlay
        showBackButton={showBackButton}
        actionButtonsTop={actionButtonsTop}
        onBackPress={handleBackPress}
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
        renderErrorScreen()
      ) : (
        <FeedPager
          ref={channelPagerRef}
          feedOptions={channelPagerFeeds}
          userDid={channelDataForFeed?.did}
          currentFeed={currentChannelFeed}
          onFeedChange={feed => {
            if (!isCategoryChannel) return;
            handleCategoryTabChange(feed === categorySourceFeeds.top ? 'top' : 'latest');
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
      <ProfileChannelFeedLoadingOverlay visible={isLoading} backgroundColor={Colors.black} />
    </ProfileChannelFeedLayout>
  );
});

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
