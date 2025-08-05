/**
 * Streamlined Video Utilities
 * Consolidated and optimized video processing functions
 */

export interface VideoEmbed {
  $type: string;
  playlist?: string | string[];
  media?: VideoEmbed;
  thumbnail?: string;
}

// Optimized cache for video extraction results
const videoExtractionCache = new Map<string, { videoEmbed: any; videoUrl: string | null }>();

// Performance monitoring for video operations
class VideoPerformanceMonitor {
  private static metrics = new Map<string, number>();
  
  static startTimer(operation: string): number {
    const startTime = performance.now();
    this.metrics.set(operation, startTime);
    return startTime;
  }
  
  static endTimer(operation: string): number {
    const startTime = this.metrics.get(operation);
    if (!startTime) return 0;
    
    const duration = performance.now() - startTime;
    this.metrics.delete(operation);
    return duration;
  }
  
  static logPerformance(operation: string, duration: number) {
    if (__DEV__ && duration > 10) { // Log only slow operations
      console.log(`[VideoPerformance] ${operation}: ${duration.toFixed(2)}ms`);
    }
  }
}

/**
 * Extracts the video URL from a post embed object.
 * @param embed The embed object from a post
 * @returns The video URL string, or null if not found
 */
export function extractVideoUrl(embed: any): string | null {
  if (!embed) return null;
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    const recordEmbed = embed as VideoEmbed;
    if (recordEmbed.media?.$type && recordEmbed.media.$type.includes('video')) {
      const videoEmbed = recordEmbed.media;
      return Array.isArray(videoEmbed.playlist)
        ? videoEmbed.playlist[0]
        : videoEmbed.playlist || null;
    }
  } else if (embed.$type && embed.$type.includes('video')) {
    return Array.isArray(embed.playlist)
      ? embed.playlist[0]
      : embed.playlist || null;
  }
  return null;
}

/**
 * Extract video embed and URL from a post in a single operation
 * @param post The post object
 * @returns Object containing videoEmbed and videoUrl
 */
export function extractVideoEmbedAndUrl(post: any): { videoEmbed: any; videoUrl: string | null } {
  const startTime = VideoPerformanceMonitor.startTimer('extractVideoEmbedAndUrl');
  
  // Create a cache key based on post URI and embed
  const cacheKey = `${post?.uri}-${JSON.stringify(post?.embed)}`;
  
  // Check cache first
  if (videoExtractionCache.has(cacheKey)) {
    VideoPerformanceMonitor.endTimer('extractVideoEmbedAndUrl');
    return videoExtractionCache.get(cacheKey)!;
  }
  
  let videoEmbed: any = null;
  
  if (post?.embed) {
    if (post.embed.$type === 'app.bsky.embed.recordWithMedia#view') {
      const recordEmbed = post.embed;
      if (recordEmbed.media?.$type && recordEmbed.media.$type.includes('video')) {
        videoEmbed = recordEmbed.media;
      }
    } else {
      videoEmbed = post.embed;
    }
  }

  const videoUrl = extractVideoUrl(videoEmbed);
  const result = { videoEmbed, videoUrl };
  
  // Cache the result
  videoExtractionCache.set(cacheKey, result);
  
  // Limit cache size to prevent memory leaks
  if (videoExtractionCache.size > 1000) {
    const firstKey = videoExtractionCache.keys().next().value;
    if (firstKey !== undefined) {
      videoExtractionCache.delete(firstKey);
    }
  }
  
  const duration = VideoPerformanceMonitor.endTimer('extractVideoEmbedAndUrl');
  VideoPerformanceMonitor.logPerformance('extractVideoEmbedAndUrl', duration);
  
  return result;
}

/**
 * Debug function to test video URL extraction
 * @param embed The embed object to test
 * @returns Debug information about the embed
 */
export function debugVideoExtraction(embed: any): {
  hasEmbed: boolean;
  embedType: string | null;
  hasMedia: boolean;
  mediaType: string | null;
  videoUrl: string | null;
  isVideo: boolean;
} {
  const hasEmbed = !!embed;
  const embedType = embed?.$type || null;
  const hasMedia = !!embed?.media;
  const mediaType = embed?.media?.$type || null;
  const videoUrl = extractVideoUrl(embed);
  const isVideo = false; // No longer filtering here, rely on AtprotoService
  
  return {
    hasEmbed,
    embedType,
    hasMedia,
    mediaType,
    videoUrl,
    isVideo
  };
}

/**
 * Extracts the video thumbnail URL from a post embed object.
 * @param embed The embed object from a post
 * @returns The thumbnail URL string, or null if not found
 */
export function extractVideoThumbnail(embed: any): string | null {
  if (!embed) return null;
  // Handle recordWithMedia wrapper
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    const recordEmbed = embed as VideoEmbed;
    if (recordEmbed.media?.$type && recordEmbed.media.$type.includes('video')) {
      const videoEmbed = recordEmbed.media;
      return videoEmbed.thumbnail || null;
    }
  } else if (embed.$type && embed.$type.includes('video')) {
    return embed.thumbnail || null;
  }
  return null;
}

