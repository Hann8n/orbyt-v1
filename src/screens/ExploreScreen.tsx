import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BORDER_RADIUS } from '../utils/constants';
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

import AtprotoService from '../services/api/AtprotoService';

import { useNavigation } from '@react-navigation/native';
import ProfileCache, { profileKeys, useFollowMutation } from '../services/cache/ProfileCache';
import ChannelCache, { useChannelColors } from '../services/cache/ChannelCache';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Rect, G } from 'react-native-svg';
import { Avatar, Icon } from '../components/ui/UI';
import HeaderBanner from '../components/ui/HeaderBanner';

import { SearchIcon } from '../components/ui/Icon';
import { Colors } from '../components/ui/UI';
import VerificationBadge from '../components/features/verification/VerificationBadge';
import EmptyFeed from '../components/features/feed/EmptyFeed';
import { feedService } from '../services/FeedService';
import { getBottomNavBarHeight } from '../utils/helpers/screenSize';
import { extractVideoThumbnail } from '../utils/helpers/video';
import { FORCE_SEARCH_ERROR, getForcedErrorMessage } from '../utils/helpers/errorDebug';
import { formatNumber } from '../utils/helpers/formatNumber';
import { HeaderService, useStaticChannels, useHeaders } from '../services/APIService';
import { useFeed } from '../hooks/useFeed';
// import { ModerationService } from '../services/ModerationService'; // Commented out since videos are disabled

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

type ListItem = SearchResult | SectionHeader | SpotlightVideosSection | PeopleChannelsSection | PopularChannelsSection | HeaderSpacer;





// Query keys for unified search
const unifiedSearchKeys = {
  all: ['unifiedSearch'] as const,
  infinite: () => [...unifiedSearchKeys.all, 'infinite'] as const,
  infiniteSearch: (query: string) => [...unifiedSearchKeys.infinite(), query] as const,
};

  // Profile shimmer skeleton component
const ProfileShimmer = () => (
  <View style={styles.profileItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.profileImage, { borderWidth: 0, borderColor: 'transparent' }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.profileContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 2, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
  </View>
);

// Channel shimmer skeleton component
const ChannelShimmer = () => (
  <View style={styles.channelItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.channelImage, { borderWidth: 0, borderColor: 'transparent' }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.channelContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 140, height: 16, marginBottom: 2, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
  </View>
);

// Feed shimmer skeleton component
const FeedShimmer = () => (
  <View style={styles.feedItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.feedImage, { borderWidth: 0, borderColor: 'transparent' }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.feedContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 4, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 14, marginBottom: 4, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 12, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
  </View>
);

// Header spacer shimmer skeleton component
const HeaderSpacerShimmer = ({ isHeaderVisible, isSearching }: { isHeaderVisible: boolean; isSearching?: boolean }) => {
  const insets = useSafeAreaInsets();
  
  // When searching, use search bar spacing
  if (isSearching) {
    return <View style={{ height: insets.top + 10 + 55 + 10 }} />; // safe area + top margin + search height + bottom margin
  }
  
  // When no header is available, use search bar spacing
  // When header is available, use header height
  const headerHeight = isHeaderVisible 
    ? Math.round(Dimensions.get('window').height * 0.30) // Use same ratio as computedHeaderHeight
    : insets.top + 10 + 55 + 10; // safe area + top margin + search height + bottom margin
  return <View style={{ height: headerHeight }} />;
};

// Section header shimmer skeleton component
const SectionHeaderShimmer = () => (
  <View style={styles.sectionHeader}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 100, height: 18, borderRadius: BORDER_RADIUS.SMALL }}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
  </View>
);

// Spotlight videos shimmer skeleton component
const SpotlightVideosShimmer = () => (
  <View style={styles.spotlightContainer}>
    <FlatList
      data={Array(4).fill(0)}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.spotlightScrollContainer}
      keyExtractor={(_, index) => `spotlight-shimmer-${index}`}
      renderItem={({ item, index }) => (
        <View style={styles.spotlightVideoItem}>
          <View style={styles.spotlightVideoThumbnailContainer}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={styles.spotlightVideoThumbnail}
              shimmerColors={Colors.SHIMMER.PRIMARY}
            />
          </View>
        </View>
      )}
    />
  </View>
);

// Video shimmer skeleton component
const VideoShimmer = () => (
  <View style={styles.videoItem}>
    <View style={styles.videoThumbnailContainer}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={styles.videoThumbnail}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
    <View style={styles.videoContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 14, marginBottom: 4, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 12, marginBottom: 2, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 11, borderRadius: BORDER_RADIUS.SMALL }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
  </View>
);

// Popular channels shimmer skeleton component
const PopularChannelsShimmer = () => (
  <View style={styles.popularChannelsContainer}>
    {Array(5).fill(0).map((_, index) => (
      <View key={`popular-channel-shimmer-${index}`} style={styles.popularChannelButton}>
        <View style={styles.popularChannelButtonContent}>
          <View style={styles.popularChannelAvatarContainer}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 50, height: 50, borderRadius: BORDER_RADIUS.MEDIUM }}
              shimmerColors={Colors.SHIMMER.PRIMARY}
            />
          </View>
          <View style={styles.popularChannelInfoContainer}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 140, height: 16, marginBottom: 2, borderRadius: BORDER_RADIUS.SMALL }}
              shimmerColors={Colors.SHIMMER.PRIMARY}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 100, height: 14, borderRadius: BORDER_RADIUS.SMALL }}
              shimmerColors={Colors.SHIMMER.PRIMARY}
            />
          </View>
          <View style={styles.popularChannelArrowContainer}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 24, height: 24, borderRadius: BORDER_RADIUS.MEDIUM }}
              shimmerColors={Colors.SHIMMER.PRIMARY}
            />
          </View>
        </View>
      </View>
    ))}
  </View>
);

// Popular Channel Button Component using channel screen style
const PopularChannelButton = ({ channel, onPress }: { channel: Channel; onPress: () => void }) => {
  return (
    <TouchableOpacity
      style={styles.popularChannelButton}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.popularChannelButtonContent}>
        <View style={styles.popularChannelAvatarContainer}>
          <Avatar
            uri={channel.avatar}
            type="channel"
            size={50}
            ringColor="transparent"
          />
        </View>
        <View style={styles.popularChannelInfoContainer}>
          <Text style={styles.popularChannelDisplayName}>
            {channel.displayName || 'Unknown channel'}
          </Text>
          {channel.description && (
            <Text style={styles.popularChannelDescription} numberOfLines={2}>
              {channel.description}
            </Text>
          )}
        </View>
        <View style={styles.popularChannelArrowContainer}>
          <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
        </View>
      </View>
    </TouchableOpacity>
  );
};


const ExploreScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [allSuggestions, setAllSuggestions] = useState<any[]>([]);
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [cacheUpdateTrigger, setCacheUpdateTrigger] = useState(0);

  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  
  // Use the follow mutation hook for proper cache management
  const followMutation = useFollowMutation();
  const insets = useSafeAreaInsets();
  
  // Initialize current user for ProfileCache on mount
  useEffect(() => {
    const initializeCache = async () => {
      try {
        const currentUser = await AtprotoService.getCurrentUser();
        if (currentUser?.did) {
          ProfileCache.setCurrentUserDid(currentUser.did);
        }
      } catch (error) {
        console.error('Error initializing profile cache:', error);
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
      
      // Check if this is a channel (has text but no author, or has author but text is the channel name)
      const postText = (post as any).text;
      const isChannel = postText && (
        !post.author || 
        (post.author && postText === post.author.displayName) ||
        post.uri?.includes('app.bsky.feed.generator')
      );
      
      if (isChannel) {
        return {
          type: 'channel' as const,
          data: {
            uri: post.uri,
            cid: post.cid,
            displayName: postText || 'Unknown channel',
            description: postText || '',
            creator: post.author || {},
            avatar: (post as any).avatar || post.author?.avatar || '', // Use channel avatar first, fallback to creator avatar
            isExperimental: false, // Will be determined by the channel data
          } as Channel,
          relevance: 10 - index,
        };
      }
      
      // Determine result type based on post content
      if (post.author) {
        const handle = post.author.handle;
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
    Keyboard.dismiss();
  };
  










  // Optimized viewabilityConfig
  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    []
  );

  // Type predicate for SearchResult
  function isSearchResult(item: ListItem): item is SearchResult {
    return (
      typeof item === 'object' &&
      'type' in item &&
      item.type !== 'section-header' &&
      'data' in item
    );
  }









  // Render each search result item
  const renderSearchResult = useCallback(({ item }: { item: ListItem }) => {
    if (isSearchResult(item)) {
      const searchItem = item as SearchResult;
      switch (searchItem.type) {
        case 'profile': {
          const profile = searchItem.data as Profile;
          
          // Safety check for profile data
          if (!profile || !profile.handle) {
            return null;
          }
          
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
                          if (target) { (() => { let rootNav: any = navigation as any; while (rootNav?.getParent?.()) { rootNav = rootNav.getParent(); } return rootNav; })().navigate('AuthorProfile', { handle: target }); }
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
              {!profile.isFollowing && (
                <TouchableOpacity
                  style={styles.followButton}
                  onPress={() => {
                    if (profile.handle) {
                      // Use the follow mutation hook for proper cache management
                      followMutation.mutate({
                        handle: profile.handle,
                        isFollowing: true
                      });
                      
                      // Add to followed users set for visual feedback
                      setFollowedUsers(prev => new Set(prev).add(profile.handle || profile.did));
                      
                      // Trigger cache update to refresh the UI
                      setCacheUpdateTrigger(prev => prev + 1);
                      
                      // Remove after 3 seconds
                      setTimeout(() => {
                        setFollowedUsers(prev => {
                          const newSet = new Set(prev);
                          newSet.delete(profile.handle || profile.did);
                          return newSet;
                        });
                      }, 3000);
                    }
                  }}
                >
                  {followedUsers.has(profile.handle || profile.did) ? (
                    <Icon name="checkmark" size={16} color={Colors.lightGray} />
                  ) : (
                    <Icon name="user-plus" size={16} color={Colors.lightGray} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }
        case 'channel': {
          const channel = searchItem.data as Channel;
          
          // Safety check for channel data
          if (!channel || !channel.uri) {
            return null;
          }
          
          return (
            <TouchableOpacity
              style={styles.channelItem}
              onPress={() => {
                if (channel.uri && channel.uri.trim()) {
                  // Navigate via root navigator so Channel overlays the tab bar
                  (() => { let rootNav: any = navigation as any; while (rootNav?.getParent?.()) { rootNav = rootNav.getParent(); } return rootNav; })().navigate('Channel', {
                    uri: channel.uri.trim(),
                    title: channel.displayName || 'Unknown Channel',
                    description: channel.description || '',
                    avatar: channel.avatar || '',
                    creator: channel.creator || null, // Temporarily pass creator info
                  });
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
          );
        }
        case 'video': {
          const video = searchItem.data;
          const author = video.author || {};
          
          // Use the same thumbnail extraction logic as GridFeedView
          const thumbnailUrl = extractVideoThumbnail(video.embed);
          
          // Check moderation decision for blur state
          const shouldBlur = !!video.moderationDecision?.blur;
          
          return (
            <TouchableOpacity
              style={styles.videoItem}
              onPress={() => {
                if (video.uri) {
                  // Find the index of this video in the allVideos array
                  const videoIndex = 0; // allVideos.findIndex(v => v.uri === video.uri); // Removed allVideos
                  const index = videoIndex >= 0 ? videoIndex : 0;
                  
                  // FeedStore is already updated with formatted data from useEffect
                  
                  navigation.navigate('FeedScreen', {
                    initialIndex: index,
                    initialUri: video.uri,
                    feedOption: 'search',
                    userDid: undefined,
                    backgroundColor: 'transparent',
                    secondaryColor: Colors.white,
                    searchQuery: debouncedQuery,
                    hasNextPage: hasSearchNextPage,
                    isFetchingNextPage: isSearchFetchingNextPage,
                    fetchNextPage: fetchSearchNextPage
                  });
                }
              }}
            >
              <View style={styles.videoThumbnailContainer}>
                {thumbnailUrl ? (
                  <>
                    <Image
                      source={{ uri: thumbnailUrl }}
                      style={styles.videoThumbnail}
                      resizeMode="cover"
                      onError={() => {
                        console.warn('Failed to load thumbnail:', thumbnailUrl);
                      }}
                    />
                    {shouldBlur && (
                      <View style={styles.videoWarningOverlay}>
                        <Text style={styles.videoWarningText}>
                          {video.moderationDecision?.reason || 'Content Warning'}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.videoThumbnailPlaceholder}>
                    <Icon name="videocam" size={16} color={Colors.gray} />
                  </View>
                )}
              </View>
              <View style={styles.videoContent}>
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {video.text || video.record?.text || 'Untitled video'}
                </Text>
                <Text style={styles.videoAuthor} numberOfLines={1}>
                  by @{author.handle || 'unknown'}
                </Text>
                {video.likeCount && video.likeCount > 0 && (
                  <Text style={styles.videoStats}>
                    {formatNumber(video.likeCount)} likes
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }
      }
    }
    return null;
  }, [navigation, queryClient, debouncedQuery, hasSearchNextPage, isSearchFetchingNextPage, fetchSearchNextPage]);

  // Organize search results into sections
  const organizedSearchResults = useMemo(() => {
    if (!searchResults.length) return [];
    
    // Separate profiles and channels (videos commented out)
    const profiles = searchResults
      .filter((result): result is any => result.type === 'profile')
      .map(result => result.data as Profile)
      .filter((profile, index, self) => 
        index === self.findIndex(p => p.did === profile.did)
      );
    
    const channels = searchResults
      .filter((result): result is any => result.type === 'channel')
      .map(result => result.data as Channel)
      .filter((channel, index, self) => 
        index === self.findIndex(c => c.uri === channel.uri)
      );
    
    // const videos = searchResults
    //   .filter((result): result is SearchResult => result.type === 'video')
    //   .map(result => result.data);
    
    const sections: ListItem[] = [];
    
    // Add people and channels section if either exists
    if (profiles.length > 0 || channels.length > 0) {
      sections.push({ type: 'people-channels-section' as const, profiles, channels, key: 'people-channels' });
    }
    
    // Comment out video grid
    // if (videos.length > 0) {
    //   sections.push({
    //     type: 'video-grid',
    //     videos: videos,
    //     key: 'videos-grid'
    //   });
    // }
    
    return sections;
  }, [searchResults]);

  // Get combined profiles and channels for unified feed
  const combinedResults = useMemo(() => {
    const peopleChannelsSection = organizedSearchResults.find(section => section.type === 'people-channels-section') as PeopleChannelsSection;
    const profiles = peopleChannelsSection?.profiles || [];
    const channels = peopleChannelsSection?.channels || [];
    
    // Get the original search results to preserve relevance ordering
    const profileResults = searchResults
      .filter((result): result is any => result.type === 'profile')
      .map(result => ({ type: 'profile' as const, data: result.data as Profile, relevance: result.relevance }));
    
    const channelResults = searchResults
      .filter((result): result is any => result.type === 'channel')
      .map(result => ({ type: 'channel' as const, data: result.data as Channel, relevance: result.relevance }));
    
    // Combine and sort by relevance to mix profiles and channels together
    const combined = [...profileResults, ...channelResults];
    combined.sort((a, b) => b.relevance - a.relevance);
    
    return combined;
  }, [organizedSearchResults, searchResults]);


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
      // Force error if debug flag is enabled
      if (FORCE_SEARCH_ERROR) {
        throw getForcedErrorMessage('suggested accounts');
      }
      return await AtprotoService.getSuggestedAccounts(5);
    },
    enabled: debouncedQuery.length === 0,
    staleTime: 60 * 1000, // 1 minute
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
      // Force error if debug flag is enabled
      if (FORCE_SEARCH_ERROR) {
        throw getForcedErrorMessage('static channels');
      }
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
      // Force error if debug flag is enabled
      if (FORCE_SEARCH_ERROR) {
        throw getForcedErrorMessage('spotlight feed');
      }
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
          console.warn('Error applying moderation to spotlight videos:', error);
        }
      }
      
      return feed;
    },
    enabled: debouncedQuery.length === 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Limit suggested feeds to 5 for display
  const limitedSuggestedFeeds = useMemo(() => (suggestedFeeds ? suggestedFeeds.slice(0, 5) : []), [suggestedFeeds]);

  // Update all suggestions when new data comes in (only for initial load)
  useEffect(() => {
    if (suggestedAccounts && allSuggestions.length === 0) {
      setAllSuggestions(suggestedAccounts);
    }
  }, [suggestedAccounts, allSuggestions.length]);

  // Batch prefetch suggested channels when they load
  useEffect(() => {
    if (suggestedFeeds && suggestedFeeds.length > 0) {
      ChannelCache.batchPrefetchFromFeed(suggestedFeeds).catch(error => {
        console.warn('Error batch prefetching suggested channels:', error);
      });
    }
  }, [suggestedFeeds]);

  // Collapsible header setup (custom for Explore)
  const isHeaderVisible = useMemo(
    () => !isLoadingHeaders && headers.length > 0,
    [isLoadingHeaders, headers.length]
  );
  const isSearching = debouncedQuery.length > 0;
  const computedHeaderHeight = useMemo(() => {
    // When searching or header not visible, reserve space for the search bar area so content starts below it
    if (isSearching || !isHeaderVisible) {
      return insets.top + 10 + 55 + 10; // safe area + top margin + search height + bottom margin
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

  // Create shimmer items for suggested content with section headers
  const shimmerSuggestedItems = useMemo(() => {
    const items = [];
    
    // Add header spacer only when not searching AND no header is visible
    if (!isSearching && !isHeaderVisible) {
      items.push({ type: 'header-spacer' as const, key: 'header-spacer-shimmer' });
    }
    
    // Add search bar spacer when searching to prevent content from being hidden behind search bar
    if (isSearching) {
      items.push({ type: 'header-spacer' as const, key: 'search-bar-spacer-shimmer' });
    }
    
    // Section header for spotlight
    // items.push({ type: 'section-header' as const, key: 'spotlight-header-shimmer' });
    // Spotlight videos section
    // items.push({ type: 'spotlight-videos' as const, key: 'spotlight-videos-shimmer' });
    // Section header for feeds
    items.push({ type: 'section-header' as const, key: 'feeds-header-shimmer' });
    // Popular channels section
    items.push({ type: 'popular-channels-section' as const, key: 'popular-channels-shimmer' });
    // Section header for accounts
    items.push({ type: 'section-header' as const, key: 'accounts-header-shimmer' });
    // Account items - increased from 5 to 10
    items.push(...Array(10).fill(0).map((_, index) => ({ type: 'profile' as const, key: `profile-shimmer-${index}` })));
    
    return items;
  }, [isSearching, isHeaderVisible]);

  const suggestionsList: any[] = (() => {
    if (isLoadingSuggestions || isLoadingChannelDids || isLoadingSuggestedFeeds || isLoadingSpotlightFeed) {
      return shimmerSuggestedItems as unknown as any[];
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
    
    // if (spotlightFeed && spotlightFeed.length > 0) {
    //   data.push({ type: 'section-header' as const, title: 'spotlight', key: 'spotlight-header' });
    //   data.push({ type: 'spotlight-videos' as const, videos: spotlightFeed, key: 'spotlight-videos' });
    // }
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

  const searchList: any[] = isLoadingResults
    ? ([] as any[])
    : (() => {
        const results = organizedSearchResults as unknown as any[];
        // Add search bar spacer at the beginning to prevent content from being hidden behind search bar
        return [{ type: 'header-spacer' as const, key: 'search-bar-spacer' }, ...results];
      })();

  const listData: any[] = isSearching ? searchList : suggestionsList;

  return (
    <View style={[styles.container, Platform.OS === 'android' ? { paddingTop: 0 } : null]}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

      {showTopGradient && (
        <View style={[styles.topSafeOverlay, { height: insets.top }]} />
      )}
      {showTopGradient && (
        <LinearGradient
          colors={['rgba(0,0,0,1.0)', 'rgba(0,0,0,0.3)', 'transparent']}
          style={[styles.topGradient, { top: insets.top }]}
          pointerEvents="none"
        />
      )}

      {/* Search Bar overlays header */}
      <View
        style={[
          styles.searchContainer,
          {
            top: insets.top + 10,
            zIndex: 20,
          },
        ]}
      >
        <SearchIcon size={24} color={Colors.black} style={{ transform: [{ scale: 1.2 }, { scaleX: -1 }] }} />
        <TextInput
          style={styles.searchInput}
          placeholder="search"
          placeholderTextColor={Colors.gray}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance="dark"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
            <Icon name="close-circle" size={22.5} color={Colors.darkGray} />
          </TouchableOpacity>
        )}
      </View>
      
      <FlashList
        ListHeaderComponent={
          !isSearching && isHeaderVisible ? (
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
            if (isSearchResult(anyItem)) {
              const searchResult = anyItem as SearchResult;
              if (searchResult.type === 'profile') {
                const profile = searchResult.data as Profile;
                return `search-profile-${profile.did || profile.handle || index}-${index}`;
              }
              if (searchResult.type === 'channel') {
                const channel = searchResult.data as Channel;
                return `search-channel-${channel.uri || channel.cid || index}-${index}`;
              }
              if (searchResult.type === 'video') {
                const video = (searchResult as any).data;
                return `search-video-${video?.uri || video?.cid || index}-${index}`;
              }
            }
          }
          return `item-${index}`;
        }}
        renderItem={(params: any) => {
          const { item } = params;
          if (typeof item === 'string') {
            if (item === 'profile') return <ProfileShimmer />;
            if (item === 'channel') return <ChannelShimmer />;
            return <VideoShimmer />;
          }
          if (item.type === 'section-header') {
            if (!('title' in item) || !item.title) {
              return <SectionHeaderShimmer />;
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
            return <HeaderSpacerShimmer isHeaderVisible={isHeaderVisible} isSearching={isSearching} />;
          }
          if (item.type === 'spotlight-videos') {
            if (!('videos' in item) || !Array.isArray(item.videos)) {
              return <SpotlightVideosShimmer />;
            }
            return (
              <View style={styles.spotlightContainer}>
                <FlatList
                  data={item.videos}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.spotlightScrollContainer}
                  keyExtractor={(video, index) => `spotlight-video-${video?.uri || index}`}
                  renderItem={({ item: video }) => (
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
                          navigation.navigate('FeedScreen', {
                            initialIndex: finalIndex,
                            initialUri: videoUri,
                            feedOption: 'search',
                            userDid: undefined,
                            backgroundColor: 'transparent',
                            secondaryColor: Colors.white,
                            searchQuery: '',
                            hasNextPage: false,
                            isFetchingNextPage: false,
                          });
                        }
                      }}
                    >
                      <View style={styles.spotlightVideoThumbnailContainer}>
                        {(() => {
                          const videoData = video.post || video;
                          const thumbnailUrl = extractVideoThumbnail(videoData.embed);
                          const shouldBlur = !!video.moderationDecision?.blur;
                          if (thumbnailUrl) {
                            return (
                              <>
                                <Image
                                  source={{ uri: thumbnailUrl }}
                                  style={styles.spotlightVideoThumbnail}
                                  resizeMode="cover"
                                  onError={() => {
                                    console.warn('Failed to load spotlight thumbnail:', thumbnailUrl);
                                  }}
                                />
                                {shouldBlur && (
                                  <View style={styles.spotlightWarningOverlay}>
                                    <Text style={styles.spotlightWarningText}>
                                      {video.moderationDecision?.reason || 'Content Warning'}
                                    </Text>
                                  </View>
                                )}
                              </>
                            );
                          }
                          return (
                            <View style={styles.spotlightVideoThumbnailPlaceholder}>
                              <Icon name="videocam" size={16} color={Colors.gray} />
                            </View>
                          );
                        })()}
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            );
          }
          if (
            (item.type === 'profile' || item.type === 'channel' || item.type === 'video') &&
            !("data" in item)
          ) {
            if (item.type === 'profile') return <ProfileShimmer />;
            if (item.type === 'channel') return <ChannelShimmer />;
            return <VideoShimmer />;
          }
          if (isSearchResult(item)) {
            return renderSearchResult({ item });
          }
          if (item.type === 'people-channels-section') {
            return (
              <View style={styles.peopleChannelsContainer}>
                {combinedResults.length > 0 ? (
                  <>
                    {combinedResults.map((result, index: number) => {
                      if (result.type === 'profile') {
                        const profile = result.data as Profile;
                        return (
                          <View
                            key={`combined-profile-${profile.did || profile.handle || index}-${index}`}
                            style={styles.profileItem}
                          >
                            <TouchableOpacity
                              style={styles.profileTouchable}
                              onPress={() => {
                                if (profile.handle) {
                                  const handle = profile.handle.trim();
                                  if (handle && handle.trim()) {
                                    queryClient.prefetchQuery({
                                      queryKey: profileKeys.detail(handle.trim()),
                                      queryFn: () => ProfileCache.getProfile(handle.trim()),
                                      staleTime: ProfileCache.cacheExpiry,
                                    }).finally(() => {
                                      const target = handle.trim();
                                      if (target) { (() => { let rootNav: any = navigation as any; while (rootNav?.getParent?.()) { rootNav = rootNav.getParent(); } return rootNav; })().navigate('AuthorProfile', { handle: target }); }
                                    });
                                  }
                                }
                              }}
                            >
                              <Avatar uri={profile.avatar} type="profile" size={40} ringColor="transparent" style={styles.profileImage} />
                              <View style={styles.profileContent}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Text style={styles.displayName}>
                                    {profile.displayName || profile.handle || 'Unknown user'}
                                  </Text>
                                  {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                                    <VerificationBadge handle={profile.handle.trim()} textSize={14} textColor={Colors.white} />
                                  )}
                                </View>
                              </View>
                            </TouchableOpacity>
                            {!profile.isFollowing && (
                              <TouchableOpacity
                                style={styles.followButton}
                                onPress={() => {
                                  if (profile.handle) {
                                    // Use the follow mutation hook for proper cache management
                                    followMutation.mutate({
                                      handle: profile.handle,
                                      isFollowing: true
                                    });
                                    
                                    // Add to followed users set for visual feedback
                                    setFollowedUsers(prev => new Set(prev).add(profile.handle || profile.did));
                                    
                                    // Trigger cache update to refresh the UI
                                    setCacheUpdateTrigger(prev => prev + 1);
                                    
                                    // Remove after 3 seconds
                                    setTimeout(() => {
                                      setFollowedUsers(prev => {
                                        const newSet = new Set(prev);
                                        newSet.delete(profile.handle || profile.did);
                                        return newSet;
                                      });
                                    }, 3000);
                                  }
                                }}
                              >
                                {followedUsers.has(profile.handle || profile.did) ? (
                                  <Icon name="checkmark" size={16} color={Colors.lightGray} />
                                ) : (
                                  <Icon name="user-plus" size={16} color={Colors.lightGray} />
                                )}
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      }
                      if (result.type === 'channel') {
                        const channel = result.data as Channel;
                        return (
                          <TouchableOpacity
                            key={`combined-channel-${channel.uri || channel.cid || index}-${index}`}
                            style={styles.channelItem}
                            onPress={() => {
                              if (channel.uri && channel.uri.trim()) {
                                // Navigate via root navigator so Channel overlays the tab bar
                                (() => { let rootNav: any = navigation as any; while (rootNav?.getParent?.()) { rootNav = rootNav.getParent(); } return rootNav; })().navigate('Channel', {
                                  uri: channel.uri.trim(),
                                  title: channel.displayName || 'Unknown Channel',
                                  description: channel.description || '',
                                  avatar: channel.avatar || '',
                                  creator: channel.creator || null,
                                });
                              }
                            }}
                          >
                            <Avatar uri={channel.avatar} type="channel" size={40} ringColor="transparent" style={styles.channelImage} />
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
                      }
                      return null;
                    })}
                    {isSearchFetchingNextPage && (
                      <View style={styles.loadingMoreContainer}>
                        <ActivityIndicator size="small" color={Colors.white} />
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyTabContent}>
                    <Text style={styles.emptyTabText}>No results found</Text>
                  </View>
                )}
              </View>
            );
          }
          if (item.type === 'popular-channels-section') {
            if (!('channels' in item) || !Array.isArray(item.channels)) {
              return <PopularChannelsShimmer />;
            }
            return (
              <View style={styles.popularChannelsContainer}>
                {item.channels.map((channel, index) => (
                  <PopularChannelButton
                    key={`popular-channel-${channel.uri || channel.cid || index}-${index}`}
                    channel={channel}
                    onPress={() => {
                      if (channel.uri && channel.uri.trim()) {
                        // Navigate via root navigator so Channel overlays the tab bar
                        (() => { let rootNav: any = navigation as any; while (rootNav?.getParent?.()) { rootNav = rootNav.getParent(); } return rootNav; })().navigate('Channel', {
                          uri: channel.uri.trim(),
                          title: channel.displayName || 'Unknown Channel',
                          description: channel.description || '',
                          avatar: channel.avatar || '',
                          creator: channel.creator || null,
                        });
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
                <Text style={styles.noResults}>No results found for "{debouncedQuery}"</Text>
                <Text style={styles.noResultsSubtext}>Try searching for something else</Text>
              </View>
            );
          }
          if (!isSearchingLocal && !(isLoadingSuggestions || isLoadingSuggestedFeeds || isLoadingSpotlightFeed)) {
            if (suggestionsError || suggestedFeedsError || spotlightFeedError) {
              return (
                <View style={styles.errorContainer}>
                  <EmptyFeed type="no-connection" />
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                      refetchSuggestions();
                      refetchSuggestedFeeds();
                      refetchSpotlightFeed();
                    }}
                  >
                    <Text style={styles.retryButtonText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            return (
              <View style={styles.initialStateContainer}>
                <Text style={styles.initialStateText}>No suggestions available</Text>
              </View>
            );
          }
          return null;
        }}
      />
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
    paddingVertical: 12,
    paddingHorizontal: 20,
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
    paddingVertical: 12,
    paddingHorizontal: 20,
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
    marginBottom: 2,
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
    paddingBottom: 15,
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

  popularChannelsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  popularChannelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: -15, // Compensate for the increased container padding
  },
  popularChannelButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  popularChannelInfoContainer: {
    flex: 1,
  },
  popularChannelDisplayName: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
    marginBottom: 2,
  },
  popularChannelDescription: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  popularChannelAvatarContainer: {
    marginRight: 12,
  },
  popularChannelArrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  followButton: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },


});

export default ExploreScreen;