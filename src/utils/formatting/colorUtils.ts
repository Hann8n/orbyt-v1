import * as FileSystem from 'expo-file-system';
import ImageColors, { ImageColorsResult } from 'react-native-image-colors';
import { Colors, hexToRGBA, isColorDark, getContrastRatio } from '../../components/ui/UI';

// Re-export utility functions for backward compatibility
export { hexToRGBA, isColorDark, getContrastRatio };

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
 * Calculates contrast ratio between two colors according to WCAG
 * @returns Contrast ratio (1-21)
 */
const getContrastRatioInternal = (color1: string, color2: string): number => {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Checks if two colors meet WCAG AA standard (contrast ratio of at least 4.5:1)
 */
const meetsContrastGuidelines = (color1: string, color2: string): boolean => {
  return getContrastRatioInternal(color1, color2) >= 4.5;
};

/**
 * Adjusts a color to ensure it has good contrast with white for status bar text
 */
const adjustColorForStatusBar = (color: string): string => {
  const minRequiredContrast = 4.5;
  let currentContrast = getContrastRatioInternal(color, '#FFFFFF');
  
  if (currentContrast >= minRequiredContrast) return color;

  // Convert hex to RGB
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  // Gradually darken the color until we reach sufficient contrast
  let newR = r;
  let newG = g;
  let newB = b;
  const step = 10;
  
  while (currentContrast < minRequiredContrast) {
    // Reduce RGB values to darken the color
    newR = Math.max(0, newR - step);
    newG = Math.max(0, newG - step);
    newB = Math.max(0, newB - step);
    
    const newColor = '#' + 
      newR.toString(16).padStart(2, '0') +
      newG.toString(16).padStart(2, '0') +
      newB.toString(16).padStart(2, '0');
    
    currentContrast = getContrastRatioInternal(newColor, '#FFFFFF');
    
    // If we reach black or sufficient contrast, break the loop
    if ((newR <= step && newG <= step && newB <= step) || currentContrast >= minRequiredContrast) {
      return newColor;
    }
  }
  
  // Fallback to dark gray if needed
  return '#303030';
};

const adjustColorForAAA = (color: string, background: string): string => {
  // Implementation for adjusting color to meet AAA contrast requirements
  return color;
};

/**
 * Ensures a color is bright and vibrant for accent usage
 * If the color is too dark, it will be lightened to make it more vibrant
 */
const ensureBrightAccentColor = (color: string): string => {
  // Convert hex to RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate brightness (0-255)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // If the color is too dark (brightness < 100), lighten it
  if (brightness < 100) {
    // Increase brightness by 50% while maintaining color hue
    const factor = 1.5;
    const newR = Math.min(255, Math.round(r * factor));
    const newG = Math.min(255, Math.round(g * factor));
    const newB = Math.min(255, Math.round(b * factor));
    
    return '#' + 
      newR.toString(16).padStart(2, '0') +
      newG.toString(16).padStart(2, '0') +
      newB.toString(16).padStart(2, '0');
  }
  
  return color;
};

/**
 * Gets the most suitable color for background from ImageColors result
 */
function getBestColor(result: ImageColorsResult): { backgroundColor: string, foregroundColor: string, accentColor?: string } {
  let bestCombo = { backgroundColor: '', foregroundColor: '', accentColor: '' };
  let bestContrastRatio = 0;
  let bestScore = 0;

  if (result.platform === "android") {
    const colors = [
      result.dominant,
      result.average,
      result.vibrant,
      result.darkVibrant,
      result.lightVibrant,
      result.darkMuted,
      result.lightMuted,
      result.muted
    ].filter(Boolean) as string[];

    // Test all possible color combinations from the image
    for (let i = 0; i < colors.length; i++) {
      for (let j = 0; j < colors.length; j++) {
        if (i !== j) {
          const contrast = getContrastRatioInternal(colors[i], colors[j]);
          const statusBarContrast = getContrastRatioInternal(colors[i], '#FFFFFF');
          
          // Skip combinations that don't meet basic contrast requirements
          if (contrast < 4.5) continue;
          
          // Calculate appeal score based on multiple factors
          let score = 0;
          
          // Prefer vibrant colors
          if (colors[i] === result.vibrant || colors[i] === result.darkVibrant) score += 10;
          if (colors[j] === result.vibrant || colors[j] === result.lightVibrant) score += 8;
          
          // Prefer dominant colors for background
          if (colors[i] === result.dominant) score += 15;
          
          // Reward good contrast (max 20 points for 21:1 contrast)
          score += Math.min(20, contrast);
          
          // Reward status bar legibility (max 10 points for good contrast with white)
          score += Math.min(10, statusBarContrast);
          
          // Slightly prefer darker backgrounds
          if (isColorDark(colors[i])) score += 5;
          
          if (score > bestScore && statusBarContrast >= 3.0) {
            bestScore = score;
            bestContrastRatio = contrast;
            
            // Ensure accent color is bright and vibrant
            const rawAccentColor = result.lightVibrant || result.vibrant || result.lightMuted || colors[j];
            const brightAccentColor = ensureBrightAccentColor(rawAccentColor);
            
            bestCombo = { 
              backgroundColor: colors[i], 
              foregroundColor: colors[j],
              accentColor: brightAccentColor
            };
          }
        }
      }
    }

    // If no good combinations found, try darker colors with lighter ones
    if (!bestCombo.backgroundColor || !bestCombo.foregroundColor) {
      // ...existing code...
    }

    // Only use black/white as absolute last resort
    if (!bestCombo.backgroundColor || !bestCombo.foregroundColor) {
      // ...existing code...
    }
    
    // Ensure selected background works well with white status bar text
    if (getContrastRatioInternal(bestCombo.backgroundColor, '#FFFFFF') < 3.5) {
      // Find a darker variant of the selected background color
      bestCombo.backgroundColor = adjustColorForStatusBar(bestCombo.backgroundColor);
    }
  } else if (result.platform === "ios") {
    const colors = [
      result.background,
      result.primary,
      result.secondary,
      result.detail
    ].filter(Boolean) as string[];

    // Test all possible color combinations from the image
    for (let i = 0; i < colors.length; i++) {
      for (let j = 0; j < colors.length; j++) {
        if (i !== j) {
          const contrast = getContrastRatioInternal(colors[i], colors[j]);
          const statusBarContrast = getContrastRatioInternal(colors[i], '#FFFFFF');
          
          // Skip combinations that don't meet basic contrast requirements
          if (contrast < 4.5) continue;
          
          // Calculate appeal score based on multiple factors
          let score = 0;
          
          // Prefer primary colors for background
          if (colors[i] === result.background) score += 15;
          if (colors[i] === result.primary) score += 10;
          
          // Prefer secondary/detail colors for foreground
          if (colors[j] === result.secondary || colors[j] === result.detail) score += 12;
          
          // Reward good contrast (max 20 points for 21:1 contrast)
          score += Math.min(20, contrast);
          
          // Reward status bar legibility (max 10 points for good contrast with white)
          score += Math.min(10, statusBarContrast);
          
          // Slightly prefer darker backgrounds
          if (isColorDark(colors[i])) score += 5;
          
          if (score > bestScore && statusBarContrast >= 3.0) {
            bestScore = score;
            bestContrastRatio = contrast;
            
            // Ensure accent color is bright and vibrant
            const rawAccentColor = result.secondary || result.detail || colors[j];
            const brightAccentColor = ensureBrightAccentColor(rawAccentColor);
            
            bestCombo = { 
              backgroundColor: colors[i], 
              foregroundColor: colors[j],
              accentColor: brightAccentColor
            };
          }
        }
      }
    }

    // If no good combinations found, try darker colors with lighter ones
    if (!bestCombo.backgroundColor || !bestCombo.foregroundColor) {
      // ...existing code...
    }

    // Only use black/white as absolute last resort
    if (!bestCombo.backgroundColor || !bestCombo.foregroundColor) {
      // ...existing code...
    }
    
    // Ensure selected background works well with white status bar text
    if (getContrastRatioInternal(bestCombo.backgroundColor, '#FFFFFF') < 3.5) {
      // Find a darker variant of the selected background color
      bestCombo.backgroundColor = adjustColorForStatusBar(bestCombo.backgroundColor);
    }
  }

  return bestCombo;
}

function getSecondaryColor(result: ImageColorsResult): string {
  if (result.platform === "android") {
    // Prioritize bright, vibrant colors for secondary/accent usage
    const rawColor = result.lightVibrant || result.vibrant || result.lightMuted || result.average || '#FFFFFF';
    return ensureBrightAccentColor(rawColor);
  } else if (result.platform === "ios") {
    // For iOS, secondary and detail colors are typically brighter
    const rawColor = result.secondary || result.detail || result.primary || '#FFFFFF';
    return ensureBrightAccentColor(rawColor);
  } else {
    const rawColor = result.lightVibrant || result.vibrant || '#FFFFFF';
    return ensureBrightAccentColor(rawColor);
  }
}

function ensureAccessibleColors(backgroundColor: string, foregroundColor: string): { backgroundColor: string, foregroundColor: string } {
  // Ensure the background has good contrast with white for status bar
  if (!meetsContrastGuidelines(backgroundColor, '#FFFFFF')) {
    backgroundColor = '#303030';
  }
  
  // Ensure the foreground has good contrast with the background
  if (!meetsContrastGuidelines(backgroundColor, foregroundColor)) {
    foregroundColor = isColorDark(backgroundColor) ? '#FFFFFF' : '#000000';
  }
  
  return { backgroundColor, foregroundColor };
}

export async function extractColorsFromImage(imageUrl: string) {
  try {
    // Check if the image URL is a local file
    const isLocalFile = imageUrl.startsWith('file://') || imageUrl.startsWith('/');
    
    let uri = imageUrl;
    if (!isLocalFile && !imageUrl.startsWith('http')) {
      // If it's not a local file and doesn't start with http, assume it's a relative path
      uri = `file://${imageUrl}`;
    }

    const result = await ImageColors.getColors(uri, {
      fallback: Colors.BRAND.PRIMARY,
      cache: true,
      key: imageUrl,
    });

    const { backgroundColor, foregroundColor, accentColor } = getBestColor(result);
    const secondaryColor = getSecondaryColor(result);
    
    const finalColors = ensureAccessibleColors(backgroundColor, foregroundColor);

    // Ensure accent color is bright and vibrant
    const brightAccentColor = ensureBrightAccentColor(accentColor || secondaryColor);

    return {
      backgroundColor: finalColors.backgroundColor,
      foregroundColor: finalColors.foregroundColor,
      textColor: finalColors.foregroundColor,
      secondaryColor: secondaryColor,
      accentColor: brightAccentColor, // Use bright accent color for vibrant UI elements
      statusBarStyle: isColorDark(finalColors.backgroundColor) ? 'light' as const : 'dark' as const,
    };
  } catch (error) {
          // console.error('Error extracting colors from image:', error);
    return {
      backgroundColor: Colors.BRAND.PRIMARY,
      foregroundColor: Colors.TEXT.PRIMARY,
      textColor: Colors.TEXT.PRIMARY,
      secondaryColor: Colors.TEXT.SECONDARY,
      accentColor: '#00D4FF', // Bright cyan fallback accent color
      statusBarStyle: 'light' as const,
    };
  }
}