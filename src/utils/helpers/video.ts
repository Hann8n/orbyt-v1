/**
 * Simplified Video Utilities
 * Optimized for immediate playback when visible
 */

export interface VideoEmbed {
  $type: string;
  playlist?: string | string[];
  media?: VideoEmbed;
  thumbnail?: string;
  aspectRatio?: {
    width: number;
    height: number;
  };
}

// Simple cache for video extraction - only cache what's needed
const videoCache = new Map<string, { videoEmbed: any; videoUrl: string | null }>();
const MAX_CACHE_SIZE = 100;

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
  const cacheKey = post?.uri;
  
  // Check cache first
  if (videoCache.has(cacheKey)) {
    return videoCache.get(cacheKey)!;
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
  
  // Simple cache management
  if (videoCache.size >= MAX_CACHE_SIZE) {
    const firstKey = videoCache.keys().next().value;
    videoCache.delete(firstKey);
  }
  
  videoCache.set(cacheKey, result);
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

// Simple utility functions
export function clearVideoCache(): void {
  videoCache.clear();
}

export function preloadVideoData(posts: any[]): void {
  posts.slice(0, 5).forEach(post => {
    if (post?.embed) {
      extractVideoEmbedAndUrl(post);
    }
  });
}

