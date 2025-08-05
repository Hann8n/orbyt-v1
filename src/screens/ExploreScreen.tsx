import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Keyboard,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../services/api/AtprotoService';
import { useNavigation } from '@react-navigation/native';
import ProfileCache, { CachedProfile, profileKeys } from '../services/cache/ProfileCache';
import ChannelCache from '../services/cache/ChannelCache';
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, Icon } from '../components/ui/UI';
import { GridViewIcon } from '../components/ui/Icon';
import { BRAND, TEXT, INTERACTIVE, UI, STATUS } from '../utils/formatting/Colors';
import VerificationBadge from '../components/features/verification/VerificationBadge';
import EmptyFeed from '../components/features/feed/EmptyFeed';
import { createQueryKeys } from '../services/FeedService';
import { getBottomNavBarHeight } from '../utils/helpers/screenSize';
import GridFeedView from '../components/features/feed/GridFeedView';
import { extractVideoThumbnail } from '../utils/helpers/video';
import { feedService } from '../services/FeedService';
import { FORCE_SEARCH_ERROR, getForcedErrorMessage } from '../utils/helpers/errorDebug';
import { formatNumber } from '../utils/helpers/formatNumber';
import { ModerationService } from '../services/ModerationService';

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

// Add a new type for the video grid section
interface VideoGridSection {
  type: 'video-grid';
  videos: any[];
  key: string;
}

// Add a new type for the spotlight videos section
interface SpotlightVideosSection {
  type: 'spotlight-videos';
  videos: any[];
  key: string;
}

// Add a new type for horizontal scrolling columns
interface ColumnData {
  type: 'mixed-column';
  data: (Profile | Channel)[];
  key: string;
}

interface HorizontalColumnsSection {
  type: 'horizontal-columns';
  mixedResults: (Profile | Channel)[];
  columns: ColumnData[];
  key: string;
}

type ListItem = SearchResult | SectionHeader | VideoGridSection | SpotlightVideosSection | HorizontalColumnsSection;



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
      style={[styles.profileImage, { borderWidth: 1, borderColor: UI.BORDER.PRIMARY }]}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.profileContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 14, marginBottom: 4, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
    </View>
  </View>
);

// Channel shimmer skeleton component
const ChannelShimmer = () => (
  <View style={styles.channelItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.channelImage, { borderWidth: 1, borderColor: UI.BORDER.PRIMARY }]}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.channelContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 140, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 100, height: 14, marginBottom: 4, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 12, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
    </View>
  </View>
);

// Feed shimmer skeleton component
const FeedShimmer = () => (
  <View style={styles.feedItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.feedImage, { borderWidth: 1, borderColor: UI.BORDER.PRIMARY }]}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.feedContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 14, marginBottom: 4, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 12, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
    </View>
  </View>
);

// Section header shimmer skeleton component


// Video shimmer skeleton component
const VideoShimmer = () => (
  <View style={styles.feedItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.feedImage, { borderWidth: 1, borderColor: UI.BORDER.PRIMARY }]}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.feedContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 14, marginBottom: 4, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 12, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
    </View>
  </View>
);

const ExploreScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isScrolling, setIsScrolling] = useState(false);
  const [allSuggestions, setAllSuggestions] = useState<any[]>([]);
  const [allVideos, setAllVideos] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid'>('grid');
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
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

  // Unified search function that combines profiles, channels, and videos
  const performUnifiedSearch = useCallback(async (query: string, pageParam?: string | null) => {
    if (!query || query.trim() === '') {
      return { results: [], cursor: null };
    }

    try {
      // Search for profiles and videos in parallel (channels don't support pagination)
      let profilesResponse, videosResponse;
      try {
        [profilesResponse, videosResponse] = await Promise.all([
          AtprotoService.searchProfilesPaginated(query, pageParam as string | null),
          AtprotoService.searchVideosPaginated(query, pageParam as string | null)
        ]);
      } catch (error) {
        console.error('Error in parallel search:', error);
        profilesResponse = { profiles: [], cursor: null };
        videosResponse = { videos: [], cursor: null };
      }

      // Only fetch channels on the first page to avoid duplicates
      let channelsResponse: any[] = [];
      if (!pageParam) {
        try {
          // Request more channels to ensure we get enough video-only results
          channelsResponse = await AtprotoService.searchPopularFeeds(query, 15);
        } catch (error) {
          console.warn('Error fetching channels:', error);
          channelsResponse = [];
        }
      }

      // Process profiles
      const processedProfiles = profilesResponse.profiles.map(profile => ({
        type: 'profile' as const,
        data: {
          ...profile,
          isFollowing: !!profile.viewer?.following
        } as Profile,
        relevance: calculateRelevance(profile, query, 'profile')
      }));

      // Process channels (only on first page)
      const processedChannels = channelsResponse.map(channel => ({
        type: 'channel' as const,
        data: channel as Channel,
        relevance: calculateRelevance(channel, query, 'channel')
      }));

      // Apply moderation to videos
      let moderatedVideos = videosResponse.videos || [];
      if (moderatedVideos.length > 0) {
        try {
          // Convert search videos to the expected feed item format for moderation
          const feedItems = moderatedVideos.map(video => ({
            post: video,
            shouldCache: true,
            uniqueKey: video.uri,
          }));
          
          const moderationResult = await ModerationService.batchModeratePosts(feedItems);
          moderatedVideos = moderationResult.filteredPosts.map(item => item.post);
          
          // Attach moderation decisions to videos
          const moderationMap = moderationResult.moderationDecisions;
          moderatedVideos = moderatedVideos.map(video => {
            const uri = video?.uri;
            return uri && moderationMap.has(uri)
              ? { ...video, moderationDecision: moderationMap.get(uri) }
              : video;
          });
        } catch (error) {
          console.warn('Error applying moderation to search videos:', error);
        }
      }

      // Process videos
      const processedVideos = moderatedVideos.map(video => {
        // Add some debugging for video structure
        if (!video.uri) {
          console.warn('Video missing URI:', video);
        }
        return {
          type: 'video' as const,
          data: video,
          relevance: calculateRelevance(video, query, 'video')
        };
      });

      // Note: allVideos is now updated in useEffect based on searchData

      // Combine all results in backend order (no client-side sorting)
      const allResults: ListItem[] = [
        ...processedProfiles,
        ...processedChannels,
        ...processedVideos
      ];
      // Removed: allResults.sort((a, b) => (b as SearchResult).relevance - (a as SearchResult).relevance);

      return {
        results: allResults,
        cursor: profilesResponse.cursor // Use profile cursor for pagination
      };
    } catch (error) {
      console.error('Error performing unified search:', error);
      return { results: [], cursor: null };
    }
  }, []);

  // Calculate relevance score for search results
  const calculateRelevance = (item: any, query: string, type: 'profile' | 'channel' | 'video'): number => {
    const queryLower = query.toLowerCase();
    let score = 0;

    if (type === 'profile') {
      // Profile relevance scoring
      if (item.handle?.toLowerCase().includes(queryLower)) score += 10;
      if (item.displayName?.toLowerCase().includes(queryLower)) score += 8;
      if (item.description?.toLowerCase().includes(queryLower)) score += 5;
      if (item.viewer?.followedBy) score += 3; // Boost followed profiles
    } else if (type === 'channel') {
      // Channel relevance scoring
      if (item.displayName?.toLowerCase().includes(queryLower)) score += 10;
      if (item.description?.toLowerCase().includes(queryLower)) score += 8;
      if (item.creator?.handle?.toLowerCase().includes(queryLower)) score += 6;
      if (item.likeCount && item.likeCount > 100) score += 2; // Boost popular channels
    } else if (type === 'video') {
      // Video relevance scoring
      const videoText = item.text || item.record?.text || '';
      if (videoText.toLowerCase().includes(queryLower)) score += 10;
      if (item.author?.displayName?.toLowerCase().includes(queryLower)) score += 6;
      if (item.author?.handle?.toLowerCase().includes(queryLower)) score += 5;
      if (item.labels && item.labels.some((l: any) => l.val?.toLowerCase().includes(queryLower))) score += 3;
      if (item.likeCount && item.likeCount > 10) score += 2;
    }

    return score;
  };

  // Use Infinite Query to fetch unified search results with pagination
  const {
    data: searchData,
    isLoading,
    error,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: unifiedSearchKeys.infiniteSearch(debouncedQuery),
    queryFn: async ({ pageParam }) => {
      // Force error if debug flag is enabled
      if (FORCE_SEARCH_ERROR) {
        throw getForcedErrorMessage('search');
      }
      return await performUnifiedSearch(debouncedQuery, pageParam as string | null);
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: null as string | null,
    enabled: debouncedQuery.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
  });

  // Flatten results from all pages
  const searchResults = useMemo(() => {
    return searchData?.pages.flatMap(page => page.results) || [];
  }, [searchData]);

  // Update allVideos with all videos from all pages when search results change
  useEffect(() => {
    if (searchData?.pages) {
      const allVideosFromPages = searchData.pages.flatMap(page => {
        const videoResults = page.results.filter((result: any) => result.type === 'video');
        return videoResults.map((result: any) => result.data);
      });
      setAllVideos(allVideosFromPages);
      
      // Also update the FeedStore with formatted feed data
      const formattedFeed = allVideosFromPages.map(video => ({
        post: video,
        shouldCache: true,
        uniqueKey: video.uri,
        moderationDecision: video.moderationDecision,
      }));
      feedService.setCurrentFeed(formattedFeed);
    }
  }, [searchData]);

  // Batch prefetch profiles and channels when search results change
  useEffect(() => {
    if (searchResults.length > 0) {
      const profiles = searchResults
        .filter((result): result is SearchResult => result.type === 'profile')
        .map(result => result.data as Profile);
      
      const channels = searchResults
        .filter((result): result is SearchResult => result.type === 'channel')
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

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async ({ profile }: { profile: Profile }) => {
      await AtprotoService.follow(profile.did);
      return profile;
    },
    onMutate: async ({ profile }) => {
      await queryClient.cancelQueries({ queryKey: unifiedSearchKeys.infiniteSearch(debouncedQuery) });
      const previousData = queryClient.getQueryData(unifiedSearchKeys.infiniteSearch(debouncedQuery));

      queryClient.setQueryData(
        unifiedSearchKeys.infiniteSearch(debouncedQuery),
        (oldData: any) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              results: page.results.map((result: SearchResult) => {
                if (result.type === 'profile' && result.data.did === profile.did) {
                  const profileData = result.data as Profile;
                  return {
                    ...result,
                    data: { ...profileData, viewer: { ...profileData.viewer, following: 'true' }, isFollowing: true } as Profile
                  };
                }
                return result;
              })
            }))
          };
        }
      );

      return { previousData };
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          unifiedSearchKeys.infiniteSearch(debouncedQuery),
          context.previousData
        );
      }
    },
    onSettled: async (profile) => {
      if (profile) {
        const freshProfile = await AtprotoService.getProfile(profile.handle);
        await ProfileCache.updateFollowingStatus(
          profile.handle, 
          !!freshProfile?.viewer?.following
        );
      }
      
      queryClient.invalidateQueries({ queryKey: unifiedSearchKeys.infiniteSearch(debouncedQuery) });
    }
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async ({ profile }: { profile: Profile }) => {
      await AtprotoService.unfollow(profile.did);
      return profile;
    },
    onMutate: async ({ profile }) => {
      await queryClient.cancelQueries({ queryKey: unifiedSearchKeys.infiniteSearch(debouncedQuery) });
      const previousData = queryClient.getQueryData(unifiedSearchKeys.infiniteSearch(debouncedQuery));

      queryClient.setQueryData(
        unifiedSearchKeys.infiniteSearch(debouncedQuery),
        (oldData: any) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              results: page.results.map((result: SearchResult) => {
                if (result.type === 'profile' && result.data.did === profile.did) {
                  const profileData = result.data as Profile;
                  return {
                    ...result,
                    data: { ...profileData, viewer: { ...profileData.viewer, following: undefined }, isFollowing: false } as Profile
                  };
                }
                return result;
              })
            }))
          };
        }
      );

      return { previousData };
    },
    onError: (_, __, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          unifiedSearchKeys.infiniteSearch(debouncedQuery),
          context.previousData
        );
      }
    },
    onSettled: async (profile) => {
      if (profile) {
        const freshProfile = await AtprotoService.getProfile(profile.handle);
        await ProfileCache.updateFollowingStatus(
          profile.handle, 
          !!freshProfile?.viewer?.following
        );
      }
      
      queryClient.invalidateQueries({ queryKey: unifiedSearchKeys.infiniteSearch(debouncedQuery) });
    }
  });

  // Handle clear search input
  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    Keyboard.dismiss();
  };
  
  // Scroll event handlers
  const handleScrollBeginDrag = useCallback(() => {
    setIsScrolling(true);
    Keyboard.dismiss();
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    setTimeout(() => setIsScrolling(false), 200);
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    setTimeout(() => setIsScrolling(false), 100);
  }, []);

  // Preload next page when close to bottom
  const preloadNextPage = useCallback(
    (currentOffset: number, contentHeight: number, containerHeight: number) => {
      const isCloseToBottom = (contentHeight - currentOffset - containerHeight) / contentHeight < 0.25;
      if (isCloseToBottom && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  // For shimmer loading, define a discriminated union type
  const shimmerTypes = ['profile', 'channel', 'video'] as const;
  type ShimmerType = typeof shimmerTypes[number];

  // Create shimmer items for suggested content with section headers
  const shimmerSuggestedItems = useMemo(() => {
    return [
      // Section header for spotlight
      { type: 'section-header' as const, key: 'spotlight-header-shimmer' },
      // Spotlight video items
      ...Array(3).fill(0).map((_, index) => ({ type: 'video' as const, key: `spotlight-video-shimmer-${index}` })),
      // Section header for feeds
      { type: 'section-header' as const, key: 'feeds-header-shimmer' },
      // Feed items
      ...Array(3).fill(0).map((_, index) => ({ type: 'feed' as const, key: `feed-shimmer-${index}` })),
      // Section header for accounts
      { type: 'section-header' as const, key: 'accounts-header-shimmer' },
      // Account items
      ...Array(5).fill(0).map((_, index) => ({ type: 'profile' as const, key: `profile-shimmer-${index}` }))
    ];
  }, []);

  // Calculate dynamic padding based on screen size
  const getDynamicPadding = () => {
    const { width, height } = require('react-native').Dimensions.get('window');
    const screenHeight = Math.max(width, height);
    return screenHeight < 700 ? 50 : 15;
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

  // Type predicate to check if item is a Profile
  function isProfile(item: any): item is Profile {
    return 'did' in item && 'handle' in item;
  }

  // Type predicate to check if item is a Channel
  function isChannel(item: any): item is Channel {
    return 'uri' in item && 'displayName' in item;
  }

  // Helper function for hex to rgba conversion (copied from TabNavigation)
  const hexToRGBA = (hex: string, alpha: number): string => {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };



  // Grid view header component
  const GridViewHeader = () => (
    <View style={styles.gridHeader}>
      <Text style={styles.gridHeaderTitle}>Videos</Text>
    </View>
  );

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
          
          const currentUserDid = ProfileCache.getCurrentUserDid();
          const isCurrentUser = currentUserDid && profile.did && currentUserDid === profile.did;
          
          return (
            <TouchableOpacity
              style={styles.profileItem}
              onPress={() => {
                if (profile.handle) {
                  const handle = profile.handle.trim();
                  if (handle && handle.trim()) {
                    queryClient.prefetchQuery({
                      queryKey: profileKeys.detail(handle.trim()),
                      queryFn: () => ProfileCache.getProfile(handle.trim()),
                      staleTime: ProfileCache.cacheExpiry
                    }).finally(() => {
                      navigation.navigate('AuthorProfile', { handle: handle.trim() });
                    });
                  }
                }
              }}
            >
              <Avatar
                uri={profile.avatar}
                type="profile"
                size={40}
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
                      textColor={TEXT.PRIMARY}
                    />
                  )}
                </View>
                <Text style={styles.handleText}>
                  @{profile.handle || 'unknown'}
                </Text>
              </View>
            </TouchableOpacity>
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
                  navigation.navigate('Channel', {
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
                style={styles.channelImage}
              />
              <View style={styles.channelContent}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={styles.channelName} numberOfLines={1}>
                    {channel.displayName || 'Unknown channel'}
                  </Text>
                  {channel.isExperimental && (
                    <Icon name="bug" size={12} color="#4CAF50" style={styles.experimentalIcon} />
                  )}
                </View>
                <Text style={styles.channelCreator}>
                  by @{channel.creator?.handle || 'unknown'}
                </Text>
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
          const shouldBlur = feedService.isVideoBlurred(video.uri, !!video.moderationDecision?.blur);
          
          return (
            <TouchableOpacity
              style={styles.videoItem}
              onPress={() => {
                if (video.uri) {
                  // Find the index of this video in the allVideos array
                  const videoIndex = allVideos.findIndex(v => v.uri === video.uri);
                  const index = videoIndex >= 0 ? videoIndex : 0;
                  
                  // FeedStore is already updated with formatted data from useEffect
                  
                  navigation.navigate('FeedModal', {
                    initialIndex: index,
                    initialUri: video.uri,
                    feedOption: 'search',
                    userDid: undefined,
                    backgroundColor: 'transparent',
                    secondaryColor: '#fff',
                    searchQuery: debouncedQuery,
                    hasNextPage: hasNextPage,
                    isFetchingNextPage: isFetchingNextPage,
                    fetchNextPage: fetchNextPage
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
                      defaultSource={require('../assets/Vector_Normal_Grey.png')}
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
                    <Icon name="videocam" size={16} color={TEXT.TERTIARY} />
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
  }, [navigation, queryClient, allVideos, debouncedQuery, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Organize search results into sections
  const organizedSearchResults = useMemo(() => {
    if (!searchResults.length) return [];
    
    // Get all profiles and channels in backend order (no client-side sorting)
    const profilesAndChannels = searchResults
      .filter((result): result is SearchResult => result.type === 'profile' || result.type === 'channel')
      .map(result => result.data as Profile | Channel);
    
    const videos = searchResults
      .filter((result): result is SearchResult => result.type === 'video')
      .map(result => result.data);
    
    const sections: ListItem[] = [];
    
    // Add mixed profiles and channels in horizontal scrolling columns
    if (profilesAndChannels.length > 0) {
      // Create columns with 5 items each
      const itemsPerColumn = 5;
      const mixedColumns = [];
      
      // Split mixed results into columns
      for (let i = 0; i < profilesAndChannels.length; i += itemsPerColumn) {
        mixedColumns.push(profilesAndChannels.slice(i, i + itemsPerColumn));
      }
      
      // Create columns data
      const columns: ColumnData[] = [];
      mixedColumns.forEach((mixedColumn, index) => {
        columns.push({
          type: 'mixed-column',
          data: mixedColumn,
          key: `mixed-column-${index}`
        });
      });
      
      sections.push({
        type: 'horizontal-columns',
        mixedResults: profilesAndChannels,
        columns: columns,
        key: 'horizontal-columns'
      });
    }
    
    // Add videos grid if there are videos
    if (videos.length > 0) {
      sections.push({
        type: 'video-grid',
        videos: videos,
        key: 'videos-grid'
      });
    }
    
    return sections;
  }, [searchResults]);


  const isLoadingResults = isLoading || isFetching && !isFetchingNextPage;

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
    data: suggestedFeeds,
    isLoading: isLoadingSuggestedFeeds,
    error: suggestedFeedsError,
    refetch: refetchSuggestedFeeds,
  } = useQuery({
    queryKey: ['suggestedFeeds', 8],
    queryFn: async () => {
      // Force error if debug flag is enabled
      if (FORCE_SEARCH_ERROR) {
        throw getForcedErrorMessage('suggested feeds');
      }
      // Request more feeds to ensure we get enough video-only results
      return await AtprotoService.getSuggestedFeeds(20);
    },
    enabled: debouncedQuery.length === 0,
    staleTime: 60 * 1000, // 1 minute
  });

  // Fetch orbyter spotlight reposts
  const {
    data: orbyterReposts,
    isLoading: isLoadingOrbyterReposts,
    error: orbyterRepostsError,
    refetch: refetchOrbyterReposts,
  } = useQuery({
    queryKey: ['orbyterReposts'],
    queryFn: async () => {
      // Force error if debug flag is enabled
      if (FORCE_SEARCH_ERROR) {
        throw getForcedErrorMessage('orbyter reposts');
      }
      // Get orbyter's reposts (filtered for videos only)
      const response = await AtprotoService.getFeed(null, 'did:plc:l3l3fjuwhv4mh4ih5y7ewrue', {}, true, 10, 'author');
      let feed = response.feed || [];
      
      // Apply moderation to spotlight videos
      if (feed.length > 0) {
        try {
          const moderationResult = await ModerationService.batchModeratePosts(feed);
          feed = moderationResult.filteredPosts;
          
          // Attach moderation decisions to videos
          const moderationMap = moderationResult.moderationDecisions;
          feed = feed.map((video: any) => {
            const uri = video?.post?.uri;
            return uri && moderationMap.has(uri)
              ? { ...video, moderationDecision: moderationMap.get(uri) }
              : video;
          });
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND.PRIMARY} />
      {/* Dark gradient below top safe area */}
      <LinearGradient
        colors={['rgba(0,0,0,1.0)', 'rgba(0,0,0,0.3)', 'transparent']}
        style={[styles.topGradient, { top: insets.top }]}
        pointerEvents="none"
      />
      {/* Search Bar */}
      <View style={[styles.searchContainer, { top: insets.top + 5, zIndex: 10 }]}>
        <Icon
          name="search"
          size={24}
          color={BRAND.PRIMARY}
          style={{ transform: [{ scale: 1.2 }, { scaleX: -1 }] }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search"
          placeholderTextColor={TEXT.DARK_GREY}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance="dark"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
            <Ionicons name="close-circle" size={22.5} color="#0d0d11" />
          </TouchableOpacity>
        )}
      </View>

      {/* Suggested Accounts and Feeds (only when not searching) */}
      {debouncedQuery.length === 0 && (
        <View style={{ flex: 1 }}>
          {isLoadingSuggestions || isLoadingSuggestedFeeds || isLoadingOrbyterReposts ? (
            <FlatList
              data={shimmerSuggestedItems}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => {
                if (item.type === 'feed') {
                  return <FeedShimmer />;
                } else if (item.type === 'video') {
                  return <VideoShimmer />;
                } else {
                  return <ProfileShimmer />;
                }
              }}
              contentContainerStyle={[styles.mainExploreContainer, { paddingTop: 60, paddingBottom: getBottomNavBarHeight(insets)}]}
              scrollEnabled={true}
            />
          ) : (suggestionsError || suggestedFeedsError || orbyterRepostsError) ? (
            <View style={styles.errorContainer}>
              <EmptyFeed type="no-connection" />
              <TouchableOpacity style={styles.retryButton} onPress={() => {
                refetchSuggestions();
                refetchSuggestedFeeds();
                refetchOrbyterReposts();
              }}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (allSuggestions && allSuggestions.length > 0) || (suggestedFeeds && suggestedFeeds.length > 0) || (orbyterReposts && orbyterReposts.length > 0) ? (
            <FlatList
              data={[
                // Spotlight section for orbyter reposts
                ...(orbyterReposts && orbyterReposts.length > 0 ? [
                  { type: 'section-header' as const, title: '🔥 Spotlight', key: 'spotlight-header' },
                  { type: 'spotlight-videos' as const, videos: orbyterReposts, key: 'spotlight-videos' }
                ] : []),
                // Section header for feeds
                ...(limitedSuggestedFeeds && limitedSuggestedFeeds.length > 0 ? [
                  { type: 'section-header' as const, title: 'Popular channels', key: 'feeds-header' },
                  ...limitedSuggestedFeeds.map(item => ({ type: 'channel' as const, data: item, relevance: 0 }))
                ] : []),
                // Section header for accounts
                ...(allSuggestions && allSuggestions.length > 0 ? [
                  { type: 'section-header' as const, title: 'Suggested Accounts', key: 'accounts-header' },
                  ...allSuggestions.map(item => ({ type: 'profile' as const, data: item, relevance: 0 }))
                ] : [])
              ] as ListItem[]}
              keyExtractor={(item, index) => item.type === 'section-header' ? item.key : `${item.type}-${index}`}
              renderItem={({ item }: { item: ListItem }) => {
                if (item.type === 'section-header') {
                  return (
                    <View style={styles.sectionHeader}>
                      <Text style={[
                        styles.sectionTitle,
                        item.title === '🔥 Spotlight' && styles.spotlightTitle
                      ]}>
                        {item.title}
                      </Text>
                    </View>
                  );
                }
                if (item.type === 'spotlight-videos') {
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
                                // Update FeedStore with spotlight videos in the correct format
                                const formattedFeed = item.videos.map(v => {
                                  const vData = v.post || v;
                                  return {
                                    post: vData,
                                    shouldCache: true,
                                    uniqueKey: vData.uri,
                                    moderationDecision: v.moderationDecision,
                                  };
                                });
                                feedService.setCurrentFeed(formattedFeed);
                                
                                // Find the index of this video in the formatted feed
                                const index = formattedFeed.findIndex(v => v.post.uri === videoUri);
                                const finalIndex = index >= 0 ? index : 0;
                                
                                navigation.navigate('FeedModal', {
                                  initialIndex: finalIndex,
                                  initialUri: videoUri,
                                  feedOption: 'search', // Use 'search' to trigger FeedStore usage
                                  userDid: undefined,
                                  backgroundColor: 'transparent',
                                  secondaryColor: '#fff',
                                  searchQuery: '',
                                  hasNextPage: false,
                                  isFetchingNextPage: false
                                });
                              }
                            }}
                          >
                            <View style={styles.spotlightVideoThumbnailContainer}>
                              {(() => {
                                // For reposts, the video data is nested under video.post
                                const videoData = video.post || video;
                                const thumbnailUrl = extractVideoThumbnail(videoData.embed);
                                const shouldBlur = feedService.isVideoBlurred(videoData.uri, !!video.moderationDecision?.blur);
                                
                                if (thumbnailUrl) {
                                  return (
                                    <>
                                      <Image
                                        source={{ uri: thumbnailUrl }}
                                        style={styles.spotlightVideoThumbnail}
                                        resizeMode="cover"
                                        defaultSource={require('../assets/Vector_Normal_Grey.png')}
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
                                } else {
                                  return (
                                    <View style={styles.spotlightVideoThumbnailPlaceholder}>
                                      <Icon name="videocam" size={16} color={TEXT.TERTIARY} />
                                    </View>
                                  );
                                }
                              })()}
                            </View>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  );
                }
                return renderSearchResult({ item });
              }}
              contentContainerStyle={[styles.mainExploreContainer, { paddingTop: 60, paddingBottom: getBottomNavBarHeight(insets) }]}
              scrollEnabled={true}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={null}
            />
          ) : (
            <View style={styles.initialStateContainer}>
              <Text style={styles.initialStateText}>No suggestions available</Text>
            </View>
          )}
        </View>
      )}

      {/* Initial State */}
      {(!isLoadingResults && !error && searchResults.length === 0 && searchQuery.length === 0 && debouncedQuery.length > 0) && (
        <View style={styles.initialStateContainer}>
          <Text style={styles.initialStateText}>Search for users and channels</Text>
        </View>
      )}

      {/* Results List or Loading State */}
      {(organizedSearchResults.length > 0 || isLoadingResults || (searchQuery.length > 0 && debouncedQuery.length > 0)) && (
        <FlatList
          data={isLoadingResults ? (shimmerTypes as unknown as any[]) : organizedSearchResults}
          keyExtractor={(item, index) => {
            if (typeof item === 'string') return `shimmer-${index}`;
            if (isSearchResult(item)) {
              const searchResult = item as SearchResult;
              if (searchResult.type === 'profile') {
                const profile = searchResult.data as Profile;
                return `profile-${profile.did || profile.handle || index}`;
              }
              if (searchResult.type === 'channel') {
                const channel = searchResult.data as Channel;
                return `channel-${channel.uri || channel.cid || index}`;
              }
              if (searchResult.type === 'video') {
                const video = searchResult.data;
                return `video-${video?.uri || video?.cid || index}`;
              }
            }
            if (item.type === 'video-grid') {
              return item.key;
            }
            return `item-${index}`;
          }}
          renderItem={({ item }) => {
            if (typeof item === 'string') {
              if (item === 'profile') return <ProfileShimmer />;
              if (item === 'channel') return <ChannelShimmer />;
              return <VideoShimmer />;
            }
            if (isSearchResult(item)) {
              return renderSearchResult({ item });
            }

            if (item.type === 'horizontal-columns') {
              return (
                <View style={styles.horizontalColumnsContainer}>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={item.columns}
                    keyExtractor={(column, index) => column.key}
                    snapToInterval={Dimensions.get('window').width}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    renderItem={({ item: column }) => (
                      <View style={styles.columnContainer}>
                        <FlatList
                          data={column.data}
                          keyExtractor={(item, index) => {
                            if (isProfile(item)) {
                              return `profile-${item.did}`;
                            } else if (isChannel(item)) {
                              return `channel-${item.uri}`;
                            }
                            return `item-${index}`;
                          }}
                          renderItem={({ item }) => {
                            if (isProfile(item)) {
                              const profile = item;
                              return (
                                <TouchableOpacity
                                  style={styles.profileItem}
                                  onPress={() => {
                                    navigation.navigate('AuthorProfile', {
                                      handle: profile.handle,
                                      did: profile.did,
                                    });
                                  }}
                                >
                                  <Avatar
                                    uri={profile.avatar}
                                    type="profile"
                                    size={40}
                                    style={styles.profileImage}
                                  />
                                  <View style={styles.profileContent}>
                                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                      <Text style={styles.profileName} numberOfLines={1}>
                                        {profile.displayName || profile.handle}
                                      </Text>
                                      {profile.handle && (
                                        <VerificationBadge handle={profile.handle} textSize={14} textColor="#FFFFFF" />
                                      )}
                                    </View>
                                    <Text style={styles.profileHandle}>
                                      @{profile.handle}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={[
                                      styles.followButton,
                                      profile.isFollowing && styles.followingButton
                                    ]}
                                    onPress={() => {
                                      if (profile.isFollowing) {
                                        unfollowMutation.mutate({ profile });
                                      } else {
                                        followMutation.mutate({ profile });
                                      }
                                    }}
                                  >
                                    <Text style={[
                                      styles.followButtonText,
                                      profile.isFollowing && styles.followingButtonText
                                    ]}>
                                      {profile.isFollowing ? 'Following' : 'Follow'}
                                    </Text>
                                  </TouchableOpacity>
                                </TouchableOpacity>
                              );
                            } else if (isChannel(item)) {
                              const channel = item;
                              return (
                                <TouchableOpacity
                                  style={styles.channelItem}
                                  onPress={() => {
                                    if (channel.uri && channel.uri.trim()) {
                                      navigation.navigate('Channel', {
                                        uri: channel.uri.trim(),
                                        title: channel.displayName || 'Unknown Channel',
                                        description: channel.description || '',
                                        avatar: channel.avatar || '',
                                        creator: channel.creator || null,
                                      });
                                    }
                                  }}
                                >
                                  <Avatar
                                    uri={channel.avatar}
                                    type="channel"
                                    size={40}
                                    style={styles.channelImage}
                                  />
                                  <View style={styles.channelContent}>
                                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                      <Text style={styles.channelName} numberOfLines={1}>
                                        {channel.displayName || 'Unknown channel'}
                                      </Text>
                                      {channel.isExperimental && (
                                        <Icon name="bug" size={12} color="#4CAF50" style={styles.experimentalIcon} />
                                      )}
                                    </View>
                                    <Text style={styles.channelCreator}>
                                      by @{channel.creator?.handle || 'unknown'}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            }
                            return null;
                          }}
                          scrollEnabled={false}
                        />
                      </View>
                    )}
                  />
                </View>
              );
            }
            if (item.type === 'video-grid') {
              const formattedFeed = item.videos.map((video: any) => ({
                post: video,
                shouldCache: true,
                uniqueKey: video.uri,
                moderationDecision: video.moderationDecision,
              }));

              return (
                <View style={styles.videoGridContainer}>
                  <GridFeedView
                    feed={formattedFeed}
                    headerComponent={<GridViewHeader />}
                    feedOption="search"
                    onLoadMore={() => {
                      if (hasNextPage && !isFetchingNextPage) {
                        fetchNextPage();
                      }
                    }}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    onGridItemPress={(index) => {
                      const video = item.videos[index];
                      if (video?.uri) {
                        // Find the index of this video in the allVideos array
                        const videoIndex = allVideos.findIndex(v => v.uri === video.uri);
                        const finalIndex = videoIndex >= 0 ? videoIndex : 0;
                        
                        navigation.navigate('FeedModal', {
                          initialIndex: finalIndex,
                          initialUri: video.uri,
                          feedOption: 'search',
                          userDid: undefined,
                          backgroundColor: 'transparent',
                          secondaryColor: '#fff',
                          searchQuery: debouncedQuery,
                          hasNextPage: hasNextPage,
                          isFetchingNextPage: isFetchingNextPage,
                          fetchNextPage: fetchNextPage
                        });
                      }
                    }}
                  />
                </View>
              );
            }
            return null;
          }}
          contentContainerStyle={[
            styles.listContainer, 
            { paddingTop: 60, paddingBottom: getBottomNavBarHeight(insets) },
            searchResults.length === 0 && !isLoadingResults && { flex: 1, justifyContent: 'center' }
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
            preloadNextPage(contentOffset.y, contentSize.height, layoutMeasurement.height);
          }}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={21}
          initialNumToRender={15}
          updateCellsBatchingPeriod={30}
          maintainVisibleContentPosition={{ 
            minIndexForVisible: 0, 
            autoscrollToTopThreshold: null 
          }}
          viewabilityConfig={viewabilityConfig}
          ListEmptyComponent={!isLoadingResults && searchQuery.length > 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.noResults}>No results found for "{debouncedQuery}"</Text>
              <Text style={styles.noResultsSubtext}>Try searching for something else</Text>
            </View>
          ) : null}
          ListFooterComponent={isFetchingNextPage ? (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color={TEXT.PRIMARY} />
            </View>
          ) : null}
        />
      )}

      {/* Error State */}
      {error && (
        <View style={styles.errorContainer}>
          <EmptyFeed type="no-connection" />
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.PRIMARY,
    paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight,
  },
  topGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 100,
    zIndex: 5,
  },

  listContainer: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  mainExploreContainer: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  searchContainer: {
    position: 'absolute',
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.SECONDARY,
    borderRadius: 17,
    paddingHorizontal: 15,
    height: 55,
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  searchInput: {
    flex: 1,
    color: BRAND.PRIMARY,
    fontSize: 20,
    height: '100%',
    fontFamily: 'Firma-Regular',
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
    borderBottomWidth: 0.5,
    borderBottomColor: UI.BORDER.PRIMARY,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
  },
  profileContent: {
    flex: 1,
    justifyContent: 'center',
  },
  displayName: {
    color: TEXT.PRIMARY,
    fontSize: 14,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  handleText: {
    color: TEXT.LIGHT_GREY,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: UI.BORDER.PRIMARY,
  },
  channelImage: {
    width: 40,
    height: 40,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
  },
  channelContent: {
    flex: 1,
    justifyContent: 'center',
  },
  channelName: {
    color: TEXT.PRIMARY,
    fontSize: 14,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  channelCreator: {
    color: TEXT.LIGHT_GREY,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 2,
  },
  channelStats: {
    color: TEXT.TERTIARY,
    fontSize: 11,
    fontFamily: 'Firma-Regular',
  },
  noResults: {
    color: TEXT.TERTIARY,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  noResultsSubtext: {
    color: TEXT.TERTIARY,
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
    color: TEXT.TERTIARY,
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
    backgroundColor: BRAND.SECONDARY,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: {
    color: BRAND.PRIMARY,
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
    paddingBottom: 10,
  },
  sectionTitle: {
    color: TEXT.PRIMARY,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
  },
  horizontalColumnsContainer: {
    marginTop: 5,
    marginBottom: 5,
  },
  columnContainer: {
    flex: 1,
    width: Dimensions.get('window').width,
    paddingHorizontal: 0,
  },

  profileName: {
    color: TEXT.PRIMARY,
    fontSize: 14,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  profileHandle: {
    color: TEXT.LIGHT_GREY,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 2,
  },
  profileDescription: {
    color: TEXT.TERTIARY,
    fontSize: 11,
    fontFamily: 'Firma-Regular',
  },
  followButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: BRAND.SECONDARY,
    borderRadius: 15,
    minWidth: 60,
    alignItems: 'center',
    marginLeft: 8,
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
  },
  followButtonText: {
    color: BRAND.PRIMARY,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
  },
  followingButtonText: {
    color: TEXT.PRIMARY,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
  },
  videoGridContainer: {
    marginTop: 5,
    marginBottom: 10,
    paddingHorizontal: 0,
    marginHorizontal: 0, // Take up full width
  },
  spotlightTitle: {
    color: '#FF6B35',
    fontSize: 20,
    fontFamily: 'Firma-Bold',
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginTop: 15,
    marginBottom: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: BRAND.SECONDARY,
    borderRadius: 20,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreButtonText: {
    color: BRAND.PRIMARY,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: UI.BORDER.PRIMARY,
  },
  feedImage: {
    width: 40,
    height: 40,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
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
    borderBottomColor: UI.BORDER.PRIMARY,
  },
  videoThumbnailContainer: {
    position: 'relative',
    marginRight: 12,
  },
  videoThumbnail: {
    width: 45,
    height: 80, // 9:16 aspect ratio (45 * 16/9)
    borderRadius: 6,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
    overflow: 'hidden' as const,
  },
  videoThumbnailPlaceholder: {
    width: 45,
    height: 80,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
    backgroundColor: UI.BACKGROUND.SECONDARY,
    justifyContent: 'center',
    alignItems: 'center',
  },

  videoContent: {
    flex: 1,
    justifyContent: 'center',
  },
  videoTitle: {
    color: TEXT.PRIMARY,
    fontSize: 14,
    marginBottom: 4,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  videoAuthor: {
    color: TEXT.LIGHT_GREY,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 2,
  },
  videoStats: {
    color: TEXT.TERTIARY,
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
    borderRadius: 8,
  },
  videoWarningText: {
    color: TEXT.PRIMARY,
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
    width: 100,
    marginRight: 12,
  },
  spotlightVideoThumbnailContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  spotlightVideoThumbnail: {
    width: 100,
    height: 178, // 9:16 aspect ratio (100 * 16/9)
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
    overflow: 'hidden' as const,
  },
  spotlightVideoThumbnailPlaceholder: {
    width: 100,
    height: 178, // 9:16 aspect ratio (100 * 16/9)
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
    backgroundColor: UI.BACKGROUND.SECONDARY,
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
    borderRadius: 12,
  },
  spotlightWarningText: {
    color: TEXT.PRIMARY,
    fontSize: 10,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  spotlightVideoTitle: {
    color: TEXT.PRIMARY,
    fontSize: 11,
    fontFamily: 'Firma-Medium',
    lineHeight: 14,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: UI.BORDER.PRIMARY,
  },
  gridHeaderTitle: {
    color: TEXT.PRIMARY,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
  },
  viewModeButton: {
    padding: 6,
    borderRadius: 50,
  },



});

export default ExploreScreen;