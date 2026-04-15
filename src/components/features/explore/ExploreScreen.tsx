import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { QUERY_CONSTANTS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import { View, StyleSheet, TextInput, StatusBar, Platform, Dimensions } from 'react-native';
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
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { navigateToEncodedChannelUri } from '@/utils/navigation/navigateEncodedChannel';
import ProfileService, { useFollowMutation } from '@/services/data/ProfileService';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/UI';
import HeaderBanner from '@/components/ui/HeaderBanner';

const GRADIENT_SHIM = require('@/assets/embed-video-gradient-shim.png');

import { SearchIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import EmptyFeed from '@/components/features/feed/EmptyFeed';
import { getBottomNavBarHeight } from '@/utils/device/screen';
import { HeaderService, useHeaders, type Header } from '@/services/OrbytBannerService';
import { useFeed } from '@/hooks/useFeed';
import { useUserStore, useFeedSettings } from '@/stores/userStore';
import type { ExtendedFeedViewPost } from '@/services/api/types';
import { useFollowStore } from '@/stores/followStore';
import { useOrbytChannels } from '@/services/OrbytChannelsService';
import { useVisitHistory, type VisitHistoryEntry } from '@/hooks/useVisitHistory';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';

import {
  exploreListKeyExtractor,
  type Profile,
  type Channel,
  type ListItem,
  type SearchResult,
  type ExploreSearchTabId,
} from './types';
import { prefetchProfileThenOpen } from './prefetchProfileThenOpen';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';
import { SearchSwipePager } from './SearchSwipePager';
import type { SearchSwipePagerRef } from './SearchSwipePager';
import { SearchFeedRenderer, ExploreSuggestionsProfileRow } from './searchFeedRenderers';
import { OrbytChannelsGrid } from './OrbytChannelsGrid';
import {
  ExploreSectionHeaderRow,
  ExploreSuggestionsLoadingRow,
} from './ExploreSuggestionSectionChrome';
import { ExploreSpotlightCarousel } from './ExploreSpotlightCarousel';
import { ExploreSectionLoading, ExploreTopSpacer } from './exploreListChrome';
import { ExploreSearchTabIndicator } from './ExploreSearchTabIndicator';
import { mapSearchFeedToResults } from './mapSearchFeedToResults';
import { useExploreSuggestionsQueries } from './useExploreSuggestionsQueries';
import { useExploreTabRefs } from './useExploreTabRefs';
import { useExploreSearchDebounce } from './useExploreSearchDebounce';
import {
  EXPLORE_SEARCH_LAYOUT,
  exploreSearchChromeHeight,
  getExploreTopChromeSpacerHeight,
} from './exploreLayout';
import { EXPLORE_HEADER_BANNER_ASPECT_RATIO } from './exploreConstants';

const ExploreScreen: React.FC = () => {
  const { t } = useTranslation();
  const flashListRef = useRef<FlashListRef<ListItem> | null>(null);
  const currentUser = useUserStore(state => state.currentUser);
  const searchInputRef = useRef<TextInput | null>(null);
  const searchPagerRef = useRef<SearchSwipePagerRef>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ExploreSearchTabId>('recently-visited');
  const {
    visitHistory,
    addVisit,
    profilesByDid: recentProfilesByDid,
    channelsByUri: recentChannelsByUri,
  } = useVisitHistory(currentUser?.did ?? null);
  const { debouncedQuery, clearPendingDebounce, setDebouncedQuery } =
    useExploreSearchDebounce(searchQuery);

  const searchProgress = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const indicatorScrollProgress = useSharedValue(0);
  const handleSearchPageIndexChange = useCallback(
    (index: number) => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write
      indicatorScrollProgress.value = index;
    },
    [indicatorScrollProgress]
  );

  const queryClient = useQueryClient();
  const { navigateToProfile: goToProfile, navigateToChannel: goToChannel } =
    useProfileChannelNavigation();

  const followMutation = useFollowMutation();
  const insets = useSafeAreaInsets();
  const [hasHeaderBannerError, setHasHeaderBannerError] = useState<boolean>(false);

  const { nativeTabsEnabled } = useFeedSettings();

  const bottomPadding = nativeTabsEnabled
    ? getBottomNavBarHeight(insets) + 10
    : getBottomNavBarHeight(insets);

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

  useEffect(() => {
    if (currentUser?.did) {
      ProfileService.setCurrentUserDid(currentUser.did);
    }
  }, [currentUser?.did]);

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

  const followStoreFollows = useFollowStore(state => state.follows);

  const searchResults: SearchResult[] = useMemo(() => {
    if (!searchFeedOption || !searchFeed.length) {
      return [];
    }
    return mapSearchFeedToResults(searchFeed as ExtendedFeedViewPost[], {
      followStoreFollows,
      currentUser,
      t,
    });
  }, [searchFeedOption, searchFeed, currentUser, followStoreFollows, t]);

  const handleHistoryItemPress = useCallback(
    (item: VisitHistoryEntry) => {
      if (item.type === 'profile') {
        const did = item.did;
        const hydrated = recentProfilesByDid.get(did);
        prefetchProfileThenOpen(
          hydrated ??
            ({
              did,
              handle: '',
              displayName: '',
              avatar: '',
              description: '',
            } as unknown as Profile),
          queryClient,
          goToProfile
        );
      } else if (item.type === 'channel') {
        navigateToEncodedChannelUri(item.uri, goToChannel);
      }
    },
    [goToChannel, goToProfile, queryClient, recentProfilesByDid]
  );

  const handleProfileNavigation = useCallback(
    (profile: Profile) => {
      addVisit('profile', profile);
      prefetchProfileThenOpen(profile, queryClient, goToProfile);
    },
    [addVisit, goToProfile, queryClient]
  );

  const handleChannelNavigation = useCallback(
    (channel: Channel) => {
      addVisit('channel', channel);
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

  const handleIndicatorTap = useCallback((tabId: ExploreSearchTabId) => {
    searchPagerRef.current?.setPage(tabId);
  }, []);

  const resetExploreSearch = useCallback(() => {
    clearPendingDebounce();
    searchInputRef.current?.setNativeProps({ text: '' });
    setSearchQuery('');
    setDebouncedQuery('');
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
  }, [clearPendingDebounce, setDebouncedQuery]);

  const isSearching = isSearchFocused || debouncedQuery.length > 0;
  const useLiquidGlassSearchBar =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  const searchBarAnimatedStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(
      searchProgress.value,
      [0, 1],
      [0.25, 0.4],
      Extrapolation.CLAMP
    );
    return {
      shadowOpacity,
      elevation: interpolate(searchProgress.value, [0, 1], [5, 8], Extrapolation.CLAMP),
    };
  });

  const searchResultsAnimatedStyle = useAnimatedStyle(() => {
    const opacity = searchProgress.value;
    const translateY = interpolate(searchProgress.value, [0, 1], [-20, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
      pointerEvents: opacity > 0.5 ? 'auto' : 'none',
    };
  });

  const searchTabsAnimatedStyle = useAnimatedStyle(() => {
    return { opacity: searchProgress.value };
  });

  const searchContentAnimatedStyle = useAnimatedStyle(() => {
    return { opacity: searchProgress.value };
  });

  const exploreContentAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: contentOpacity.value,
      pointerEvents: contentOpacity.value > 0.5 ? 'auto' : 'none',
    };
  });

  const topGradientAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(searchProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));

  useEffect(() => {
    if (isSearching) {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write
      searchProgress.value = withTiming(1, {
        duration: 200,
      });
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write
      contentOpacity.value = withTiming(0, {
        duration: 200,
      });
    } else {
      searchProgress.value = withTiming(0, {
        duration: 200,
      });
      contentOpacity.value = withTiming(1, {
        duration: 200,
      });
    }
  }, [isSearching, searchProgress, contentOpacity]);

  useExploreTabRefs({
    flashListRef,
    searchInputRef,
    resetExploreSearch,
    setIsSearchFocused,
    isSearching,
  });

  const viewabilityConfig = useMemo(
    () => ({
      viewAreaCoveragePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    []
  );

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
  const computedHeaderHeight = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    return Math.round(screenWidth / EXPLORE_HEADER_BANNER_ASPECT_RATIO);
  }, []);
  const topChromeSpacerHeight = useMemo(
    () => getExploreTopChromeSpacerHeight(insets.top),
    [insets.top]
  );
  const activeHeaderHeight = useMemo(
    () => (isHeaderVisible ? computedHeaderHeight : topChromeSpacerHeight),
    [computedHeaderHeight, isHeaderVisible, topChromeSpacerHeight]
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

  const listData = suggestionsList;

  const renderSearchTabContent = useCallback(
    (tabId: ExploreSearchTabId) => (
      <SearchFeedRenderer
        feedOption={tabId}
        searchResults={searchResults}
        onFollow={handleFollow}
        isLoading={isSearchLoading}
        onProfilePress={handleProfileNavigation}
        onChannelPress={handleChannelNavigation}
        visitHistory={visitHistory}
        onHistoryItemPress={handleHistoryItemPress}
        profilesByDid={recentProfilesByDid}
        channelsByUri={recentChannelsByUri}
        bottomPadding={bottomPadding}
        hasNextPage={hasSearchNextPage}
        isFetchingNextPage={isSearchFetchingNextPage}
        fetchNextPage={fetchSearchNextPage}
      />
    ),
    [
      searchResults,
      handleFollow,
      isSearchLoading,
      handleProfileNavigation,
      handleChannelNavigation,
      visitHistory,
      handleHistoryItemPress,
      recentProfilesByDid,
      recentChannelsByUri,
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
        const screenHeight = Dimensions.get('window').height;
        const bottomNavHeight = getBottomNavBarHeight(insets);
        const availableHeight = screenHeight - activeHeaderHeight - bottomNavHeight;
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
    [t, activeHeaderHeight, insets, queryClient, goToProfile, handleFollow]
  );

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
      <StatusBar barStyle="light-content" backgroundColor={Colors.transparent} translucent={true} />

      <SafeAreaView
        edges={['top']}
        style={[
          styles.searchSafeArea,
          {
            minHeight: EXPLORE_SEARCH_LAYOUT.BAR_OFFSET_TOP + EXPLORE_SEARCH_LAYOUT.BAR_HEIGHT,
          },
        ]}
        pointerEvents="box-none"
      >
        <Reanimated.View
          pointerEvents="none"
          style={[styles.topGradient, styles.topGradientExploreHeight, topGradientAnimatedStyle]}
        >
          <Image source={GRADIENT_SHIM} style={StyleSheet.absoluteFill} contentFit="fill" />
        </Reanimated.View>

        <NativePressable
          onPress={() => searchInputRef.current?.focus()}
          style={styles.searchBarPressable}
        >
          <Reanimated.View style={searchBarAnimatedStyle}>
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
                  onBlur={() => {}}
                  onSubmitEditing={() => {}}
                  autoCapitalize="none"
                  autoCorrect={false}
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
          </Reanimated.View>
        </NativePressable>
      </SafeAreaView>

      <Reanimated.View
        style={[StyleSheet.absoluteFill, searchResultsAnimatedStyle]}
        pointerEvents={isSearching ? 'auto' : 'none'}
      >
        {isSearching && (
          <SafeAreaView edges={['top']} style={styles.searchResultsSafeArea}>
            <View
              style={[styles.exploreSearchResultsTopInset, { height: exploreSearchChromeHeight }]}
              pointerEvents="none"
            />
            <Reanimated.View style={[styles.searchTabsContainer, searchTabsAnimatedStyle]}>
              <View style={styles.indicatorContainer}>
                {pages.map((tabId, tabIndex) => (
                  <ExploreSearchTabIndicator
                    key={tabId}
                    tabId={tabId}
                    tabIndex={tabIndex}
                    onPress={() => handleIndicatorTap(tabId)}
                    indicatorScrollProgress={indicatorScrollProgress}
                    t={t}
                  />
                ))}
              </View>
            </Reanimated.View>

            <Reanimated.View style={[styles.searchContentWrapper, searchContentAnimatedStyle]}>
              <SearchSwipePager
                ref={searchPagerRef}
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
                onPageIndexChange={handleSearchPageIndexChange}
                pages={pages}
                renderTabContent={renderSearchTabContent}
              />
            </Reanimated.View>
          </SafeAreaView>
        )}
      </Reanimated.View>

      <Reanimated.View
        style={[StyleSheet.absoluteFill, exploreContentAnimatedStyle]}
        pointerEvents={!isSearching ? 'auto' : 'none'}
      >
        <FlashList<ListItem>
          ref={flashListRef}
          ListHeaderComponent={listHeaderComponent}
          data={listData}
          keyExtractor={exploreListKeyExtractor}
          renderItem={renderExploreItem}
          contentContainerStyle={[
            styles.listContainer,
            {
              paddingBottom: bottomPadding,
            },
          ]}
          showsVerticalScrollIndicator={
            listData.length >= SCROLL_INDICATOR_CONSTANTS.EXPLORE_SUGGESTIONS_MIN_ITEMS
          }
          bounces={true}
          scrollEventThrottle={16}
          onEndReached={() => {}}
          onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
          removeClippedSubviews={false}
          viewabilityConfig={viewabilityConfig}
          ListEmptyComponent={renderExploreListEmpty}
        />
      </Reanimated.View>
    </View>
  );
};

export default ExploreScreen;
