import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { BORDER_RADIUS } from '@/utils/constants';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { useRouter, useLocalSearchParams } from 'expo-router';

import ChannelHeader from '@/components/layout/header/ChannelHeader';
import TabNavigation, { TabOption } from '@/components/layout/header/TabNavigation';
import DetailScreenOverlay from '@/components/layout/detail/DetailScreenOverlay';
import {
  ProfileChannelFeedLayout,
  ProfileChannelFeedLoadingOverlay,
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
import { extractColorsFromImage, hexToRGBA } from '@/utils/formatting/colors';
import Icon from '@/components/ui/Icon';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '@/hooks';
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
  useVisibilityRouteTracker('channel');
  const isRouteFocused = useVisibilityRouteIsActive('channel');
  const uriParam = (params.id as string) || '';
  const uri = uriParam ? decodeURIComponent(uriParam) : '';

  const [refreshing, setRefreshing] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<ChannelCategoryTab>('top');

  const {
    data: channelData,
    isLoading: isLoadingChannel,
    error: channelError,
    refetch: refetchChannel,
  } = useChannel(uri || '');

  const { colors: channelColors } = useChannelColors(uri || '');
  const colorsMutation = useChannelColorsMutation();

  const [viewMode, setViewMode] = useState<ViewMode>('list');

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

  useEffect(() => {
    setActiveCategoryTab('top');
  }, [uri]);

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
        isRouteFocused &&
        channelDataForFeed &&
        uri &&
        (uri.startsWith('hashtag:') || uri.startsWith('at://'))
      ),
    }),
    [isRouteFocused, channelDataForFeed, uri]
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchChannel();
    } catch (error) {
      logger.error('Error during refresh', error, { component: 'Channel' });
    } finally {
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    }
  }, [refetchChannel]);

  const showErrorScreen = !!channelError && !refreshing;

  const renderErrorScreen = () => (
    <View style={styles.errorContainer}>
      <Icon
        name="user_x"
        size={48}
        color={channelColors.textColor || '#fff'}
        style={styles.errorIcon}
      />
      <Text style={[styles.errorText, { color: channelColors.textColor || '#fff' }]}>
        {t('channel.notFound')}
      </Text>
      <Text style={styles.errorSubtext}>{t('channel.retrieveFailed')}</Text>
      <NativePressable
        style={[styles.errorButton, { borderColor: (channelColors.textColor || '#fff') + '44' }]}
        onPress={onRefresh}
      >
        <Text style={[styles.errorButtonText, { color: channelColors.textColor || '#fff' }]}>
          {t('errors.tryAgain')}
        </Text>
      </NativePressable>
      <NativePressable
        style={[
          styles.errorButton,
          styles.secondaryButton,
          { borderColor: (channelColors.textColor || '#fff') + '44' },
        ]}
        onPress={() => router.back()}
      >
        <Text style={[styles.errorButtonText, { color: channelColors.textColor || '#fff' }]}>
          {t('common.goBack')}
        </Text>
      </NativePressable>
    </View>
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
          setActiveCategoryTab(id);
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
  }, [isCategoryChannel, tabOptions, activeCategoryTab, channelColors.textColor, viewMode]);

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
            setActiveCategoryTab(feed === categorySourceFeeds.top ? 'top' : 'latest');
          }}
          {...PROFILE_CHANNEL_FEED_PAGER_DEFAULTS}
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
      <ProfileChannelFeedLoadingOverlay visible={isLoading} />
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
  overlayActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
});

export default Channel;
