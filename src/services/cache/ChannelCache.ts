import AsyncStorage from '@react-native-async-storage/async-storage';
import AtprotoService from '../api/AtprotoService';
import { extractColorsFromImage, isColorDark } from '../../utils/formatting/colorUtils';
import { 
  useQuery, 
  useMutation,
  useQueryClient, 
  QueryKey,
  UseQueryResult,
  QueryFunction
} from '@tanstack/react-query';
import { useCallback } from 'react';

export interface CachedChannel {
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
  channelColors?: {
    backgroundColor: string;
    foregroundColor: string;
    statusBarStyle: 'light' | 'dark';
  };
  lastUpdated: number; // timestamp
}

// Type for channel colors returned by the hook
export interface ChannelColorScheme {
  backgroundColor: string;
  foregroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  statusBarStyle: 'light' | 'dark';
}

// Query keys for React Query
export const channelKeys = {
  all: ['channels'] as const,
  detail: (uri: string) => [...channelKeys.all, 'detail', uri] as const,
  colors: (uri: string) => [...channelKeys.all, 'colors', uri] as const,
};

class ChannelCache {
  private static memoryCache = new Map<string, CachedChannel>();
  private static subscribers = new Map<string, Set<() => void>>();
  private static DEBUG = false;

  // Cache expiration time (1 hour)
  private static CACHE_EXPIRY = 60 * 60 * 1000;

  /**
   * Get cache key for AsyncStorage
   */
  private static getCacheKey(uri: string): string {
    return `channel_${uri}`;
  }

  /**
   * Check if cache is still valid
   */
  private static isCacheValid(cachedChannel: CachedChannel): boolean {
    return Date.now() - cachedChannel.lastUpdated < this.CACHE_EXPIRY;
  }

  /**
   * Notify subscribers of channel updates
   */
  private static notifyChannelUpdated(uri: string): void {
    const subscribers = this.subscribers.get(uri);
    if (subscribers) {
      subscribers.forEach(callback => callback());
    }
  }

  /**
   * Subscribe to channel updates
   */
  static subscribe(uri: string, callback: () => void): () => void {
    if (!this.subscribers.has(uri)) {
      this.subscribers.set(uri, new Set());
    }
    this.subscribers.get(uri)!.add(callback);

    return () => {
      const subscribers = this.subscribers.get(uri);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(uri);
        }
      }
    };
  }

  /**
   * Get channel from memory cache
   */
  static getChannelFromCacheSync(uri: string): CachedChannel | null {
    const normalizedUri = uri.toLowerCase();
    const cached = this.memoryCache.get(normalizedUri);
    return cached && this.isCacheValid(cached) ? cached : null;
  }

  /**
   * Get channel from persistent cache
   */
  static async getChannelFromCache(uri: string): Promise<CachedChannel | null> {
    if (!uri) return null;
    
    try {
      const normalizedUri = uri.toLowerCase();
      const cached = await AsyncStorage.getItem(this.getCacheKey(normalizedUri));
      
      if (cached) {
        const parsed = JSON.parse(cached) as CachedChannel;
        if (this.isCacheValid(parsed)) {
          // Update memory cache
          this.memoryCache.set(normalizedUri, parsed);
          return parsed;
        }
      }
    } catch (error) {
      console.error('[ChannelCache] Error reading from cache:', error);
    }
    
    return null;
  }

  /**
   * Fetch and cache a channel
   */
  static async getChannel(uri: string): Promise<CachedChannel | null> {
    if (!uri) return null;

    // Check memory cache first
    const memoryCached = this.getChannelFromCacheSync(uri);
    if (memoryCached) {
      return memoryCached;
    }

    // Check persistent cache
    const cached = await this.getChannelFromCache(uri);
    if (cached) {
      return cached;
    }

    // Fetch from API
    return this.fetchAndCacheChannel(uri);
  }

  /**
   * Fetch a channel from the API and cache it
   */
  private static async fetchAndCacheChannel(uri: string): Promise<CachedChannel | null> {
    if (!uri) return null;
    
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            if (this.DEBUG) {
              console.log(`ChannelCache: Fetching channel for ${uri}`);
            }
            
            const normalizedUri = uri.toLowerCase();
            const channel = await AtprotoService.getFeedGenerator(uri);
            if (!channel) {
              resolve(null);
              return;
            }

            let channelColors = undefined;
            if (channel.avatar) {
              try {
                channelColors = await extractColorsFromImage(channel.avatar);
              } catch (e) {
                console.error('[ChannelCache] Error extracting colors:', e);
              }
            }

            const cacheObject: CachedChannel = {
              uri: channel.uri,
              cid: channel.cid,
              did: channel.did,
              creator: channel.creator,
              displayName: channel.displayName,
              description: channel.description,
              avatar: channel.avatar,
              likeCount: channel.likeCount,
              indexedAt: channel.indexedAt,
              channelColors: channelColors ? {
                backgroundColor: channelColors.backgroundColor,
                foregroundColor: channelColors.foregroundColor,
                statusBarStyle: channelColors.statusBarStyle,
              } : undefined,
              lastUpdated: Date.now()
            };

            // Update caches in background
            this.memoryCache.set(normalizedUri, cacheObject);
            
            requestAnimationFrame(() => {
              setTimeout(() => {
                AsyncStorage.setItem(
                  this.getCacheKey(normalizedUri),
                  JSON.stringify(cacheObject)
                ).catch(error => {
                  console.warn('Error storing channel in cache:', error);
                });
                
                this.notifyChannelUpdated(normalizedUri);
              }, 0);
            });

            resolve(cacheObject);
          } catch (error) {
            console.warn(`ChannelCache: Error fetching and caching channel for ${uri}:`, error);
            resolve(null);
          }
        }, 0);
      });
    });
  }

  /**
   * Update the channel colors
   */
  static async updateChannelColors(
    uri: string,
    backgroundColor: string,
    foregroundColor: string
  ): Promise<void> {
    if (!uri) return;
    
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            const normalizedUri = uri.toLowerCase();
            
            // Check memory cache first
            let cachedChannel = this.memoryCache.get(normalizedUri);
            
            // If not in memory, check storage
            if (!cachedChannel) {
              cachedChannel = (await this.getChannelFromCache(normalizedUri)) || undefined;
            }
            
            if (cachedChannel) {
              // Create a new colors object to avoid direct reference mutation
              cachedChannel.channelColors = {
                backgroundColor,
                foregroundColor,
                statusBarStyle: isColorDark(backgroundColor) ? 'light' : 'dark'
              };
              
              cachedChannel.lastUpdated = Date.now();
              
              // Update both memory and storage
              this.memoryCache.set(normalizedUri, {...cachedChannel});
              await AsyncStorage.setItem(this.getCacheKey(normalizedUri), JSON.stringify(cachedChannel));
              
              // Notify subscribers of a channel update
              this.notifyChannelUpdated(normalizedUri);
            }
            resolve();
          } catch (error) {
            console.error('[ChannelCache] Error updating channel colors:', error);
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Pre-cache a list of channels
   * Optimized to avoid redundant network requests
   */
  static async cacheChannels(channels: any[]): Promise<void> {
    if (!channels || channels.length === 0) return;

    return new Promise((resolve) => {
      // Move batch operations to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            // Process channels with controlled concurrency in smaller batches
            const batchSize = 3;
            for (let i = 0; i < channels.length; i += batchSize) {
              const batch = channels.slice(i, i + batchSize);
              
              await Promise.all(batch.map(async (channel) => {
                const uri = channel.uri;
                if (!uri) return;
                
                const normalizedUri = uri.toLowerCase();

                // Skip if already in memory cache and valid
                const memoryCached = this.memoryCache.get(normalizedUri);
                if (memoryCached && this.isCacheValid(memoryCached)) {
                  return;
                }
                
                // Skip if already in AsyncStorage cache and valid
                const cachedChannel = await this.getChannelFromCache(normalizedUri);
                if (cachedChannel && this.isCacheValid(cachedChannel)) {
                  this.memoryCache.set(normalizedUri, cachedChannel);
                  return;
                }

                // Extract channel colors
                let channelColors = undefined;
                try {
                  if (channel.avatar) {
                    channelColors = await extractColorsFromImage(channel.avatar);
                  }
                } catch (e) {
                  console.error('[ChannelCache] Error extracting colors:', e);
                }

                const cacheObject: CachedChannel = {
                  uri: channel.uri,
                  cid: channel.cid,
                  did: channel.did,
                  creator: channel.creator,
                  displayName: channel.displayName,
                  description: channel.description,
                  avatar: channel.avatar,
                  likeCount: channel.likeCount,
                  indexedAt: channel.indexedAt,
                  channelColors: channelColors ? {
                    backgroundColor: channelColors.backgroundColor,
                    foregroundColor: channelColors.foregroundColor,
                    statusBarStyle: channelColors.statusBarStyle,
                  } : undefined,
                  lastUpdated: Date.now()
                };

                // Save to both memory and persistent cache
                this.memoryCache.set(normalizedUri, cacheObject);
                await AsyncStorage.setItem(this.getCacheKey(normalizedUri), JSON.stringify(cacheObject));
                
                // Notify subscribers of a channel update
                this.notifyChannelUpdated(normalizedUri);
              }));
            }
            resolve();
          } catch (error) {
            console.error('[ChannelCache] Error in cacheChannels:', error);
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Batch prefetch channels from feed data
   * This is the most efficient way to prefetch channels - extracts all unique URIs
   * from feed items and prefetches them in one operation
   * @param feedItems - Array of feed items containing channel data
   */
  static async batchPrefetchFromFeed(feedItems: any[]): Promise<void> {
    if (!feedItems || feedItems.length === 0) return;

    return new Promise((resolve) => {
      // Move batch operations to background
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            // Extract all unique URIs from feed items
            const uniqueUris = new Set<string>();
            
            feedItems.forEach(item => {
              // Handle feed items with channel structure
              if (item.uri) {
                uniqueUris.add(item.uri.toLowerCase());
              }
              
              // Handle search result structure
              if (item.data?.uri) {
                uniqueUris.add(item.data.uri.toLowerCase());
              }
              
              // Handle direct channel structure
              if (item.channel?.uri) {
                uniqueUris.add(item.channel.uri.toLowerCase());
              }
            });

            // Convert to array and filter out empty URIs
            const urisToPrefetch = Array.from(uniqueUris).filter(uri => uri && uri.trim() !== '');
            
            if (urisToPrefetch.length === 0) {
              resolve();
              return;
            }

            // Check how many are already cached
            const alreadyCached = urisToPrefetch.filter(uri => {
              const cached = this.getChannelFromCacheSync(uri);
              return cached && this.isCacheValid(cached);
            }).length;

            const needsFetching = urisToPrefetch.length - alreadyCached;

            if (this.DEBUG) {
              console.log(`[ChannelCache] Batch prefetching ${urisToPrefetch.length} channels (${alreadyCached} cached, ${needsFetching} new)`);
            }

            // Process URIs in smaller batches to avoid overwhelming the API
            const batchSize = 5;
            for (let i = 0; i < urisToPrefetch.length; i += batchSize) {
              const batch = urisToPrefetch.slice(i, i + batchSize);
              
              await Promise.allSettled(batch.map(async (uri) => {
                try {
                  // Check if already cached first
                  const cached = this.getChannelFromCacheSync(uri);
                  if (cached && this.isCacheValid(cached)) {
                    return; // Already cached and valid
                  }
                  
                  // Fetch and cache the channel
                  await this.getChannel(uri);
                } catch (error) {
                  console.warn(`[ChannelCache] Error prefetching channel ${uri}:`, error);
                }
              }));
            }

            if (this.DEBUG) {
              console.log(`[ChannelCache] Batch prefetch completed for ${urisToPrefetch.length} channels`);
            }
            
            resolve();
          } catch (error) {
            console.error('[ChannelCache] Error in batch prefetch:', error);
            resolve();
          }
        }, 0);
      });
    });
  }

  /**
   * Clear all cached data
   */
  static async clearCache(): Promise<void> {
    try {
      this.memoryCache.clear();
      const keys = await AsyncStorage.getAllKeys();
      const channelKeys = keys.filter(key => key.startsWith('channel_'));
      if (channelKeys.length > 0) {
        await AsyncStorage.multiRemove(channelKeys);
      }
    } catch (error) {
      console.error('[ChannelCache] Error clearing cache:', error);
    }
  }

  /**
   * Invalidate a specific channel cache
   */
  static async invalidateChannel(uri: string): Promise<void> {
    if (!uri) return;
    
    try {
      const normalizedUri = uri.toLowerCase();
      this.memoryCache.delete(normalizedUri);
      await AsyncStorage.removeItem(this.getCacheKey(normalizedUri));
      this.notifyChannelUpdated(normalizedUri);
    } catch (error) {
      console.error('[ChannelCache] Error invalidating channel:', error);
    }
  }
}

/**
 * Hook to fetch channel data
 */
export function useChannel(uri: string | null | undefined): UseQueryResult<CachedChannel | null> {
  return useQuery({
    queryKey: channelKeys.detail(uri || ''),
    queryFn: () => ChannelCache.getChannel(uri || ''),
    enabled: !!uri,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch just the channel colors
 */
export function useChannelColors(uri: string | null | undefined) {
  const { data: channel } = useChannel(uri);
  
  const colors: ChannelColorScheme = {
    backgroundColor: channel?.channelColors?.backgroundColor || '#000000',
    foregroundColor: channel?.channelColors?.foregroundColor || '#FFFFFF',
    textColor: channel?.channelColors?.foregroundColor || '#FFFFFF',
    primaryColor: channel?.channelColors?.backgroundColor || '#000000',
    secondaryColor: channel?.channelColors?.foregroundColor || '#FFFFFF',
    statusBarStyle: channel?.channelColors?.statusBarStyle || 'light',
  };
  
  return {
    colors,
    isLoading: !channel,
    getColorWithOpacity: (colorKey: keyof ChannelColorScheme, opacity: number): string => {
      const hex = colors[colorKey];
      if (hex.startsWith('#')) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      return hex;
    }
  };
}

/**
 * Hook to update channel colors with React Query integration
 */
export function useChannelColorsMutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      uri, 
      backgroundColor, 
      foregroundColor 
    }: { 
      uri: string, 
      backgroundColor: string, 
      foregroundColor: string 
    }) => {
      await ChannelCache.updateChannelColors(uri, backgroundColor, foregroundColor);
      return { uri, backgroundColor, foregroundColor };
    },
    onSuccess: (_, { uri }) => {
      // Invalidate the specific channel query to refetch with new colors
      queryClient.invalidateQueries({ queryKey: channelKeys.detail(uri) });
    },
  });
}

/**
 * Hook to invalidate channel cache
 */
export function useChannelInvalidation() {
  const queryClient = useQueryClient();
  
  return useCallback((uri: string) => {
    queryClient.invalidateQueries({ queryKey: channelKeys.detail(uri) });
  }, [queryClient]);
}

export default ChannelCache; 