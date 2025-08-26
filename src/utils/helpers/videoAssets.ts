import { extractVideoThumbnail, extractVideoEmbedAndUrl } from './video';
import { generateVideoBackground, getCachedBackground } from './videoBackgrounds';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';

// Cache for combined video assets (thumbnail + background)
const assetCache = new Map<string, {
  thumbnailUrl: string | null;
  backgroundColors: string[];
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

/**
 * Hook that combines thumbnail and background processing
 * Pre-loads backgrounds immediately without blocking UI thread
 */
export function useVideoAssets(post: any | null, isVisible: boolean) {
  const [backgroundColors, setBackgroundColors] = useState<string[]>([]);
  const [isLoadingBackground, setIsLoadingBackground] = useState(false);
  const loadingRef = useRef(false);
  const postUriRef = useRef<string | null>(null);

  // Memoize video embed and thumbnail extraction
  const { videoEmbed, videoUrl } = useMemo(() => {
    if (!post) return { videoEmbed: null, videoUrl: null };
    return extractVideoEmbedAndUrl(post);
  }, [post?.embed, post?.uri]);

  const thumbnailUrl = useMemo(() => {
    if (!videoEmbed) return null;
    return extractVideoThumbnail(videoEmbed);
  }, [videoEmbed]);

  // Check cache for combined assets
  const cachedAssets = useMemo(() => {
    if (!post?.uri) return null;
    const cached = assetCache.get(post.uri);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached;
    }
    
    // Remove expired cache entry
    assetCache.delete(post.uri);
    return null;
  }, [post?.uri]);

  // Pre-load background immediately when post changes (non-blocking)
  const preloadBackground = useCallback(async () => {
    if (!post || !thumbnailUrl || loadingRef.current || postUriRef.current === post.uri) {
      return;
    }

    // Use cached background if available
    if (cachedAssets?.backgroundColors) {
      setBackgroundColors(cachedAssets.backgroundColors);
      postUriRef.current = post.uri;
      return;
    }

    // Check if we have a cached background from the background utility
    const cachedBackground = getCachedBackground(post);
    if (cachedBackground) {
      setBackgroundColors(cachedBackground);
      cacheAssets(post.uri, thumbnailUrl, cachedBackground);
      postUriRef.current = post.uri;
      return;
    }

    // Start background loading immediately (non-blocking)
    loadingRef.current = true;
    postUriRef.current = post.uri;
    
    try {
      // This runs in background thread
      const colors = await generateVideoBackground(post);
      
      // Only update if this is still the current post
      if (postUriRef.current === post.uri) {
        setBackgroundColors(colors);
        cacheAssets(post.uri, thumbnailUrl, colors);
      }
    } catch (error) {
      console.warn('Failed to load video background:', error);
      if (postUriRef.current === post.uri) {
        setBackgroundColors([]);
        cacheAssets(post.uri, thumbnailUrl, []);
      }
    } finally {
      loadingRef.current = false;
    }
  }, [post, thumbnailUrl, cachedAssets]);

  // Pre-load background immediately when post changes
  useEffect(() => {
    if (cachedAssets?.backgroundColors) {
      setBackgroundColors(cachedAssets.backgroundColors);
      postUriRef.current = post?.uri;
    } else if (thumbnailUrl) {
      // Start pre-loading immediately without waiting for visibility
      preloadBackground();
    } else {
      setBackgroundColors([]);
      postUriRef.current = null;
    }
  }, [post?.uri, thumbnailUrl, cachedAssets, preloadBackground]);

  return {
    thumbnailUrl,
    backgroundColors,
    isLoadingBackground,
    hasBackground: backgroundColors.length > 0,
    videoEmbed,
    videoUrl
  };
}

/**
 * Caches combined video assets
 */
function cacheAssets(uri: string, thumbnailUrl: string | null, backgroundColors: string[]) {
  // Clean up cache if it's too large
  if (assetCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = assetCache.keys().next().value;
    assetCache.delete(oldestKey);
  }
  
  assetCache.set(uri, {
    thumbnailUrl,
    backgroundColors,
    timestamp: Date.now()
  });
}

/**
 * Clears the asset cache
 */
export function clearAssetCache(): void {
  assetCache.clear();
}

/**
 * Gets cached assets for a post
 */
export function getCachedAssets(post: any): { thumbnailUrl: string | null; backgroundColors: string[] } | null {
  if (!post?.uri) return null;
  
  const cached = assetCache.get(post.uri);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp < CACHE_DURATION) {
    return cached;
  }
  
  // Remove expired cache entry
  assetCache.delete(post.uri);
  return null;
}

/**
 * Pre-loads backgrounds for a list of posts (useful for feed pre-loading)
 */
export function preloadVideoAssets(posts: any[]): void {
  if (!posts || posts.length === 0) return;
  
  // Pre-load backgrounds for posts with thumbnails
  posts.forEach(post => {
    if (post?.uri) {
      const thumbnailUrl = extractVideoThumbnail(post?.embed);
      if (thumbnailUrl && !getCachedAssets(post)) {
        // Start background loading in background thread
        generateVideoBackground(post).catch(() => {
          // Silently handle errors for pre-loading
        });
      }
    }
  });
}
