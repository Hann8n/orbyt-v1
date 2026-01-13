import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  TextInput,
  Pressable,
  StatusBar,
  Platform,
  Dimensions,
  FlatList,
  useWindowDimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
  type PageScrollStateChangedNativeEvent,
} from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import AtprotoService from '../../src/services/api/AtprotoService';

import { useRouter, type Router } from 'expo-router';
import ProfileService, {
  useFollowMutation,
  prefetchProfile,
} from '../../src/services/data/ProfileService';
import type { ProfileViewWithOrbyt } from '../../src/services/api/types';
import ChannelService from '../../src/services/data/ChannelService';
import type { CachedChannel } from '../../src/services/data/ChannelService';
import { useQueryClient, useQuery, type QueryClient } from '@tanstack/react-query';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { LinearGradient } from 'expo-linear-gradient';
import HeaderBanner from '../../src/components/ui/HeaderBanner';

import { SearchIcon, FollowIcon, Loading3FillIcon } from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import { VerificationBadge } from '../../src/components/features/badging';
import EmptyFeed from '../../src/components/features/feed/EmptyFeed';
import { feedService } from '../../src/services/FeedService';
import { getBottomNavBarHeight, isTablet } from '../../src/utils/device/screen';
import { getVideoView } from '../../src/utils/video/helpers';
import { formatHandle } from '../../src/utils/formatting/handles';
import BlurredThumbnailBackground from '../../src/components/ui/BlurredThumbnailBackground';
import { HeaderService, useHeaders, type Header } from '../../src/services/OrbytBannerService';
import { useFeed } from '../../src/hooks/useFeed';
import { useUserStore, useFeedSettings } from '../../src/stores/userStore';
import { useModerationSettings } from '../../src/hooks/useModerationSettings';
import { computeModerationDecision } from '../../src/utils/moderation/computeDecision';
import type { ExtendedFeedViewPost } from '../../src/services/api/types';
import { isCurrentUser } from '../../src/stores/profileInteractionStore';
import { useFollowStore } from '../../src/stores/followStore';
import {
  getActiveChannels,
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  shouldShowChannelSlash,
  extractFeedSlug,
} from '../../src/utils/channels/orbyt';
import { tabRefs } from '../../src/utils/navigation/tabRefs';
import type { ExploreRef } from '../../src/utils/navigation/tabRefs';

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
  contentMode?: string; // Used to determine if feed is experimental (non-video)
  isExperimental?: boolean; // Added for experimental feed badge (computed from contentMode)
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

// Search-related components
const SEARCH_TAB_LABELS: { [key: string]: string } = {
  'recently-visited': 'Recently Visited',
  profiles: 'People',
  channels: 'Feeds',
};

// Helper function to navigate to profile
const navigateToProfile = (profile: Profile, queryClient: QueryClient, router: Router) => {
  if (!profile.handle) return;

  const handle = profile.handle.trim();
  if (!handle) return;

  // Prefetch profile: sets partial data immediately + fetches full profile in background
  prefetchProfile(queryClient, handle, {
    did: profile.did,
    handle,
    displayName: profile.displayName,
    avatar: profile.avatar,
    description: profile.description,
    verification: profile.verification,
  }).finally(() => {
    router.push({
      pathname: '/profile/[did]',
      params: { did: handle },
    });
  });
};

// SearchSwipePager component
const SearchSwipePager = ({
  activeTab,
  onActiveTabChange,
  renderTabContent,
  onScrollProgressChange,
  pages,
}: {
  activeTab: 'recently-visited' | 'profiles' | 'channels';
  onActiveTabChange: (tab: 'recently-visited' | 'profiles' | 'channels') => void;
  renderTabContent: (tabId: 'recently-visited' | 'profiles' | 'channels') => React.ReactNode;
  onScrollProgressChange?: (progress: number) => void;
  pages: Array<'recently-visited' | 'profiles' | 'channels'>;
}) => {
  const pagerViewRef = useRef<PagerView>(null);
  const activeIndex = pages.indexOf(activeTab);
  const currentPageRef = useRef(activeIndex);
  const hasAppliedInitialIndexRef = useRef(false);
  const previousPagesRef = useRef<string>(JSON.stringify(pages));
  const isUserScrollingRef = useRef(false);
  const isUserGestureRef = useRef(false);

  useLayoutEffect(() => {
    const currentPagesString = JSON.stringify(pages);
    const pagesChanged = currentPagesString !== previousPagesRef.current;

    if (pagesChanged) {
      hasAppliedInitialIndexRef.current = false;
      previousPagesRef.current = currentPagesString;
    }

    if (!hasAppliedInitialIndexRef.current && pages.length > 0) {
      const targetIndex = activeIndex >= 0 ? activeIndex : 0;
      currentPageRef.current = targetIndex;
      onScrollProgressChange?.(targetIndex);
      requestAnimationFrame(() => {
        pagerViewRef.current?.setPage(targetIndex);
      });
      hasAppliedInitialIndexRef.current = true;
    }
  }, [activeIndex, pages, onScrollProgressChange]);

  useEffect(() => {
    if (hasAppliedInitialIndexRef.current && pagerViewRef.current && activeIndex >= 0) {
      if (isUserScrollingRef.current || isUserGestureRef.current) {
        return;
      }
      if (currentPageRef.current !== activeIndex) {
        requestAnimationFrame(() => {
          pagerViewRef.current?.setPage(activeIndex);
        });
      }
    }
  }, [activeIndex]);

  const handlePageScroll = useCallback(
    (event: PagerViewOnPageScrollEvent) => {
      const { position, offset } = event.nativeEvent;
      const progress = position + offset;
      const roundedPosition = Math.round(progress);

      onScrollProgressChange?.(progress);

      if (
        roundedPosition !== currentPageRef.current &&
        roundedPosition >= 0 &&
        roundedPosition < pages.length
      ) {
        currentPageRef.current = roundedPosition;
        const nextTab = pages[roundedPosition];
        if (nextTab && nextTab !== activeTab) {
          isUserGestureRef.current = true;
          onActiveTabChange(nextTab);
        }
      }
    },
    [pages, activeTab, onActiveTabChange, onScrollProgressChange]
  );

  const handlePageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      if (!hasAppliedInitialIndexRef.current) return;

      const nextIndex = event.nativeEvent.position;
      const prevIndex = currentPageRef.current;

      if (nextIndex !== prevIndex) {
        currentPageRef.current = nextIndex;
        onScrollProgressChange?.(nextIndex);
      }

      const nextTab = pages[nextIndex];
      if (nextTab && nextTab !== activeTab) {
        isUserGestureRef.current = true;
        onActiveTabChange(nextTab);
      }

      setTimeout(() => {
        isUserGestureRef.current = false;
      }, 100);
    },
    [activeTab, pages, onActiveTabChange, onScrollProgressChange]
  );

  const handlePageScrollStateChanged = useCallback((event: PageScrollStateChangedNativeEvent) => {
    const state = event.nativeEvent.pageScrollState;
    if (state === 'dragging' || state === 'settling') {
      isUserScrollingRef.current = true;
    } else if (state === 'idle') {
      setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 50);
    }
  }, []);

  return (
    <View style={styles.searchResultsContainer}>
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={activeIndex >= 0 ? activeIndex : 0}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
        onPageScrollStateChanged={handlePageScrollStateChanged}
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
};

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
    const router = useRouter();
    const queryClient = useQueryClient();
    const currentUser = useUserStore(state => state.currentUser);

    const profiles = searchResults
      .filter(isProfileResult)
      .map(result => result.data)
      .filter((profile, index, self) => index === self.findIndex(p => p.did === profile.did));

    if (isLoading) {
      return (
        <View style={[styles.loadingContainer, { flex: 1 }]}>
          <Loading3FillIcon size={48} color={Colors.white} />
        </View>
      );
    }

    return (
      <FlashList
        data={profiles}
        keyExtractor={profile => `profile-${profile.did || profile.handle}`}
        renderItem={({ item: profile }) => (
          <View style={styles.profileItem}>
            <Pressable
              style={styles.profileTouchable}
              onPress={() => {
                if (onProfilePress) {
                  onProfilePress(profile);
                } else {
                  navigateToProfile(profile, queryClient, router);
                }
              }}
            >
              <Avatar
                uri={profile.avatar}
                type="profile"
                size={48}
                ringColor="transparent"
                style={styles.profileImage}
                status={profile.status}
              />
              <View style={styles.profileContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
                    {formatHandle(profile.handle) || 'Unknown user'}
                  </Text>
                  {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                    <VerificationBadge
                      handle={profile.handle.trim()}
                      verification={profile.verification}
                      textSize={16}
                      textColor={Colors.white}
                    />
                  )}
                </View>
              </View>
            </Pressable>
            {!profile.viewer?.following &&
              !isCurrentUser(profile.did, profile.handle, currentUser) && (
                <Pressable
                  style={({ pressed }) => [styles.followButton, pressed && { opacity: 0.8 }]}
                  onPress={() => onFollow(profile)}
                >
                  <FollowIcon size={16} color={Colors.black} />
                </Pressable>
              )}
          </View>
        )}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && fetchNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        maintainVisibleContentPosition={{
          disabled: false,
          autoscrollToTopThreshold: undefined,
        }}
        ListEmptyComponent={() => (
          <View style={styles.emptyTabContent}>
            <Text style={styles.emptyTabText}>No people found</Text>
          </View>
        )}
      />
    );
  }
);

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
    const router = useRouter();

    const channels = searchResults
      .filter(isChannelResult)
      .map(result => result.data)
      .filter((channel, index, self) => index === self.findIndex(c => c.uri === channel.uri));

    if (isLoading) {
      return (
        <View style={[styles.loadingContainer, { flex: 1 }]}>
          <Loading3FillIcon size={48} color={Colors.white} />
        </View>
      );
    }

    return (
      <FlashList
        data={channels}
        keyExtractor={channel => `channel-${channel.uri || channel.cid}`}
        renderItem={({ item: channel }) => (
          <Pressable
            style={styles.channelItem}
            onPress={() => {
              if (onChannelPress) {
                onChannelPress(channel);
              } else {
                if (channel.uri && channel.uri.trim()) {
                  router.push({
                    pathname: '/channel/[id]',
                    params: { id: channel.uri.trim() },
                  });
                }
              }
            }}
          >
            <Avatar
              uri={getChannelAvatarUri(channel.uri, channel.avatar)}
              type="channel"
              size={48}
              ringColor="transparent"
              style={styles.channelImage}
            />
            <View style={styles.channelContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ChannelNameDisplay channel={channel} />
                {channel.isExperimental && (
                  <Icon
                    name="bug"
                    size={12}
                    color={Colors.lightGreen}
                    style={styles.experimentalIcon}
                  />
                )}
              </View>
            </View>
          </Pressable>
        )}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={() => (
          <View style={styles.emptyTabContent}>
            <Text style={styles.emptyTabText}>No feeds found</Text>
          </View>
        )}
      />
    );
  }
);

// Visit History Component
const VisitHistoryList = React.memo(
  ({
    visitHistory,
    onHistoryItemPress,
    onFollow,
    bottomPadding = 0,
  }: {
    visitHistory: Array<{ type: 'profile' | 'channel'; data: Profile | Channel }>;
    onHistoryItemPress: (item: { type: 'profile' | 'channel'; data: Profile | Channel }) => void;
    onFollow: (profile: Profile) => void;
    bottomPadding?: number;
  }) => {
    const currentUser = useUserStore(state => state.currentUser);
    return (
      <FlashList
        data={visitHistory}
        keyExtractor={item => {
          if (item.type === 'profile') {
            return `history-profile-${(item.data as Profile).did}`;
          } else {
            return `history-channel-${(item.data as Channel).uri}`;
          }
        }}
        renderItem={({ item }) => {
          const isProfile = item.type === 'profile';
          const profileData = isProfile ? (item.data as Profile) : null;
          const channelData = !isProfile ? (item.data as Channel) : null;

          if (isProfile && profileData) {
            return (
              <View style={styles.profileItem}>
                <Pressable style={styles.profileTouchable} onPress={() => onHistoryItemPress(item)}>
                  <Avatar
                    uri={profileData.avatar}
                    type="profile"
                    size={48}
                    ringColor="transparent"
                    style={styles.profileImage}
                    status={profileData.status}
                  />
                  <View style={styles.profileContent}>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}
                    >
                      <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
                        {formatHandle(profileData.handle) || 'Unknown user'}
                      </Text>
                      {profileData.handle &&
                        profileData.handle.trim() &&
                        profileData.handle.length > 0 && (
                          <VerificationBadge
                            handle={profileData.handle.trim()}
                            verification={profileData.verification}
                            textSize={16}
                            textColor={Colors.white}
                          />
                        )}
                    </View>
                  </View>
                </Pressable>
                {!profileData.viewer?.following &&
                  !isCurrentUser(profileData.did, profileData.handle, currentUser) && (
                    <Pressable
                      style={({ pressed }) => [styles.followButton, pressed && { opacity: 0.8 }]}
                      onPress={() => onFollow(profileData)}
                    >
                      <FollowIcon size={16} color={Colors.black} />
                    </Pressable>
                  )}
              </View>
            );
          } else if (!isProfile && channelData) {
            return (
              <Pressable style={styles.channelItem} onPress={() => onHistoryItemPress(item)}>
                <Avatar
                  uri={getChannelAvatarUri(channelData.uri, channelData.avatar)}
                  type="channel"
                  size={48}
                  ringColor="transparent"
                  style={styles.channelImage}
                />
                <View style={styles.channelContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ChannelNameDisplay channel={channelData} />
                    {channelData.isExperimental && (
                      <Icon
                        name="bug"
                        size={12}
                        color={Colors.lightGreen}
                        style={styles.experimentalIcon}
                      />
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }
          return null;
        }}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={() => (
          <View style={styles.emptyTabContent}>
            <Text style={styles.emptyTabText}>No recent visits</Text>
          </View>
        )}
      />
    );
  }
);

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
    visitHistory?: Array<{ type: 'profile' | 'channel'; data: Profile | Channel }>;
    onHistoryItemPress?: (item: { type: 'profile' | 'channel'; data: Profile | Channel }) => void;
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

const SectionHeaderLoading = () => (
  <View style={[styles.sectionHeader, styles.loadingContainer]}>
    <Loading3FillIcon size={24} color={Colors.white} />
  </View>
);

const PopularChannelsLoading = () => (
  <View style={styles.loadingContainer}>
    <Loading3FillIcon size={24} color={Colors.white} />
  </View>
);

const SpotlightLoading = () => (
  <View style={[styles.spotlightContainer, styles.loadingContainer]}>
    <Loading3FillIcon size={24} color={Colors.white} />
  </View>
);

// Header spacer component
const HeaderSpacer = ({ computedHeaderHeight }: { computedHeaderHeight: number }) => {
  // Always use the computed header height for consistency
  return <View style={{ height: computedHeaderHeight }} />;
};

// Channel Name Component with Orbyt formatting
const ChannelNameDisplay: React.FC<{ channel: Channel; style?: StyleProp<ViewStyle> }> = ({
  channel,
  style,
}) => {
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || '#FFD700';

  if (isOrbyt) {
    const showSlash = shouldShowChannelSlash(channel.uri);
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
        {showSlash && (
          <Text style={[styles.channelName, styles.orbytSlash, { color: channelColor }]}>/</Text>
        )}
        <Text style={styles.channelName} numberOfLines={1}>
          {channel.displayName || 'Unknown channel'}
        </Text>
      </View>
    );
  }

  return (
    <Text style={styles.channelName} numberOfLines={1}>
      {channel.displayName || 'Unknown channel'}
    </Text>
  );
};

// Popular Channel Item Component using normal list style
const PopularChannelItem = ({ channel, onPress }: { channel: Channel; onPress: () => void }) => {
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  return (
    <Pressable style={styles.channelItem} onPress={onPress}>
      <Avatar
        uri={avatarUri}
        type="channel"
        size={48}
        ringColor="transparent"
        style={styles.channelImage}
      />
      <View style={styles.channelContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ChannelNameDisplay channel={channel} />
          {channel.isExperimental && (
            <Icon name="bug" size={12} color={Colors.lightGreen} style={styles.experimentalIcon} />
          )}
        </View>
      </View>
    </Pressable>
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
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || '#FFD700';
  const thumbnailHeight = itemHeight || itemWidth; // Use itemHeight if provided, otherwise use itemWidth for square

  return (
    <Pressable style={[styles.gridChannelItem, { width: itemWidth }]} onPress={onPress}>
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
              { backgroundColor: Colors.darkGray, justifyContent: 'center', alignItems: 'center' },
            ]}
          >
            <Icon name="device-tv" size={thumbnailHeight * 0.4} color={Colors.gray} />
          </View>
        )}
        {/* Light gradient from bottom */}
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.5)']}
          style={styles.gridChannelGradient}
        />
        {/* Channel name overlay at bottom left */}
        <View style={styles.gridChannelNameOverlay}>
          {isOrbyt ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {shouldShowChannelSlash(channel.uri) && (
                <Text style={[styles.gridChannelName, styles.orbytSlash, { color: channelColor }]}>
                  /
                </Text>
              )}
              <Text style={styles.gridChannelName} numberOfLines={1}>
                {channel.displayName || 'Unknown channel'}
              </Text>
            </View>
          ) : (
            <Text style={styles.gridChannelName} numberOfLines={1}>
              {channel.displayName || 'Unknown channel'}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
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
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || '#FFD700';
  // Calculate max width for label: full width - left padding - right padding
  const labelMaxWidth = itemWidth - 16 - 16; // width - left padding - right padding

  // Check if this is the popular now channel for special cropping
  const slug = extractFeedSlug(channel.uri || '');
  const isPopularNow = slug === 'popular-now';
  const isLatest = slug === 'latest';

  return (
    <Pressable
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
      <View
        style={[
          styles.horizontalChannelThumbnail,
          isLatest && { alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        {isPopularNow ? (
          <Image
            source={{ uri: avatarUri }}
            style={[
              styles.horizontalChannelImage,
              {
                width: itemWidth * 0.7,
                height: itemHeight * 2.5,
                alignSelf: 'flex-end',
                marginRight: -50,
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
            style={[styles.horizontalChannelImage, { borderRadius: 0 }]}
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
            ringColor="transparent"
            style={styles.horizontalChannelImage}
          />
        )}
      </View>

      {/* Label at bottom left - overlaying GIF */}
      <View style={[styles.horizontalChannelLabelContainer, { maxWidth: labelMaxWidth }]}>
        {isOrbyt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {shouldShowChannelSlash(channel.uri) && (
              <Text style={[styles.horizontalChannelLabel, styles.orbytSlash]}>/</Text>
            )}
            <Text style={styles.horizontalChannelLabel} numberOfLines={1}>
              {channel.displayName || 'Unknown channel'}
            </Text>
          </View>
        ) : (
          <Text style={styles.horizontalChannelLabel} numberOfLines={1}>
            {channel.displayName || 'Unknown channel'}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

// Search-related components moved to search.tsx

// Responsive Orbyt Channels Grid Component
const OrbytChannelsGrid = React.memo(
  ({ channels, router }: { channels: Channel[]; router: Router }) => {
    const { width: windowWidth } = useWindowDimensions();

    // Responsive column calculation - similar to GridFeedView
    const computedColumns = useMemo(() => {
      const w = windowWidth || Dimensions.get('window').width;
      let cols = 3; // default mobile
      if (w > 1200 || isTablet()) {
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
    }, [windowWidth]);

    // Responsive padding and gap based on screen size
    const { padding, gap } = useMemo(() => {
      const w = windowWidth || Dimensions.get('window').width;
      if (isTablet() || w > 900) {
        return { padding: 10, gap: 10 };
      } else if (w > 480) {
        return { padding: 10, gap: 8 };
      } else {
        return { padding: 10, gap: 7 };
      }
    }, [windowWidth]);

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
      return computedColumns >= 4 || isTablet();
    }, [computedColumns]);

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
                      router.push({
                        pathname: '/channel/[id]',
                        params: { id: popularNowChannel.uri.trim() },
                      });
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
                      router.push({
                        pathname: '/channel/[id]',
                        params: { id: latestChannel.uri.trim() },
                      });
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
                      router.push({
                        pathname: '/channel/[id]',
                        params: { id: popularNowChannel.uri.trim() },
                      });
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
                      router.push({
                        pathname: '/channel/[id]',
                        params: { id: latestChannel.uri.trim() },
                      });
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
              return (
                <View
                  key={`orbyt-channel-${channel.uri || channel.cid || index}`}
                  style={{
                    width: itemWidth,
                    marginRight: isLastInRow ? 0 : gap,
                    marginBottom: gap,
                  }}
                >
                  <GridChannelItem
                    channel={channel}
                    itemWidth={itemWidth}
                    onPress={() => {
                      if (channel.uri && channel.uri.trim()) {
                        router.push({
                          pathname: '/channel/[id]',
                          params: { id: channel.uri.trim() },
                        });
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
  }
);

const ExploreScreen: React.FC = () => {
  const flashListRef = useRef<FlashListRef<ListItem> | null>(null);
  const currentUser = useUserStore(state => state.currentUser);
  const searchInputRef = useRef<TextInput | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'recently-visited' | 'profiles' | 'channels'>(
    'recently-visited'
  );
  const [visitHistory, setVisitHistory] = useState<
    Array<{
      type: 'profile' | 'channel';
      data: Profile | Channel;
    }>
  >([]);
  const [indicatorScrollProgress, setIndicatorScrollProgress] = useState(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reanimated values for smooth transitions
  const searchProgress = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const topGradientOpacity = useSharedValue(0);

  const router = useRouter();
  const queryClient = useQueryClient();

  // Use the follow mutation hook for proper cache management
  const followMutation = useFollowMutation();
  const insets = useSafeAreaInsets();

  // Get experimental feeds setting and native tabs setting
  const { experimentalFeedsEnabled, nativeTabsEnabled } = useFeedSettings();

  // Get moderation settings for computing decisions
  const { settings: moderationSettings } = useModerationSettings(currentUser?.did ?? undefined);

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

  // Comment out video-related useEffect since videos are disabled
  // useEffect(() => {
  //   if (searchData?.pages) {
  //     const allVideosFromPages = searchData.pages.flatMap(page => {
  //       const videoResults = page.results.filter((result: any) => result.type === 'video');
  //       return videoResults.map((result: any) => result.data);
  //     });
  //     setAllVideos(allVideosFromPages);
  //
  //     const formattedFeed = allVideosFromPages.map(video => ({
  //       post: video,
  //       shouldCache: true,
  //       uniqueKey: video.uri,
  //     }));
  //     setCurrentFeed(formattedFeed);
  //   }
  // }, [searchData]);

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
        results.push({
          type: 'channel' as const,
          data: {
            uri: post.uri,
            cid: post.cid,
            did: post.author?.did || '',
            displayName: post.text || post.author?.displayName || 'Unknown channel',
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
              displayName: postText || 'Unknown channel',
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
      if (result.type === 'channel') {
        const channel = result.data as Channel & { contentMode?: string };
        const contentMode = channel.contentMode;
        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        if (!experimentalFeedsEnabled && !isVideoOnly) {
          return false;
        }
      }
      if (result.type === 'profile') {
        const profile = result.data as Profile;
        if (isCurrentUser(profile.did, profile.handle, currentUser)) {
          return false;
        }
      }
      return true;
    });

    return filtered;
  }, [searchFeedOption, searchFeed, experimentalFeedsEnabled, currentUser, followStoreFollows]);

  // Visit history management
  const loadVisitHistory = useCallback(async () => {
    try {
      const { storageHelpers } = await import('../../src/utils/storage');
      const history = await storageHelpers.getItem('visitHistory');
      if (history) {
        setVisitHistory(JSON.parse(history));
      }
    } catch (error) {
      console.warn('Failed to load visit history:', error);
    }
  }, []);

  const saveToVisitHistory = useCallback(
    async (type: 'profile' | 'channel', data: Profile | Channel) => {
      try {
        const { storageHelpers } = await import('../../src/utils/storage');
        const historyItem = {
          type,
          data,
        };

        const newHistory = [
          historyItem,
          ...visitHistory.filter(item => {
            if (type === 'profile') {
              return (item.data as Profile).did !== (data as Profile).did;
            } else {
              return (item.data as Channel).uri !== (data as Channel).uri;
            }
          }),
        ].slice(0, 20);

        setVisitHistory(newHistory);
        await storageHelpers.setItem('visitHistory', JSON.stringify(newHistory));
      } catch (error) {
        console.warn('Failed to save visit history:', error);
      }
    },
    [visitHistory]
  );

  const handleHistoryItemPress = useCallback(
    (item: { type: 'profile' | 'channel'; data: Profile | Channel }) => {
      if (item.type === 'profile') {
        navigateToProfile(item.data as Profile, queryClient, router);
      } else if (item.type === 'channel') {
        const channel = item.data as Channel;
        if (channel.uri) {
          router.push({
            pathname: '/channel/[id]',
            params: { id: channel.uri },
          });
        }
      }
    },
    [queryClient, router]
  );

  const handleProfileNavigation = useCallback(
    (profile: Profile) => {
      saveToVisitHistory('profile', profile);
      navigateToProfile(profile, queryClient, router);
    },
    [saveToVisitHistory, queryClient, router]
  );

  const handleChannelNavigation = useCallback(
    (channel: Channel) => {
      saveToVisitHistory('channel', channel);
      if (channel.uri) {
        router.push({
          pathname: '/channel/[id]',
          params: { id: channel.uri },
        });
      }
    },
    [saveToVisitHistory, router]
  );

  useEffect(() => {
    loadVisitHistory();
  }, [loadVisitHistory]);

  // Determine search pages
  const pages: Array<'recently-visited' | 'profiles' | 'channels'> = useMemo(() => {
    if (debouncedQuery.length === 0) {
      return ['recently-visited'];
    }
    return ['profiles', 'channels'];
  }, [debouncedQuery.length]);

  const activeIndex = pages.indexOf(activeTab);

  useEffect(() => {
    if (pages.length > 0 && !pages.includes(activeTab)) {
      setActiveTab(pages[0]);
    }
  }, [pages]);

  useEffect(() => {
    if (activeIndex >= 0) {
      setIndicatorScrollProgress(activeIndex);
    } else {
      setIndicatorScrollProgress(0);
    }
  }, [activeIndex]);

  const getIndicatorStyle = useCallback(
    (tabId: 'recently-visited' | 'profiles' | 'channels') => {
      const tabIndex = pages.indexOf(tabId);
      const isActive = tabId === activeTab;

      const baseProgress = indicatorScrollProgress;
      let opacity = 0.75;
      if (isActive) {
        opacity = 1;
      } else {
        const distance = Math.abs(baseProgress - tabIndex);
        opacity = Math.max(0.3, 1 - distance * 0.4);
      }

      return {
        color: isActive ? Colors.white : Colors.gray,
        fontSize: 20,
        fontWeight: isActive ? ('bold' as const) : ('600' as const),
        fontFamily: isActive ? 'Firma-Bold' : 'Firma-SemiBold',
        opacity: isActive ? 1 : opacity,
      };
    },
    [activeTab, pages, indicatorScrollProgress, activeIndex]
  );

  const handleIndicatorTap = useCallback((tabId: 'recently-visited' | 'profiles' | 'channels') => {
    setActiveTab(tabId);
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
    searchProgress.value = 0;
    contentOpacity.value = 1;
  };

  const isSearching = isSearchFocused || debouncedQuery.length > 0;

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
    const opacity = interpolate(searchProgress.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  const searchContentAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(searchProgress.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  const exploreContentAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: contentOpacity.value,
      pointerEvents: contentOpacity.value > 0.5 ? 'auto' : 'none',
    };
  });

  const topGradientAnimatedStyle = useAnimatedStyle(() => ({
    opacity: topGradientOpacity.value,
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
  }, [isSearching]);

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
          isExperimental: cachedChannel.isExperimental || false,
        })
      );
    },
    enabled: orbytChannelUris.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch custom spotlight feed
  const {
    data: spotlightFeed,
    isLoading: isLoadingSpotlightFeed,
    error: spotlightFeedError,
    refetch: refetchSpotlightFeed,
  } = useQuery({
    queryKey: ['spotlightFeed'],
    queryFn: async () => {
      // Get custom spotlight feed
      const response = await AtprotoService.getFeed(
        null,
        'at://did:plc:l3l3fjuwhv4mh4ih5y7ewrue/app.bsky.feed.generator/aaaiu3akzsv6q',
        {},
        true,
        10,
        'custom'
      );
      let feed = response.feed || [];

      // Compute moderation flags for spotlight feed items
      // This feed doesn't go through useFeed, so we need to compute moderation here
      if (moderationSettings) {
        feed = feed.map((item: ExtendedFeedViewPost) => {
          try {
            const decision = computeModerationDecision(item, moderationSettings);
            item.shouldBlur = decision.blur;
            item.shouldFilter = decision.filter;
          } catch {
            item.shouldBlur = false;
            item.shouldFilter = false;
          }
          return item;
        });
      } else {
        // No settings loaded yet - use safe defaults
        feed = feed.map((item: ExtendedFeedViewPost) => {
          item.shouldBlur = false;
          item.shouldFilter = false;
          return item;
        });
      }

      return feed;
    },
    enabled: true,
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
  }, [insets.top, headers]);

  const handleExploreScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event?.nativeEvent?.contentOffset?.y ?? 0;
      // Start the fade slightly higher in the header and ease in gently
      const start = 0;
      const targetOpacity = Math.min(Math.max((y - start) / 200, 0), 0.55);
      topGradientOpacity.value = targetOpacity;
    },
    [computedHeaderHeight, topGradientOpacity]
  );

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
      data.push({ type: 'section-header' as const, title: 'spotlight', key: 'spotlight-header' });
      data.push({
        type: 'spotlight-videos' as const,
        videos: spotlightFeed,
        key: 'spotlight-videos',
      });
    }
    // Add Orbyt Channels section
    if (orbytChannelsData && orbytChannelsData.length > 0) {
      data.push({
        type: 'section-header' as const,
        title: 'channels',
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
    <View style={[styles.container, Platform.OS === 'android' ? { paddingTop: 0 } : null]}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

      {!isSearching && (
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.topGradient,
            // Cover status bar + search bar (top offset 10 + height 48)
            { top: 0, height: insets.top + 10 + 48 },
            topGradientAnimatedStyle,
          ]}
        >
          <LinearGradient
            colors={[Colors.black, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
      )}

      {/* Search Bar */}
      <Pressable onPress={() => searchInputRef.current?.focus()} style={{ zIndex: 30 }}>
        <Reanimated.View
          style={[
            styles.searchContainer,
            {
              top: insets.top + 10,
            },
            searchBarAnimatedStyle,
          ]}
        >
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
              placeholder="search"
              placeholderTextColor={Colors.gray}
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
              textAlignVertical="center"
              caretHidden={false}
              {...(Platform.OS === 'android' && { includeFontPadding: false })}
            />
          </View>
          {isSearching && (
            <Pressable
              onPress={handleClearSearch}
              style={styles.clearButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close-circle" size={22.5} color={Colors.darkGray} />
            </Pressable>
          )}
        </Reanimated.View>
      </Pressable>

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
                  zIndex: 20,
                },
                searchTabsAnimatedStyle,
              ]}
            >
              <View style={styles.indicatorContainer}>
                {pages.map(tabId => (
                  <Pressable
                    key={tabId}
                    onPress={() => handleIndicatorTap(tabId)}
                    style={styles.indicatorItem}
                  >
                    <Text style={getIndicatorStyle(tabId)}>
                      {SEARCH_TAB_LABELS[tabId] || tabId}
                    </Text>
                  </Pressable>
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
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
                onScrollProgressChange={setIndicatorScrollProgress}
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
          onScroll={handleExploreScroll}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {typeof item.title === 'string' &&
                    item.title.toLowerCase().includes('spotlight') ? (
                      <Text style={styles.sectionTitle}>spotlight</Text>
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
                  <Loading3FillIcon size={48} color={Colors.white} />
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
                      const videoData = video.post || video;
                      const videoView = getVideoView(videoData?.embed);
                      const thumbnailUrl = videoView?.thumbnail || null;
                      // Use shouldBlur flag from feed item (computed at feed level)
                      const shouldBlur = (video as ExtendedFeedViewPost).shouldBlur ?? false;

                      return (
                        <Pressable
                          style={styles.spotlightVideoItem}
                          onPress={() => {
                            const videoData = video.post || video;
                            const videoUri = videoData.uri;
                            if (videoUri) {
                              const formattedFeed = item.videos.map((v: ExtendedFeedViewPost) => {
                                const vData = v.post || v;
                                return {
                                  post: vData,
                                  uniqueKey: vData.uri,
                                  shouldBlur: v.shouldBlur ?? false,
                                  shouldFilter: v.shouldFilter ?? false,
                                };
                              });
                              feedService.setCurrentFeed(formattedFeed);
                              const index = formattedFeed.findIndex(v => v.post.uri === videoUri);
                              const finalIndex = index >= 0 ? index : 0;
                              router.push({
                                pathname: '/(modals)/feed',
                                params: {
                                  initialIndex: finalIndex,
                                  initialUri: videoUri,
                                  feedOption: 'search',
                                  userDid: undefined,
                                  backgroundColor: 'transparent',
                                  secondaryColor: Colors.white,
                                  searchQuery: '',
                                  hasNextPage: 'false',
                                  isFetchingNextPage: 'false',
                                },
                              });
                            }
                          }}
                        >
                          <View style={styles.spotlightVideoThumbnailContainer}>
                            <BlurredThumbnailBackground thumbnailUrl={thumbnailUrl} />
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
                                <Icon name="videocam" size={16} color={Colors.gray} />
                              </View>
                            )}
                            {shouldBlur && (
                              <View style={styles.spotlightWarningOverlay}>
                                <Text style={styles.spotlightWarningText}>Content Warning</Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                      );
                    }}
                  />
                </View>
              );
            }
            if (item.type === 'profile' && 'data' in item) {
              const profile = item.data as Profile;
              return (
                <View style={styles.profileItem}>
                  <Pressable
                    style={styles.profileTouchable}
                    onPress={() => {
                      if (profile.handle) {
                        const handle = profile.handle.trim();
                        if (handle && handle.trim()) {
                          // Prefetch profile: sets partial data immediately + fetches full profile
                          prefetchProfile(queryClient, handle.trim(), {
                            did: profile.did,
                            handle: handle.trim(),
                            displayName: profile.displayName,
                            avatar: profile.avatar,
                            description: profile.description,
                            verification: profile.verification,
                          }).finally(() => {
                            const target = handle.trim();
                            if (target) {
                              router.push({
                                pathname: '/profile/[did]',
                                params: { did: target },
                              });
                            }
                          });
                        }
                      }
                    }}
                  >
                    <Avatar
                      uri={profile.avatar}
                      type="profile"
                      size={48}
                      ringColor="transparent"
                      style={styles.profileImage}
                    />
                    <View style={styles.profileContent}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.displayName} numberOfLines={1}>
                          {formatHandle(profile.handle) || 'Unknown user'}
                        </Text>
                        {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                          <VerificationBadge
                            handle={profile.handle.trim()}
                            verification={profile.verification}
                            textSize={16}
                            textColor={Colors.white}
                          />
                        )}
                      </View>
                    </View>
                  </Pressable>
                  {!profile.viewer?.following &&
                    !isCurrentUser(profile.did, profile.handle, currentUser) && (
                      <Pressable
                        style={({ pressed }) => [styles.followButton, pressed && { opacity: 0.8 }]}
                        onPress={() => handleFollow(profile)}
                      >
                        <FollowIcon size={16} color={Colors.black} />
                      </Pressable>
                    )}
                </View>
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
                          // Navigate to channel using Expo Router
                          router.push({
                            pathname: '/channel/[id]',
                            params: { id: channel.uri.trim() },
                          });
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

              return <OrbytChannelsGrid channels={item.channels} router={router} />;
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
          onEndReachedThreshold={0.5}
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
    left: 0,
    right: 0,
    height: 100,
    zIndex: 5,
  },
  topSafeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: Colors.black,
    zIndex: 6,
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
    backgroundColor: Colors.white,
    borderRadius: 8,
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
    color: 'black',
    fontSize: 20,
    fontFamily: 'Firma-Medium',
    padding: 0,
    ...(Platform.OS === 'android' && {
      paddingVertical: 0,
    }),
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  profileTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileImage: {
    marginRight: 12,
  },
  profileContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  displayName: {
    color: Colors.white,
    fontSize: 17,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  handleText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
  gridChannelNameOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  gridChannelName: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
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
    color: Colors.white,
    fontSize: 22,
    fontFamily: 'Firma-Bold',
  },
  channelContent: {
    flex: 1,
    justifyContent: 'center',
  },
  orbytSlash: {
    fontFamily: 'Firma-SemiBold',
    marginRight: 0,
  },
  channelName: {
    color: Colors.white,
    fontSize: 17,
    fontFamily: 'Firma-Bold',
    flexShrink: 1,
  },
  channelCreator: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginBottom: 2,
  },
  channelStats: {
    color: Colors.lightGray,
    fontSize: 11,
    fontFamily: 'Firma-Regular',
  },
  noResults: {
    color: Colors.lightGray,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  noResultsSubtext: {
    color: Colors.lightGray,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    marginTop: 5,
  },
  initialStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialStateText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.LARGE,
  },
  retryButtonText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
  },
  loadingMoreContainer: {
    padding: 20,
    alignItems: 'center',
  },

  sectionHeader: {
    paddingHorizontal: 10,
    paddingTop: 15,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },

  spotlightTitle: {
    color: Colors.orange,
    fontSize: 24,
    fontFamily: 'Firma-Bold',
  },

  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray,
  },
  feedImage: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginRight: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  feedContent: {
    flex: 1,
    justifyContent: 'center',
  },
  videoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray,
  },
  videoThumbnailContainer: {
    position: 'relative',
    marginRight: 12,
  },
  videoThumbnail: {
    width: 45,
    height: 80, // 9:16 aspect ratio (45 * 16/9)
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden' as const,
  },
  videoThumbnailPlaceholder: {
    width: 45,
    height: 80,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: Colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },

  videoContent: {
    flex: 1,
    justifyContent: 'center',
  },
  videoTitle: {
    color: Colors.white,
    fontSize: 14,
    marginBottom: 4,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  videoAuthor: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 2,
  },
  videoStats: {
    color: Colors.gray,
    fontSize: 11,
    fontFamily: 'Firma-Regular',
  },
  videoWarningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  videoWarningText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  experimentalIcon: {
    marginLeft: 4,
    alignSelf: 'center',
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
    backgroundColor: Colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightWarningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  spotlightWarningText: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  spotlightVideoTitle: {
    color: Colors.white,
    fontSize: 11,
    fontFamily: 'Firma-Medium',
    lineHeight: 14,
  },

  peopleChannelsContainer: {
    marginBottom: 10,
  },
  emptyTabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTabText: {
    color: Colors.gray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
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
  searchFeedPage: {
    flex: 1,
  },

  followButton: {
    width: 32,
    height: 32,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 10,
  },

  // Search History Styles
  searchHistoryContainer: {
    flex: 1,
    paddingTop: 10,
  },
  searchHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  searchHistoryTitle: {
    fontFamily: 'Firma-Black',
    fontSize: 18,
  },
  clearHistoryButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearHistoryText: {
    fontFamily: 'Firma-Regular',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyHistoryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyHistoryText: {
    fontFamily: 'Firma-Regular',
    fontSize: 16,
  },
  historyList: {
    flex: 1,
  },
  historyTime: {
    fontFamily: 'Firma-Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    alignSelf: 'center',
  },

  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContentWrapper: {
    flex: 1,
  },
});

export default ExploreScreen;
