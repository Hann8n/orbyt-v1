// Utility to extract video URLs from embed objects in a type-safe way
export interface VideoEmbed {
  $type: string;
  playlist?: string | string[];
  media?: VideoEmbed;
}

// Simple cache for video extraction results
const videoExtractionCache = new Map<string, { videoEmbed: any; videoUrl: string | null }>();

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
  // Create a cache key based on post URI and embed
  const cacheKey = `${post?.uri}-${JSON.stringify(post?.embed)}`;
  
  // Check cache first
  if (videoExtractionCache.has(cacheKey)) {
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
  
  return result;
}

/**
 * Checks if an embed object contains video content.
 * @param options Object containing embed property
 * @returns true if the embed contains video content, false otherwise
 */
export function hasVideoContent({ embed }: { embed: any }): boolean {
  if (!embed) return false;
  
  // Check for recordWithMedia type with video content
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    return embed.media?.$type?.includes('video') || false;
  }
  
  // Check for direct video embed types
  if (embed.$type?.includes('video')) {
    return true;
  }
  
  // Check for video playlist
  if (embed.playlist) {
    return true;
  }
  
  // Check for media property with video content
  if (embed.media?.$type?.includes('video')) {
    return true;
  }
  
  return false;
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
  const isVideo = hasVideoContent({ embed });
  
  return {
    hasEmbed,
    embedType,
    hasMedia,
    mediaType,
    videoUrl,
    isVideo
  };
}

