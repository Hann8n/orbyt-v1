import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  TouchableOpacity,
  StatusBar,
  Platform,
  Keyboard,
  Dimensions,
  FlatList,
  Animated,
  useWindowDimensions,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import AtprotoService from '../../src/services/api/AtprotoService';

import { useRouter, useFocusEffect } from 'expo-router';
import ProfileCache, { profileKeys, useFollowMutation } from '../../src/services/cache/ProfileCache';
import ChannelCache, { useChannelColors } from '../../src/services/cache/ChannelCache';
import type { CachedChannel } from '../../src/services/cache/ChannelCache';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import Svg, { Path, Rect, G } from 'react-native-svg';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import HeaderBanner from '../../src/components/ui/HeaderBanner';
import { logger } from '../../src/utils/logger';

import { SearchIcon, FollowIcon, CheckIcon, Loading3FillIcon } from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import { VerificationBadge } from '../../src/components/features/badging';
import { hexToRGBA } from '../../src/utils/formatting/colorUtils';
import EmptyFeed from '../../src/components/features/feed/EmptyFeed';
import { feedService } from '../../src/services/FeedService';
import { getBottomNavBarHeight, isSmallScreen, isTablet } from '../../src/utils/helpers';
import { extractVideoThumbnail } from '../../src/utils/helpers/video';
import { formatNumber, formatHandle } from '../../src/utils/helpers';
import { HeaderService, useHeaders } from '../../src/services/APIService';
import { useFeed } from '../../src/hooks/useFeed';
import { ModerationService } from '../../src/services/ModerationService';
import { useUserStore, useFeedSettings } from '../../src/stores/userStore';
import { isCurrentUser } from '../../src/stores/profileInteractionStore';
import { Colors as UIColors } from '../../src/components/ui/UI';
import { getAllChannels, isOrbytChannel, getChannelByUri, getChannelAvatarUri, shouldShowChannelSlash, extractFeedSlug } from '../../src/utils/orbytChannels';

// Custom Warning Icon Component
const WarningIcon = ({ size = 20, color = Colors.white }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect width="24" height="24" fill="none"/>
    <G fill="none">
      <Path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" fill={color}/>
      <Path fill="#fff" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2m0 13a1 1 0 1 0 0 2a1 1 0 0 0 0-2m0-9a1 1 0 0 0-.993.883L11 7v6a1 1 0 0 0 1.993.117L13 13V7a1 1 0 0 0-1-1"/>
    </G>
  </Svg>
);

interface Profile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  viewer?: {
    following?: string;
    followedBy?: string;
  };
  isFollowing?: boolean;
}

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

interface SearchResult {
  type: 'profile' | 'channel' | 'video';
  data: Profile | Channel | any; // 'any' for video post
  relevance: number;
}

interface SectionHeader {
  type: 'section-header';
  title: string;
  key: string;
}

// Add a new type for the spotlight videos section
interface SpotlightVideosSection {
  type: 'spotlight-videos';
  videos: any[];
  key: string;
}

interface PeopleChannelsSection {
  type: 'people-channels-section';
  profiles: Profile[];
  channels: Channel[];
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

interface HeaderSpacer {
  type: 'header-spacer';
  key: string;
}

interface LoadingItem {
  type: 'loading';
  key: string;
}

type ListItem = SearchResult | SectionHeader | SpotlightVideosSection | PeopleChannelsSection | PopularChannelsSection | OrbytChannelsSection | HeaderSpacer | LoadingItem;





// Tab labels
const SEARCH_TAB_LABELS: { [key: string]: string } = {
  'recently-visited': 'Recently Visited',
  'profiles': 'People',
  'channels': 'Feeds',
};

// Minimal swipeable pager for search tabs using react-native-pager-view
const SearchSwipePager = ({
  topOffset,
  bottomOffset,
  activeTab,
  onActiveTabChange,
  renderTabContent,
  onScrollProgressChange,
  pages,
}: {
  topOffset: number;
  bottomOffset: number;
  activeTab: 'recently-visited' | 'profiles' | 'channels';
  onActiveTabChange: (tab: 'recently-visited' | 'profiles' | 'channels') => void;
  renderTabContent: (tabId: 'recently-visited' | 'profiles' | 'channels') => React.ReactNode;
  onScrollProgressChange?: (progress: number) => void;
  pages: Array<'recently-visited' | 'profiles' | 'channels'>;
}) => {
  const pagerViewRef = useRef<PagerView>(null);
  const [dims, setDims] = useState(Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);

  const activeIndex = pages.indexOf(activeTab);
  const currentPageRef = useRef(activeIndex);
  const hasAppliedInitialIndexRef = useRef(false);
  const previousPagesRef = useRef<string>(JSON.stringify(pages));
  // Track if user is actively scrolling to prevent programmatic page changes during gestures
  const isUserScrollingRef = useRef(false);
  // Track if the activeTab change came from user gesture (not indicator tap)
  const isUserGestureRef = useRef(false);

  // Set initial page index and re-initialize when pages array structure changes
  useLayoutEffect(() => {
    const currentPagesString = JSON.stringify(pages);
    const pagesChanged = currentPagesString !== previousPagesRef.current;
    
    // Reset initialization flag if pages array structure changed
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

  // Sync PagerView page when activeTab changes (e.g., from indicator tap)
  // Only sync if NOT in the middle of a user gesture
  useEffect(() => {
    if (hasAppliedInitialIndexRef.current && pagerViewRef.current && activeIndex >= 0) {
      // Don't sync if user is actively scrolling - let the gesture complete naturally
      if (isUserScrollingRef.current || isUserGestureRef.current) {
        return;
      }
      // Only sync if the page actually changed (indicator tap)
      if (currentPageRef.current !== activeIndex) {
        requestAnimationFrame(() => {
          pagerViewRef.current?.setPage(activeIndex);
        });
      }
    }
  }, [activeIndex]);

  // Handle page scroll from PagerView - update indicator directly from SDK
  // This fires synchronously during scroll, no state batching
  const handlePageScroll = useCallback((event: any) => {
    const { position, offset } = event.nativeEvent;
    const progress = position + offset;
    const roundedPosition = Math.round(progress);
    
    // Update indicator progress directly from SDK - immediate, no batching
    onScrollProgressChange?.(progress);
    
    // Update active tab immediately during scroll (not waiting for onPageSelected)
    // This makes indicators respond in real-time as user swipes
    if (roundedPosition !== currentPageRef.current && roundedPosition >= 0 && roundedPosition < pages.length) {
      currentPageRef.current = roundedPosition;
      const nextTab = pages[roundedPosition];
      if (nextTab && nextTab !== activeTab) {
        // Mark as user gesture to prevent sync effect from interfering
        isUserGestureRef.current = true;
        onActiveTabChange(nextTab);
      }
    }
  }, [pages, activeTab, onActiveTabChange, onScrollProgressChange]);

  // Handle page selection from PagerView - final confirmation after transition completes
  const handlePageSelected = useCallback((event: any) => {
    if (!hasAppliedInitialIndexRef.current) return;
    
    const nextIndex = event.nativeEvent.position;
    const prevIndex = currentPageRef.current;
    
    if (nextIndex !== prevIndex) {
      currentPageRef.current = nextIndex;
      // Ensure indicator is at exact position after transition
      onScrollProgressChange?.(nextIndex);
    }
    
    const nextTab = pages[nextIndex];
    if (nextTab && nextTab !== activeTab) {
      isUserGestureRef.current = true;
      onActiveTabChange(nextTab);
    }
    
    // Reset user gesture flag after a short delay to allow state to settle
    setTimeout(() => {
      isUserGestureRef.current = false;
    }, 100);
  }, [activeTab, pages, onActiveTabChange, onScrollProgressChange]);

  // Handle scroll state changes from PagerView
  const handlePageScrollStateChanged = useCallback((event: any) => {
    const state = event.nativeEvent.pageScrollState;
    // Track when user starts/stops scrolling
    if (state === 'dragging' || state === 'settling') {
      isUserScrollingRef.current = true;
    } else if (state === 'idle') {
      // Reset scrolling flag after a short delay to ensure gesture is complete
      setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 50);
    }
  }, []);

  const initialPageIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <View
      style={[
        styles.searchResultsContainer,
        { top: topOffset, bottom: bottomOffset, zIndex: 19 },
      ]}
    >
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
        onPageScrollStateChanged={handlePageScrollStateChanged}
        scrollEnabled={true}
        pageMargin={0}
      >
        {pages.map((page) => (
          <View key={page} style={styles.pagerPage}>
            {renderTabContent(page)}
          </View>
        ))}
      </PagerView>
    </View>
  );
};
// Query keys for unified search
const unifiedSearchKeys = {
  all: ['unifiedSearch'] as const,
  infinite: () => [...unifiedSearchKeys.all, 'infinite'] as const,
  infiniteSearch: (query: string) => [...unifiedSearchKeys.infinite(), query] as const,
};

// Simple loading components with Loading3FillIcon
const ProfileLoading = () => (
  <View style={[styles.profileItem, styles.loadingContainer]}>
    <Loading3FillIcon size={24} color={Colors.white} />
  </View>
);

const ChannelLoading = () => (
  <View style={[styles.channelItem, styles.loadingContainer]}>
    <Loading3FillIcon size={24} color={Colors.white} />
  </View>
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
const HeaderSpacer = ({ isHeaderVisible, isSearching, computedHeaderHeight }: { isHeaderVisible: boolean; isSearching?: boolean; computedHeaderHeight: number }) => {
  // Always use the computed header height for consistency
  // computedHeaderHeight already handles both searching and non-searching cases
  return <View style={{ height: computedHeaderHeight }} />;
};


// Channel Name Component with Orbyt formatting
const ChannelNameDisplay: React.FC<{ channel: Channel; style?: any }> = ({ channel, style }) => {
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
    <TouchableOpacity
      style={styles.channelItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Avatar
        uri={avatarUri}
        type="channel"
        size={48}
        ringColor="transparent"
        style={styles.channelImage}
      />
      <View style={styles.channelContent}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <ChannelNameDisplay channel={channel} />
          {channel.isExperimental && (
            <Icon name="bug" size={12} color={Colors.lightGreen} style={styles.experimentalIcon} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Grid Channel Item Component with large square thumbnail
const GridChannelItem = ({ channel, onPress, itemWidth, itemHeight }: { channel: Channel; onPress: () => void; itemWidth: number; itemHeight?: number }) => {
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || '#FFD700';
  const thumbnailHeight = itemHeight || itemWidth; // Use itemHeight if provided, otherwise use itemWidth for square

  return (
    <TouchableOpacity
      style={[styles.gridChannelItem, { width: itemWidth }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.gridChannelThumbnail, 
        { height: thumbnailHeight },
        itemHeight ? { aspectRatio: undefined } : {} // Remove aspectRatio when height is explicitly set
      ]}>
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={styles.gridChannelImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.gridChannelImage, { backgroundColor: Colors.darkGray, justifyContent: 'center', alignItems: 'center' }]}>
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
                <Text style={[styles.gridChannelName, styles.orbytSlash, { color: channelColor }]}>/</Text>
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
    </TouchableOpacity>
  );
};

// Horizontal Channel Button Component for popular now and latest (full width, GIF on right, label bottom left)
const HorizontalChannelItem = ({ channel, onPress, itemWidth, itemHeight }: { channel: Channel; onPress: () => void; itemWidth: number; itemHeight: number }) => {
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || '#FFD700';
  // Calculate max width for label: full width - left padding - right padding
  const labelMaxWidth = itemWidth - 16 - 16; // width - left padding - right padding
  
  // Check if this is the popular now channel for special cropping
  const slug = extractFeedSlug(channel.uri || '');
  const isPopularNow = slug === 'popular-now';

  return (
    <TouchableOpacity
      style={[
        styles.horizontalChannelButton,
        { 
          width: itemWidth, 
          height: itemHeight,
          backgroundColor: channelColor,
        }
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* GIF fills entire button */}
      <View style={styles.horizontalChannelThumbnail}>
        {isPopularNow ? (
          <Image
            source={{ uri: avatarUri }}
            style={[
              styles.horizontalChannelImage,
              {
                width: itemWidth * 0.7, // Smaller width
                height: itemHeight * 2.5, // Make image much taller to crop more from bottom
                alignSelf: 'flex-end', // Align to right
                marginRight: -50, // Push further right
              }
            ]}
            resizeMode="cover"
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
    </TouchableOpacity>
  );
};

// Profiles Feed Renderer Component
const ProfilesFeedRenderer = React.memo(({ searchResults, onFollow, followedUsers, cacheUpdateTrigger, isLoading, onProfilePress }: {
  searchResults: SearchResult[];
  onFollow: (profile: Profile) => void;
  followedUsers: Set<string>;
  cacheUpdateTrigger: number;
  isLoading?: boolean;
  onProfilePress?: (profile: Profile) => void;
}) => {
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useUserStore(state => state.currentUser);

  const profiles = searchResults
    .filter((result): result is any => result.type === 'profile')
    .map(result => result.data as Profile)
    .filter((profile, index, self) => 
      index === self.findIndex(p => p.did === profile.did)
    );

  // Show loading state when loading
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
      keyExtractor={(profile) => `profile-${profile.did || profile.handle}`}
      renderItem={({ item: profile }) => (
        <View style={styles.profileItem}>
          <TouchableOpacity
            style={styles.profileTouchable}
            onPress={() => {
              if (onProfilePress) {
                onProfilePress(profile);
              } else {
                // Fallback to original behavior
                if (profile.handle) {
                  const handle = profile.handle.trim();
                  if (handle && handle.trim()) {
                    queryClient.prefetchQuery({
                      queryKey: profileKeys.detail(handle.trim()),
                      queryFn: () => ProfileCache.getProfile(handle.trim()),
                      staleTime: ProfileCache.cacheExpiry
                    }).finally(() => {
                      const target = handle.trim();
                      if (target) { navigation.push(`/profile/${target}`); }
                    });
                  }
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
              <View style={{flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0}}>
                <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
                  {formatHandle(profile.handle) || 'Unknown user'}
                </Text>
                {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                  <VerificationBadge 
                    handle={profile.handle.trim()} 
                    textSize={16} 
                    textColor={Colors.white}
                  />
                )}
              </View>
            </View>
          </TouchableOpacity>
          {!(ProfileCache.getProfileFromCacheSync(profile.handle || '')?.isFollowing ?? profile.isFollowing) && !isCurrentUser(profile.did, profile.handle, currentUser) && (
            <TouchableOpacity
              style={styles.followButton}
              onPress={() => onFollow(profile)}
              activeOpacity={0.8}
            >
              <FollowIcon size={16} color={Colors.black} />
            </TouchableOpacity>
          )}
        </View>
      )}
      contentContainerStyle={styles.listContainer}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={() => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>No people found</Text>
        </View>
      )}
    />
  );
});

// Channels Feed Renderer Component
const ChannelsFeedRenderer = React.memo(({ searchResults, isLoading, onChannelPress }: { searchResults: SearchResult[]; isLoading?: boolean; onChannelPress?: (channel: Channel) => void }) => {
  const navigation = useRouter();

  const channels = searchResults
    .filter((result): result is any => result.type === 'channel')
    .map(result => result.data as Channel)
    .filter((channel, index, self) => 
      index === self.findIndex(c => c.uri === channel.uri)
    );

  // Show loading state when loading
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
      keyExtractor={(channel) => `channel-${channel.uri || channel.cid}`}
      renderItem={({ item: channel }) => (
        <TouchableOpacity
          style={styles.channelItem}
          onPress={() => {
            if (onChannelPress) {
              onChannelPress(channel);
            } else {
              // Fallback to original behavior
              if (channel.uri && channel.uri.trim()) {
                navigation.push(`/channel/${encodeURIComponent(channel.uri.trim())}`);
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
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <ChannelNameDisplay channel={channel} />
              {channel.isExperimental && (
                <Icon name="bug" size={12} color={Colors.lightGreen} style={styles.experimentalIcon} />
              )}
            </View>
          </View>
        </TouchableOpacity>
      )}
      contentContainerStyle={styles.listContainer}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={() => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>No feeds found</Text>
        </View>
      )}
    />
  );
});


// Custom Feed Renderer for Search Results
const SearchFeedRenderer = React.memo(({ feedOption, searchResults, onFollow, followedUsers, cacheUpdateTrigger, isLoading, onProfilePress, onChannelPress, visitHistory, onHistoryItemPress, onClearHistory }: {
  feedOption: string;
  searchResults: SearchResult[];
  onFollow: (profile: Profile) => void;
  followedUsers: Set<string>;
  cacheUpdateTrigger: number;
  isLoading?: boolean;
  onProfilePress?: (profile: Profile) => void;
  onChannelPress?: (channel: Channel) => void;
  visitHistory?: Array<{ type: 'profile' | 'channel'; data: Profile | Channel }>;
  onHistoryItemPress?: (item: { type: 'profile' | 'channel'; data: Profile | Channel }) => void;
  onClearHistory?: () => void;
}) => {
  // Show visit history for recently-visited tab
  if (feedOption === 'recently-visited') {
    return (
      <VisitHistoryList
        visitHistory={visitHistory || []}
        onHistoryItemPress={onHistoryItemPress || (() => {})}
        onClearHistory={onClearHistory || (() => {})}
        currentColors={{ backgroundColor: Colors.black, textColor: Colors.white }}
        onFollow={onFollow}
        followedUsers={followedUsers}
        cacheUpdateTrigger={cacheUpdateTrigger}
      />
    );
  }

  if (feedOption === 'profiles') {
    return (
      <ProfilesFeedRenderer
        searchResults={searchResults}
        onFollow={onFollow}
        followedUsers={followedUsers}
        cacheUpdateTrigger={cacheUpdateTrigger}
        isLoading={isLoading}
        onProfilePress={onProfilePress}
      />
    );
  } else if (feedOption === 'channels') {
    return <ChannelsFeedRenderer searchResults={searchResults} isLoading={isLoading} onChannelPress={onChannelPress} />;
  }
  return null;
});

// Visit History Component
const VisitHistoryList = React.memo(({ 
  visitHistory, 
  onHistoryItemPress, 
  onClearHistory,
  currentColors,
  onFollow,
  followedUsers,
  cacheUpdateTrigger
}: {
  visitHistory: Array<{ type: 'profile' | 'channel'; data: Profile | Channel }>;
  onHistoryItemPress: (item: { type: 'profile' | 'channel'; data: Profile | Channel }) => void;
  onClearHistory: () => void;
  currentColors: { backgroundColor: string; textColor: string };
  onFollow: (profile: Profile) => void;
  followedUsers: Set<string>;
  cacheUpdateTrigger: number;
}) => {
  const currentUser = useUserStore(state => state.currentUser);
  return (
    <FlashList
      data={visitHistory}
      keyExtractor={(item, index) => {
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
              <TouchableOpacity
                style={styles.profileTouchable}
                onPress={() => onHistoryItemPress(item)}
                activeOpacity={0.7}
              >
                <Avatar
                  uri={profileData.avatar}
                  type="profile"
                  size={48}
                  ringColor="transparent"
                  style={styles.profileImage}
                />
                <View style={styles.profileContent}>
                  <View style={{flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0}}>
                    <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
                      {formatHandle(profileData.handle) || 'Unknown user'}
                    </Text>
                    {profileData.handle && profileData.handle.trim() && profileData.handle.length > 0 && (
                      <VerificationBadge 
                        handle={profileData.handle.trim()} 
                        textSize={16} 
                        textColor={Colors.white}
                      />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
              {!(ProfileCache.getProfileFromCacheSync(profileData.handle || '')?.isFollowing ?? profileData.isFollowing) && !isCurrentUser(profileData.did, profileData.handle, currentUser) && (
                <TouchableOpacity
                  style={styles.followButton}
                  onPress={() => onFollow(profileData)}
                  activeOpacity={0.8}
                >
                  <FollowIcon size={16} color={Colors.black} />
                </TouchableOpacity>
              )}
            </View>
          );
        } else if (!isProfile && channelData) {
          return (
            <TouchableOpacity
              style={styles.channelItem}
              onPress={() => onHistoryItemPress(item)}
              activeOpacity={0.7}
            >
              <Avatar
                uri={getChannelAvatarUri(channelData.uri, channelData.avatar)}
                type="channel"
                size={48}
                ringColor="transparent"
                style={styles.channelImage}
              />
              <View style={styles.channelContent}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <ChannelNameDisplay channel={channelData} />
                  {channelData.isExperimental && (
                    <Icon name="bug" size={12} color={Colors.lightGreen} style={styles.experimentalIcon} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }
        return null;
      }}
      contentContainerStyle={styles.listContainer}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={() => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>No recent visits</Text>
        </View>
      )}
    />
  );
});

// Responsive Orbyt Channels Grid Component
const OrbytChannelsGrid = React.memo(({ channels, navigation }: { channels: Channel[]; navigation: any }) => {
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
      return { padding: 24, gap: 10 }; // Larger spacing for tablets
    } else if (w > 480) {
      return { padding: 20, gap: 8 }; // Medium spacing
    } else {
      return { padding: 20, gap: 7 }; // Default spacing for small screens
    }
  }, [windowWidth]);
  
  // Calculate grid dimensions
  const { itemWidth, fullWidth, buttonHeight } = useMemo(() => {
    const screenWidth = windowWidth || Dimensions.get('window').width;
    const totalPadding = padding * 2; // Left and right padding
    const totalGap = gap * (computedColumns - 1); // Gaps between items
    
    // Regular grid item width
    const calculatedItemWidth = (screenWidth - totalPadding - totalGap) / computedColumns;
    const gridItemHeight = calculatedItemWidth; // Square items
    
    // Full width for popular now and latest buttons
    const calculatedFullWidth = screenWidth - totalPadding;
    
    // Reduced height for popular now and latest buttons (80% of grid item height)
    const calculatedButtonHeight = Math.round(gridItemHeight * 0.8);
    
    return {
      itemWidth: calculatedItemWidth,
      fullWidth: calculatedFullWidth,
      buttonHeight: calculatedButtonHeight,
    };
  }, [windowWidth, padding, gap, computedColumns]);

  const shouldShowSpecialInRow = useMemo(() => {
    return computedColumns >= 4 || isTablet();
  }, [computedColumns]);

  const { specialItemWidth, specialItemHeight } = useMemo(() => {
    if (!shouldShowSpecialInRow) {
      return { specialItemWidth: fullWidth, specialItemHeight: buttonHeight };
    }

    const columnsToSpan = Math.min(2, computedColumns);
    const width = itemWidth * columnsToSpan + gap * (columnsToSpan - 1);
    const height = Math.round(buttonHeight * 0.9);

    return { specialItemWidth: width, specialItemHeight: height };
  }, [shouldShowSpecialInRow, fullWidth, buttonHeight, itemWidth, gap, computedColumns]);
  
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
  
  return (
    <View style={[styles.channelsGridContainer, { paddingHorizontal: padding }]}>
      {/* Render popular now and latest either stacked or side by side on large screens */}
      {shouldShowSpecialInRow ? (
        <View style={{ width: fullWidth, flexDirection: 'row', flexWrap: 'wrap' }}>
          {popularNowChannel && (
            <View
              key={`orbyt-channel-popular-now`}
              style={{ width: specialItemWidth, marginRight: latestChannel ? gap : 0, marginBottom: gap }}
            >
              <HorizontalChannelItem
                channel={popularNowChannel}
                itemWidth={specialItemWidth}
                itemHeight={specialItemHeight}
                onPress={() => {
                  if (popularNowChannel.uri && popularNowChannel.uri.trim()) {
                    navigation.push(`/channel/${encodeURIComponent(popularNowChannel.uri.trim())}`);
                  }
                }}
              />
            </View>
          )}
          {latestChannel && (
            <View
              key={`orbyt-channel-latest`}
              style={{ width: specialItemWidth, marginBottom: gap }}
            >
              <HorizontalChannelItem
                channel={latestChannel}
                itemWidth={specialItemWidth}
                itemHeight={specialItemHeight}
                onPress={() => {
                  if (latestChannel.uri && latestChannel.uri.trim()) {
                    navigation.push(`/channel/${encodeURIComponent(latestChannel.uri.trim())}`);
                  }
                }}
              />
            </View>
          )}
        </View>
      ) : (
        <>
          {popularNowChannel && (
            <View
              key={`orbyt-channel-popular-now`}
              style={{ width: fullWidth, marginBottom: gap }}
            >
              <HorizontalChannelItem
                channel={popularNowChannel}
                itemWidth={fullWidth}
                itemHeight={buttonHeight}
                onPress={() => {
                  if (popularNowChannel.uri && popularNowChannel.uri.trim()) {
                    navigation.push(`/channel/${encodeURIComponent(popularNowChannel.uri.trim())}`);
                  }
                }}
              />
            </View>
          )}
          {latestChannel && (
            <View
              key={`orbyt-channel-latest`}
              style={{ width: fullWidth, marginBottom: gap }}
            >
              <HorizontalChannelItem
                channel={latestChannel}
                itemWidth={fullWidth}
                itemHeight={buttonHeight}
                onPress={() => {
                  if (latestChannel.uri && latestChannel.uri.trim()) {
                    navigation.push(`/channel/${encodeURIComponent(latestChannel.uri.trim())}`);
                  }
                }}
              />
            </View>
          )}
        </>
      )}
      
      {/* Render other channels in responsive grid */}
      {otherChannels.map((channel, index) => (
        <View
          key={`orbyt-channel-${channel.uri || channel.cid || index}`}
          style={{ 
            width: itemWidth, 
            marginRight: index % computedColumns === computedColumns - 1 ? 0 : gap,
            marginBottom: gap
          }}
        >
          <GridChannelItem
            channel={channel}
            itemWidth={itemWidth}
            onPress={() => {
              if (channel.uri && channel.uri.trim()) {
                navigation.push(`/channel/${encodeURIComponent(channel.uri.trim())}`);
              }
            }}
          />
        </View>
      ))}
    </View>
  );
});

const ExploreScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [cacheUpdateTrigger, setCacheUpdateTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<'recently-visited' | 'profiles' | 'channels'>('recently-visited');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const hasAppliedInitialIndexRef = useRef(false);
  const [visitHistory, setVisitHistory] = useState<Array<{
    type: 'profile' | 'channel';
    data: Profile | Channel;
  }>>([]);
  const currentUser = useUserStore(state => state.currentUser);
  

  // Dynamic pages: show recently-visited when no query, show profiles/channels when searching
  const pages: Array<'recently-visited' | 'profiles' | 'channels'> = useMemo(() => {
    if (debouncedQuery.length === 0) {
      return ['recently-visited'];
    }
    return ['profiles', 'channels'];
  }, [debouncedQuery.length]);
  const activeIndex = pages.indexOf(activeTab);
  // State to trigger indicator re-renders during scroll (doesn't affect feeds) - matches SwipeableFeedContainer
  const [indicatorScrollProgress, setIndicatorScrollProgress] = useState(activeIndex >= 0 ? activeIndex : 0);

  // Reset activeTab when pages change
  useEffect(() => {
    if (pages.length > 0 && !pages.includes(activeTab)) {
      setActiveTab(pages[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // Update indicatorScrollProgress when activeIndex changes (fixes stale state when pages array changes)
  useEffect(() => {
    if (activeIndex >= 0) {
      setIndicatorScrollProgress(activeIndex);
    } else {
      setIndicatorScrollProgress(0);
    }
  }, [activeIndex]);

  // Get indicator style using PagerView's scroll progress - matches SwipeableFeedContainer exactly
  const getIndicatorStyle = useCallback((tabId: 'recently-visited' | 'profiles' | 'channels') => {
    const tabIndex = pages.indexOf(tabId);
    const isActive = tabId === activeTab;
    
    // Use state directly for smooth real-time updates during scroll (not ref) - matches SwipeableFeedContainer
    const baseProgress = indicatorScrollProgress;

    // Calculate opacity based on distance from current position - matches SwipeableFeedContainer
    let opacity = 0.75; // Default inactive opacity
    if (isActive) {
      opacity = 1;
    } else {
      // Gradual opacity based on PagerView's scroll progress (real-time from state)
      const distance = Math.abs(baseProgress - tabIndex);
      opacity = Math.max(0.3, 1 - distance * 0.4);
    }
    
    // Larger font size for search tabs (under search bar)
    const indicatorBaseFontSize = 20;
    
    return {
      color: isActive ? Colors.white : 'rgba(255, 255, 255, 0.6)',
      fontSize: indicatorBaseFontSize,
      marginRight: 8,
      fontWeight: 'bold' as const,
      opacity,
    };
  }, [activeTab, pages, indicatorScrollProgress, activeIndex]);

  // Handle indicator tap
  const handleIndicatorTap = useCallback((tabId: 'recently-visited' | 'profiles' | 'channels') => {
    setActiveTab(tabId);
  }, []);


  const navigation = useRouter();
  const queryClient = useQueryClient();
  
  // Use the follow mutation hook for proper cache management
  const followMutation = useFollowMutation();
  const insets = useSafeAreaInsets();
  
  // Get experimental feeds setting
  const { experimentalFeedsEnabled } = useFeedSettings();

  // Handle follow toggle with persistent cache
  const handleFollow = useCallback((profile: Profile) => {
    if (profile.handle) {
      const handle = profile.handle;
      followMutation.mutate({
        handle,
        isFollowing: !(profile.isFollowing ?? false),
      });
    }
  }, [followMutation]);
  
  // Initialize current user for ProfileCache on mount
  useEffect(() => {
    const initializeCache = async () => {
      try {
        const currentUser = await AtprotoService.getCurrentUser();
        if (currentUser?.did) {
          ProfileCache.setCurrentUserDid(currentUser.did);
        }
      } catch (error) {
        // Silently handle rate limiting errors during initialization
        if (error?.message?.includes('Rate Limit Exceeded')) {
          console.warn('Rate limited during cache initialization, skipping...');
        } else {
          console.error('Error initializing profile cache:', error);
        }
      }
    };
    
    initializeCache();
  }, []);

  // Fetch headers using TanStack Query
  const {
    data: fetchedHeaders = [],
    isLoading: isLoadingHeaders,
  } = useHeaders();

  // Process headers with image URLs
  const headers = useMemo(() => {
    return fetchedHeaders.map(header => ({
      ...header,
      imageUrl: HeaderService.getImageUrl(header.imageUrl)
    }));
  }, [fetchedHeaders]);

  // Debounce search query to avoid too many API calls
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery) {
        setDebouncedQuery(searchQuery);
      } else {
        setDebouncedQuery('');
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Reset showAll states when search query changes
  useEffect(() => {
    // setShowAllProfiles(false); // Removed
    // setShowAllChannels(false); // Removed
  }, [debouncedQuery]);



  // Use FeedService for search functionality
  const searchFeedOption = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.trim() === '') {
      return null;
    }
    return `search:${debouncedQuery}`;
  }, [debouncedQuery]);

  // Use the standardized useFeed hook for search
  const {
    feed: searchFeed,
    isLoading: isSearchLoading,
    isError: isSearchError,
    isFetchingNextPage: isSearchFetchingNextPage,
    hasNextPage: hasSearchNextPage,
    fetchNextPage: fetchSearchNextPage,
    // Removed onScroll - using FlashList's onEndReached
  } = useFeed(searchFeedOption || 'following', undefined, {
    enabled: !!searchFeedOption,
    staleTime: 30 * 1000, // 30 seconds for search
    refetchOnMount: false,
  });

  // Process search results for display
  const searchResults = useMemo(() => {
    if (!searchFeedOption || !searchFeed.length) {
      return [];
    }

    // Convert feed items to search results format
    const results = searchFeed.map((feedItem, index) => {
      const post = feedItem.post;
      
      // Better channel detection logic - check for feed generator URIs
      const isChannel = post.uri?.includes('app.bsky.feed.generator');
      
      if (isChannel) {
        // Check contentMode directly from post - preserved from FeedService
        const contentMode = (post as any).contentMode;
        
        // For channels, the post structure is different - it contains channel data directly
        return {
          type: 'channel' as const,
          data: {
            uri: post.uri,
            cid: post.cid,
            did: (post.author as any)?.did || '',
            displayName: (post as any).text || post.author?.displayName || 'Unknown channel',
            description: (post as any).description || '',
            creator: {
              did: (post.author as any)?.did || '',
              handle: post.author?.handle || '',
              displayName: post.author?.displayName || '',
              avatar: post.author?.avatar || '',
            },
            avatar: (post as any).avatar || post.author?.avatar || '',
            likeCount: (post as any).likeCount || 0,
            contentMode, // Store contentMode to determine if feed is experimental
          } as Channel & { contentMode?: string },
          relevance: 10 - index,
        };
      }
      
      // Determine result type based on post content
      if (post.author) {
        const handle = post.author.handle;
        const postText = (post as any).text || '';
        // Get cached profile data for accurate following status
        const cachedProfile = handle ? ProfileCache.getProfileFromCacheSync(handle) : null;
        
        return {
          type: 'profile' as const,
          data: {
            did: (post.author as any).did || '',
            handle: post.author.handle || '',
            displayName: post.author.displayName || '',
            avatar: post.author.avatar || '',
            description: postText || '',
            isFollowing: cachedProfile?.isFollowing ?? !!(post as any).viewer?.following,
          } as Profile,
          relevance: 10 - index, // Higher relevance for earlier results
        };
      }
      
      // For channel-like content with embed
      if (post.embed?.$type === 'app.bsky.embed.record') {
        const postText = (post as any).text || '';
        // Check if this embedded record is a feed generator (channel)
        const embedRecord = (post.embed as any)?.record;
        const isEmbedChannel = embedRecord?.uri?.includes('app.bsky.feed.generator');
        
        if (isEmbedChannel) {
          const contentMode = embedRecord?.contentMode || embedRecord?.view?.contentMode;
          
          return {
            type: 'channel' as const,
            data: {
              uri: embedRecord?.uri || post.uri,
              cid: embedRecord?.cid || post.cid,
              displayName: postText || 'Unknown channel',
              description: postText || '',
              creator: post.author || {},
              contentMode, // Store contentMode to determine if feed is experimental
            } as Channel & { contentMode?: string },
            relevance: 10 - index,
          };
        }
      }
      
      // Default to profile
      const handle = post.author?.handle;
      const postText = (post as any).text || '';
      const cachedProfile = handle ? ProfileCache.getProfileFromCacheSync(handle) : null;
      
      return {
        type: 'profile' as const,
        data: {
          did: (post.author as any)?.did || '',
          handle: post.author?.handle || '',
          displayName: post.author?.displayName || '',
          avatar: post.author?.avatar || '',
          description: postText || '',
          isFollowing: cachedProfile?.isFollowing ?? !!(post as any).viewer?.following,
        } as Profile,
        relevance: 10 - index,
      };
    });
    
    // Filter out experimental (non-video) channels when experimental feeds are disabled
    const filtered = results.filter((result) => {
      if (result.type === 'channel') {
        const channel = result.data as Channel & { contentMode?: string };
        // Check contentMode directly - non-video feeds (contentMode !== 'app.bsky.feed.defs#contentModeVideo') are experimental
        const contentMode = channel.contentMode;
        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        
        // If experimental feeds are disabled, filter out non-video (experimental) channels
        if (!experimentalFeedsEnabled && !isVideoOnly) {
          return false;
        }
      }
      // Filter out current user from profile results
      if (result.type === 'profile') {
        const profile = result.data as Profile;
        if (isCurrentUser(profile.did, profile.handle, currentUser)) {
          return false;
        }
      }
      return true;
    });
    
    return filtered;
  }, [searchFeedOption, searchFeed, cacheUpdateTrigger, experimentalFeedsEnabled, currentUser]);



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

  // Batch prefetch profiles and channels when search results change
  useEffect(() => {
    if (searchResults.length > 0) {
      const profiles = searchResults
        .filter((result): result is any => result.type === 'profile')
        .map(result => result.data as Profile);
      
      const channels = searchResults
        .filter((result): result is any => result.type === 'channel')
        .map(result => result.data as Channel);
      
      if (profiles.length > 0) {
        ProfileCache.batchPrefetchFromFeed(profiles).catch(error => {
          console.warn('Error batch prefetching search profiles:', error);
        });
      }
      
      if (channels.length > 0) {
        ChannelCache.batchPrefetchFromFeed(channels).catch(error => {
          console.warn('Error batch prefetching search channels:', error);
        });
      }
    }
  }, [searchResults]);



  // Handle clear search input
  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setIsSearchFocused(false);
    Keyboard.dismiss();
  };

  // Load visit history from storage
  const loadVisitHistory = useCallback(async () => {
    try {
      // Using AsyncStorage for persistence
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      const history = await AsyncStorage.default.getItem('visitHistory');
      if (history) {
        setVisitHistory(JSON.parse(history));
      }
    } catch (error) {
      console.warn('Failed to load visit history:', error);
    }
  }, []);

  // Save visited profile or channel to history
  const saveToVisitHistory = useCallback(async (type: 'profile' | 'channel', data: Profile | Channel) => {
    try {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      const historyItem = {
        type,
        data,
      };
      
      // Remove any existing entry for this item and add to beginning
      const newHistory = [
        historyItem,
        ...visitHistory.filter(item => {
          if (type === 'profile') {
            return (item.data as Profile).did !== (data as Profile).did;
          } else {
            return (item.data as Channel).uri !== (data as Channel).uri;
          }
        })
      ].slice(0, 20); // Keep last 20 visited items
      
      setVisitHistory(newHistory);
      await AsyncStorage.default.setItem('visitHistory', JSON.stringify(newHistory));
    } catch (error) {
      console.warn('Failed to save visit history:', error);
    }
  }, [visitHistory]);

  // Clear visit history
  const clearVisitHistory = useCallback(async () => {
    try {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      setVisitHistory([]);
      await AsyncStorage.default.removeItem('visitHistory');
    } catch (error) {
      console.warn('Failed to clear visit history:', error);
    }
  }, []);

  // Handle visit history item selection
  const handleHistoryItemPress = useCallback((item: { type: 'profile' | 'channel'; data: Profile | Channel }) => {
    if (item.type === 'profile') {
      const profile = item.data as Profile;
      if (profile.handle) {
        const handle = profile.handle.trim();
        if (handle && handle.trim()) {
          queryClient.prefetchQuery({
            queryKey: profileKeys.detail(handle.trim()),
            queryFn: () => ProfileCache.getProfile(handle.trim()),
            staleTime: ProfileCache.cacheExpiry
          }).finally(() => {
            const target = handle.trim();
            if (target) { 
              navigation.push(`/profile/${target}`); 
            }
          });
        }
      }
    } else if (item.type === 'channel') {
      const channel = item.data as Channel;
      if (channel.uri) {
        navigation.push(`/channel/${encodeURIComponent(channel.uri)}`);
      }
    }
  }, [queryClient, navigation]);

  // Load visit history on mount
  useEffect(() => {
    loadVisitHistory();
  }, [loadVisitHistory]);

  // Handle profile navigation with visit tracking
  const handleProfileNavigation = useCallback((profile: Profile) => {
    saveToVisitHistory('profile', profile);
    if (profile.handle) {
      const handle = profile.handle.trim();
      if (handle && handle.trim()) {
        queryClient.prefetchQuery({
          queryKey: profileKeys.detail(handle.trim()),
          queryFn: () => ProfileCache.getProfile(handle.trim()),
          staleTime: ProfileCache.cacheExpiry
        }).finally(() => {
          const target = handle.trim();
          if (target) { navigation.push(`/profile/${target}`); }
        });
      }
    }
  }, [saveToVisitHistory, queryClient, navigation]);

  // Handle channel navigation with visit tracking
  const handleChannelNavigation = useCallback((channel: Channel) => {
    saveToVisitHistory('channel', channel);
    if (channel.uri) {
      navigation.push(`/channel/${encodeURIComponent(channel.uri)}`);
    }
  }, [saveToVisitHistory, navigation]);

  // Save to history when user submits search (on return key)
  const handleSearchSubmit = useCallback(() => {
    if (searchQuery.trim()) {
      // For now, we don't save search queries to history since we're tracking visits instead
      // This function is kept for compatibility with the TextInput onSubmitEditing
    }
  }, [searchQuery]);
  










  // Optimized viewabilityConfig
  const viewabilityConfig = useMemo(
    () => ({
      viewAreaCoveragePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    []
  );













  const isLoadingResults = isSearchLoading || isSearchError;

  // Fetch orbyt channel details using ChannelCache
  const orbytChannelUris = getAllChannels().map(ch => ch.uri);
  const {
    data: orbytChannelsData,
    isLoading: isLoadingOrbytChannels,
    error: orbytChannelsError,
    refetch: refetchOrbytChannels,
  } = useQuery({
    queryKey: ['orbytChannels', orbytChannelUris],
    queryFn: async () => {
      // Use ChannelCache which handles caching, error handling, and avatar extraction
      const channelPromises = orbytChannelUris.map(uri => ChannelCache.getChannel(uri));
      const cachedChannels = await Promise.all(channelPromises);
      
      // Convert CachedChannel to Channel format
      return cachedChannels
        .filter((ch): ch is CachedChannel => ch !== null)
        .map((cachedChannel): Channel => ({
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
        }));
    },
    enabled: debouncedQuery.length === 0 && orbytChannelUris.length > 0,
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
      const response = await AtprotoService.getFeed(null, 'at://did:plc:l3l3fjuwhv4mh4ih5y7ewrue/app.bsky.feed.generator/aaaiu3akzsv6q', {}, true, 10, 'custom');
      let feed = response.feed || [];
      
      // Apply moderation to spotlight videos
      if (feed.length > 0) {
        try {
          // Get agent from userStore to pass to moderation
          const { agent } = useUserStore.getState();
          
          if (!agent) {
            // Fail-safe: filter out posts with sensitive labels when no agent
            feed = ModerationService.filterSensitiveByLabels(feed);
          } else {
            const moderationResult = await ModerationService.batchModeratePosts(feed, 'contentList', agent);
            feed = moderationResult.filteredPosts;
          }
        } catch (error) {
          // Fail-safe: filter out posts with sensitive labels if moderation fails
          logger.error('Error applying moderation to spotlight videos, applying basic filtering', error, { component: 'explore' });
          feed = ModerationService.filterSensitiveByLabels(feed);
        }
      }
      
      return feed;
    },
    enabled: debouncedQuery.length === 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });


  // Collapsible header setup (custom for Explore)
  const isHeaderVisible = useMemo(
    () => !isLoadingHeaders && headers.length > 0,
    [isLoadingHeaders, headers.length]
  );
  const isSearching = isSearchFocused || debouncedQuery.length > 0;
  const computedHeaderHeight = useMemo(() => {
    // When searching, reserve space for the search bar area so content starts below it
    if (isSearching) {
      return insets.top + 10 + 48 + 10 + 50 + 10; // safe area + top margin + search height + bottom margin + tabs height + bottom margin
    }
    // Calculate header height: use actual header ratio if available, otherwise use default 30% even during loading
    // This ensures consistent spacing during initial load to prevent spinner jump
    const ratio = Math.max(0.2, Math.min(0.5, headers?.[0]?.heightRatio ?? 0.35));
    return Math.round(Dimensions.get('window').height * ratio);
  }, [isSearching, insets.top, headers]);

  // Gradient should be visible when searching or when no banner is visible
  const showTopGradient = useMemo(
    () => isSearching || !isHeaderVisible,
    [isSearching, isHeaderVisible]
  );


  // Create loading items for suggested content
  const loadingSuggestedItems = useMemo(() => {
    const items = [];
    
    // Add header spacer only when not searching AND no header is visible
    if (!isSearching && !isHeaderVisible) {
      items.push({ type: 'header-spacer' as const, key: 'header-spacer-loading' });
    }
    
    // Add search bar spacer when searching to prevent content from being hidden behind search bar
    if (isSearching) {
      items.push({ type: 'header-spacer' as const, key: 'search-bar-spacer-loading' });
    }
    
    // Add loading indicator
    items.push({ type: 'loading' as const, key: 'loading-indicator' });
    
    return items;
  }, [isSearching, isHeaderVisible]);

  const suggestionsList: any[] = (() => {
    // Show loading while loading
    if (isLoadingSpotlightFeed || isLoadingOrbytChannels) {
      return loadingSuggestedItems as unknown as any[];
    }
    if (spotlightFeedError || orbytChannelsError) {
      return [];
    }
    const data: ListItem[] = [];
    
    // Add header spacer only when not searching AND no header is visible
    if (!isSearching && !isHeaderVisible) {
      data.push({ type: 'header-spacer' as const, key: 'header-spacer' });
    }
    
    // Add search bar spacer when searching to prevent content from being hidden behind search bar
    if (isSearching) {
      data.push({ type: 'header-spacer' as const, key: 'search-bar-spacer' });
    }
    
    if (spotlightFeed && spotlightFeed.length > 0) {
      data.push({ type: 'section-header' as const, title: 'spotlight', key: 'spotlight-header' });
      data.push({ type: 'spotlight-videos' as const, videos: spotlightFeed, key: 'spotlight-videos' });
    }
    // Add Orbyt Channels section
    if (orbytChannelsData && orbytChannelsData.length > 0) {
      data.push({ type: 'section-header' as const, title: 'channels', key: 'orbyt-channels-header' });
      data.push({ type: 'orbyt-channels-section' as const, channels: orbytChannelsData, key: 'orbyt-channels' });
    }
    return data;
  })();

  const listData: any[] = suggestionsList;

  return (
    <View style={[styles.container, Platform.OS === 'android' ? { paddingTop: 0 } : null]}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

      {showTopGradient && (
        <View
          style={[styles.topGradient, { top: 0, height: insets.top + 70 + 40, backgroundColor: Colors.black }]}
        />
      )}

      {/* Search Bar overlays header */}
      <View
        style={[
          styles.searchContainer,
          Platform.OS === 'ios' && isLiquidGlassAvailable() && styles.searchContainerGlass,
          {
            top: insets.top + 10,
            zIndex: 20,
          },
        ]}
      >
        {Platform.OS === 'ios' && isLiquidGlassAvailable() && (
          <GlassView
            style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
            glassEffectStyle="clear"
            tintColor="white"
            isInteractive
          />
        )}
        <SearchIcon size={24} color={Colors.black} style={{ transform: [{ scale: 1.2 }, { scaleX: -1 }] }} />
        <TextInput
          style={styles.searchInput}
          placeholder="search"
          placeholderTextColor={Colors.gray}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => {
            // Keep search focused to prevent results from disappearing
          }}
          onSubmitEditing={handleSearchSubmit}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance="dark"
          returnKeyType="search"
        />
        {isSearching && (
          <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
            <Icon name="close-circle" size={22.5} color={Colors.darkGray} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results */}
      {isSearching && (
        <>
          {/* Tab Navigation with animated indicators */}
          <View
            style={[
              styles.searchTabsContainer,
              {
                top: insets.top + 65, // Position closer to search bar
                zIndex: 20,
              },
            ]}
          >
            <View style={styles.indicatorContainer}>
              {pages.map((tabId) => (
                <TouchableOpacity
                  key={tabId}
                  onPress={() => handleIndicatorTap(tabId)}
                  activeOpacity={0.7}
                  style={styles.indicatorItem}
                >
                  <Text style={getIndicatorStyle(tabId)}>
                    {SEARCH_TAB_LABELS[tabId] || tabId}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Tab Content */}
          <SearchSwipePager
            topOffset={insets.top + 65 + 36}
            bottomOffset={getBottomNavBarHeight(insets)}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            onScrollProgressChange={setIndicatorScrollProgress}
            pages={pages}
            renderTabContent={(tabId) => (
              <SearchFeedRenderer
                feedOption={tabId}
                searchResults={searchResults}
                onFollow={handleFollow}
                followedUsers={followedUsers}
                cacheUpdateTrigger={cacheUpdateTrigger}
                isLoading={isSearchLoading}
                onProfilePress={handleProfileNavigation}
                onChannelPress={handleChannelNavigation}
                visitHistory={visitHistory}
                onHistoryItemPress={handleHistoryItemPress}
                onClearHistory={clearVisitHistory}
              />
            )}
          />
        </>
      )}
      
      {!isSearching && (
        <FlashList
          ListHeaderComponent={
            isHeaderVisible ? (
              <HeaderBanner headers={headers} height={computedHeaderHeight} />
            ) : null
          }

          data={listData}
        keyExtractor={(item: any, index: number) => {
          if (typeof item === 'string') return `shimmer-${index}`;
          if (item && typeof item === 'object' && 'type' in item) {
            const anyItem: any = item as any;
            if (anyItem.type === 'section-header') return anyItem.key || `${anyItem.title}-${index}`;
            if (anyItem.type === 'spotlight-videos') return anyItem.key || `spotlight-${index}`;
            if (anyItem.type === 'video-grid') return anyItem.key || `key-${index}`;
          }
          return `item-${index}`;
        }}
        renderItem={(params: any) => {
          const { item } = params;
          if (typeof item === 'string') {
            if (item === 'profile') return <ProfileLoading />;
            if (item === 'channel') return <ChannelLoading />;
            return null;
          }
          if (item.type === 'section-header') {
            if (!('title' in item) || !item.title) {
              return <SectionHeaderLoading />;
            }
            return (
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {typeof item.title === 'string' && item.title.toLowerCase().includes('spotlight') ? (
                    <Text style={styles.sectionTitle}>spotlight</Text>
                  ) : (
                    <Text style={styles.sectionTitle}>{item.title}</Text>
                  )}
                </View>
              </View>
            );
          }
          if (item.type === 'header-spacer') {
            return <HeaderSpacer isHeaderVisible={isHeaderVisible} isSearching={isSearching} computedHeaderHeight={computedHeaderHeight} />;
          }
          if (item.type === 'loading') {
            // Calculate available height: screen height - header - bottom nav
            const screenHeight = Dimensions.get('window').height;
            const bottomNavHeight = getBottomNavBarHeight(insets);
            const availableHeight = screenHeight - computedHeaderHeight - bottomNavHeight;
            
            return (
              <View style={[styles.loadingContainer, { minHeight: Math.max(availableHeight, 200) }]}>
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
                  keyExtractor={(video, index) => `spotlight-video-${video?.uri || index}`}
                  renderItem={({ item: video }) => {
                    const videoData = video.post || video;
                    const thumbnailUrl = extractVideoThumbnail(videoData?.embed);
                    const thumbnailColor = Colors.darkGray;
                    const shouldBlur = !!video.moderationDecision?.blur;
                    
                    return (
                    <TouchableOpacity
                      style={styles.spotlightVideoItem}
                      onPress={() => {
                        const videoData = video.post || video;
                        const videoUri = videoData.uri;
                        if (videoUri) {
                          const formattedFeed = item.videos.map((v: any) => {
                            const vData = v.post || v;
                            return {
                              post: vData,
                              uniqueKey: vData.uri,
                              moderationDecision: v.moderationDecision,
                            };
                          });
                          feedService.setCurrentFeed(formattedFeed);
                          const index = formattedFeed.findIndex((v: any) => v.post.uri === videoUri);
                          const finalIndex = index >= 0 ? index : 0;
                          navigation.push({
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
                            }
                          });
                        }
                      }}
                    >
                      <View style={[styles.spotlightVideoThumbnailContainer, { backgroundColor: thumbnailColor }]}>
                        {thumbnailUrl ? (
                          <Image
                            source={{ uri: thumbnailUrl }}
                            style={styles.spotlightVideoThumbnail}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.spotlightVideoThumbnailPlaceholder}>
                            <Icon name="videocam" size={16} color={Colors.gray} />
                          </View>
                        )}
                        {shouldBlur && (
                          <View style={styles.spotlightWarningOverlay}>
                            <Text style={styles.spotlightWarningText}>
                              {video.moderationDecision?.reason || 'Content Warning'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                    );
                  }}
                />
              </View>
            );
          }
          if (
            (item.type === 'profile' || item.type === 'channel' || item.type === 'video') &&
            !("data" in item)
          ) {
            if (item.type === 'profile') return <ProfileLoading />;
            if (item.type === 'channel') return <ChannelLoading />;
            return null;
          }
          if (item.type === 'profile' && "data" in item) {
            const profile = item.data as Profile;
            return (
              <View style={styles.profileItem}>
                <TouchableOpacity
                  style={styles.profileTouchable}
                  onPress={() => {
                    if (profile.handle) {
                      const handle = profile.handle.trim();
                      if (handle && handle.trim()) {
                        queryClient.prefetchQuery({
                          queryKey: profileKeys.detail(handle.trim()),
                          queryFn: () => ProfileCache.getProfile(handle.trim()),
                          staleTime: ProfileCache.cacheExpiry
                        }).finally(() => {
                          const target = handle.trim();
                          if (target) { navigation.push(`/profile/${target}`); }
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
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Text style={styles.displayName} numberOfLines={1}>
                        {formatHandle(profile.handle) || 'Unknown user'}
                      </Text>
                      {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                        <VerificationBadge 
                          handle={profile.handle.trim()} 
                          textSize={16} 
                          textColor={Colors.white}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                {!(ProfileCache.getProfileFromCacheSync(profile.handle || '')?.isFollowing ?? profile.isFollowing) && !isCurrentUser(profile.did, profile.handle, currentUser) && (
                  <TouchableOpacity
                    style={styles.followButton}
                    onPress={() => handleFollow(profile)}
                    activeOpacity={0.8}
                  >
                    <FollowIcon size={16} color={Colors.black} />
                  </TouchableOpacity>
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
                {item.channels.map((channel, index) => (
                  <PopularChannelItem
                    key={`popular-channel-${channel.uri || channel.cid || index}-${index}`}
                    channel={channel}
                    onPress={() => {
                      if (channel.uri && channel.uri.trim()) {
                        // Navigate to channel using Expo Router
                        navigation.push(`/channel/${encodeURIComponent(channel.uri.trim())}`);
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
            
            return <OrbytChannelsGrid channels={item.channels} navigation={navigation} />;
          }
          return null;
        }}
        contentContainerStyle={[
          styles.listContainer, 
          { 
            paddingBottom: getBottomNavBarHeight(insets)
          }
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onEndReached={() => {
          if (isSearching && hasSearchNextPage && !isSearchFetchingNextPage) {
            fetchSearchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={false}
        viewabilityConfig={viewabilityConfig}
        ListEmptyComponent={() => {
          const isSearchingLocal = debouncedQuery.length > 0;
          if (isSearchingLocal && !isLoadingResults) {
            return (
              <View style={styles.emptyContainer}>
                <Text style={styles.noResults}>
                  No {SEARCH_TAB_LABELS[activeTab] || activeTab} found for "{debouncedQuery}"
                </Text>
                <Text style={styles.noResultsSubtext}>Try searching for something else</Text>
              </View>
            );
          }
          if (!isSearchingLocal && !(isLoadingSpotlightFeed || isLoadingOrbytChannels)) {
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
            return (
              <EmptyFeed type="no-videos" />
            );
          }
          return null;
        }}
        />
      )}
    </View>
  );
};

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
  searchInput: {
    flex: 1,
    color: 'black',
    fontSize: 20,
    height: '100%',
    fontFamily: 'Firma-Medium',
    marginLeft: 10,
  },
  clearButton: {
    padding: 0,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
  },
  channelImage: {
    marginRight: 12,
  },
  channelsGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 20,
  },
  gridChannelItem: {
  },
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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

  searchContainerGlass: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },

  searchTabsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingBottom: 0,
  },
  indicatorItem: {
    paddingHorizontal: 4,
  },
  searchResultsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.black,
  },
  pagerView: {
    flex: 1,
  },
  pagerPage: {
    width: '100%',
    height: '100%',
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
    paddingHorizontal: 20,
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

});

export default ExploreScreen;




