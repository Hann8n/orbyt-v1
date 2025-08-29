import { useState, useEffect, useCallback } from 'react';
import { extractThumbnailColor } from '../utils/helpers/video';

/**
 * Darkens a hex color by reducing its brightness
 */
const darkenColor = (hex: string, factor: number = 0.3): string => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  // Reduce RGB values to darken the color
  const newR = Math.max(0, Math.round(r * (1 - factor)));
  const newG = Math.max(0, Math.round(g * (1 - factor)));
  const newB = Math.max(0, Math.round(b * (1 - factor)));
  
  return '#' + 
    newR.toString(16).padStart(2, '0') +
    newG.toString(16).padStart(2, '0') +
    newB.toString(16).padStart(2, '0');
};

/**
 * Hook to extract and manage background colors from video thumbnails
 * Uses efficient caching and background processing to avoid UI blocking
 * Returns darkened colors for better visual consistency
 */
export function useThumbnailColor(thumbnailUrl: string | null) {
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [isLoading, setIsLoading] = useState(false);

  const extractColor = useCallback(async (url: string) => {
    if (!url) return;
    
    setIsLoading(true);
    try {
      const color = await extractThumbnailColor(url);
      // Darken the extracted color for better visual consistency
      const darkenedColor = darkenColor(color, 0.7);
      setBackgroundColor(darkenedColor);
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
      // Use setTimeout to defer the extractColor call to avoid setState during render
      const timeoutId = setTimeout(() => {
        extractColor(thumbnailUrl);
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [thumbnailUrl, extractColor]);

  return {
    backgroundColor,
    isLoading,
    extractColor: () => thumbnailUrl ? extractColor(thumbnailUrl) : Promise.resolve()
  };
}
