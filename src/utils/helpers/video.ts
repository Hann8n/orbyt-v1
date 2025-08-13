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
 * Helper function to get the actual video embed object from any embed type
 * @param embed The embed object from a post
 * @returns The actual video embed or null
 */
function getActualVideoEmbed(embed: any): any | null {
  if (!embed) return null;
  
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    const recordEmbed = embed as VideoEmbed;
    if (recordEmbed.media?.$type && recordEmbed.media.$type.includes('video')) {
      return recordEmbed.media;
    }
    return null;
  } 
  
  if (embed.$type && embed.$type.includes('video')) {
    return embed;
  }
  
  return null;
}

/**
 * Extracts the video URL from a post embed object.
 * @param embed The embed object from a post
 * @returns The video URL string, or null if not found
 */
export function extractVideoUrl(embed: any): string | null {
  const videoEmbed = getActualVideoEmbed(embed);
  if (!videoEmbed) return null;
  
  // If playlist is an array, prefer HLS (.m3u8) for widest iOS support,
  // then fallback to MP4, otherwise use the first entry.
  if (Array.isArray(videoEmbed.playlist)) {
    const entries = videoEmbed.playlist.filter(Boolean) as string[];
    if (entries.length === 0) return null;

    // Prefer URLs that clearly indicate HLS
    const hls = entries.find(u => typeof u === 'string' && u.toLowerCase().includes('.m3u8'));
    if (hls) return hls;

    // Fallback to MP4 if present
    const mp4 = entries.find(u => typeof u === 'string' && u.toLowerCase().includes('.mp4'));
    if (mp4) return mp4;

    // Otherwise, return the first available URL
    return entries[0] || null;
  }

  return videoEmbed.playlist || null;
}

/**
 * Extract video embed and URL from a post in a single operation
 * Uses shared helper function to avoid duplication
 * @param post The post object
 * @returns Object containing videoEmbed and videoUrl
 */
export function extractVideoEmbedAndUrl(post: any): { videoEmbed: any; videoUrl: string | null } {
  const cacheKey = post?.uri;
  
  // Check cache first for better performance
  if (cacheKey && videoCache.has(cacheKey)) {
    return videoCache.get(cacheKey)!;
  }
  
  // Use our shared helper to get the actual video embed
  const videoEmbed = post?.embed ? getActualVideoEmbed(post.embed) : null;
  const videoUrl = extractVideoUrl(videoEmbed);
  const result = { videoEmbed, videoUrl };
  
  // Cache management - remove oldest items when cache gets too big
  if (cacheKey) {
    if (videoCache.size >= MAX_CACHE_SIZE) {
      const firstKey = videoCache.keys().next().value;
      videoCache.delete(firstKey);
    }
    videoCache.set(cacheKey, result);
  }
  
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
  const videoEmbed = getActualVideoEmbed(embed);
  return videoEmbed?.thumbnail || null;
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

