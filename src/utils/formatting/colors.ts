import * as FileSystem from 'expo-file-system';
import ImageColors, { ImageColorsResult } from 'react-native-image-colors';

// Minimal Colors object to avoid circular dependency
const Colors = {
  white: '#FFFFFF',
  black: '#000000',
  lightGray: '#ccd7e9',
  darkGray: '#181c22',
};

/**
 * Converts a hex color to RGBA format
 */
export const hexToRGBA = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Checks if a color is dark (for determining text color)
 */
export const isColorDark = (hex: string): boolean => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
};

/**
 * Inverts a hex color
 * @param hex Hex color string
 * @returns Inverted hex color string
 */
export const invertColor = (hex: string): string => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  // Invert each component
  const invertedR = (255 - r).toString(16).padStart(2, '0');
  const invertedG = (255 - g).toString(16).padStart(2, '0');
  const invertedB = (255 - b).toString(16).padStart(2, '0');

  return `#${invertedR}${invertedG}${invertedB}`;
};

/**
 * Darkens a color by a specified amount (0-1)
 * @param hex Hex color string
 * @param amount Amount to darken (0 = no change, 1 = black)
 * @returns Darkened hex color string
 */
export const darkenColor = (hex: string, amount: number = 0.4): string => {
  const color = hex.replace('#', '');
  let r = parseInt(color.substring(0, 2), 16);
  let g = parseInt(color.substring(2, 4), 16);
  let b = parseInt(color.substring(4, 6), 16);

  // Darken by reducing RGB values
  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));

  // Ensure minimum darkness - if still too bright, darken more
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness > 100) {
    // If brightness is still above 100, darken further
    const additionalDarken = (brightness - 100) / brightness;
    r = Math.max(0, Math.floor(r * (1 - additionalDarken)));
    g = Math.max(0, Math.floor(g * (1 - additionalDarken)));
    b = Math.max(0, Math.floor(b * (1 - additionalDarken)));
  }

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Calculates contrast ratio between two colors according to WCAG
 * @returns Contrast ratio (1-21)
 */
export const getContrastRatio = (color1: string, color2: string): number => {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Calculates relative luminance of a color according to WCAG standards
 * @param hex Hex color string
 */
const getRelativeLuminance = (hex: string): number => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16) / 255;
  const g = parseInt(color.substring(2, 4), 16) / 255;
  const b = parseInt(color.substring(4, 6), 16) / 255;

  const transform = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

/**
 * Checks if two colors meet WCAG AA standard (contrast ratio of at least 4.5:1)
 */
const meetsContrastGuidelines = (color1: string, color2: string): boolean => {
  return getContrastRatio(color1, color2) >= 4.5;
};

/**
 * Determines the appropriate status bar style based on background color
 * @param backgroundColor - Hex color string
 * @returns 'light' for dark backgrounds, 'dark' for light backgrounds
 */
export const getStatusBarStyle = (backgroundColor: string): 'light' | 'dark' => {
  return isColorDark(backgroundColor) ? 'light' : 'dark';
};

/**
 * Default profile colors used throughout the app
 */
export const DEFAULT_PROFILE_COLORS = {
  backgroundColor: Colors.black,
  foregroundColor: Colors.lightGray,
  statusBarStyle: 'light' as const,
};

/**
 * Enhances color saturation to make it more vibrant
 */
function enhanceColorSaturation(hex: string, saturationBoost: number = 1.3): string {
  // Convert hex to HSL for saturation adjustment
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h: number = 0;
  let s: number = 0;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        h = 0; // TypeScript safety (should never happen)
    }
    h /= 6;
  }

  // Boost saturation while keeping it within bounds
  s = Math.min(1, s * saturationBoost);

  // Convert back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r1, g1, b1;
  if (s === 0) {
    r1 = g1 = b1 = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r1 = hue2rgb(p, q, h + 1 / 3);
    g1 = hue2rgb(p, q, h);
    b1 = hue2rgb(p, q, h - 1 / 3);
  }

  const r2 = Math.round(r1 * 255);
  const g2 = Math.round(g1 * 255);
  const b2 = Math.round(b1 * 255);

  return (
    '#' +
    r2.toString(16).padStart(2, '0') +
    g2.toString(16).padStart(2, '0') +
    b2.toString(16).padStart(2, '0')
  );
}

/**
 * Gets the most suitable color for background from ImageColors result
 * Always prioritizes the background color from the image and enhances vibrancy
 */
function getBestColor(result: ImageColorsResult): {
  backgroundColor: string;
  foregroundColor: string;
  accentColor?: string;
} {
  let backgroundColor = '#000000';
  let foregroundColor = '#FFFFFF';
  let accentColor = '#FFFFFF';

  if (result.platform === 'android') {
    // Prioritize vibrant colors for more dynamic headers
    if (result.vibrant) {
      backgroundColor = result.vibrant;
    } else if (result.darkVibrant) {
      backgroundColor = result.darkVibrant;
    } else if (result.lightVibrant) {
      backgroundColor = result.lightVibrant;
    } else if (result.dominant) {
      backgroundColor = result.dominant;
    } else if (result.average) {
      backgroundColor = result.average;
    } else if (result.muted) {
      backgroundColor = result.muted;
    } else if (result.darkMuted) {
      backgroundColor = result.darkMuted;
    } else if (result.lightMuted) {
      backgroundColor = result.lightMuted;
    }

    // Select foreground color for good contrast
    if (isColorDark(backgroundColor)) {
      // For dark backgrounds, use light colors
      foregroundColor = result.lightVibrant || result.lightMuted || '#FFFFFF';
    } else {
      // For light backgrounds, use dark colors
      foregroundColor = result.darkVibrant || result.darkMuted || result.muted || '#000000';
    }

    // Select accent color (prefer bright/vibrant)
    accentColor = result.lightVibrant || result.vibrant || result.lightMuted || '#FFFFFF';
  } else if (result.platform === 'ios') {
    // Prioritize more vibrant colors from iOS result
    if (result.primary) {
      backgroundColor = result.primary;
    } else if (result.secondary) {
      backgroundColor = result.secondary;
    } else if (result.background) {
      backgroundColor = result.background;
    } else if (result.detail) {
      backgroundColor = result.detail;
    }

    // Select foreground color for good contrast
    if (isColorDark(backgroundColor)) {
      // For dark backgrounds, use light colors
      foregroundColor = result.secondary || result.detail || '#FFFFFF';
    } else {
      // For light backgrounds, use dark colors
      foregroundColor = result.primary || '#000000';
    }

    // Select accent color
    accentColor = result.secondary || result.detail || '#FFFFFF';
  } else {
    // Web platform fallback - prioritize vibrant colors
    if (result.vibrant) {
      backgroundColor = result.vibrant;
    } else if (result.lightVibrant) {
      backgroundColor = result.lightVibrant;
    } else if (result.dominant) {
      backgroundColor = result.dominant;
    } else if (result.darkVibrant) {
      backgroundColor = result.darkVibrant;
    }

    // Select foreground color for good contrast
    if (isColorDark(backgroundColor)) {
      foregroundColor = result.lightVibrant || '#FFFFFF';
    } else {
      foregroundColor = result.darkVibrant || '#000000';
    }

    accentColor = result.lightVibrant || result.vibrant || '#FFFFFF';
  }

  // Enhance color saturation for more vibrant appearance
  backgroundColor = enhanceColorSaturation(backgroundColor, 1.4);
  accentColor = enhanceColorSaturation(accentColor, 1.5);

  // Ensure foreground color is different from background and has sufficient contrast
  // Check if foreground and background are the same or too similar (minimum contrast ratio of 3.0)
  const normalizedBg = backgroundColor.toLowerCase();
  const normalizedFg = foregroundColor.toLowerCase();
  const contrast = getContrastRatio(backgroundColor, foregroundColor);

  // If colors are the same or contrast is too low, force a contrasting color
  if (normalizedBg === normalizedFg || contrast < 3.0) {
    // Force a contrasting color based on background brightness
    foregroundColor = isColorDark(backgroundColor) ? '#FFFFFF' : '#000000';
  }

  return { backgroundColor, foregroundColor, accentColor };
}

/**
 * Extract colors from image - ONLY for use in edit screen as suggestions
 * This should not be used for automatic profile color setting
 */
export async function extractColorsFromImage(imageUrl: string): Promise<{
  backgroundColor: string;
  foregroundColor: string;
  textColor: string;
  accentColor: string;
  statusBarStyle: 'light' | 'dark';
}> {
  try {
    // Check if the image URL is a local file
    const isLocalFile = imageUrl.startsWith('file://') || imageUrl.startsWith('/');

    let uri = imageUrl;
    if (!isLocalFile && !imageUrl.startsWith('http')) {
      // If it's not a local file and doesn't start with http, assume it's a relative path
      uri = `file://${imageUrl}`;
    }

    const result = await ImageColors.getColors(uri, {
      fallback: Colors.lightGray,
      cache: true,
      key: imageUrl,
    });

    const { backgroundColor, foregroundColor, accentColor } = getBestColor(result);

    const finalResult = {
      backgroundColor,
      foregroundColor,
      textColor: foregroundColor,
      accentColor: accentColor || foregroundColor,
      statusBarStyle: isColorDark(backgroundColor) ? ('light' as const) : ('dark' as const),
    };

    return finalResult;
  } catch (error) {
    return {
      backgroundColor: Colors.darkGray,
      foregroundColor: Colors.white,
      textColor: Colors.white,
      accentColor: '#FFFFFF',
      statusBarStyle: 'light' as const,
    };
  }
}

/**
 * Batch extract colors from multiple images
 * Uses InteractionManager to defer operations until after interactions complete
 * @param imageUrls Array of image URLs to extract colors from
 * @returns Promise that resolves to array of color results
 */
export async function batchExtractColorsFromImages(imageUrls: string[]): Promise<
  Array<{
    backgroundColor: string;
    foregroundColor: string;
    textColor: string;
    accentColor: string;
    statusBarStyle: 'light' | 'dark';
  }>
> {
  if (!imageUrls || imageUrls.length === 0) {
    return [];
  }

  // Import InteractionManager dynamically to avoid issues if not available
  const { InteractionManager } = require('react-native');

  return new Promise(resolve => {
    // Defer batch color extraction until after interactions complete
    InteractionManager.runAfterInteractions(async () => {
      try {
        // Process images in smaller batches to avoid overwhelming the system
        const batchSize = 3;
        const results: Array<{
          backgroundColor: string;
          foregroundColor: string;
          textColor: string;
          accentColor: string;
          statusBarStyle: 'light' | 'dark';
        }> = [];

        for (let i = 0; i < imageUrls.length; i += batchSize) {
          const batch = imageUrls.slice(i, i + batchSize);
          const batchResults = await Promise.allSettled(
            batch.map(url => extractColorsFromImage(url))
          );

          // Collect successful results
          batchResults.forEach(result => {
            if (result.status === 'fulfilled') {
              results.push(result.value);
            } else {
              // Add fallback color for failed extractions
              results.push({
                backgroundColor: Colors.darkGray,
                foregroundColor: Colors.white,
                textColor: Colors.white,
                accentColor: '#FFFFFF',
                statusBarStyle: 'light' as const,
              });
            }
          });
        }

        resolve(results);
      } catch (error) {
        // Return fallback colors for all images on error
        resolve(
          imageUrls.map(() => ({
            backgroundColor: Colors.darkGray,
            foregroundColor: Colors.white,
            textColor: Colors.white,
            accentColor: '#FFFFFF',
            statusBarStyle: 'light' as const,
          }))
        );
      }
    });
  });
}
