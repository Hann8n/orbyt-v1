import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '@/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  TextInput,
  StatusBar,
  Platform,
  Dimensions,
  FlatList,
  useWindowDimensions,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { Image } from 'expo-image';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import AtprotoService from '@/services/api/AtprotoService';

import { useRouter } from 'expo-router';
import { buildFeedModalHref } from '@/utils/navigation/feedModalRoute';
import ProfileService, { useFollowMutation, prefetchProfile } from '@/services/data/ProfileService';
import type { ProfileViewWithOrbyt } from '@/services/api/types';
import ChannelService from '@/services/data/ChannelService';
import type { CachedChannel } from '@/services/data/ChannelService';
import { useQueryClient, useQuery, type QueryClient } from '@tanstack/react-query';
import { Avatar, Icon } from '@/components/ui/UI';
import { LinearGradient } from '@/components/ui/LinearGradient';
import HeaderBanner from '@/components/ui/HeaderBanner';
import AuthorItem from '@/components/ui/AuthorItem';
import ChannelItem from '@/components/ui/ChannelItem';

const CORNER_GRADIENT = require('@/assets/corner-gradient.png');
const GRADIENT_SHIM = require('@/assets/embed-video-gradient-shim.png');

import { SearchIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import EmptyFeed from '@/components/features/feed/EmptyFeed';
import { feedService } from '@/services/FeedService';
import * as Device from 'expo-device';
import { getBottomNavBarHeight } from '@/utils/device/screen';
import { getVideoView } from '@/utils/video/helpers';
import BlurredBackground from '@/components/ui/BlurredBackground';
import { HeaderService, useHeaders, type Header } from '@/services/OrbytBannerService';
import { useFeed } from '@/hooks/useFeed';
import { useUserStore, useFeedSettings } from '@/stores/userStore';
import type { ExtendedFeedViewPost } from '@/services/api/types';
import { isCurrentUser } from '@/stores/profileInteractionStore';
import { useFollowStore } from '@/stores/followStore';
import {
  getActiveChannels,
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  getLocalizedChannelDisplayName,
  shouldShowChannelSlash,
  extractFeedSlug,
} from '@/utils/channels/orbyt';
import { tabRefs } from '@/utils/navigation/tabRefs';
import type { ExploreRef } from '@/utils/navigation/tabRefs';
import { useVisitHistory, type VisitHistoryEntry } from '@/hooks/useVisitHistory';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';

// Use ProfileViewWithOrbyt as the canonical profile type (single source of truth)
// Only extract the fields we need for the explore page
type Profile = Pick<
  ProfileViewWithOrbyt,
  'did' | 'handle' | 'displayName' | 'avatar' | 'description' | 'viewer' | 'verification' | 'status'
>;

interface Channel {
  uri: string;
  cid: string;
  did: string;
  creator: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  displayName: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
  indexedAt: string;
}

type ProfileResult = {
  type: 'profile';
  data: Profile;
  relevance: number;
};

type ChannelResult = {
  type: 'channel';
  data: Channel;
  relevance: number;
};

type SearchResult = ProfileResult | ChannelResult;

interface SectionHeader {
  type: 'section-header';
  title: string;
  key: string;
}

interface SpotlightVideosSection {
  type: 'spotlight-videos';
  videos: ExtendedFeedViewPost[];
  key: string;
}

interface PopularChannelsSection {
  type: 'popular-channels-section';
  channels: Channel[];
  key: string;
}

interface OrbytChannelsSection {
  type: 'orbyt-channels-section';
  channels: Channel[];
  key: string;
}

interface HeaderSpacerItem {
  type: 'header-spacer';
  key: string;
}

interface LoadingItem {
  type: 'loading';
  key: string;
}

type ListItem =
  | SearchResult
  | SectionHeader
  | SpotlightVideosSection
  | PopularChannelsSection
  | OrbytChannelsSection
  | HeaderSpacerItem
  | LoadingItem;

const isProfileResult = (result: SearchResult): result is ProfileResult =>
  result.type === 'profile';
const isChannelResult = (result: SearchResult): result is ChannelResult =>
  result.type === 'channel';

/** Prefetch profile then open with tab-aware stack navigation. */
const prefetchProfileThenOpen = (
  profile: Profile,
  queryClient: QueryClient,
  openProfileForDid: (did: string) => void
) => {
  if (!profile.did) return;

  const did = profile.did.trim();
  if (!did) return;

  prefetchProfile(queryClient, did, {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    avatar: profile.avatar,
    description: profile.description,
    verification: profile.verification,
  }).finally(() => {
    openProfileForDid(did);
  });
};

// SearchSwipePager ref interface
export interface SearchSwipePagerRef {
  setPage: (tabId: 'recently-visited' | 'profiles' | 'channels') => void;
}

// SearchSwipePager component - simplified, uses PagerView native API directly
const SearchSwipePager = forwardRef<
  SearchSwipePagerRef,
  {
    activeTab: 'recently-visited' | 'profiles' | 'channels';
    onActiveTabChange: (tab: 'recently-visited' | 'profiles' | 'channels') => void;
    onPageIndexChange?: (index: number) => void;
    renderTabContent: (tabId: 'recently-visited' | 'profiles' | 'channels') => React.ReactNode;
    pages: Array<'recently-visited' | 'profiles' | 'channels'>;
  }
>(({ activeTab, onActiveTabChange, onPageIndexChange, renderTabContent, pages }, ref) => {
  const pagerViewRef = useRef<PagerView>(null);
  const activeIndex = pages.indexOf(activeTab);

  useImperativeHandle(
    ref,
    () => ({
      setPage: (tabId: 'recently-visited' | 'profiles' | 'channels') => {
        const targetIndex = pages.indexOf(tabId);
        if (targetIndex >= 0 && pagerViewRef.current) {
          pagerViewRef.current.setPage(targetIndex);
        }
      },
    }),
    [pages]
  );

  const handlePageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const index = event.nativeEvent.position;
      onPageIndexChange?.(index);
      const tab = pages[index];
      if (tab && tab !== activeTab) {
        onActiveTabChange(tab);
      }
    },
    [activeTab, pages, onActiveTabChange, onPageIndexChange]
  );

  return (
    <View style={styles.searchResultsContainer}>
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={activeIndex >= 0 ? activeIndex : 0}
        onPageSelected={handlePageSelected}
        scrollEnabled={true}
        pageMargin={0}
      >
        {pages.map(page => (
          <View key={page} style={styles.pagerPage}>
            {renderTabContent(page)}
          </View>
        ))}
      </PagerView>
    </View>
  );
});
SearchSwipePager.displayName = 'SearchSwipePager';

// Profiles Feed Renderer
const ProfilesFeedRenderer = React.memo(
  ({
    searchResults,
    onFollow,
    isLoading,
    onProfilePress,
    bottomPadding = 0,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }: {
    searchResults: SearchResult[];
    onFollow: (profile: Profile) => void;
    isLoading?: boolean;
    onProfilePress?: (profile: Profile) => void;
    bottomPadding?: number;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
  }) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

    const profiles = useMemo(() => {
      const seen = new Set<string>();
      const dedupedProfiles: Profile[] = [];

      for (const result of searchResults) {
        if (!isProfileResult(result)) continue;
        const profile = result.data;
        const key = profile.did || profile.handle;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        dedupedProfiles.push(profile);
      }

      return dedupedProfiles;
    }, [searchResults]);

    const handleLoadMore = useCallback(() => {
      if (hasNextPage && !isFetchingNextPage && fetchNextPage) {
        fetchNextPage();
      }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const renderEmptyProfiles = useCallback(
      () => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noPeopleFound')}</Text>
        </View>
      ),
      [t]
    );

    const renderProfileItem = useCallback(
      ({ item: profile }: { item: Profile }) => {
        const isFollowing = !!profile.viewer?.following;

        return (
          <AuthorItem
            handle={profile.handle || ''}
            did={profile.did}
            displayName={profile.displayName}
            avatar={profile.avatar}
            size="large"
            showArrow={false}
            showFollowButton={!isFollowing}
            isFollowing={isFollowing}
            onFollowPress={() => onFollow(profile)}
            onPress={() => {
              if (onProfilePress) {
                onProfilePress(profile);
              } else {
                prefetchProfileThenOpen(profile, queryClient, goToProfile);
              }
            }}
            backgroundColor={Colors.transparent}
            textColor={Colors.neutral[50]}
            nameFontWeight="Figtree-SemiBold"
            style={styles.authorItemStyle}
          />
        );
      },
      [onFollow, onProfilePress, queryClient, goToProfile]
    );

    if (isLoading) {
      return (
        <View style={styles.loadingContainerFull}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      );
    }

    return (
      <FlashList
        data={profiles}
        keyExtractor={profile => `profile-${profile.did || profile.handle}`}
        renderItem={renderProfileItem}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        onEndReached={handleLoadMore}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        maintainVisibleContentPosition={{
          disabled: false,
          autoscrollToTopThreshold: undefined,
        }}
        ListEmptyComponent={renderEmptyProfiles}
      />
    );
  }
);
ProfilesFeedRenderer.displayName = 'ProfilesFeedRenderer';

// Channels Feed Renderer
const ChannelsFeedRenderer = React.memo(
  ({
    searchResults,
    isLoading,
    onChannelPress,
    bottomPadding = 0,
  }: {
    searchResults: SearchResult[];
    isLoading?: boolean;
    onChannelPress?: (channel: Channel) => void;
    bottomPadding?: number;
  }) => {
    const { t } = useTranslation();
    const { navigateToChannel: goToChannel } = useProfileChannelNavigation();

    const channels = useMemo(() => {
      const seen = new Set<string>();
      const dedupedChannels: Channel[] = [];

      for (const result of searchResults) {
        if (!isChannelResult(result)) continue;
        const channel = result.data;
        const key = channel.uri || channel.cid;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        dedupedChannels.push(channel);
      }

      return dedupedChannels;
    }, [searchResults]);

    const renderEmptyChannels = useCallback(
      () => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noFeedsFound')}</Text>
        </View>
      ),
      [t]
    );

    const renderChannelItem = useCallback(
      ({ item: channel }: { item: Channel }) => (
        <ChannelItem
          uri={channel.uri}
          displayName={channel.displayName}
          avatar={channel.avatar}
          size="large"
          showArrow={false}
          onPress={() => {
            if (onChannelPress) {
              onChannelPress(channel);
            } else {
              if (channel.uri && channel.uri.trim()) {
                goToChannel(encodeURIComponent(channel.uri.trim()));
              }
            }
          }}
          backgroundColor={Colors.transparent}
          textColor={Colors.neutral[50]}
          nameFontWeight="Figtree-Bold"
          style={styles.channelItemStyle}
        />
      ),
      [onChannelPress, goToChannel]
    );

    if (isLoading) {
      return (
        <View style={[styles.loadingContainer, styles.flexOne]}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      );
    }

    return (
      <FlashList
        data={channels}
        keyExtractor={channel => `channel-${channel.uri || channel.cid}`}
        renderItem={renderChannelItem}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={renderEmptyChannels}
      />
    );
  }
);
ChannelsFeedRenderer.displayName = 'ChannelsFeedRenderer';

// Visit History Component
const VisitHistoryList = React.memo(
  ({
    visitHistory,
    onHistoryItemPress,
    onFollow,
    bottomPadding = 0,
    profilesByDid,
    channelsByUri,
  }: {
    visitHistory: VisitHistoryEntry[];
    onHistoryItemPress: (item: VisitHistoryEntry) => void;
    onFollow: (profile: Profile) => void;
    bottomPadding?: number;
    profilesByDid: Map<string, ProfileViewWithOrbyt>;
    channelsByUri: Map<string, CachedChannel>;
  }) => {
    const { t } = useTranslation();
    return (
      <FlashList
        data={visitHistory}
        keyExtractor={item => {
          if (item.type === 'profile') {
            return `history-profile-${item.did}`;
          } else {
            return `history-channel-${item.uri}`;
          }
        }}
        renderItem={({ item }) => {
          const isProfile = item.type === 'profile';
          const profileData = isProfile ? profilesByDid.get(item.did) : null;
          const channelData = !isProfile ? channelsByUri.get(item.uri) : null;

          if (isProfile && profileData) {
            const isFollowing = !!profileData.viewer?.following;

            return (
              <AuthorItem
                handle={profileData.handle || ''}
                did={profileData.did}
                displayName={profileData.displayName}
                avatar={profileData.avatar}
                size="large"
                showArrow={false}
                showFollowButton={!isFollowing}
                isFollowing={isFollowing}
                onFollowPress={() => onFollow(profileData as unknown as Profile)}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-SemiBold"
                style={styles.authorItemStyle}
              />
            );
          }

          if (isProfile && !profileData) {
            return (
              <AuthorItem
                handle=""
                did={item.did}
                displayName={t('feed.loading')}
                avatar={undefined}
                size="large"
                showArrow={false}
                showFollowButton={false}
                isFollowing={false}
                onFollowPress={undefined}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-SemiBold"
                style={styles.authorItemStyle}
              />
            );
          }

          if (!isProfile && channelData) {
            return (
              <ChannelItem
                uri={channelData.uri}
                displayName={channelData.displayName}
                avatar={channelData.avatar}
                size="large"
                showArrow={false}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-Bold"
                style={styles.channelItemStyle}
              />
            );
          }

          if (!isProfile && !channelData) {
            return (
              <ChannelItem
                uri={item.uri}
                displayName={t('feed.loading')}
                avatar={undefined}
                size="large"
                showArrow={false}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-Bold"
                style={styles.channelItemStyle}
              />
            );
          }
          return null;
        }}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={() => (
          <View style={styles.emptyTabContent}>
            <Text style={styles.emptyTabText}>{t('feed.noRecentVisits')}</Text>
          </View>
        )}
      />
    );
  }
);
VisitHistoryList.displayName = 'VisitHistoryList';

// Search Feed Renderer
const SearchFeedRenderer = React.memo(
  ({
    feedOption,
    searchResults,
    onFollow,
    isLoading,
    onProfilePress,
    onChannelPress,
    visitHistory,
    onHistoryItemPress,
    profilesByDid,
    channelsByUri,
    bottomPadding = 0,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }: {
    feedOption: string;
    searchResults: SearchResult[];
    onFollow: (profile: Profile) => void;
    isLoading?: boolean;
    onProfilePress?: (profile: Profile) => void;
    onChannelPress?: (channel: Channel) => void;
    visitHistory?: VisitHistoryEntry[];
    onHistoryItemPress?: (item: VisitHistoryEntry) => void;
    profilesByDid?: Map<string, ProfileViewWithOrbyt>;
    channelsByUri?: Map<string, CachedChannel>;
    bottomPadding?: number;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
  }) => {
    if (feedOption === 'recently-visited') {
      return (
        <VisitHistoryList
          visitHistory={visitHistory || []}
          onHistoryItemPress={onHistoryItemPress || (() => {})}
          onFollow={onFollow}
          bottomPadding={bottomPadding}
          profilesByDid={profilesByDid || new Map()}
          channelsByUri={channelsByUri || new Map()}
        />
      );
    }

    if (feedOption === 'profiles') {
      return (
        <ProfilesFeedRenderer
          searchResults={searchResults}
          onFollow={onFollow}
          isLoading={isLoading}
          onProfilePress={onProfilePress}
          bottomPadding={bottomPadding}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      );
    } else if (feedOption === 'channels') {
      return (
        <ChannelsFeedRenderer
          searchResults={searchResults}
          isLoading={isLoading}
          onChannelPress={onChannelPress}
          bottomPadding={bottomPadding}
        />
      );
    }
    return null;
  }
);
SearchFeedRenderer.displayName = 'SearchFeedRenderer';

const SectionHeaderLoading = () => (
  <View style={[styles.sectionHeader, styles.loadingContainer]}>
    <ActivityIndicator size="small" color={Colors.neutral[50]} />
  </View>
);

const PopularChannelsLoading = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="small" color={Colors.neutral[50]} />
  </View>
);

const SpotlightLoading = () => (
  <View style={[styles.spotlightContainer, styles.loadingContainer]}>
    <ActivityIndicator size="small" color={Colors.neutral[50]} />
  </View>
);

// Header spacer component
const HeaderSpacer = ({ computedHeaderHeight }: { computedHeaderHeight: number }) => {
  // Always use the computed header height for consistency
  return <View style={{ height: computedHeaderHeight }} />;
};

// Channel Name Component with orbyt formatting
const ChannelNameDisplay: React.FC<{ channel: Channel; style?: StyleProp<ViewStyle> }> = ({
  channel,
  style,
}) => {
  const { t } = useTranslation();
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || Colors.amber[400];
  const displayName =
    getLocalizedChannelDisplayName(channel.uri, channel.displayName) ||
    channel.displayName ||
    t('feed.unknownChannel');

  if (isOrbyt) {
    const showSlash = shouldShowChannelSlash(channel.uri);
    return (
      <View style={[styles.rowCenter, style]}>
        {showSlash && (
          <Text style={[styles.channelName, styles.orbytSlash, { color: channelColor }]}>/</Text>
        )}
        <Text style={styles.channelName} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
    );
  }

  return (
    <Text style={styles.channelName} numberOfLines={1}>
      {displayName}
    </Text>
  );
};

// Popular Channel Item Component using normal list style
const PopularChannelItem = ({ channel, onPress }: { channel: Channel; onPress: () => void }) => {
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  return (
    <NativePressable style={styles.channelItem} onPress={onPress}>
      <Avatar
        uri={avatarUri}
        type="channel"
        size={48}
        ringColor="transparent"
        style={styles.channelImage}
      />
      <View style={styles.channelContent}>
        <View style={styles.rowCenter}>
          <ChannelNameDisplay channel={channel} />
        </View>
      </View>
    </NativePressable>
  );
};

// Grid Channel Item Component with large square thumbnail
const GridChannelItem = ({
  channel,
  onPress,
  itemWidth,
  itemHeight,
}: {
  channel: Channel;
  onPress: () => void;
  itemWidth: number;
  itemHeight?: number;
}) => {
  const { t } = useTranslation();
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || Colors.amber[400];
  const thumbnailHeight = itemHeight || itemWidth; // Use itemHeight if provided, otherwise use itemWidth for square

  return (
    <NativePressable style={[styles.gridChannelItem, { width: itemWidth }]} onPress={onPress}>
      <View
        style={[
          styles.gridChannelThumbnail,
          { height: thumbnailHeight },
          itemHeight ? { aspectRatio: undefined } : {}, // Remove aspectRatio when height is explicitly set
        ]}
      >
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={styles.gridChannelImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="normal"
            transition={200}
          />
        ) : (
          <View
            style={[
              styles.gridChannelImage,
              styles.centerContent,
              { backgroundColor: Colors.neutral[900] },
            ]}
          >
            <Icon name="tv_2" size={thumbnailHeight * 0.4} color={Colors.neutral[500]} />
          </View>
        )}
        {/* Light gradient from bottom */}
        <LinearGradient
          colors={[Colors.transparent, Colors.overlay.black50]}
          style={styles.gridChannelGradient}
        />
        {/* Corner gradient at bottom left */}
        <Image
          source={CORNER_GRADIENT}
          style={styles.gridChannelCornerGradient}
          contentFit="cover"
        />
        {/* Channel name overlay at bottom left */}
        <View style={styles.gridChannelNameOverlay}>
          {isOrbyt ? (
            <View style={styles.rowCenter}>
              {shouldShowChannelSlash(channel.uri) && (
                <Text style={[styles.gridChannelName, styles.orbytSlash, { color: channelColor }]}>
                  /
                </Text>
              )}
              <Text style={styles.gridChannelName} numberOfLines={1}>
                {getLocalizedChannelDisplayName(channel.uri, channel.displayName) ||
                  channel.displayName ||
                  t('feed.unknownChannel')}
              </Text>
            </View>
          ) : (
            <Text style={styles.gridChannelName} numberOfLines={1}>
              {getLocalizedChannelDisplayName(channel.uri, channel.displayName) ||
                channel.displayName ||
                t('feed.unknownChannel')}
            </Text>
          )}
        </View>
      </View>
    </NativePressable>
  );
};

// Horizontal Channel Button Component for popular now and latest (full width, GIF on right, label bottom left)
const HorizontalChannelItem = ({
  channel,
  onPress,
  itemWidth,
  itemHeight,
}: {
  channel: Channel;
  onPress: () => void;
  itemWidth: number;
  itemHeight: number;
}) => {
  const { t } = useTranslation();
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || Colors.amber[400];
  // Calculate max width for label: full width - left padding - right padding
  const labelMaxWidth = itemWidth - 16 - 16; // width - left padding - right padding

  // Check if this is the popular now channel for special cropping
  const slug = extractFeedSlug(channel.uri || '');
  const isPopularNow = slug === 'popular-now';
  const isLatest = slug === 'latest';

  return (
    <NativePressable
      style={[
        styles.horizontalChannelButton,
        {
          width: itemWidth,
          height: itemHeight,
          backgroundColor: channelColor,
        },
      ]}
      onPress={onPress}
    >
      {/* GIF fills entire button */}
      <View style={[styles.horizontalChannelThumbnail, isLatest && styles.centerContent]}>
        {isPopularNow ? (
          <Image
            source={{ uri: avatarUri }}
            style={[
              styles.horizontalChannelImage,
              styles.popularNowImage,
              {
                width: itemWidth * 0.7,
                height: itemHeight * 2.5,
              },
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="normal"
            transition={200}
          />
        ) : isLatest ? (
          <Image
            source={{ uri: avatarUri }}
            style={[styles.horizontalChannelImage, styles.latestImage]}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="normal"
            transition={200}
          />
        ) : (
          <Avatar
            uri={avatarUri}
            type="channel"
            size={Math.max(itemWidth, itemHeight)}
            ringColor={Colors.transparent}
            style={styles.horizontalChannelImage}
          />
        )}
      </View>

      {/* Label at bottom left - overlaying GIF */}
      <View style={[styles.horizontalChannelLabelContainer, { maxWidth: labelMaxWidth }]}>
        {isOrbyt ? (
          <View style={styles.rowCenter}>
            {shouldShowChannelSlash(channel.uri) && (
              <Text style={[styles.horizontalChannelLabel, styles.orbytSlash]}>/</Text>
            )}
            <Text style={styles.horizontalChannelLabel} numberOfLines={1}>
              {getLocalizedChannelDisplayName(channel.uri, channel.displayName) ||
                channel.displayName ||
                t('feed.unknownChannel')}
            </Text>
          </View>
        ) : (
          <Text style={styles.horizontalChannelLabel} numberOfLines={1}>
            {getLocalizedChannelDisplayName(channel.uri, channel.displayName) ||
              channel.displayName ||
              t('feed.unknownChannel')}
          </Text>
        )}
      </View>
    </NativePressable>
  );
};

// Search-related components moved to search.tsx

// Responsive orbyt Channels Grid Component
const OrbytChannelsGrid = React.memo(({ channels }: { channels: Channel[] }) => {
  const { navigateToChannel: goToChannel } = useProfileChannelNavigation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet =
    Device.deviceType === Device.DeviceType.TABLET || Math.min(windowWidth, windowHeight) >= 600;

  // Responsive column calculation - similar to GridFeedView
  const computedColumns = useMemo(() => {
    const w = windowWidth || Dimensions.get('window').width;
    let cols = 3; // default mobile
    if (w > 1200 || isTablet) {
      cols = 6;
    } else if (w > 900) {
      cols = 5;
    } else if (w > 480) {
      cols = 4;
    } else {
      cols = 3;
    }
    // enforce minimum of 3
    return Math.max(3, cols);
  }, [windowWidth, isTablet]);

  // Responsive padding and gap based on screen size
  const { padding, gap } = useMemo(() => {
    const w = windowWidth || Dimensions.get('window').width;
    if (isTablet || w > 900) {
      return { padding: 10, gap: 10 };
    } else if (w > 480) {
      return { padding: 10, gap: 8 };
    } else {
      return { padding: 10, gap: 7 };
    }
  }, [windowWidth, isTablet]);

  // Calculate grid dimensions using native formulas
  // W = container width, p = padding, g = gap
  // availableWidth = W - 2*p
  // itemWidth = (availableWidth - (columns - 1) * g) / columns
  // specialWidth = (availableWidth - g) / 2 (for two items side-by-side)
  const { itemWidth, fullWidth, specialWidth, buttonHeight } = useMemo(() => {
    const screenWidth = windowWidth || Dimensions.get('window').width;
    const availableWidth = screenWidth - padding * 2; // W - 2*p

    // Grid item width: (W - 2*p - (columns - 1) * g) / columns
    const calculatedItemWidth = Math.floor(
      (availableWidth - (computedColumns - 1) * gap) / computedColumns
    );
    const gridItemHeight = calculatedItemWidth; // Square items

    // Full width for stacked special items: availableWidth
    const calculatedFullWidth = availableWidth;

    // Special width for side-by-side items: (availableWidth - g) / 2
    const calculatedSpecialWidth = Math.floor((availableWidth - gap) / 2);

    // Reduced height for popular now and latest buttons (80% of grid item height)
    const calculatedButtonHeight = Math.round(gridItemHeight * 0.8);

    return {
      itemWidth: calculatedItemWidth,
      fullWidth: calculatedFullWidth,
      specialWidth: calculatedSpecialWidth,
      buttonHeight: calculatedButtonHeight,
    };
  }, [windowWidth, padding, gap, computedColumns]);

  const shouldShowSpecialInRow = useMemo(() => {
    return computedColumns >= 4 || isTablet;
  }, [computedColumns, isTablet]);

  const specialItemHeight = useMemo(() => {
    return shouldShowSpecialInRow ? Math.round(buttonHeight * 0.9) : buttonHeight;
  }, [shouldShowSpecialInRow, buttonHeight]);

  // Separate popular now and latest from other channels
  const popularNowChannel = channels.find(ch => {
    const slug = extractFeedSlug(ch.uri || '');
    return slug === 'popular-now';
  });
  const latestChannel = channels.find(ch => {
    const slug = extractFeedSlug(ch.uri || '');
    return slug === 'latest';
  });
  const otherChannels = channels.filter(ch => {
    const slug = extractFeedSlug(ch.uri || '');
    return slug !== 'popular-now' && slug !== 'latest';
  });

  // Render special items header
  const renderSpecialItems = () => {
    if (!popularNowChannel && !latestChannel) return null;

    if (shouldShowSpecialInRow) {
      // Two items side-by-side using calculated specialWidth
      return (
        <View style={[styles.specialRow, { marginBottom: gap }]}>
          {popularNowChannel && (
            <View style={{ width: specialWidth }}>
              <HorizontalChannelItem
                channel={popularNowChannel}
                itemWidth={specialWidth}
                itemHeight={specialItemHeight}
                onPress={() => {
                  if (popularNowChannel.uri && popularNowChannel.uri.trim()) {
                    goToChannel(encodeURIComponent(popularNowChannel.uri.trim()));
                  }
                }}
              />
            </View>
          )}
          {latestChannel && (
            <View style={{ width: specialWidth, marginLeft: gap }}>
              <HorizontalChannelItem
                channel={latestChannel}
                itemWidth={specialWidth}
                itemHeight={specialItemHeight}
                onPress={() => {
                  if (latestChannel.uri && latestChannel.uri.trim()) {
                    goToChannel(encodeURIComponent(latestChannel.uri.trim()));
                  }
                }}
              />
            </View>
          )}
        </View>
      );
    } else {
      // Stacked items using fullWidth
      return (
        <View style={{ marginBottom: gap }}>
          {popularNowChannel && (
            <View style={{ width: fullWidth, marginBottom: gap }}>
              <HorizontalChannelItem
                channel={popularNowChannel}
                itemWidth={fullWidth}
                itemHeight={specialItemHeight}
                onPress={() => {
                  if (popularNowChannel.uri && popularNowChannel.uri.trim()) {
                    goToChannel(encodeURIComponent(popularNowChannel.uri.trim()));
                  }
                }}
              />
            </View>
          )}
          {latestChannel && (
            <View style={{ width: fullWidth }}>
              <HorizontalChannelItem
                channel={latestChannel}
                itemWidth={fullWidth}
                itemHeight={specialItemHeight}
                onPress={() => {
                  if (latestChannel.uri && latestChannel.uri.trim()) {
                    goToChannel(encodeURIComponent(latestChannel.uri.trim()));
                  }
                }}
              />
            </View>
          )}
        </View>
      );
    }
  };

  return (
    <View style={[styles.channelsGridContainer, { paddingHorizontal: padding }]}>
      {/* Render special items */}
      {renderSpecialItems()}

      {/* Render grid items with proper width calculations */}
      {otherChannels.length > 0 && (
        <View style={styles.gridItemsContainer}>
          {otherChannels.map((channel, index) => {
            const isLastInRow = (index + 1) % computedColumns === 0;
            const wrapperStyle = [
              styles.gridChannelWrapper,
              {
                width: itemWidth,
                marginRight: isLastInRow ? 0 : gap,
                marginBottom: gap,
              },
            ];
            return (
              <View
                key={`orbyt-channel-${channel.uri || channel.cid || index}`}
                style={wrapperStyle}
              >
                <GridChannelItem
                  channel={channel}
                  itemWidth={itemWidth}
                  onPress={() => {
                    if (channel.uri && channel.uri.trim()) {
                      goToChannel(encodeURIComponent(channel.uri.trim()));
                    }
                  }}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
});
OrbytChannelsGrid.displayName = 'orbytChannelsGrid';

const ExploreScreen: React.FC = () => {
  const { t } = useTranslation();
  const flashListRef = useRef<FlashListRef<ListItem> | null>(null);
  const currentUser = useUserStore(state => state.currentUser);
  const searchInputRef = useRef<TextInput | null>(null);
  const searchPagerRef = useRef<SearchSwipePagerRef>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'recently-visited' | 'profiles' | 'channels'>(
    'recently-visited'
  );
  const {
    visitHistory,
    addVisit,
    profilesByDid: recentProfilesByDid,
    channelsByUri: recentChannelsByUri,
  } = useVisitHistory(currentUser?.did ?? null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reanimated values for smooth transitions
  const searchProgress = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const indicatorScrollProgress = useSharedValue(0);
  const handleSearchPageIndexChange = useCallback(
    (index: number) => {
      indicatorScrollProgress.value = index;
    },
    [indicatorScrollProgress]
  );

  const router = useRouter();
  const queryClient = useQueryClient();
  const { navigateToProfile: goToProfile, navigateToChannel: goToChannel } =
    useProfileChannelNavigation();

  // Use the follow mutation hook for proper cache management
  const followMutation = useFollowMutation();
  const insets = useSafeAreaInsets();

  const { nativeTabsEnabled } = useFeedSettings();

  // Calculate bottom padding - add extra when native tabs are enabled for better coverage
  const bottomPadding = nativeTabsEnabled
    ? getBottomNavBarHeight(insets) + 10
    : getBottomNavBarHeight(insets);

  // Handle follow toggle with persistent cache
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

  // Initialize current user for ProfileService on mount - use store instead of API call
  useEffect(() => {
    if (currentUser?.did) {
      ProfileService.setCurrentUserDid(currentUser.did);
    }
  }, [currentUser?.did]);

  // Fetch headers using TanStack Query
  const { data: fetchedHeaders = [], isLoading: isLoadingHeaders } = useHeaders();

  // Process headers with image URLs
  const headers = useMemo(() => {
    return fetchedHeaders.map((header: Header) => ({
      ...header,
      imageUrl: HeaderService.getImageUrl(header.imageUrl),
    }));
  }, [fetchedHeaders]);

  // Debounce search query
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    if (searchQuery === '') {
      setDebouncedQuery('');
      debounceTimeoutRef.current = null;
      return;
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      debounceTimeoutRef.current = null;
    }, 500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [searchQuery]);

  // Search feed option
  const searchFeedOption = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.trim() === '') {
      return null;
    }
    return `search:${debouncedQuery}`;
  }, [debouncedQuery]);

  // Fetch search feed
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

  // Process search results
  type SearchFeedPost = ExtendedFeedViewPost['post'] & {
    contentMode?: string;
    text?: string;
    description?: string;
    likeCount?: number;
    indexedAt?: string;
    viewer?: { following?: string | null };
    avatar?: string;
  };

  const searchResults = useMemo(() => {
    if (!searchFeedOption || !searchFeed.length) {
      return [];
    }

    const results: SearchResult[] = [];

    for (let index = 0; index < searchFeed.length; index++) {
      const feedItem = searchFeed[index] as ExtendedFeedViewPost;
      const post = feedItem.post as SearchFeedPost;

      // Check if this is a channel (feed generator)
      // Channels from search have uri that includes 'app.bsky.feed.generator'
      const isChannel = post.uri?.includes('app.bsky.feed.generator');

      if (isChannel) {
        // Channel data structure from FeedService:
        // post.uri = channel.uri
        // post.text = channel.displayName
        // post.avatar = channel.avatar
        // post.contentMode = channel.contentMode
        // post.author = channel.creator
        const contentMode = post.contentMode;
        // Note: Service layer already filters to video-only feeds, but double-check for safety
        if (contentMode && contentMode !== 'app.bsky.feed.defs#contentModeVideo') {
          continue;
        }

        results.push({
          type: 'channel' as const,
          data: {
            uri: post.uri,
            cid: post.cid,
            did: post.author?.did || '',
            displayName: post.text || post.author?.displayName || t('feed.unknownChannel'),
            description: post.description || '',
            creator: post.author
              ? {
                  did: post.author.did || '',
                  handle: post.author.handle || '',
                  displayName: post.author.displayName || '',
                  avatar: post.author.avatar || '',
                }
              : {
                  did: '',
                  handle: '',
                },
            avatar: post.avatar || post.author?.avatar || '',
            likeCount: post.likeCount || 0,
            indexedAt: post.indexedAt || new Date().toISOString(),
            contentMode,
          } as Channel & { contentMode?: string },
          relevance: 10 - index,
        });
        continue;
      }

      // Check if this is a profile
      // Profiles from search have post.uri = 'at://${profile.did}/profile' and post.author set
      // But we check for post.author first since that's the reliable indicator
      if (
        post.author &&
        (post.uri?.includes('/profile') || !post.uri?.includes('app.bsky.feed.generator'))
      ) {
        const postText = post.text || '';
        const did = post.author.did || '';
        const followStoreState = followStoreFollows?.get(did);

        results.push({
          type: 'profile' as const,
          data: {
            did,
            handle: post.author.handle || '',
            displayName: post.author.displayName || '',
            avatar: post.author.avatar || '',
            description: postText || '',
            viewer: {
              following: followStoreState?.isFollowing
                ? 'at://placeholder'
                : post.viewer?.following,
            },
            // Extract verification and status directly from API response (ProfileViewBasic includes both)
            verification: post.author.verification,
            status: post.author.status,
          } as Profile,
          relevance: 10 - index,
        });
        continue;
      }

      // Check for embedded channels in posts
      if (post.embed?.$type === 'app.bsky.embed.record') {
        const postText = post.text || '';
        const embedRecord = (
          post.embed as {
            record?: {
              uri?: string;
              cid?: string;
              contentMode?: string;
              view?: { contentMode?: string };
            };
          }
        )?.record;
        const isEmbedChannel = embedRecord?.uri?.includes('app.bsky.feed.generator');

        if (isEmbedChannel) {
          const contentMode = embedRecord?.contentMode || embedRecord?.view?.contentMode;
          results.push({
            type: 'channel' as const,
            data: {
              uri: embedRecord?.uri || post.uri,
              cid: embedRecord?.cid || post.cid,
              displayName: postText || t('feed.unknownChannel'),
              description: postText || '',
              creator: post.author
                ? {
                    did: post.author.did || '',
                    handle: post.author.handle || '',
                    displayName: post.author.displayName || '',
                    avatar: post.author.avatar || '',
                  }
                : {
                    did: '',
                    handle: '',
                  },
              indexedAt: post.indexedAt || new Date().toISOString(),
              contentMode,
            } as Channel & { contentMode?: string },
            relevance: 10 - index,
          });
          continue;
        }
      }
    }

    const filtered = results.filter(result => {
      if (result.type === 'profile') {
        const profile = result.data as Profile;
        if (isCurrentUser(profile.did, profile.handle, currentUser)) {
          return false;
        }
      }
      return true;
    });

    return filtered;
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
        if (item.uri) {
          goToChannel(encodeURIComponent(item.uri));
        }
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
      if (channel.uri) {
        goToChannel(encodeURIComponent(channel.uri));
      }
    },
    [addVisit, goToChannel]
  );

  // Determine search pages
  const pages: Array<'recently-visited' | 'profiles' | 'channels'> = useMemo(() => {
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

  // Simple animated indicator component
  const IndicatorItem = ({
    tabId,
    onPress,
  }: {
    tabId: 'recently-visited' | 'profiles' | 'channels';
    onPress: () => void;
  }) => {
    const tabIndex = pages.indexOf(tabId);
    const label =
      tabId === 'recently-visited'
        ? t('feed.recentlyVisited')
        : tabId === 'profiles'
          ? t('feed.people')
          : t('feed.feeds');

    const animatedStyle = useAnimatedStyle(() => {
      'worklet';
      const progress = indicatorScrollProgress.value;
      const isActive = Math.round(progress) === tabIndex;
      const distance = Math.abs(progress - tabIndex);
      const opacity = isActive ? 1 : Math.max(0.3, 1 - distance * 0.4);

      return {
        color: isActive ? Colors.neutral[50] : Colors.neutral[500],
        fontSize: 20,
        fontWeight: isActive ? ('bold' as const) : ('600' as const),
        fontFamily: isActive ? 'Figtree-Bold' : 'Figtree-SemiBold',
        opacity,
      };
    }, [tabIndex]);

    return (
      <NativePressable onPress={onPress} style={styles.indicatorItem}>
        <Reanimated.Text style={animatedStyle}>{label}</Reanimated.Text>
      </NativePressable>
    );
  };

  const handleIndicatorTap = useCallback((tabId: 'recently-visited' | 'profiles' | 'channels') => {
    searchPagerRef.current?.setPage(tabId);
  }, []);

  const handleClearSearch = () => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    searchInputRef.current?.setNativeProps({ text: '' });
    setSearchQuery('');
    setDebouncedQuery('');
    setIsSearchFocused(false);
    searchInputRef.current?.blur();
    // Let useEffect handle the animation when isSearching becomes false
  };

  const isSearching = isSearchFocused || debouncedQuery.length > 0;
  const useLiquidGlassSearchBar =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  // Animated styles
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

  // Animate search state transitions
  useEffect(() => {
    if (isSearching) {
      searchProgress.value = withTiming(1, {
        duration: 200,
      });
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

  // Set up tabRefs for double tap scroll to top
  // Tab press handling is now centralized in CustomBottomTabBar - no need for duplicate listener
  useLayoutEffect(() => {
    tabRefs.explore = {
      scrollToTop: () => {
        // Use FlashList's native scrollToTop method for better performance
        flashListRef.current?.scrollToTop({ animated: true });
      },
      dismissSearch: () => {
        setSearchQuery('');
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      },
      isSearchActive: () => isSearching,
      focusSearch: () => {
        setIsSearchFocused(true);
        searchInputRef.current?.focus();
      },
    } as ExploreRef;

    return () => {
      tabRefs.explore = null;
    };
  }, [isSearching]);

  // Optimized viewabilityConfig
  const viewabilityConfig = useMemo(
    () => ({
      viewAreaCoveragePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    []
  );

  // Fetch orbyt channel details using ChannelService
  // Memoize getActiveChannels() to avoid calling it on every render - only show active channels in explore
  const orbytChannelUris = useMemo(() => getActiveChannels().map(ch => ch.uri), []);
  const {
    data: orbytChannelsData,
    isLoading: isLoadingOrbytChannels,
    error: orbytChannelsError,
    refetch: refetchOrbytChannels,
  } = useQuery({
    queryKey: ['orbytChannels', orbytChannelUris],
    queryFn: async () => {
      // Use ChannelService which handles caching, error handling, and avatar extraction
      // Use Promise.allSettled instead of Promise.all to prevent blocking on failures
      const channelPromises = orbytChannelUris.map(uri => ChannelService.getChannel(uri));
      const results = await Promise.allSettled(channelPromises);

      // Convert CachedChannel to Channel format, filtering out failures
      const cachedChannels: CachedChannel[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
          cachedChannels.push(result.value);
        }
      }

      return cachedChannels.map(
        (cachedChannel): Channel => ({
          uri: cachedChannel.uri,
          cid: cachedChannel.cid,
          did: cachedChannel.did,
          creator: cachedChannel.creator,
          displayName: cachedChannel.displayName,
          description: cachedChannel.description,
          avatar: cachedChannel.avatar,
          likeCount: cachedChannel.likeCount || 0,
          indexedAt: cachedChannel.indexedAt,
        })
      );
    },
    enabled: orbytChannelUris.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch custom spotlight feed (disabled)
  const {
    data: spotlightFeed,
    isLoading: isLoadingSpotlightFeed,
    error: spotlightFeedError,
    refetch: refetchSpotlightFeed,
  } = useQuery({
    queryKey: ['spotlightFeed'],
    queryFn: async () => {
      // Get custom spotlight feed (AtprotoFeedService.getFeed via AtprotoService runs moderation batch; items have contentListUI, contentMediaUI, shouldFilter)
      const response = await AtprotoService.getFeed(
        null,
        'at://did:plc:l3l3fjuwhv4mh4ih5y7ewrue/app.bsky.feed.generator/aaaiu3akzsv6q',
        {},
        true,
        10,
        'custom'
      );
      return response.feed || [];
    },
    enabled: false, // Spotlight videos disabled
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Collapsible header setup (custom for Explore)
  const isHeaderVisible = useMemo(
    () => !isLoadingHeaders && headers.length > 0,
    [isLoadingHeaders, headers.length]
  );
  const computedHeaderHeight = useMemo(() => {
    // Calculate header height: use actual header ratio if available, otherwise use default 30% even during loading
    // This ensures consistent spacing during initial load to prevent spinner jump
    const ratio = Math.max(0.2, Math.min(0.5, headers?.[0]?.heightRatio ?? 0.35));
    return Math.round(Dimensions.get('window').height * ratio);
  }, [headers]);

  // Create loading items for suggested content
  const loadingSuggestedItems = useMemo(() => {
    const items: ListItem[] = [];

    // Add header spacer only when no header is visible
    if (!isHeaderVisible) {
      items.push({ type: 'header-spacer' as const, key: 'header-spacer-loading' });
    }

    // Add loading indicator
    items.push({ type: 'loading' as const, key: 'loading-indicator' });

    return items;
  }, [isHeaderVisible]);

  const suggestionsList: ListItem[] = (() => {
    // Show loading while loading
    if (isLoadingSpotlightFeed || isLoadingOrbytChannels) {
      return loadingSuggestedItems;
    }
    if (spotlightFeedError || orbytChannelsError) {
      return [];
    }
    const data: ListItem[] = [];

    // Add header spacer only when no header is visible
    if (!isHeaderVisible) {
      data.push({ type: 'header-spacer' as const, key: 'header-spacer' });
    }

    if (spotlightFeed && spotlightFeed.length > 0) {
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
    // Add orbyt channels section
    if (orbytChannelsData && orbytChannelsData.length > 0) {
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
  })();

  const listData: ListItem[] = suggestionsList;

  return (
    <View style={[styles.container, Platform.OS === 'android' && styles.androidPaddingTop]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.transparent} translucent={true} />

      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.topGradient,
          {
            height: insets.top + 10 + 48,
          },
          topGradientAnimatedStyle,
        ]}
      >
        <Image source={GRADIENT_SHIM} style={StyleSheet.absoluteFill} contentFit="fill" />
      </Reanimated.View>

      {/* Search Bar */}
      <NativePressable
        onPress={() => searchInputRef.current?.focus()}
        style={styles.searchBarPressable}
      >
        <Reanimated.View
          style={[
            styles.searchContainer,
            useLiquidGlassSearchBar
              ? styles.searchContainerLiquidGlass
              : styles.searchContainerTintedWhite,
            {
              top: insets.top + 10,
            },
            searchBarAnimatedStyle,
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
              <SearchIcon
                size={24}
                color={Colors.black}
                style={{ transform: [{ scale: 1.2 }, { scaleX: -1 }] }}
              />
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
              onBlur={() => {
                // Keep search visible even when blurred - don't auto-hide
              }}
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
          </View>
          {isSearching && (
            <NativePressable
              onPress={handleClearSearch}
              style={styles.clearButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close-circle" size={22.5} color={Colors.neutral[900]} />
            </NativePressable>
          )}
        </Reanimated.View>
      </NativePressable>

      {/* Search Results */}
      <Reanimated.View
        style={[StyleSheet.absoluteFill, searchResultsAnimatedStyle]}
        pointerEvents={isSearching ? 'auto' : 'none'}
      >
        {isSearching && (
          <>
            {/* Tab Navigation */}
            <Reanimated.View
              style={[
                styles.searchTabsContainer,
                {
                  top: insets.top + 65,
                },
                styles.searchTabsZIndex,
                searchTabsAnimatedStyle,
              ]}
            >
              <View style={styles.indicatorContainer}>
                {pages.map(tabId => (
                  <IndicatorItem
                    key={tabId}
                    tabId={tabId}
                    onPress={() => handleIndicatorTap(tabId)}
                  />
                ))}
              </View>
            </Reanimated.View>

            {/* Tab Content */}
            <Reanimated.View
              style={[
                styles.searchContentWrapper,
                { marginTop: insets.top + 65 + 44 },
                searchContentAnimatedStyle,
              ]}
            >
              <SearchSwipePager
                ref={searchPagerRef}
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
                onPageIndexChange={handleSearchPageIndexChange}
                pages={pages}
                renderTabContent={tabId => (
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
                    bottomPadding={getBottomNavBarHeight(insets)}
                    hasNextPage={hasSearchNextPage}
                    isFetchingNextPage={isSearchFetchingNextPage}
                    fetchNextPage={fetchSearchNextPage}
                  />
                )}
              />
            </Reanimated.View>
          </>
        )}
      </Reanimated.View>

      {/* Explore Content */}
      <Reanimated.View
        style={[StyleSheet.absoluteFill, exploreContentAnimatedStyle]}
        pointerEvents={!isSearching ? 'auto' : 'none'}
      >
        <FlashList<ListItem>
          ref={flashListRef}
          ListHeaderComponent={
            isHeaderVisible ? (
              <HeaderBanner headers={headers} height={computedHeaderHeight} />
            ) : null
          }
          data={listData}
          keyExtractor={(item, index) => {
            switch (item.type) {
              case 'section-header':
                return item.key || `${item.title}-${index}`;
              case 'spotlight-videos':
                return item.key || `spotlight-${index}`;
              case 'popular-channels-section':
                return item.key || `popular-channels-${index}`;
              case 'orbyt-channels-section':
                return item.key || `orbyt-channels-${index}`;
              case 'header-spacer':
                return item.key || `header-spacer-${index}`;
              case 'loading':
                return item.key || `loading-${index}`;
              case 'profile':
                return item.data.did || item.data.handle || `profile-${index}`;
              case 'channel':
                return item.data.uri || item.data.cid || `channel-${index}`;
              default:
                return `item-${index}`;
            }
          }}
          renderItem={({ item }) => {
            if (item.type === 'section-header') {
              if (!('title' in item) || !item.title) {
                return <SectionHeaderLoading />;
              }
              return (
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderRow}>
                    {typeof item.title === 'string' &&
                    item.title.toLowerCase().includes('spotlight') ? (
                      <Text style={styles.sectionTitle}>{t('feed.spotlight')}</Text>
                    ) : (
                      <Text style={styles.sectionTitle}>{item.title}</Text>
                    )}
                  </View>
                </View>
              );
            }
            if (item.type === 'header-spacer') {
              return <HeaderSpacer computedHeaderHeight={computedHeaderHeight} />;
            }
            if (item.type === 'loading') {
              // Calculate available height: screen height - header - bottom nav
              const screenHeight = Dimensions.get('window').height;
              const bottomNavHeight = getBottomNavBarHeight(insets);
              const availableHeight = screenHeight - computedHeaderHeight - bottomNavHeight;

              return (
                <View
                  style={[styles.loadingContainer, { minHeight: Math.max(availableHeight, 200) }]}
                >
                  <ActivityIndicator size="large" color={Colors.neutral[50]} />
                </View>
              );
            }
            if (item.type === 'spotlight-videos') {
              // Check if this is a loading item (no videos property)
              if (!('videos' in item)) {
                return <SpotlightLoading />;
              }
              if (!Array.isArray(item.videos)) {
                return null;
              }
              return (
                <View style={styles.spotlightContainer}>
                  <FlatList
                    data={item.videos}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.spotlightScrollContainer}
                    keyExtractor={(video, index) => {
                      const videoUri = video.post?.uri || (video as { uri?: string }).uri;
                      return `spotlight-video-${videoUri || index}`;
                    }}
                    renderItem={({ item: video }) => {
                      const v = video as ExtendedFeedViewPost;
                      const videoData = v.post || video;
                      const videoView = getVideoView(videoData?.embed);
                      const thumbnailUrl = videoView?.thumbnail || null;
                      const shouldBlur = !!(v.contentListUI?.blur || v.contentMediaUI?.blur);

                      return (
                        <NativePressable
                          style={styles.spotlightVideoItem}
                          onPress={() => {
                            const videoData = video.post || video;
                            const videoUri = videoData.uri;
                            if (videoUri) {
                              const formattedFeed = item.videos.map((v: ExtendedFeedViewPost) => ({
                                ...v,
                                post: v.post || v,
                                uniqueKey: v.post?.uri || v.uniqueKey,
                              }));
                              feedService.setCurrentFeed(formattedFeed);
                              const index = formattedFeed.findIndex(v => v.post.uri === videoUri);
                              const finalIndex = index >= 0 ? index : 0;
                              router.navigate(
                                buildFeedModalHref(
                                  {
                                    initialIndex: String(finalIndex),
                                    initialPostUri: videoUri,
                                    feedOption: 'search',
                                    backgroundColor: 'transparent',
                                    secondaryColor: Colors.neutral[50],
                                    hasNextPage: 'false',
                                    isFetchingNextPage: 'false',
                                  },
                                  'explore'
                                )
                              );
                            }
                          }}
                        >
                          <View style={styles.spotlightVideoThumbnailContainer}>
                            <BlurredBackground thumbnailUrl={thumbnailUrl} />
                            {thumbnailUrl ? (
                              <Image
                                source={{ uri: thumbnailUrl }}
                                style={styles.spotlightVideoThumbnail}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                                priority="normal"
                                transition={200}
                              />
                            ) : (
                              <View style={styles.spotlightVideoThumbnailPlaceholder}>
                                <Icon name="video_camera_2" size={16} color={Colors.neutral[500]} />
                              </View>
                            )}
                            {shouldBlur && (
                              <View style={styles.spotlightWarningOverlay}>
                                <Text style={styles.spotlightWarningText}>
                                  {t('feed.contentWarning')}
                                </Text>
                              </View>
                            )}
                          </View>
                        </NativePressable>
                      );
                    }}
                  />
                </View>
              );
            }
            if (item.type === 'profile' && 'data' in item) {
              const profile = item.data as Profile;
              const isFollowing = !!profile.viewer?.following;

              return (
                <AuthorItem
                  handle={profile.handle || ''}
                  did={profile.did}
                  displayName={profile.displayName}
                  avatar={profile.avatar}
                  size="large"
                  showArrow={false}
                  showFollowButton={!isFollowing}
                  isFollowing={isFollowing}
                  onFollowPress={() => handleFollow(profile)}
                  onPress={() => {
                    if (profile.did) {
                      const did = profile.did.trim();
                      if (did) {
                        // Prefetch profile: sets partial data immediately + fetches full profile
                        prefetchProfile(queryClient, did, {
                          did: profile.did,
                          handle: profile.handle,
                          displayName: profile.displayName,
                          avatar: profile.avatar,
                          description: profile.description,
                          verification: profile.verification,
                        }).finally(() => {
                          goToProfile(did);
                        });
                      }
                    }
                  }}
                  backgroundColor={Colors.transparent}
                  textColor={Colors.neutral[50]}
                  nameFontWeight="Figtree-SemiBold"
                  style={styles.authorItemStyle}
                />
              );
            }
            if (item.type === 'popular-channels-section') {
              if (!('channels' in item) || !Array.isArray(item.channels)) {
                return <PopularChannelsLoading />;
              }
              return (
                <View>
                  {item.channels.map((channel: Channel, index: number) => (
                    <PopularChannelItem
                      key={`popular-channel-${channel.uri || channel.cid || index}-${index}`}
                      channel={channel}
                      onPress={() => {
                        if (channel.uri && channel.uri.trim()) {
                          goToChannel(encodeURIComponent(channel.uri.trim()));
                        }
                      }}
                    />
                  ))}
                </View>
              );
            }
            if (item.type === 'orbyt-channels-section') {
              if (!('channels' in item) || !Array.isArray(item.channels)) {
                return <PopularChannelsLoading />;
              }

              return <OrbytChannelsGrid channels={item.channels} />;
            }
            return null;
          }}
          contentContainerStyle={[
            styles.listContainer,
            {
              paddingBottom: bottomPadding,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEventThrottle={16}
          onEndReached={() => {
            // No pagination for explore content
          }}
          onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
          removeClippedSubviews={false}
          viewabilityConfig={viewabilityConfig}
          ListEmptyComponent={() => {
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
          }}
        />
      </Reanimated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    overflow: 'hidden',
  },

  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 5,
  },
  flexOne: {
    flex: 1,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },

  searchContainer: {
    position: 'absolute',
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    paddingHorizontal: 15,
    height: 48,
    zIndex: 10,
    elevation: 5,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  searchContainerLiquidGlass: {
    backgroundColor: Colors.transparent,
  },
  searchContainerTintedWhite: {
    // Non-glass fallback that matches the same shape metrics as liquid glass.
    backgroundColor: Colors.neutral[50],
  },
  searchContainerGlassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  searchBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIconContainer: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.black,
    fontSize: 20,
    fontFamily: 'Figtree-Medium',
    padding: 0,
    paddingVertical: 12,
    textAlign: 'left',
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' && {
      includeFontPadding: false,
    }),
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorItemStyle: {
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  channelItemStyle: {
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  channelImage: {
    marginRight: 12,
  },
  channelsGridContainer: {
    paddingBottom: 20,
  },
  specialRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  gridItemsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridChannelWrapper: {
    // Wrapper for grid channel items
  },
  gridChannelItem: {},
  gridChannelThumbnail: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridChannelImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  gridChannelGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    borderRadius: 8,
  },
  gridChannelCornerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 120,
    height: 120,
    transform: [{ scaleY: -1 }], // Flip vertically to move gradient from top-left to bottom-left
  },
  gridChannelNameOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  gridChannelName: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-Bold',
  },
  horizontalChannelButton: {
    marginBottom: 0,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  horizontalChannelThumbnail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'flex-end', // Align content to right
    justifyContent: 'flex-start', // Align to top
  },
  horizontalChannelImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  horizontalChannelLabelContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    paddingRight: 8,
  },
  horizontalChannelLabel: {
    color: Colors.neutral[50],
    fontSize: 22,
    fontFamily: 'Figtree-Bold',
  },
  channelContent: {
    flex: 1,
    justifyContent: 'center',
  },
  orbytSlash: {
    fontFamily: 'Figtree-SemiBold',
    marginRight: 0,
  },
  channelName: {
    color: Colors.neutral[50],
    fontSize: 17,
    fontFamily: 'Figtree-Bold',
    flexShrink: 1,
  },
  sectionHeader: {
    paddingHorizontal: 10,
    paddingTop: 15,
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },

  spotlightContainer: {
    marginBottom: 7,
    marginHorizontal: 0,
  },
  spotlightScrollContainer: {
    paddingHorizontal: 10,
    paddingRight: 40, // Extra padding on the right to allow scrolling off screen
  },
  spotlightVideoItem: {
    width: 90,
    marginRight: 7,
  },
  spotlightVideoThumbnailContainer: {
    position: 'relative',
    marginBottom: 0,
    borderRadius: 8,
    overflow: 'hidden' as const,
  },
  spotlightVideoThumbnail: {
    width: 90,
    height: 160, // 9:16 aspect ratio (90 * 16/9)
    borderRadius: 8,
    overflow: 'hidden' as const,
    position: 'relative',
    zIndex: 1,
  },
  spotlightVideoThumbnailPlaceholder: {
    width: 90,
    height: 160, // 9:16 aspect ratio (90 * 16/9)
    borderRadius: 8,
    backgroundColor: Colors.neutral[900],
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightWarningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.overlay.black70,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  spotlightWarningText: {
    color: Colors.neutral[50],
    fontSize: 10,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  emptyTabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTabText: {
    color: Colors.neutral[500],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
  },

  searchTabsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingTop: 0,
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 15,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 16,
    backgroundColor: Colors.black,
  },
  indicatorItem: {
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  searchResultsContainer: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  pagerView: {
    flex: 1,
  },
  pagerPage: {
    flex: 1,
  },

  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainerFull: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  searchContentWrapper: {
    flex: 1,
  },
  androidPaddingTop: {
    paddingTop: 0,
  },
  searchBarPressable: {
    zIndex: 30,
  },
  searchTabsZIndex: {
    zIndex: 20,
  },
  popularNowImage: {
    alignSelf: 'flex-end',
    marginRight: -50,
  },
  latestImage: {
    borderRadius: 0,
  },
});

export default ExploreScreen;
