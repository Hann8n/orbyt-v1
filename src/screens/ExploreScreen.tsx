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
import { BRAND, TEXT, INTERACTIVE, UI, STATUS } from '../utils/formatting/Colors';
import VerificationBadge from '../components/features/verification/VerificationBadge';
import EmptyFeed from '../components/features/feed/EmptyFeed';
import { queryKeys } from '../services/queryKeys';
import { getBottomNavBarHeight } from '../utils/helpers/screenSize';

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
}

interface SearchResult {
  type: 'profile' | 'channel';
  data: Profile | Channel;
  relevance: number;
}

interface SectionHeader {
  type: 'section-header';
  title: string;
  key: string;
}

type ListItem = SearchResult | SectionHeader;



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
const SectionHeaderShimmer = () => (
  <View style={styles.sectionHeader}>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 140, height: 18, borderRadius: 3 }}
      shimmerColors={UI.SHIMMER}
    />
  </View>
);

const ExploreScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isScrolling, setIsScrolling] = useState(false);
  const [allSuggestions, setAllSuggestions] = useState<any[]>([]);
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

  // Unified search function that combines profiles and channels
  const performUnifiedSearch = useCallback(async (query: string, pageParam?: string | null) => {
    if (!query || query.trim() === '') {
      return { results: [], cursor: null };
    }

    try {
      // Search for both profiles and channels in parallel
      const [profilesResponse, channelsResponse] = await Promise.all([
        AtprotoService.searchProfilesPaginated(query, pageParam as string | null),
        AtprotoService.searchPopularFeeds(query, 10)
      ]);

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

      // Combine and sort by relevance
      const allResults = [...processedProfiles, ...processedChannels]
        .sort((a, b) => b.relevance - a.relevance);

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
  const calculateRelevance = (item: any, query: string, type: 'profile' | 'channel'): number => {
    const queryLower = query.toLowerCase();
    let score = 0;

    if (type === 'profile') {
      // Profile relevance scoring
      if (item.handle?.toLowerCase().includes(queryLower)) score += 10;
      if (item.displayName?.toLowerCase().includes(queryLower)) score += 8;
      if (item.description?.toLowerCase().includes(queryLower)) score += 5;
      if (item.viewer?.followedBy) score += 3; // Boost followed profiles
    } else {
      // Channel relevance scoring
      if (item.displayName?.toLowerCase().includes(queryLower)) score += 10;
      if (item.description?.toLowerCase().includes(queryLower)) score += 8;
      if (item.creator?.handle?.toLowerCase().includes(queryLower)) score += 6;
      if (item.likeCount && item.likeCount > 100) score += 2; // Boost popular channels
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

  // Batch prefetch profiles and channels when search results change
  useEffect(() => {
    if (searchResults.length > 0) {
      const profiles = searchResults
        .filter(result => result.type === 'profile')
        .map(result => result.data as Profile);
      
      const channels = searchResults
        .filter(result => result.type === 'channel')
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

  // Create shimmer placeholders for loading state
  const shimmerItems = useMemo(() => {
    return Array(6).fill(0);
  }, []);

  // Create shimmer items for suggested content with section headers
  const shimmerSuggestedItems = useMemo(() => {
    return [
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

  // Render each search result item
  const renderSearchResult = useCallback(({ item }: { item: SearchResult }) => {
    if (item.type === 'profile') {
      const profile = item.data as Profile;
      
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
              <Text style={styles.displayName}>
                {profile.displayName || profile.handle || 'Unknown user'}
              </Text>
              {profile.handle && profile.handle.trim() && profile.handle.length > 0 && (
                <VerificationBadge 
                  handle={profile.handle.trim()} 
                  size={12} 
                  style={{marginLeft: 4}}
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
    } else {
      const channel = item.data as Channel;
      
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
            <Text style={styles.channelName}>
              {channel.displayName || 'Unknown channel'}
            </Text>
            <Text style={styles.channelCreator}>
              by @{channel.creator?.handle || 'unknown'}
            </Text>
            {channel.likeCount && channel.likeCount > 0 && (
              <Text style={styles.channelStats}>
                {channel.likeCount} likes
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }
  }, [navigation, queryClient]);

  const isLoadingResults = isLoading || isFetching && !isFetchingNextPage;

  // Fetch suggested accounts when there is no search query
  const {
    data: suggestedAccounts,
    isLoading: isLoadingSuggestions,
    error: suggestionsError,
    refetch: refetchSuggestions,
  } = useQuery({
    queryKey: ['suggestedAccounts', 5],
    queryFn: () => AtprotoService.getSuggestedAccounts(5),
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
    queryFn: () => AtprotoService.getSuggestedFeeds(8),
    enabled: debouncedQuery.length === 0,
    staleTime: 60 * 1000, // 1 minute
  });

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
      {/* Search Bar Background */}
      <View style={[styles.searchBarBackground, { top: insets.top, height: insets.top + 5 }]} />
      {/* Search Bar */}
      <View style={[styles.searchContainer, { top: insets.top + 15, zIndex: 10 }]}>
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
          {isLoadingSuggestions || isLoadingSuggestedFeeds ? (
            <FlatList
              data={shimmerSuggestedItems}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => {
                if (item.type === 'section-header') {
                  return <SectionHeaderShimmer />;
                } else if (item.type === 'feed') {
                  return <FeedShimmer />;
                } else {
                  return <ProfileShimmer />;
                }
              }}
              contentContainerStyle={[styles.listContainer, { paddingTop: 70, paddingBottom: getBottomNavBarHeight(insets)}]}
              scrollEnabled={true}
            />
          ) : (suggestionsError || suggestedFeedsError) ? (
            <View style={styles.errorContainer}>
              <EmptyFeed type="no-connection" />
              <TouchableOpacity style={styles.retryButton} onPress={() => {
                refetchSuggestions();
                refetchSuggestedFeeds();
              }}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (allSuggestions && allSuggestions.length > 0) || (suggestedFeeds && suggestedFeeds.length > 0) ? (
            <FlatList
              data={[
                // Section header for feeds
                ...(suggestedFeeds && suggestedFeeds.length > 0 ? [
                  { type: 'section-header' as const, title: 'Popular channels', key: 'feeds-header' },
                  ...suggestedFeeds.map(item => ({ type: 'channel' as const, data: item, relevance: 0 }))
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
                      <Text style={styles.sectionTitle}>{item.title}</Text>
                    </View>
                  );
                }
                return renderSearchResult({ item });
              }}
              contentContainerStyle={[styles.listContainer, { paddingTop: 70, paddingBottom: getBottomNavBarHeight(insets) }]}
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
      {(searchResults.length > 0 || isLoadingResults || (searchQuery.length > 0 && debouncedQuery.length > 0)) && (
        <FlatList
          data={isLoadingResults ? shimmerItems : searchResults}
          keyExtractor={(item, index) => isLoadingResults ? `shimmer-${index}` : `${item.type}-${item.type === 'profile' ? (item.data as Profile).did : (item.data as Channel).uri}-${index}`}
          renderItem={isLoadingResults ? ({ item, index }) => {
            // Alternate between profile and channel shimmer for search results
            return index % 2 === 0 ? <ProfileShimmer /> : <ChannelShimmer />;
          } : renderSearchResult}
          contentContainerStyle={[
            styles.listContainer, 
            { paddingTop: 70, paddingBottom: getBottomNavBarHeight(insets) },
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
              <Text style={styles.noResults}>No results found</Text>
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
  searchBarBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: BRAND.PRIMARY,
    zIndex: 1,
  },
  listContainer: {
    paddingHorizontal: 20,
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
    paddingHorizontal: 0,
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
    fontWeight: 'bold',
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
    paddingHorizontal: 0,
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
    fontWeight: 'bold',
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
    fontFamily: 'Firma-Regular',
  },
  initialStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialStateText: {
    color: TEXT.TERTIARY,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
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
    paddingHorizontal: 0,
    paddingTop: 15,
    paddingBottom: 10,
  },
  sectionTitle: {
    color: TEXT.PRIMARY,
    fontSize: 18,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
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
    paddingHorizontal: 0,
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

});

export default ExploreScreen;