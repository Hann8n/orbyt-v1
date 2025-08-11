import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import AtprotoService from '../services/api/AtprotoService';
import { useNavigation } from '@react-navigation/native';
import ProfileCache, { CachedProfile, profileKeys } from '../services/cache/ProfileCache';
import ChannelCache from '../services/cache/ChannelCache';
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, Icon } from '../components/ui/UI';
import HeaderBanner from '../components/ui/HeaderBanner';
import { navigateToUserProfile } from '../navigation/profileNavigation';

import { GridViewIcon, SearchIcon } from '../components/ui/Icon';
import { Colors } from '../components/ui/UI';
import VerificationBadge from '../components/features/verification/VerificationBadge';
import EmptyFeed from '../components/features/feed/EmptyFeed';
import { createQueryKeys } from '../services/FeedService';
import { getBottomNavBarHeight } from '../utils/helpers/screenSize';
import GridFeedView from '../components/features/feed/GridFeedView';
import { extractVideoThumbnail } from '../utils/helpers/video';
import { feedService } from '../services/FeedService';
import { FORCE_SEARCH_ERROR, getForcedErrorMessage } from '../utils/helpers/errorDebug';
import { formatNumber } from '../utils/helpers/formatNumber';
import HeaderService, { Header } from '../services/HeaderService';
// import { ModerationService } from '../services/ModerationService'; // Commented out since videos are disabled

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



interface LoadMoreSection {
  type: 'load-more';
  section: 'profiles' | 'channels';
  remaining: number;
  key: string;
}

interface PeopleChannelsSection {
  type: 'people-channels-section';
  profiles: Profile[];
  channels: Channel[];
  key: string;
}

type ListItem = SearchResult | SectionHeader | VideoGridSection | SpotlightVideosSection | LoadMoreSection | PeopleChannelsSection;



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
      style={[styles.profileImage, { borderWidth: 1, borderColor: Colors.gray }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.profileContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 14, marginBottom: 4, borderRadius: 2 }}
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
      style={[styles.channelImage, { borderWidth: 1, borderColor: Colors.gray }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.channelContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 140, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 100, height: 14, marginBottom: 4, borderRadius: 2 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 12, borderRadius: 2 }}
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
      style={[styles.feedImage, { borderWidth: 1, borderColor: Colors.gray }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.feedContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 14, marginBottom: 4, borderRadius: 2 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 12, borderRadius: 2 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
  </View>
);

// Section header shimmer skeleton component
const SectionHeaderShimmer = () => (
  <View style={styles.sectionHeader}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 120, height: 16, borderRadius: 3 }}
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
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={styles.spotlightVideoThumbnail}
            shimmerColors={Colors.SHIMMER.PRIMARY}
          />
        </View>
      )}
    />
  </View>
);

// Video shimmer skeleton component
const VideoShimmer = () => (
  <View style={styles.feedItem}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={[styles.feedImage, { borderWidth: 1, borderColor: Colors.gray }]}
      shimmerColors={Colors.SHIMMER.PRIMARY}
    />
    <View style={styles.feedContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 16, marginBottom: 4, borderRadius: 3 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 14, marginBottom: 4, borderRadius: 2 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 12, borderRadius: 2 }}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
    </View>
  </View>
);

const ExploreScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isScrolling, setIsScrolling] = useState(false);
  const [allSuggestions, setAllSuggestions] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid'>('grid');
  const [headers, setHeaders] = useState<Header[]>([]);
  const [isLoadingHeaders, setIsLoadingHeaders] = useState(false);
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

  // Fetch headers
  useEffect(() => {
    const fetchHeaders = async () => {
      setIsLoadingHeaders(true);
      try {
        const fetchedHeaders = await HeaderService.getHeaders();
        // Convert relative URLs to absolute URLs
        const processedHeaders = fetchedHeaders.map(header => ({
          ...header,
          imageUrl: HeaderService.getImageUrl(header.imageUrl)
        }));
        setHeaders(processedHeaders);
      } catch (error) {
        console.error('Error fetching headers:', error);
        // Set empty headers on error to avoid showing loading state indefinitely
        setHeaders([]);
      } finally {
        setIsLoadingHeaders(false);
      }
    };

    fetchHeaders();
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

  // Reset showAll states when search query changes
  useEffect(() => {
    // setShowAllProfiles(false); // Removed
    // setShowAllChannels(false); // Removed
  }, [debouncedQuery]);



  // Unified search function that combines profiles, channels, and videos
  const performUnifiedSearch = useCallback(async (query: string, pageParam?: string | null) => {
    if (!query || query.trim() === '') {
      return { results: [], cursor: null };
    }

    try {
      // Search for profiles and channels in parallel (videos commented out)
      let profilesResponse, channelsResponse;
      try {
        [profilesResponse, channelsResponse] = await Promise.all([
          AtprotoService.searchProfilesPaginated(query, pageParam as string | null),
          // AtprotoService.searchVideosPaginated(query, pageParam as string | null) // Commented out video support
          AtprotoService.searchPopularFeeds(query, 15) // Get channels instead
        ]);
      } catch (error) {
        console.error('Error in parallel search:', error);
        profilesResponse = { profiles: [], cursor: null };
        channelsResponse = [];
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

      // Process channels
      const processedChannels = channelsResponse.map(channel => ({
        type: 'channel' as const,
        data: channel as Channel,
        relevance: calculateRelevance(channel, query, 'channel')
      }));

      // Comment out video processing
      // let moderatedVideos = videosResponse.videos || [];
      // if (moderatedVideos.length > 0) {
      //   try {
      //     const feedItems = moderatedVideos.map(video => ({
      //       post: video,
      //       shouldCache: true,
      //       uniqueKey: video.uri,
      //     }));
      //     
      //     const moderationResult = await ModerationService.batchModeratePosts(feedItems);
      //     moderatedVideos = moderationResult.filteredPosts.map(item => item.post);
      //     
      //     const moderationMap = moderationResult.moderationDecisions;
      //     moderatedVideos = moderatedVideos.map(video => {
      //       const uri = video?.uri;
      //       return uri && moderationMap.has(uri)
      //         ? { ...video, moderationDecision: moderationMap.get(uri) }
      //         : video;
      //     });
      //   } catch (error) {
      //     console.warn('Error applying moderation to search videos:', error);
      //   }
      // }

      // const processedVideos = moderatedVideos.map(video => {
      //   if (!video.uri) {
      //     console.warn('Video missing URI:', video);
      //   }
      //   return {
      //     type: 'video' as const,
      //     data: video,
      //     relevance: calculateRelevance(video, query, 'video')
      //   };
      // });

      // Combine all results and sort by relevance
      const allResults: ListItem[] = [
        ...processedProfiles,
        ...processedChannels,
        // ...processedVideos // Commented out video results
      ];
      allResults.sort((a, b) => (b as SearchResult).relevance - (a as SearchResult).relevance);

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
      // Channel relevance scoring - focus on actual search relevance
      if (item.displayName?.toLowerCase().includes(queryLower)) score += 10;
      if (item.description?.toLowerCase().includes(queryLower)) score += 8;
      if (item.creator?.handle?.toLowerCase().includes(queryLower)) score += 6;
      // Removed popularity boost to focus on search relevance
    }
    // Comment out video relevance scoring since videos are disabled
    // else if (type === 'video') {
    //   // Video relevance scoring
    //   const videoText = item.text || item.record?.text || '';
    //   if (videoText.toLowerCase().includes(queryLower)) score += 10;
    //   if (item.author?.displayName?.toLowerCase().includes(queryLower)) score += 6;
    //   if (item.author?.handle?.toLowerCase().includes(queryLower)) score += 5;
    //   if (item.labels && item.labels.some((l: any) => l.val?.toLowerCase().includes(queryLower))) score += 3;
    //   if (item.likeCount && item.likeCount > 10) score += 2;
    // }

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
  const shimmerTypes = [
    'profile', 'channel', 'profile', 'channel', 'profile', 
    'channel', 'profile', 'channel', 'profile', 'channel'
  ] as const;
  type ShimmerType = typeof shimmerTypes[number];

  // Create shimmer items for suggested content with section headers
  const shimmerSuggestedItems = useMemo(() => {
    return [
      // Section header for spotlight
      { type: 'section-header' as const, key: 'spotlight-header-shimmer' },
      // Spotlight videos section
      { type: 'spotlight-videos' as const, key: 'spotlight-videos-shimmer' },
      // Section header for feeds
      { type: 'section-header' as const, key: 'feeds-header-shimmer' },
      // Feed items - increased from 3 to 8
      ...Array(8).fill(0).map((_, index) => ({ type: 'channel' as const, key: `feed-shimmer-${index}` })),
      // Section header for accounts
      { type: 'section-header' as const, key: 'accounts-header-shimmer' },
      // Account items - increased from 5 to 10
      ...Array(10).fill(0).map((_, index) => ({ type: 'profile' as const, key: `profile-shimmer-${index}` }))
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
      item.type !== 'load-more' &&
      'data' in item
    );
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
      <Text style={styles.gridHeaderTitle}>videos</Text>
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
                        navigateToUserProfile(navigation, { handle: handle.trim() });
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
                      textColor={Colors.white}
                    />
                  )}
                </View>
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
          const shouldBlur = feedService.isVideoBlurred(video.uri, !!video.moderationDecision?.blur);
          
          return (
            <TouchableOpacity
              style={styles.videoItem}
              onPress={() => {
                if (video.uri) {
                  // Find the index of this video in the allVideos array
                  const videoIndex = 0; // allVideos.findIndex(v => v.uri === video.uri); // Removed allVideos
                  const index = videoIndex >= 0 ? videoIndex : 0;
                  
                  // FeedStore is already updated with formatted data from useEffect
                  
                  navigation.navigate('FeedModal', {
                    initialIndex: index,
                    initialUri: video.uri,
                    feedOption: 'search',
                    userDid: undefined,
                    backgroundColor: 'transparent',
                    secondaryColor: Colors.white,
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
  }, [navigation, queryClient, debouncedQuery, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Organize search results into sections
  const organizedSearchResults = useMemo(() => {
    if (!searchResults.length) return [];
    
    // Separate profiles and channels (videos commented out)
    const profiles = searchResults
      .filter((result): result is SearchResult => result.type === 'profile')
      .map(result => result.data as Profile)
      .filter((profile, index, self) => 
        index === self.findIndex(p => p.did === profile.did)
      );
    
    const channels = searchResults
      .filter((result): result is SearchResult => result.type === 'channel')
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
      .filter((result): result is SearchResult => result.type === 'profile')
      .map(result => ({ type: 'profile' as const, data: result.data as Profile, relevance: result.relevance }));
    
    const channelResults = searchResults
      .filter((result): result is SearchResult => result.type === 'channel')
      .map(result => ({ type: 'channel' as const, data: result.data as Channel, relevance: result.relevance }));
    
    // Combine and sort by relevance to mix profiles and channels together
    const combined = [...profileResults, ...channelResults];
    combined.sort((a, b) => b.relevance - a.relevance);
    
    return combined;
  }, [organizedSearchResults, searchResults]);


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

  // Header is part of the FlatList now; keep it mounted when searching to avoid flicker
  const isHeaderVisible = useMemo(
    () => !isLoadingHeaders && headers.length > 0,
    [isLoadingHeaders, headers.length]
  );

  // Stable header element to avoid remounts/reloads of the header image
  const headerHeight = useMemo(() => Dimensions.get('window').height * 0.30, []);
  const listHeaderElement = useMemo(() => {
    // Show header only on main explore (no active search)
    if (!isHeaderVisible || debouncedQuery.length > 0) return null;
    return (
      <View style={{ height: headerHeight, marginTop: -insets.top }}>
        <HeaderBanner headers={headers} />
      </View>
    );
  }, [isHeaderVisible, debouncedQuery.length, headerHeight, insets.top, headers]);

  // Gradient should be visible when searching or when no banner is visible
  const showTopGradient = useMemo(
    () => debouncedQuery.length > 0 || !isHeaderVisible,
    [debouncedQuery.length, isHeaderVisible]
  );

  return (
    <SafeAreaView
      style={[
        styles.container,
        // Allow header to extend into the status bar area
        Platform.OS === 'android' ? { paddingTop: 0 } : null
      ]}
      edges={['left', 'right', 'bottom']}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={'transparent'}
        translucent={true}
      />
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
      <View style={[
        styles.searchContainer, 
        { 
          top: insets.top + 10, 
          zIndex: 20 
        }
      ]}>
        <SearchIcon
          size={24}
          color={Colors.black}
          style={{ transform: [{ scale: 1.2 }, { scaleX: -1 }] }}
        />
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

      {/* Single FlatList for both suggestions and search results to keep header mounted and avoid flicker */}
      {(() => {
        const isSearching = debouncedQuery.length > 0;

        // Build suggestions list data
        const suggestionsList: any[] = (() => {
          if (isLoadingSuggestions || isLoadingSuggestedFeeds || isLoadingSpotlightFeed) {
            return shimmerSuggestedItems as unknown as any[];
          }
          if (suggestionsError || suggestedFeedsError || spotlightFeedError) {
            return [];
          }
          const data: ListItem[] = [];
          if (spotlightFeed && spotlightFeed.length > 0) {
            data.push({ type: 'section-header' as const, title: 'spotlight', key: 'spotlight-header' });
            data.push({ type: 'spotlight-videos' as const, videos: spotlightFeed, key: 'spotlight-videos' });
          }
          if (limitedSuggestedFeeds && limitedSuggestedFeeds.length > 0) {
            data.push({ type: 'section-header' as const, title: 'popular channels', key: 'feeds-header' });
            data.push(...limitedSuggestedFeeds.map(item => ({ type: 'channel' as const, data: item, relevance: 0 })));
          }
          if (allSuggestions && allSuggestions.length > 0) {
            data.push({ type: 'section-header' as const, title: 'suggested accounts', key: 'accounts-header' });
            data.push(...allSuggestions.map(item => ({ type: 'profile' as const, data: item, relevance: 0 })));
          }
          return data;
        })();

        // Build search list data
        const searchList: any[] = isLoadingResults
          ? (shimmerTypes as unknown as any[])
          : (organizedSearchResults as unknown as any[]);

        const listData: any[] = isSearching ? searchList : suggestionsList;

        return (
          <FlatList
            data={listData}
            keyExtractor={(item, index) => {
              if (typeof item === 'string') return `shimmer-${index}`;
              if (item && typeof item === 'object' && 'type' in item) {
                const anyItem: any = item as any;
                if (anyItem.type === 'section-header') return anyItem.key || `${anyItem.title}-${index}`;
                if (anyItem.type === 'spotlight-videos') return anyItem.key || `spotlight-${index}`;
                if (anyItem.type === 'video-grid' || anyItem.type === 'load-more') return anyItem.key || `key-${index}`;
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
            renderItem={({ item }) => {
              if (typeof item === 'string') {
                if (item === 'profile') return <ProfileShimmer />;
                if (item === 'channel') return <ChannelShimmer />;
                return <VideoShimmer />;
              }
              if (item.type === 'section-header') {
                // If title is missing, this is a shimmer placeholder item
                if (!('title' in item) || !item.title) {
                  return <SectionHeaderShimmer />;
                }
                return (
                  <View style={styles.sectionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {typeof item.title === 'string' && item.title.toLowerCase().includes('spotlight') ? (
                        <>
                          <Text style={styles.sectionTitle}>
                            spotlight
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.sectionTitle}>
                          {item.title}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              }
              if (item.type === 'spotlight-videos') {
                // If videos are missing, this is a shimmer placeholder item
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
                              navigation.navigate('FeedModal', {
                                initialIndex: finalIndex,
                                initialUri: videoUri,
                                feedOption: 'search',
                                userDid: undefined,
                                backgroundColor: 'transparent',
                                secondaryColor: Colors.white,
                                searchQuery: '',
                                hasNextPage: false,
                                isFetchingNextPage: false
                              });
                            }
                          }}
                        >
                          <View style={styles.spotlightVideoThumbnailContainer}>
                            {(() => {
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
                                    <Icon name="videocam" size={16} color={Colors.gray} />
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
              // Handle item-level shimmers for profiles/channels/videos represented as objects without data
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
                              <TouchableOpacity
                                key={`combined-profile-${profile.did || profile.handle || index}-${index}`}
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
                                        navigateToUserProfile(navigation, { handle: handle.trim() });
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
                                    <Text style={styles.displayName}>
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
                                  <Text style={styles.handleText}>
                                    @{profile.handle || 'unknown'}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          } else if (result.type === 'channel') {
                            const channel = result.data as Channel;
                            return (
                              <TouchableOpacity
                                key={`combined-channel-${channel.uri || channel.cid || index}-${index}`}
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
                                  <Text style={styles.channelName}>
                                    {channel.displayName || 'Unknown channel'}
                                  </Text>
                                  <Text style={styles.channelCreator}>
                                    by @{channel.creator?.handle || 'unknown'}
                                  </Text>
                                  {channel.likeCount && channel.likeCount > 0 && (
                                    <Text style={styles.channelStats}>
                                      {formatNumber(channel.likeCount)} likes
                                    </Text>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          }
                          return null;
                        })}
                        {isFetchingNextPage && (
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
              return null;
            }}
            ListHeaderComponent={listHeaderElement ?? undefined}
            contentContainerStyle={[
              styles.listContainer,
              {
                // Use safe area + search bar height when searching OR when header not visible on main explore
                paddingTop: (debouncedQuery.length > 0 || !isHeaderVisible)
                  ? (insets.top + 10 + 55 + 10)
                  : insets.top,
                paddingBottom: getBottomNavBarHeight(insets),
              },
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
              if (isSearching && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            removeClippedSubviews={Platform.OS === 'android'}
            maxToRenderPerBatch={10}
            windowSize={21}
            initialNumToRender={15}
            updateCellsBatchingPeriod={30}
            // Removing maintainVisibleContentPosition to avoid initial offset issues on Android/iOS
            // maintainVisibleContentPosition can cause lists to mount with an unintended scroll offset
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
                      <TouchableOpacity style={styles.retryButton} onPress={() => {
                        refetchSuggestions();
                        refetchSuggestedFeeds();
                        refetchSpotlightFeed();
                      }}>
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
            ListFooterComponent={null}
          />
        );
      })()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  headerBannerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 8,
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
    backgroundColor: Colors.white,
    borderRadius: 17,
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
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
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
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
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
    borderRadius: 20,
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
    paddingBottom: 10,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-Bold',
  },


  videoGridContainer: {
    marginTop: 5,
    marginBottom: 10,
    paddingHorizontal: 0,
    marginHorizontal: 0, // Take up full width
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
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
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
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.gray,
    overflow: 'hidden' as const,
  },
  videoThumbnailPlaceholder: {
    width: 45,
    height: 80,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.gray,
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
    borderRadius: 8,
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
    width: 85,
    marginRight: 12,
  },
  spotlightVideoThumbnailContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  spotlightVideoThumbnail: {
    width: 85,
    height: 151, // 9:16 aspect ratio (85 * 16/9)
    borderRadius: 12,
    overflow: 'hidden' as const,
  },
  spotlightVideoThumbnailPlaceholder: {
    width: 85,
    height: 151, // 9:16 aspect ratio (85 * 16/9)
    borderRadius: 12,
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
    borderRadius: 12,
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
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray,
  },
  gridHeaderTitle: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
  },
  viewModeButton: {
    padding: 6,
    borderRadius: 50,
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



});

export default ExploreScreen;