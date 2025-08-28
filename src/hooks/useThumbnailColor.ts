import { useState, useEffect, useCallback } from 'react';
import { extractThumbnailColor } from '../utils/helpers/video';

/**
 * Hook to extract and manage background colors from video thumbnails
 * Uses efficient caching and background processing to avoid UI blocking
 */
export function useThumbnailColor(thumbnailUrl: string | null) {
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [isLoading, setIsLoading] = useState(false);

  const extractColor = useCallback(async (url: string) => {
    if (!url) return;
    
    setIsLoading(true);
    try {
      const color = await extractThumbnailColor(url);
      setBackgroundColor(color);
    } catch (error) {
      // Keep default black background on error
      console.warn('[useThumbnailColor] Error extracting color:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (thumbnailUrl) {
      // Extract color immediately when thumbnail URL is available
      // Use requestAnimationFrame to avoid blocking the UI
      requestAnimationFrame(() => {
        extractColor(thumbnailUrl);
      });
    }
  }, [thumbnailUrl, extractColor]);

  return {
    backgroundColor,
    isLoading,
    extractColor: () => thumbnailUrl ? extractColor(thumbnailUrl) : Promise.resolve()
  };
}
