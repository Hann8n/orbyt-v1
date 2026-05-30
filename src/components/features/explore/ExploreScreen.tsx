import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QUERY_CONSTANTS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import { View, StyleSheet, TextInput, Platform, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleView } from '@/components/ui/Squircle';
import { Image } from 'expo-image';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  TabView,
  TabBar,
  type SceneRendererProps,
  type NavigationState,
  type Route,
  type TabDescriptor,
} from 'react-native-tab-view';

import { navigateToEncodedChannelUri } from '@/utils/navigation/navigateEncodedChannel';
import { useFollowMutation } from '@/services/data/ProfileService';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/UI';
import HeaderBanner from '@/components/ui/HeaderBanner';

const GRADIENT_SHIM = require('@/assets/embed-video-gradient-shim.png');

import { SearchIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import EmptyFeed from '@/components/features/feed/EmptyFeed';

import { HeaderService, useHeaders, type Header } from '@/services/OrbytBannerService';
import { useFeed } from '@/hooks/useFeed';
import { useUserStore } from '@/stores/userStore';
import type { ExtendedFeedViewPost } from '@/services/api/types';
import { useOrbytChannels } from '@/services/OrbytChannelsService';
import { useVisitHistory } from '@/hooks/useVisitHistory';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';

import {
  exploreListKeyExtractor,
  type ListItem,
  type ExploreSearchTabId,
  type Profile,
} from './types';
import type { ProfileViewWithOrbyt } from '@/services/api/types';
import type { CachedChannel } from '@/services/data/ChannelService';
import { prefetchProfileThenOpen } from './prefetchProfileThenOpen';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';
import { SearchFeedRenderer, ExploreSuggestionsProfileRow } from './ExploreSearchResults';
import { OrbytChannelsGrid } from './OrbytChannelsGrid';
import {
  ExploreSectionHeaderRow,
  ExploreSuggestionsLoadingRow,
} from './ExploreSuggestionSectionChrome';
import { ExploreSpotlightCarousel } from './ExploreSpotlightCarousel';
import { ExploreSectionLoading, ExploreTopSpacer } from './exploreListChrome';
import { mapSearchFeedToResults } from './exploreSearchMapper';
import { useExploreSuggestionsQueries } from './useExploreSuggestionsQueries';
import { useExploreTabRefs } from './useExploreTabRefs';
import { useExploreSearchDebounce } from './useExploreSearchDebounce';
import {
  EXPLORE_SEARCH_LAYOUT,
  exploreSearchChromeHeight,
  getExploreTopChromeSpacerHeight,
} from './exploreLayout';
import { EXPLORE_HEADER_BANNER_ASPECT_RATIO } from './exploreConstants';
import { FontFamily, Typography, fontSizeFor } from '@/utils/components/typography';

const ExploreScreen: React.FC = () => {
  const { t } = useTranslation();
  const flashListRef = useRef<FlashListRef<ListItem> | null>(null);
  const currentUser = useUserStore(state => state.currentUser);
  const searchInputRef = useRef<TextInput | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ExploreSearchTabId>('recently-visited');
  const {
    addVisit,
    profilesByDid: recentProfilesByDid,
    channelsByUri: recentChannelsByUri,
  } = useVisitHistory(currentUser?.did ?? null);

  // Convert SDK types to arrays for rendering
  const recentlyVisitedProfiles = useMemo(
    () => Array.from(recentProfilesByDid.values()),
    [recentProfilesByDid]
  );
  const recentlyVisitedChannels = useMemo(
    () => Array.from(recentChannelsByUri.values()),
    [recentChannelsByUri]
  );

  const { debouncedQuery, clearPendingDebounce, setDebouncedQuery } =
    useExploreSearchDebounce(searchQuery);

  const queryClient = useQueryClient();
  const { navigateToProfile: goToProfile, navigateToChannel: goToChannel } =
    useProfileChannelNavigation();

  const followMutation = useFollowMutation();
  const insets = useSafeAreaInsets();
  const { screenWidth, screenHeight } = useDeviceLayout();
  const [hasHeaderBannerError, setHasHeaderBannerError] = useState<boolean>(false);

  const bottomPadding = insets.bottom;

  const handleFollow = useCallback(
    (profile: Profile) => {
      if (profile.handle) {
        const handle = profile.handle;
        followMutation.mutate({
          did: profile.did,
          handle,
          isFollowing: !profile.viewer?.following,
        });
      }
    },
    [followMutation]
  );

  const { data: fetchedHeaders = [], isPending: isHeadersPending } = useHeaders();

  useEffect(() => {
    setHasHeaderBannerError(false);
  }, [fetchedHeaders]);

  const headers = useMemo(() => {
    return fetchedHeaders.map((header: Header) => ({
      ...header,
      imageUrl: HeaderService.getImageUrl(header.imageUrl),
    }));
  }, [fetchedHeaders]);

  const searchFeedOption = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.trim() === '') {
      return null;
    }
    return `search:${debouncedQuery}`;
  }, [debouncedQuery]);

  const {
    feed: searchFeed,
    isLoading: isSearchLoading,
    hasNextPage: hasSearchNextPage,
    isFetchingNextPage: isSearchFetchingNextPage,
    fetchNextPage: fetchSearchNextPage,
  } = useFeed(searchFeedOption || 'following', undefined, {
    enabled: !!searchFeedOption,
    staleTime: 30 * 1000,
    refetchOnMount: false,
  });

  const { profiles: searchProfiles, channels: searchChannels } = useMemo(() => {
    if (!searchFeedOption || !searchFeed.length) {
      return { profiles: [], channels: [] };
    }
    return mapSearchFeedToResults(searchFeed as ExtendedFeedViewPost[], {
      currentUser,
      t,
    });
  }, [searchFeedOption, searchFeed, currentUser, t]);

  const handleProfileNavigation = useCallback(
    (profile: ProfileViewWithOrbyt) => {
      addVisit('profile', { did: profile.did });
      prefetchProfileThenOpen(profile, queryClient, goToProfile);
    },
    [addVisit, goToProfile, queryClient]
  );

  const handleChannelNavigation = useCallback(
    (channel: CachedChannel) => {
      addVisit('channel', { uri: channel.uri });
      navigateToEncodedChannelUri(channel.uri, goToChannel);
    },
    [addVisit, goToChannel]
  );

  const pages: ExploreSearchTabId[] = useMemo(() => {
    if (debouncedQuery.length === 0) {
      return ['recently-visited'];
    }
    return ['profiles', 'channels'];
  }, [debouncedQuery.length]);

  useEffect(() => {
    if (pages.length > 0 && !pages.includes(activeTab)) {
      setActiveTab(pages[0]);
    }
  }, [pages, activeTab]);

  const searchTabIndex = useMemo(() => Math.max(0, pages.indexOf(activeTab)), [pages, activeTab]);

  const searchRoutes: Route[] = useMemo(
    () =>
      pages.map(tabId => ({
        key: tabId,
        title:
          tabId === 'recently-visited'
            ? t('feed.recentlyVisited')
            : tabId === 'profiles'
              ? t('feed.people')
              : t('feed.feeds'),
      })),
    [pages, t]
  );

  const searchTabCommonOptions = useMemo<TabDescriptor<Route>>(
    () => ({
      sceneStyle: styles.searchResultsContainer,
      label: ({ color, labelText }) => (
        <Text
          style={{
            color,
            fontSize: Typography.sizes.h3,
            fontFamily: FontFamily.black,
            includeFontPadding: false,
          }}
        >
          {labelText}
        </Text>
      ),
    }),
    []
  );

  const renderSearchTabBar = useCallback(
    (
      props: SceneRendererProps & {
        navigationState: NavigationState<Route>;
        options: Record<string, TabDescriptor<Route>> | undefined;
      }
    ) => (
      <TabBar
        {...props}
        style={styles.indicatorContainer}
        tabStyle={styles.indicatorItem}
        contentContainerStyle={styles.searchTabBarContent}
        activeColor={Colors.neutral[50]}
        inactiveColor={Colors.neutral[500]}
        renderIndicator={() => null}
        scrollEnabled
        gap={fontSizeFor(10)}
        pressOpacity={0.7}
      />
    ),
    []
  );

  const resetExploreSearch = useCallback(() => {
    clearPendingDebounce();
    searchInputRef.current?.setNativeProps({ text: '' });
    setSearchQuery('');
    setDebouncedQuery('');
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
  }, [clearPendingDebounce, setDebouncedQuery]);

  const isSearching = isSearchFocused || debouncedQuery.length > 0;

  const searchOverlayOpacity = useSharedValue(0);
  useEffect(() => {
    searchOverlayOpacity.value = withTiming(isSearching ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [isSearching, searchOverlayOpacity]);

  const searchOverlayStyle = useAnimatedStyle(() => ({
    opacity: searchOverlayOpacity.value,
    pointerEvents: searchOverlayOpacity.value > 0 ? 'auto' : 'none',
  }));

  const gradientStyle = useAnimatedStyle(() => ({
    opacity: 1 - searchOverlayOpacity.value,
  }));

  const useLiquidGlassSearchBar =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  const { data: activeChannels = [], isPending: isOrbytChannelsMetadataPending } =
    useOrbytChannels();
  const orbytChannelUris = useMemo(() => activeChannels.map(ch => ch.uri), [activeChannels]);
  const {
    orbytChannelsData,
    isLoadingOrbytChannels,
    orbytChannelsError,
    refetchOrbytChannels,
    spotlightFeed,
    isLoadingSpotlightFeed,
    spotlightFeedError,
    refetchSpotlightFeed,
    isInitialSuggestionsLoading,
    hasSettledInitialSuggestions,
  } = useExploreSuggestionsQueries(orbytChannelUris, {
    isResolvingOrbytUris: isOrbytChannelsMetadataPending,
  });

  const isHeaderVisible = useMemo(
    () => headers.length > 0 && !hasHeaderBannerError,
    [hasHeaderBannerError, headers.length]
  );
  const computedHeaderHeight = Math.round(screenWidth / EXPLORE_HEADER_BANNER_ASPECT_RATIO);
  const topChromeSpacerHeight = useMemo(
    () => insets.top + getExploreTopChromeSpacerHeight(),
    [insets.top]
  );
  const activeHeaderHeight = useMemo(
    () => (isHeaderVisible ? computedHeaderHeight : topChromeSpacerHeight),
    [computedHeaderHeight, isHeaderVisible, topChromeSpacerHeight]
  );

  const renderSearchTabContent = useCallback(
    (tabId: ExploreSearchTabId) => (
      <SearchFeedRenderer
        feedOption={tabId}
        profiles={searchProfiles}
        channels={searchChannels}
        isLoading={isSearchLoading}
        onProfilePress={handleProfileNavigation}
        onChannelPress={handleChannelNavigation}
        onFollow={handleFollow}
        recentlyVisitedProfiles={recentlyVisitedProfiles}
        recentlyVisitedChannels={recentlyVisitedChannels}
        bottomPadding={bottomPadding}
        hasNextPage={hasSearchNextPage}
        isFetchingNextPage={isSearchFetchingNextPage}
        fetchNextPage={fetchSearchNextPage}
      />
    ),
    [
      searchProfiles,
      searchChannels,
      isSearchLoading,
      handleProfileNavigation,
      handleChannelNavigation,
      handleFollow,
      recentlyVisitedProfiles,
      recentlyVisitedChannels,
      bottomPadding,
      hasSearchNextPage,
      isSearchFetchingNextPage,
      fetchSearchNextPage,
    ]
  );

  const renderExploreListEmpty = useCallback(() => {
    if (!(isLoadingSpotlightFeed || isLoadingOrbytChannels)) {
      if (spotlightFeedError || orbytChannelsError) {
        return (
          <EmptyFeed
            type="no-connection"
            onRetry={() => {
              refetchSpotlightFeed();
              refetchOrbytChannels();
            }}
          />
        );
      }
      return <EmptyFeed type="no-videos" />;
    }
    return null;
  }, [
    isLoadingSpotlightFeed,
    isLoadingOrbytChannels,
    spotlightFeedError,
    orbytChannelsError,
    refetchSpotlightFeed,
    refetchOrbytChannels,
  ]);

  const renderExploreItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'section-header') {
        if (!('title' in item) || !item.title) {
          return <ExploreSectionLoading variant="sectionHeader" />;
        }
        return <ExploreSectionHeaderRow title={item.title} spotlightLabel={t('feed.spotlight')} />;
      }
      if (item.type === 'loading') {
        if (item.variant === 'spotlight') {
          return <ExploreSectionLoading variant="spotlight" />;
        }
        if (item.variant === 'channels') {
          return <ExploreSectionLoading variant="inline" />;
        }
        const availableHeight = screenHeight - activeHeaderHeight - bottomPadding;
        const minHeight = Math.max(availableHeight, 200);
        return <ExploreSuggestionsLoadingRow minHeight={minHeight} />;
      }
      if (item.type === 'spotlight-videos') {
        if (!('videos' in item)) {
          return <ExploreSectionLoading variant="spotlight" />;
        }
        if (!Array.isArray(item.videos)) {
          return null;
        }
        return <ExploreSpotlightCarousel videos={item.videos} />;
      }
      if (item.type === 'profile' && 'data' in item) {
        return (
          <ExploreSuggestionsProfileRow
            profile={item.data}
            queryClient={queryClient}
            goToProfile={goToProfile}
            onFollow={handleFollow}
          />
        );
      }
      if (item.type === 'orbyt-channels-section') {
        if (!('channels' in item) || !Array.isArray(item.channels)) {
          return <ExploreSectionLoading variant="inline" />;
        }
        return <OrbytChannelsGrid channels={item.channels} />;
      }
      return null;
    },
    [t, activeHeaderHeight, bottomPadding, queryClient, goToProfile, handleFollow, screenHeight]
  );

  useExploreTabRefs({
    flashListRef,
    resetExploreSearch,
    isSearching,
  });

  const viewabilityConfig = useMemo(
    () => ({
      viewAreaCoveragePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    []
  );

  const loadingSuggestedItems = useMemo(() => {
    return [{ type: 'loading' as const, variant: 'full' as const, key: 'loading-indicator' }];
  }, []);

  const suggestionsList: ListItem[] = useMemo(() => {
    if (!hasSettledInitialSuggestions || isInitialSuggestionsLoading) {
      return loadingSuggestedItems;
    }
    if (
      spotlightFeedError &&
      orbytChannelsError &&
      !spotlightFeed?.length &&
      !orbytChannelsData?.length
    ) {
      return [];
    }

    const data: ListItem[] = [];

    if (spotlightFeed?.length) {
      data.push({
        type: 'section-header' as const,
        title: t('feed.spotlight'),
        key: 'spotlight-header',
      });
      data.push({
        type: 'spotlight-videos' as const,
        videos: spotlightFeed,
        key: 'spotlight-videos',
      });
    }

    if (orbytChannelsData?.length) {
      data.push({
        type: 'section-header' as const,
        title: t('feed.channels'),
        key: 'orbyt-channels-header',
      });
      data.push({
        type: 'orbyt-channels-section' as const,
        channels: orbytChannelsData,
        key: 'orbyt-channels',
      });
    }

    return data;
  }, [
    isInitialSuggestionsLoading,
    hasSettledInitialSuggestions,
    loadingSuggestedItems,
    spotlightFeedError,
    orbytChannelsError,
    spotlightFeed,
    orbytChannelsData,
    t,
  ]);

  const listHeaderComponent = useMemo(() => {
    if (isHeaderVisible) {
      return (
        <HeaderBanner
          headers={headers}
          height={computedHeaderHeight}
          onImageError={() => setHasHeaderBannerError(true)}
        />
      );
    }

    const shouldReserveHeaderSpace = isHeadersPending && headers.length === 0;
    return (
      <ExploreTopSpacer
        height={shouldReserveHeaderSpace ? computedHeaderHeight : topChromeSpacerHeight}
      />
    );
  }, [computedHeaderHeight, headers, isHeaderVisible, isHeadersPending, topChromeSpacerHeight]);

  return (
    <View style={[styles.container, Platform.OS === 'android' && styles.androidPaddingTop]}>
      <StatusBar style="light" />

      <View style={StyleSheet.absoluteFill}>
        <FlashList<ListItem>
          ref={flashListRef}
          ListHeaderComponent={listHeaderComponent}
          data={suggestionsList}
          keyExtractor={exploreListKeyExtractor}
          renderItem={renderExploreItem}
          getItemType={item => item.type}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding }]}
          scrollIndicatorInsets={{ top: activeHeaderHeight }}
          showsVerticalScrollIndicator={
            suggestionsList.length >= SCROLL_INDICATOR_CONSTANTS.EXPLORE_SUGGESTIONS_MIN_ITEMS
          }
          bounces={true}
          scrollEventThrottle={16}
          onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
          viewabilityConfig={viewabilityConfig}
          ListEmptyComponent={renderExploreListEmpty}
        />
      </View>

      {/* Search overlay — always mounted so the search bar TextInput focus is never disrupted */}
      <Reanimated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: Colors.black }, searchOverlayStyle]}
      >
        <SafeAreaView edges={['top']} style={styles.searchResultsSafeArea}>
          <View
            style={[styles.exploreSearchResultsTopInset, { height: exploreSearchChromeHeight }]}
            pointerEvents="none"
          />
          <TabView
            navigationState={{ index: searchTabIndex, routes: searchRoutes }}
            renderScene={({ route }) => renderSearchTabContent(route.key as ExploreSearchTabId)}
            onIndexChange={nextIndex => setActiveTab(pages[nextIndex] ?? pages[0])}
            renderTabBar={renderSearchTabBar}
            swipeEnabled={true}
            initialLayout={{ width: screenWidth }}
            lazy
            lazyPreloadDistance={1}
            style={styles.searchContentWrapper}
            commonOptions={searchTabCommonOptions}
            overScrollMode="never"
          />
        </SafeAreaView>
      </Reanimated.View>

      {/* Search bar — always on top */}
      <SafeAreaView
        edges={['top']}
        style={[
          styles.searchSafeArea,
          { minHeight: EXPLORE_SEARCH_LAYOUT.BAR_OFFSET_TOP + EXPLORE_SEARCH_LAYOUT.BAR_HEIGHT },
        ]}
        pointerEvents="box-none"
      >
        <Reanimated.View
          pointerEvents="none"
          style={[styles.topGradient, styles.topGradientExploreHeight, gradientStyle]}
        >
          <Image source={GRADIENT_SHIM} style={StyleSheet.absoluteFill} contentFit="fill" />
        </Reanimated.View>

        <NativePressable
          onPressIn={() => searchInputRef.current?.focus()}
          style={styles.searchBarPressable}
        >
          <SquircleView
            style={[
              styles.searchContainer,
              useLiquidGlassSearchBar
                ? styles.searchContainerLiquidGlass
                : styles.searchContainerTintedWhite,
              {
                top: EXPLORE_SEARCH_LAYOUT.BAR_OFFSET_TOP,
                height: EXPLORE_SEARCH_LAYOUT.BAR_HEIGHT,
              },
            ]}
          >
            {useLiquidGlassSearchBar && (
              <GlassView
                style={styles.searchContainerGlassBackground}
                glassEffectStyle="clear"
                tintColor={Colors.neutral[50]}
              />
            )}
            <View style={styles.searchBarContent} pointerEvents="box-none">
              <View style={styles.searchIconContainer}>
                <SearchIcon size={24} color={Colors.black} style={styles.searchIconMirror} />
              </View>
              <TextInput
                ref={searchInputRef}
                nativeID="explore-search-input"
                style={styles.searchInput}
                placeholder={t('feed.searchPlaceholder')}
                placeholderTextColor={Colors.neutral[500]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onSubmitEditing={() => {}}
                autoCapitalize="none"
                autoCorrect={true}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                keyboardAppearance="dark"
                returnKeyType="search"
                caretHidden={false}
              />
              {isSearching && (
                <NativePressable
                  onPress={resetExploreSearch}
                  style={styles.clearButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="close-circle" size={22.5} color={Colors.neutral[900]} />
                </NativePressable>
              )}
            </View>
          </SquircleView>
        </NativePressable>
      </SafeAreaView>
    </View>
  );
};

export default ExploreScreen;
