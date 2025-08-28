/**
 * Simplified Video Utilities
 * Optimized for immediate playback when visible
 */

import { extractColorsFromImage } from '../formatting/colorUtils';

export interface VideoEmbed {
  $type: string;
  playlist?: string | string[];
  media?: VideoEmbed;
  aspectRatio?: {
    width: number;
    height: number;
  };
}

// Simple cache for video extraction - only cache what's needed
const videoCache = new Map<string, { videoEmbed: any; videoUrl: string | null }>();
const MAX_CACHE_SIZE = 100;

// Color cache for video thumbnails
const thumbnailColorCache = new Map<string, { backgroundColor: string; timestamp: number }>();
const COLOR_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const MAX_COLOR_CACHE_SIZE = 200;

// Batch processing system
const pendingColorExtractions = new Map<string, Promise<string>>();
const colorExtractionQueue: string[] = [];
let isProcessingQueue = false;
const BATCH_SIZE = 3; // Process 3 colors at a time
const BATCH_DELAY = 100; // 100ms between batches

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
 * Extracts the video thumbnail URL from a post embed object.
 * @param embed The embed object from a post
 * @returns The thumbnail URL string, or null if not found
 */
export function extractVideoThumbnail(embed: any): string | null {
  const videoEmbed = getActualVideoEmbed(embed);
  if (!videoEmbed) return null;
  
  return videoEmbed.thumbnail || null;
}

/**
 * Process the color extraction queue in batches
 */
async function processColorQueue(): Promise<void> {
  if (isProcessingQueue || colorExtractionQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (colorExtractionQueue.length > 0) {
    const batch = colorExtractionQueue.splice(0, BATCH_SIZE);
    
    // Process batch in parallel
    const promises = batch.map(async (url) => {
      try {
        const colors = await extractColorsFromImage(url);
        
        // Cache the result
        if (thumbnailColorCache.size >= MAX_COLOR_CACHE_SIZE) {
          const oldestKey = thumbnailColorCache.keys().next().value;
          thumbnailColorCache.delete(oldestKey);
        }
        
        thumbnailColorCache.set(url, {
          backgroundColor: colors.backgroundColor,
          timestamp: Date.now()
        });
        
        // Resolve the pending promise
        const pendingPromise = pendingColorExtractions.get(url);
        if (pendingPromise) {
          // This is a bit hacky but works - we need to resolve the promise
          // The actual promise resolution happens in extractThumbnailColor
        }
      } catch (error) {
        console.warn('[VideoUtils] Error extracting color for:', url, error);
      }
    });
    
    await Promise.all(promises);
    
    // Small delay between batches to avoid overwhelming the system
    if (colorExtractionQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  isProcessingQueue = false;
}

/**
 * Extract background color from video thumbnail URL with batch processing
 * Uses efficient caching and batch processing to avoid redundant extractions
 */
export async function extractThumbnailColor(thumbnailUrl: string | null): Promise<string> {
  if (!thumbnailUrl) return '#000000';
  
  const now = Date.now();
  
  // Check cache first
  const cached = thumbnailColorCache.get(thumbnailUrl);
  if (cached && (now - cached.timestamp) < COLOR_CACHE_DURATION) {
    return cached.backgroundColor;
  }
  
  // Check if already being processed
  if (pendingColorExtractions.has(thumbnailUrl)) {
    return pendingColorExtractions.get(thumbnailUrl)!;
  }
  
  // Create a new promise for this extraction
  const extractionPromise = new Promise<string>(async (resolve) => {
    // Add to queue if not already there
    if (!colorExtractionQueue.includes(thumbnailUrl)) {
      colorExtractionQueue.push(thumbnailUrl);
    }
    
    // Start processing queue if not already running
    if (!isProcessingQueue) {
      processColorQueue();
    }
    
    // Wait for the color to be processed
    const checkInterval = setInterval(() => {
      const cached = thumbnailColorCache.get(thumbnailUrl);
      if (cached && (Date.now() - cached.timestamp) < COLOR_CACHE_DURATION) {
        clearInterval(checkInterval);
        resolve(cached.backgroundColor);
      }
    }, 50); // Check every 50ms
    
    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve('#000000');
    }, 5000);
  });
  
  pendingColorExtractions.set(thumbnailUrl, extractionPromise);
  
  // Clean up pending promise after resolution
  extractionPromise.finally(() => {
    pendingColorExtractions.delete(thumbnailUrl);
  });
  
  return extractionPromise;
}

/**
 * Preload thumbnail colors for a batch of posts with improved batch processing
 * This can be called when posts are loaded to prepare colors in background
 */
export async function preloadThumbnailColors(posts: any[]): Promise<void> {
  const thumbnailUrls = posts
    .map(post => {
      const videoEmbed = getActualVideoEmbed(post.embed);
      return videoEmbed?.thumbnail || null;
    })
    .filter(Boolean);
  
  // Add all URLs to the queue for batch processing
  requestAnimationFrame(() => {
    thumbnailUrls.slice(0, 10).forEach(url => {
      if (!colorExtractionQueue.includes(url)) {
        colorExtractionQueue.push(url);
      }
    });
    
    // Start processing if not already running
    if (!isProcessingQueue) {
      processColorQueue();
    }
  });
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

// Simple utility functions
export function clearVideoCache(): void {
  videoCache.clear();
}

export function clearThumbnailColorCache(): void {
  thumbnailColorCache.clear();
  pendingColorExtractions.clear();
  colorExtractionQueue.length = 0;
  isProcessingQueue = false;
}

export function getThumbnailColorCacheStats(): { 
  size: number; 
  maxSize: number; 
  pendingCount: number;
  queueLength: number;
  isProcessing: boolean;
} {
  return {
    size: thumbnailColorCache.size,
    maxSize: MAX_COLOR_CACHE_SIZE,
    pendingCount: pendingColorExtractions.size,
    queueLength: colorExtractionQueue.length,
    isProcessing: isProcessingQueue
  };
}

export function preloadVideoData(posts: any[]): void {
  posts.slice(0, 5).forEach(post => {
    if (post?.embed) {
      extractVideoEmbedAndUrl(post);
    }
  });
}

