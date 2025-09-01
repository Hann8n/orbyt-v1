import * as FileSystem from 'expo-file-system';
import ImageColors, { ImageColorsResult } from 'react-native-image-colors';

// Minimal Colors object to avoid circular dependency
const Colors = {
  white: '#FFFFFF',
  black: '#000000',
  lightGray: '#CFD6E8',
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
 * Ensures the color is light enough to be visible against a black background
 */
const ensureBrightAccentColor = (color: string): string => {
  // Convert hex to RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate brightness (0-255)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // For visibility against black background, we need a higher brightness threshold
  // WCAG AA requires contrast ratio of 4.5:1, which means brightness should be around 180+ for good visibility
  const minBrightnessForBlackBackground = 180;
  
  // If the color is too dark for black background visibility, lighten it significantly
  if (brightness < minBrightnessForBlackBackground) {
    // Calculate how much we need to increase the brightness
    const targetBrightness = minBrightnessForBlackBackground;
    const brightnessDifference = targetBrightness - brightness;
    
    // Increase RGB values proportionally to reach target brightness
    // Use a more aggressive approach to ensure good visibility
    const factor = 1 + (brightnessDifference / brightness) * 0.8;
    
    const newR = Math.min(255, Math.round(r * factor));
    const newG = Math.min(255, Math.round(g * factor));
    const newB = Math.min(255, Math.round(b * factor));
    
    // Verify the new brightness meets our requirements
    const newBrightness = (newR * 299 + newG * 587 + newB * 114) / 1000;
    
    // If still not bright enough, push to even brighter values
    if (newBrightness < minBrightnessForBlackBackground) {
      const finalR = Math.min(255, newR + 50);
      const finalG = Math.min(255, newG + 50);
      const finalB = Math.min(255, newB + 50);
      
      return '#' + 
        finalR.toString(16).padStart(2, '0') +
        finalG.toString(16).padStart(2, '0') +
        finalB.toString(16).padStart(2, '0');
    }
    
    return '#' + 
      newR.toString(16).padStart(2, '0') +
      newG.toString(16).padStart(2, '0') +
      newB.toString(16).padStart(2, '0');
  }
  
  return color;
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
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  // Boost saturation while keeping it within bounds
  s = Math.min(1, s * saturationBoost);

  // Convert back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let r1, g1, b1;
  if (s === 0) {
    r1 = g1 = b1 = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r1 = hue2rgb(p, q, h + 1/3);
    g1 = hue2rgb(p, q, h);
    b1 = hue2rgb(p, q, h - 1/3);
  }

  const r2 = Math.round(r1 * 255);
  const g2 = Math.round(g1 * 255);
  const b2 = Math.round(b1 * 255);

  return '#' + r2.toString(16).padStart(2, '0') + g2.toString(16).padStart(2, '0') + b2.toString(16).padStart(2, '0');
}

/**
 * Gets the most suitable color for background from ImageColors result
 * Always prioritizes the background color from the image and enhances vibrancy
 */
function getBestColor(result: ImageColorsResult): { backgroundColor: string, foregroundColor: string, accentColor?: string } {
  let backgroundColor = '#000000';
  let foregroundColor = '#FFFFFF';
  let accentColor = '#FFFFFF';

  if (result.platform === "android") {
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

  } else if (result.platform === "ios") {
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

  // Ensure accent color is bright and vibrant
  accentColor = ensureBrightAccentColor(accentColor);

  // Ensure selected background works well with white status bar text
  if (getContrastRatioInternal(backgroundColor, '#FFFFFF') < 3.5) {
    backgroundColor = adjustColorForStatusBar(backgroundColor);
  }

  return { backgroundColor, foregroundColor, accentColor };
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

/**
 * Test function to verify accent color brightness for black background visibility
 * This can be used for debugging and verification
 */
export const enhanceColorBrightness = (hex: string, brightnessBoost: number = 1.1): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const newR = Math.min(255, Math.round(r * brightnessBoost));
  const newG = Math.min(255, Math.round(g * brightnessBoost));
  const newB = Math.min(255, Math.round(b * brightnessBoost));

  return '#' + newR.toString(16).padStart(2, '0') + newG.toString(16).padStart(2, '0') + newB.toString(16).padStart(2, '0');
};

export const testAccentColorBrightness = (color: string): { 
  original: string, 
  originalBrightness: number, 
  adjusted: string, 
  adjustedBrightness: number,
  isVisibleOnBlack: boolean 
} => {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const originalBrightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  const adjustedColor = ensureBrightAccentColor(color);
  const adjustedHex = adjustedColor.replace('#', '');
  const adjustedR = parseInt(adjustedHex.substring(0, 2), 16);
  const adjustedG = parseInt(adjustedHex.substring(2, 4), 16);
  const adjustedB = parseInt(adjustedHex.substring(4, 6), 16);
  const adjustedBrightness = (adjustedR * 299 + adjustedG * 587 + adjustedB * 114) / 1000;
  
  return {
    original: color,
    originalBrightness: Math.round(originalBrightness),
    adjusted: adjustedColor,
    adjustedBrightness: Math.round(adjustedBrightness),
    isVisibleOnBlack: adjustedBrightness >= 180
  };
};

export async function extractColorsFromImage(imageUrl: string) {
  try {
    console.log('[ColorUtils] extractColorsFromImage called with:', imageUrl);
    
    // Check if the image URL is a local file
    const isLocalFile = imageUrl.startsWith('file://') || imageUrl.startsWith('/');
    
    let uri = imageUrl;
    if (!isLocalFile && !imageUrl.startsWith('http')) {
      // If it's not a local file and doesn't start with http, assume it's a relative path
      uri = `file://${imageUrl}`;
    }

    console.log('[ColorUtils] Processing image URI:', uri);

    const result = await ImageColors.getColors(uri, {
      fallback: Colors.lightGray,
      cache: true,
      key: imageUrl,
    });

    console.log('[ColorUtils] ImageColors.getColors result:', {
      platform: result.platform,
      result: JSON.stringify(result),
    });

    const { backgroundColor, foregroundColor, accentColor } = getBestColor(result);
    const secondaryColor = getSecondaryColor(result);
    
    console.log('[ColorUtils] getBestColor result:', {
      backgroundColor,
      foregroundColor,
      accentColor,
    });
    
    console.log('[ColorUtils] getSecondaryColor result:', secondaryColor);
    
    const finalColors = ensureAccessibleColors(backgroundColor, foregroundColor);
    
    console.log('[ColorUtils] ensureAccessibleColors result:', finalColors);

    // Ensure accent color is bright and vibrant
    const brightAccentColor = ensureBrightAccentColor(accentColor || secondaryColor);
    
    console.log('[ColorUtils] ensureBrightAccentColor result:', brightAccentColor);

    const finalResult = {
      backgroundColor: finalColors.backgroundColor,
      foregroundColor: finalColors.foregroundColor,
      textColor: finalColors.foregroundColor,
      secondaryColor: secondaryColor,
      accentColor: brightAccentColor, // Use bright accent color for vibrant UI elements
      statusBarStyle: isColorDark(finalColors.backgroundColor) ? 'light' as const : 'dark' as const,
    };
    
    console.log('[ColorUtils] Final extracted colors:', finalResult);
    return finalResult;
  } catch (error) {
          // console.error('Error extracting colors from image:', error);
    return {
      backgroundColor: Colors.darkGray,
      foregroundColor: Colors.white,
      textColor: Colors.white,
      secondaryColor: Colors.lightGray,
      accentColor: '#000000', // Accent to black
      statusBarStyle: 'light' as const,
    };
  }
}