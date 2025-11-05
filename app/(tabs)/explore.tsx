import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
  Keyboard,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import AtprotoService from '../../src/services/api/AtprotoService';

import { useRouter } from 'expo-router';
import ProfileCache, { profileKeys, useFollowMutation } from '../../src/services/cache/ProfileCache';
import ChannelCache, { useChannelColors } from '../../src/services/cache/ChannelCache';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import Svg, { Path, Rect, G } from 'react-native-svg';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import HeaderBanner from '../../src/components/ui/HeaderBanner';
import { TabNavigation, TabOption } from '../../src/components/layout/header';
import { logger } from '../../src/utils/logger';

import { SearchIcon, FollowIcon, CheckIcon } from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import { VerificationBadge } from '../../src/components/features/badging';
import { hexToRGBA } from '../../src/utils/formatting/colorUtils';
import EmptyFeed from '../../src/components/features/feed/EmptyFeed';
import { feedService } from '../../src/services/FeedService';
import { getBottomNavBarHeight } from '../../src/utils/helpers';
import { extractVideoThumbnail } from '../../src/utils/helpers/video';
import { formatNumber } from '../../src/utils/helpers';
import { HeaderService, useStaticChannels, useHeaders } from '../../src/services/APIService';
import { useFeed } from '../../src/hooks/useFeed';
// import { ModerationService } from '../../src/services/ModerationService'; // Commented out since videos are disabled
import { Colors as UIColors } from '../../src/components/ui/UI';

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
  isExperimental?: boolean; // Added for experimental feed badge
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

interface HeaderSpacer {
  type: 'header-spacer';
  key: string;
}

interface LoadingItem {
  type: 'loading';
  key: string;
}

type ListItem = SearchResult | SectionHeader | SpotlightVideosSection | PeopleChannelsSection | PopularChannelsSection | HeaderSpacer | LoadingItem;





// Minimal swipeable pager for search tabs
const SearchSwipePager = ({
  topOffset,
  bottomOffset,
  activeTab,
  onActiveTabChange,
  renderTabContent,
}: {
  topOffset: number;
  bottomOffset: number;
  activeTab: 'profiles' | 'channels';
  onActiveTabChange: (tab: 'profiles' | 'channels') => void;
  renderTabContent: (tabId: 'profiles' | 'channels') => React.ReactNode;
}) => {
  const flatListRef = useRef<FlatList>(null);
  const [dims, setDims] = useState(Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);

  const screenWidth = dims.width;
  const pages: Array<'profiles' | 'channels'> = ['profiles', 'channels'];
  const activeIndex = pages.indexOf(activeTab);

  useEffect(() => {
    if (flatListRef.current && activeIndex >= 0) {
      flatListRef.current.scrollToIndex({ index: activeIndex, animated: true });
    }
  }, [activeIndex]);

  const getItemLayout = useCallback((_, index: number) => ({ length: screenWidth, offset: screenWidth * index, index }), [screenWidth]);

  return (
    <View
      style={[
        styles.searchResultsContainer,
        { top: topOffset, bottom: bottomOffset, zIndex: 19 },
      ]}
    >
      <FlatList
        ref={flatListRef}
        data={pages}
        keyExtractor={(t) => `search-page-${t}`}
        renderItem={({ item }) => (
          <View style={{ width: screenWidth, flex: 1 }}>
            {renderTabContent(item)}
          </View>
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          const nextTab = pages[index];
          if (nextTab && nextTab !== activeTab) onActiveTabChange(nextTab);
        }}
        initialScrollIndex={activeIndex < 0 ? 0 : activeIndex}
      />
    </View>
  );
};
// Query keys for unified search
const unifiedSearchKeys = {
  all: ['unifiedSearch'] as const,
  infinite: () => [...unifiedSearchKeys.all, 'infinite'] as const,
  infiniteSearch: (query: string) => [...unifiedSearchKeys.infinite(), query] as const,
};

// Simple loading components with ActivityIndicator
const ProfileLoading = () => (
  <View style={[styles.profileItem, styles.loadingContainer]}>
    <ActivityIndicator size="small" color={Colors.white} />
  </View>
);

const ChannelLoading = () => (
  <View style={[styles.channelItem, styles.loadingContainer]}>
    <ActivityIndicator size="small" color={Colors.white} />
  </View>
);

const SectionHeaderLoading = () => (
  <View style={[styles.sectionHeader, styles.loadingContainer]}>
    <ActivityIndicator size="small" color={Colors.white} />
  </View>
);

const PopularChannelsLoading = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="small" color={Colors.white} />
  </View>
);

const SpotlightLoading = () => (
  <View style={[styles.spotlightContainer, styles.loadingContainer]}>
    <ActivityIndicator size="small" color={Colors.white} />
  </View>
);

// Header spacer component
const HeaderSpacer = ({ isHeaderVisible, isSearching, computedHeaderHeight }: { isHeaderVisible: boolean; isSearching?: boolean; computedHeaderHeight: number }) => {
  const insets = useSafeAreaInsets();
  
  // When searching, use search bar spacing + tabs spacing
  if (isSearching) {
    return <View style={{ height: insets.top + 10 + 55 + 5 + 40 + 5 }} />; // safe area + top margin + search height + reduced margin + tabs height + reduced margin
  }
  
  // Use the same computed header height as the rest of the component
  return <View style={{ height: computedHeaderHeight }} />;
};


// Popular Channel Item Component using normal list style
const PopularChannelItem = ({ channel, onPress }: { channel: Channel; onPress: () => void }) => {
  return (
    <TouchableOpacity
      style={styles.channelItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Avatar
        uri={channel.avatar}
        type="channel"
        size={40}
        ringColor="transparent"
        style={styles.channelImage}
      />
      <View style={styles.channelContent}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text style={styles.channelName} numberOfLines={1}>
            {channel.displayName || 'Unknown channel'}
          </Text>
          {channel.isExperimental && (
            <Icon name="bug" size={12} color={Colors.lightGreen} style={styles.experimentalIcon} />
          )}
        </View>
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

  const profiles = searchResults
    .filter((result): result is any => result.type === 'profile')
    .map(result => result.data as Profile)
    .filter((profile, index, self) => 
      index === self.findIndex(p => p.did === profile.did)
    );

  // Show loading state when loading
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.white} />
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
              size={40}
              ringColor="transparent"
              style={styles.profileImage}
            />
            <View style={styles.profileContent}>
              <View style={{flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0}}>
                <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
                  {profile.displayName || profile.handle || 'Unknown user'}
                </Text>
                {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                  <VerificationBadge 
                    handle={profile.handle.trim()} 
                    textSize={14} 
                    textColor={Colors.white}
                  />
                )}
              </View>
            </View>
          </TouchableOpacity>
          {!(ProfileCache.getProfileFromCacheSync(profile.handle || '')?.isFollowing ?? profile.isFollowing) && (
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
          <Text style={styles.emptyTabText}>No profiles found</Text>
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.white} />
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
            uri={channel.avatar}
            type="channel"
            size={40}
            ringColor="transparent"
            style={styles.channelImage}
          />
          <View style={styles.channelContent}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={styles.channelName} numberOfLines={1}>
                {channel.displayName || 'Unknown channel'}
              </Text>
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
          <Text style={styles.emptyTabText}>No channels found</Text>
        </View>
      )}
    />
  );
});


// Custom Feed Renderer for Search Results
const SearchFeedRenderer = React.memo(({ feedOption, searchResults, onFollow, followedUsers, cacheUpdateTrigger, isLoading, onProfilePress, onChannelPress }: {
  feedOption: string;
  searchResults: SearchResult[];
  onFollow: (profile: Profile) => void;
  followedUsers: Set<string>;
  cacheUpdateTrigger: number;
  isLoading?: boolean;
  onProfilePress?: (profile: Profile) => void;
  onChannelPress?: (channel: Channel) => void;
}) => {
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
const VisitHistoryList = ({ 
  visitHistory, 
  onHistoryItemPress, 
  onClearHistory,
  currentColors 
}: {
  visitHistory: Array<{ type: 'profile' | 'channel'; data: Profile | Channel }>;
  onHistoryItemPress: (item: { type: 'profile' | 'channel'; data: Profile | Channel }) => void;
  onClearHistory: () => void;
  currentColors: { backgroundColor: string; textColor: string };
}) => {
  if (visitHistory.length === 0) {
    return (
      <View style={styles.searchHistoryContainer}>
        <View style={styles.searchHistoryHeader}>
          <Text style={[styles.searchHistoryTitle, { color: currentColors.textColor }]}>
            Recently Visited
          </Text>
        </View>
        <View style={styles.emptyHistoryContainer}>
          <Text style={[styles.emptyHistoryText, { color: hexToRGBA(currentColors.textColor, 0.6) }]}>
            No recent visits
          </Text>
        </View>
      </View>
    );
  }


  return (
    <View style={styles.searchHistoryContainer}>
      <View style={styles.searchHistoryHeader}>
        <Text style={[styles.searchHistoryTitle, { color: currentColors.textColor }]}>
          Recently Visited
        </Text>
        <TouchableOpacity onPress={onClearHistory} style={styles.clearHistoryButton}>
          <Text style={[styles.clearHistoryText, { color: hexToRGBA(currentColors.textColor, 0.7) }]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
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
                    size={40}
                    ringColor="transparent"
                    style={styles.profileImage}
                  />
                  <View style={styles.profileContent}>
                    <View style={{flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0}}>
                      <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
                        {profileData.displayName || profileData.handle || 'Unknown user'}
                      </Text>
                      {profileData.handle && profileData.handle.trim() && profileData.handle.length > 0 && (
                        <VerificationBadge 
                          handle={profileData.handle.trim()} 
                          textSize={14} 
                          textColor={Colors.white}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            );
          } else if (!isProfile && channelData) {
            return (
              <View style={styles.channelItem}>
                <TouchableOpacity
                  style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}
                  onPress={() => onHistoryItemPress(item)}
                  activeOpacity={0.7}
                >
                  <Avatar
                    uri={channelData.avatar}
                    type="channel"
                    size={40}
                    ringColor="transparent"
                    style={styles.channelImage}
                  />
                  <View style={styles.channelContent}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Text style={styles.channelName} numberOfLines={1}>
                        {channelData.displayName || 'Unknown channel'}
                      </Text>
                      {channelData.isExperimental && (
                        <Icon name="bug" size={12} color={Colors.lightGreen} style={styles.experimentalIcon} />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            );
          }
          return null;
        }}
        showsVerticalScrollIndicator={false}
        style={styles.historyList}
      />
    </View>
  );
};

const ExploreScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [allSuggestions, setAllSuggestions] = useState<any[]>([]);
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [cacheUpdateTrigger, setCacheUpdateTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<'profiles' | 'channels'>('profiles');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [visitHistory, setVisitHistory] = useState<Array<{
    type: 'profile' | 'channel';
    data: Profile | Channel;
  }>>([]);
  

  // Define tab options for search results
  const tabOptions: TabOption[] = useMemo(() => [
    { id: 'profiles', label: 'Profiles' },
    { id: 'channels', label: 'Channels' },
  ], []);


  const navigation = useRouter();
  const queryClient = useQueryClient();
  
  // Use the follow mutation hook for proper cache management
  const followMutation = useFollowMutation();
  const insets = useSafeAreaInsets();

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
  } = useFeed(searchFeedOption || 'yourMix', undefined, {
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
    return searchFeed.map((feedItem, index) => {
      const post = feedItem.post;
      
      // Better channel detection logic - check for feed generator URIs
      const isChannel = post.uri?.includes('app.bsky.feed.generator');
      
      if (isChannel) {
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
            isExperimental: (post as any).isExperimental || false,
          } as Channel,
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
        return {
          type: 'channel' as const,
          data: {
            uri: post.uri,
            cid: post.cid,
            displayName: postText || 'Unknown channel',
            description: postText || '',
            creator: post.author || {},
          } as Channel,
          relevance: 10 - index,
        };
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
  }, [searchFeedOption, searchFeed, cacheUpdateTrigger]);



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
              setIsSearchFocused(false);
            }
          });
        }
      }
    } else if (item.type === 'channel') {
      const channel = item.data as Channel;
      if (channel.uri) {
        navigation.push(`/channel/${encodeURIComponent(channel.uri)}`);
        setIsSearchFocused(false);
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

  // Fetch suggested accounts when there is no search query
  const {
    data: suggestedAccounts,
    isLoading: isLoadingSuggestions,
    error: suggestionsError,
    refetch: refetchSuggestions,
  } = useQuery({
    queryKey: ['suggestedAccounts', 5],
    queryFn: async () => {
      return await AtprotoService.getSuggestedAccounts(5);
    },
    enabled: debouncedQuery.length === 0,
    staleTime: 60 * 1000, // 1 minute
    retry: (failureCount, error) => {
      // Don't retry on rate limiting errors
      if (error?.message?.includes('Rate Limit Exceeded')) {
        return false;
      }
      return failureCount < 2; // Reduced retry count
    },
  });

  // Fetch suggested feeds when there is no search query
  const {
    data: channelDids,
    isLoading: isLoadingChannelDids,
    error: channelDidsError,
    refetch: refetchChannelDids,
  } = useStaticChannels();

  const {
    data: suggestedFeeds,
    isLoading: isLoadingSuggestedFeeds,
    error: suggestedFeedsError,
    refetch: refetchSuggestedFeeds,
  } = useQuery({
    queryKey: ['staticChannels', channelDids],
    queryFn: async () => {
      // Get static channels from the web API
      return await AtprotoService.getStaticChannels(20);
    },
    enabled: debouncedQuery.length === 0 && !!channelDids,
    staleTime: 60 * 1000, // 1 minute
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
          // const moderationResult = await ModerationService.batchModeratePosts(feed); // Commented out ModerationService
          // feed = moderationResult.filteredPosts;
          
          // // Attach moderation decisions to videos
          // const moderationMap = moderationResult.moderationDecisions;
          // feed = feed.map((video: any) => {
          //   const uri = video?.post?.uri;
          //   return uri && moderationMap.has(uri)
          //     ? { ...video, moderationDecision: moderationMap.get(uri) }
          //     : video;
          // });
        } catch (error) {
          logger.warn('Error applying moderation to spotlight videos', { error });
        }
      }
      
      return feed;
    },
    enabled: debouncedQuery.length === 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Limit suggested feeds to 5 for display
  const limitedSuggestedFeeds = useMemo(() => (suggestedFeeds ? suggestedFeeds.slice(0, 5) : []), [suggestedFeeds]);

  // Update all suggestions when new data comes in
  useEffect(() => {
    if (suggestedAccounts && suggestedAccounts.length > 0) {
      setAllSuggestions(suggestedAccounts);
    }
  }, [suggestedAccounts]);

  // Batch prefetch suggested channels when they load
  useEffect(() => {
    if (suggestedFeeds && suggestedFeeds.length > 0) {
      ChannelCache.batchPrefetchFromFeed(suggestedFeeds).catch(error => {
        logger.warn('Error batch prefetching suggested channels', { error });
      });
    }
  }, [suggestedFeeds]);

  // Collapsible header setup (custom for Explore)
  const isHeaderVisible = useMemo(
    () => !isLoadingHeaders && headers.length > 0,
    [isLoadingHeaders, headers.length]
  );
  const isSearching = isSearchFocused || debouncedQuery.length > 0;
  const showSearchHistory = isSearchFocused && debouncedQuery.length === 0;
  const showSearchResults = isSearchFocused && debouncedQuery.length > 0;
  const computedHeaderHeight = useMemo(() => {
    // When searching or header not visible, reserve space for the search bar area so content starts below it
    if (isSearching || !isHeaderVisible) {
      return insets.top + 10 + 55 + 10 + 50 + 10; // safe area + top margin + search height + bottom margin + tabs height + bottom margin
    }
    // Allow per-header custom ratio via HeaderService metadata; fallback to 30%
    const ratio = Math.max(0.2, Math.min(0.5, headers?.[0]?.heightRatio ?? 0.30));
    return Math.round(Dimensions.get('window').height * ratio);
  }, [isSearching, isHeaderVisible, insets.top, headers]);

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
    if (isLoadingSuggestions || isLoadingChannelDids || isLoadingSuggestedFeeds || isLoadingSpotlightFeed) {
      return loadingSuggestedItems as unknown as any[];
    }
    if (suggestionsError || channelDidsError || suggestedFeedsError || spotlightFeedError) {
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
    if (limitedSuggestedFeeds && limitedSuggestedFeeds.length > 0) {
      data.push({ type: 'section-header' as const, title: 'popular channels', key: 'feeds-header' });
      data.push({ type: 'popular-channels-section' as const, channels: limitedSuggestedFeeds, key: 'popular-channels' });
    }
    if (allSuggestions && allSuggestions.length > 0) {
      data.push({ type: 'section-header' as const, title: 'suggested accounts', key: 'accounts-header' });
      data.push(...allSuggestions.map(item => ({ type: 'profile' as const, data: item, relevance: 0 })));
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
            style={[StyleSheet.absoluteFill, { borderRadius: BORDER_RADIUS.LARGE }]}
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
            // Keep search focused if there's a query to prevent results from disappearing
            if (!searchQuery.trim()) {
              setIsSearchFocused(false);
            }
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

      {/* Search History or Search Results */}
      {isSearching && (
        <>
          {showSearchHistory ? (
            <View
              style={[
                styles.searchHistoryWrapper,
                {
                  top: insets.top + 65,
                  bottom: getBottomNavBarHeight(insets),
                  zIndex: 20,
                },
              ]}
            >
              <VisitHistoryList
                visitHistory={visitHistory}
                onHistoryItemPress={handleHistoryItemPress}
                onClearHistory={clearVisitHistory}
                currentColors={{ backgroundColor: Colors.black, textColor: Colors.white }}
              />
            </View>
          ) : showSearchResults ? (
            <>
              {/* Tab Navigation */}
              <View
                style={[
                  styles.searchTabsContainer,
                  {
                    top: insets.top + 65, // Position closer to search bar
                    zIndex: 20,
                  },
                ]}
              >
                <View style={styles.tabNavigationWrapper}>
                  <TabNavigation
                    tabs={tabOptions}
                    activeTab={activeTab}
                    onTabPress={(tabId) => {
                      const newTab = tabId as 'profiles' | 'channels';
                      setActiveTab(newTab);
                    }}
                    textColor={Colors.white}
                    backgroundColor="transparent"
                    style={styles.searchTabs}
                  />
                </View>
              </View>

              {/* Tab Content */}
              <SearchSwipePager
                topOffset={insets.top + 65 + 50}
                bottomOffset={getBottomNavBarHeight(insets)}
                activeTab={activeTab}
                onActiveTabChange={setActiveTab}
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
                  />
                )}
              />
            </>
          ) : null}
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
            return (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.white} />
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
                              shouldCache: true,
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
                    size={40}
                    ringColor="transparent"
                    style={styles.profileImage}
                  />
                  <View style={styles.profileContent}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Text style={styles.displayName} numberOfLines={1}>
                        {profile.displayName || profile.handle || 'Unknown user'}
                      </Text>
                      {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                        <VerificationBadge 
                          handle={profile.handle.trim()} 
                          textSize={14} 
                          textColor={Colors.white}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                {!(ProfileCache.getProfileFromCacheSync(profile.handle || '')?.isFollowing ?? profile.isFollowing) && (
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
                  No {activeTab} found for "{debouncedQuery}"
                </Text>
                <Text style={styles.noResultsSubtext}>Try searching for something else</Text>
              </View>
            );
          }
          if (!isSearchingLocal && !(isLoadingSuggestions || isLoadingSuggestedFeeds || isLoadingSpotlightFeed)) {
            if (suggestionsError || suggestedFeedsError || spotlightFeedError) {
              return (
                <EmptyFeed 
                  type="no-connection" 
                  onRetry={() => {
                    refetchSuggestions();
                    refetchSuggestedFeeds();
                    refetchSpotlightFeed();
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
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingHorizontal: 15,
    height: 55,
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
    fontFamily: 'Firma-SemiBold',
    marginLeft: 15,
  },
  clearButton: {
    padding: 10,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    position: 'relative',
  },
  profileTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  profileContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  displayName: {
    color: Colors.white,
    fontSize: 16,
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
    borderWidth: 0,
    borderColor: 'transparent',
    position: 'relative',
  },
  channelImage: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  channelContent: {
    flex: 1,
    justifyContent: 'center',
  },
  channelName: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
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
    paddingTop: 25,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-Bold',
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
    marginBottom: 10,
    marginHorizontal: 0,
  },
  spotlightScrollContainer: {
    paddingHorizontal: 20,
    paddingRight: 40, // Extra padding on the right to allow scrolling off screen
  },
  spotlightVideoItem: {
    width: 95,
    marginRight: 12,
  },
  spotlightVideoThumbnailContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  spotlightVideoThumbnail: {
    width: 95,
    height: 169, // 9:16 aspect ratio (95 * 16/9)
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden' as const,
  },
  spotlightVideoThumbnailPlaceholder: {
    width: 95,
    height: 169, // 9:16 aspect ratio (95 * 16/9)
    borderRadius: BORDER_RADIUS.MEDIUM,
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
    borderRadius: BORDER_RADIUS.MEDIUM,
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
    borderRadius: BORDER_RADIUS.LARGE,
  },

  searchTabsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingLeft: 5,
    paddingRight: 0,
    paddingTop: 0,
  },
  tabNavigationWrapper: {
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.LARGE,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchTabs: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  searchResultsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.black,
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
  searchHistoryWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.black,
  },
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100, // Space below header
    paddingBottom: 100, // Space above bottom nav bar
  },

});

export default ExploreScreen;


