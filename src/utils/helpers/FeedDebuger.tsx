/**
 * FeedDebugger Component
 * Displays real-time debugging information about feed hydration, infinite query state, and scroll position
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { feedService, createQueryKeys } from '../../services/FeedService';
import ProfileCache from '../../services/cache/ProfileCache';
import ChannelCache from '../../services/cache/ChannelCache';

interface FeedDebuggerProps {
  feedOption: string;
  userDid?: string;
  isVisible?: boolean;
  onToggle?: () => void;
  scrollInfo?: {
    scrollY: number;
    scrollProgress: number;
    isNearEnd: boolean;
  };
}

interface DebugInfo {
  // Feed state
  feedLength: number;
  pagesCount: number;
  totalItems: number;
  
  // Infinite query state
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetching: boolean;
  isError: boolean;
  error: string | null;
  
  // Scroll position
  scrollY: number;
  scrollProgress: number;
  isNearEnd: boolean;
  

  
  // Cache state
  cacheKeys: string[];
  cacheSize: number;
  
  // Performance
  lastFetchTime: number;
  averageFetchTime: number;
}

const FeedDebugger: React.FC<FeedDebuggerProps> = ({
  feedOption,
  userDid,
  isVisible = false,
  onToggle,
  scrollInfo,
}) => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
            feedLength: 0,
        pagesCount: 0,
        totalItems: 0,
        hasNextPage: false,
        isFetchingNextPage: false,
        isFetching: false,
        isError: false,
        error: null,
        scrollY: 0,
        scrollProgress: 0,
        isNearEnd: false,
        cacheKeys: [],
        cacheSize: 0,
        lastFetchTime: 0,
        averageFetchTime: 0,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const queryClient = useQueryClient();
  const prevPagesCountRef = useRef<number>(0);

  // Update debug info every 500ms
  useEffect(() => {
    if (!isVisible) return;

    const updateDebugInfo = () => {
      const queryKey = createQueryKeys.feed.infinite(feedOption, userDid);
      const query = queryClient.getQueryData(queryKey) as any;
      
      // Get feed data
      const feed = feedService.getCurrentFeed();
      const pages = query?.pages || [];
      
      // Get infinite query state
      const infiniteQuery = queryClient.getQueryState(queryKey) as any;
      
      // Get cache info
      const cache = queryClient.getQueryCache();
      const cacheKeys = Array.from(cache.getAll()).map(q => q.queryKey[0] as string);
      
      // Derive state
      const currentPagesCount = pages.length;
      const lastPage = currentPagesCount > 0 ? pages[currentPagesCount - 1] : null;
      const hasNextPage = Boolean(lastPage && lastPage.cursor);
      const isFetching = infiniteQuery?.fetchStatus === 'fetching';
      const isError = Boolean(infiniteQuery?.status === 'error' || infiniteQuery?.fetchFailureCount > 0 || infiniteQuery?.error);
      const errorMessage = infiniteQuery?.error ? String(infiniteQuery.error.message || infiniteQuery.error) : null;
      // Heuristic: treat fetch while we already had at least one page as next-page fetching
      const isFetchingNextPage = Boolean(isFetching && prevPagesCountRef.current > 0);

      setDebugInfo({
        feedLength: feed.length,
        pagesCount: currentPagesCount,
        totalItems: pages.reduce((acc: number, page: any) => acc + (page.feed?.length || 0), 0),
        hasNextPage,
        isFetchingNextPage,
        isFetching,
        isError,
        error: errorMessage,
        scrollY: scrollInfo?.scrollY || 0,
        scrollProgress: scrollInfo?.scrollProgress || 0,
        isNearEnd: scrollInfo?.isNearEnd || false,
        cacheKeys: [...new Set(cacheKeys)].slice(0, 10), // Show first 10 unique keys
        cacheSize: cache.getAll().length,
        lastFetchTime: infiniteQuery?.dataUpdatedAt || 0,
        averageFetchTime: 0, // Could be calculated from multiple fetches
      });
      prevPagesCountRef.current = currentPagesCount;
    };

    const interval = setInterval(updateDebugInfo, 500);
    updateDebugInfo(); // Initial update

    return () => clearInterval(interval);
  }, [isVisible, feedOption, userDid, queryClient, scrollInfo]);

  if (!isVisible) return null;

  const formatTime = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'fetching': return '#FFA500';
      case 'queued': return '#00B2FF';
      case 'error': return '#FF0000';
      case 'success': return '#00FF00';
      default: return '#888888';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity 
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Text style={styles.headerText}>
          🔍 Feed Debugger - {feedOption}
        </Text>
        <Text style={styles.toggleText}>
          {isExpanded ? '▼' : '▶'}
        </Text>
      </TouchableOpacity>

      {isExpanded && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Feed State */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Feed State</Text>
            <Text style={styles.infoText}>Feed Length: {debugInfo.feedLength}</Text>
            <Text style={styles.infoText}>Pages Count: {debugInfo.pagesCount}</Text>
            <Text style={styles.infoText}>Total Items: {debugInfo.totalItems}</Text>
          </View>

          {/* Infinite Query State */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔄 Infinite Query</Text>
            <Text style={[styles.infoText, { color: debugInfo.hasNextPage ? '#00FF00' : '#FF0000' }]}>
              Has Next Page: {debugInfo.hasNextPage ? 'Yes' : 'No'}
            </Text>
            <Text style={[styles.infoText, { color: debugInfo.isFetchingNextPage ? '#FFA500' : '#888888' }]}>
              Fetching Next: {debugInfo.isFetchingNextPage ? 'Yes' : 'No'}
            </Text>
            <Text style={[styles.infoText, { color: debugInfo.isFetching ? '#FFA500' : '#888888' }]}>
              Is Fetching: {debugInfo.isFetching ? 'Yes' : 'No'}
            </Text>
            <Text style={[styles.infoText, { color: debugInfo.isError ? '#FF0000' : '#00FF00' }]}>
              Has Error: {debugInfo.isError ? 'Yes' : 'No'}
            </Text>
            {debugInfo.error && (
              <Text style={[styles.infoText, { color: '#FF0000' }]}>
                Error: {debugInfo.error}
              </Text>
            )}
          </View>

          {/* Scroll Position */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📏 Scroll Position</Text>
            <Text style={styles.infoText}>Scroll Y: {Math.round(debugInfo.scrollY)}</Text>
            <Text style={styles.infoText}>Progress: {(debugInfo.scrollProgress * 100).toFixed(1)}%</Text>
            <Text style={[styles.infoText, { color: debugInfo.isNearEnd ? '#FFA500' : '#888888' }]}>
              Near End: {debugInfo.isNearEnd ? 'Yes' : 'No'}
            </Text>
          </View>



          {/* Cache State */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💾 Cache State</Text>
            <Text style={styles.infoText}>Cache Size: {debugInfo.cacheSize}</Text>
            <Text style={styles.infoText}>Last Fetch: {formatTime(debugInfo.lastFetchTime)}</Text>
            <Text style={styles.infoText}>Cache Keys:</Text>
            {debugInfo.cacheKeys.map((key, index) => (
              <Text key={index} style={styles.cacheKeyText}>  • {key}</Text>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔧 Actions</Text>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={async () => {
                try {
                  console.log('[FeedDebugger] Invalidating all cache related to feed:', feedOption);
                  
                  // 1. Invalidate the main feed query
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.infinite(feedOption, userDid) });
                  
                  // 2. Invalidate all feed-related queries for this feed option
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.byOption(feedOption) });
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.byUser(feedOption, userDid) });
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.batch(feedOption, userDid) });
                  
                  // 3. If this is a channel feed (starts with at://), invalidate channel cache
                  if (feedOption.startsWith('at://')) {
                    await ChannelCache.invalidateChannel(feedOption);
                    queryClient.invalidateQueries({ queryKey: createQueryKeys.feeds.detail(feedOption) });
                    queryClient.invalidateQueries({ queryKey: createQueryKeys.feeds.infinite(feedOption) });
                  }
                  
                  // 4. If this is a profile feed, invalidate profile cache
                  if (feedOption === 'profile' && userDid) {
                    // Get current feed to extract profile handles
                    const currentFeed = feedService.getCurrentFeed();
                    const profileHandles = new Set<string>();
                    
                    // Extract unique profile handles from current feed
                    currentFeed.forEach(item => {
                      if (item.post?.author?.handle) {
                        profileHandles.add(item.post.author.handle);
                      }
                      if (item.reason?.by?.handle) {
                        profileHandles.add(item.reason.by.handle);
                      }
                    });
                    
                    // Invalidate profile cache for all handles in the feed
                    for (const handle of profileHandles) {
                      await ProfileCache.invalidateProfile(handle);
                      queryClient.invalidateQueries({ queryKey: createQueryKeys.profiles.detail(handle) });
                    }
                  }
                  
                  // 5. Clear the feed state manager's current feed
                  feedService.clearCurrentFeed();
                  
                  // 6. Invalidate any related search queries that might be cached
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.search.all });
                  
                  console.log('[FeedDebugger] Cache invalidation completed');
                } catch (error) {
                  console.error('[FeedDebugger] Error during cache invalidation:', error);
                }
              }}
            >
              <Text style={styles.actionButtonText}>Invalidate All Cache</Text>
            </TouchableOpacity>



          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 10,
    width: 300,
    maxHeight: 400,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  toggleText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  content: {
    maxHeight: 350,
  },
  section: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 10,
    marginBottom: 2,
  },
  cacheKeyText: {
    color: '#CCCCCC',
    fontSize: 9,
    marginBottom: 1,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 6,
    borderRadius: 4,
    marginBottom: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    textAlign: 'center',
  },
});

export default FeedDebugger;
