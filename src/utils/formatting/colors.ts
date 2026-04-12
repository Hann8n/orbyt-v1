import ImageColors, { ImageColorsResult } from 'react-native-image-colors';
import { APP_CONSTANTS } from '../constants';
import { Colors } from '../../theme';

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
 * Blends two hex colors together to create a solid color
 * @param color1 First hex color (e.g., '#FFFFFF')
 * @param color2 Second hex color (e.g., `Colors.black`)
 * @param ratio Blend ratio (0-1), where 0 = color1, 1 = color2
 * @returns Blended hex color string
 */
export const blendColors = (color1: string, color2: string, ratio: number = 0.5): string => {
  'worklet';
  const r = Math.round(
    parseInt(color1.slice(1, 3), 16) * (1 - ratio) + parseInt(color2.slice(1, 3), 16) * ratio
  );
  const g = Math.round(
    parseInt(color1.slice(3, 5), 16) * (1 - ratio) + parseInt(color2.slice(3, 5), 16) * ratio
  );
  const b = Math.round(
    parseInt(color1.slice(5, 7), 16) * (1 - ratio) + parseInt(color2.slice(5, 7), 16) * ratio
  );
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
export const getRelativeLuminance = (hex: string): number => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16) / 255;
  const g = parseInt(color.substring(2, 4), 16) / 255;
  const b = parseInt(color.substring(4, 6), 16) / 255;

  const transform = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

/**
 * Returns the lighter of two hex colors (higher relative luminance).
 * Used for native tab bar tint so icons stay visible on any profile theme.
 */
export const pickLighterHex = (a: string, b: string): string =>
  getRelativeLuminance(a) >= getRelativeLuminance(b) ? a : b;

/** Inactive tab bar icon/label color (used by both native and custom tab bars). */
export const TAB_BAR_INACTIVE_TINT = blendColors(Colors.neutral[200], Colors.neutral[300], 0.5);

const MIN_DARK_BG_CONTRAST = 4.5;
const MUDDY_SATURATION_THRESHOLD = 0.18;

function getSaturation(hex: string): number {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16) / 255;
  const g = parseInt(color.substring(2, 4), 16) / 255;
  const b = parseInt(color.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function ensureVisibleOnDarkBackground(hex: string, lighterProfileColor: string): string {
  if (getContrastRatio(hex, Colors.black) >= MIN_DARK_BG_CONTRAST) {
    return hex;
  }

  // Gradually lift toward the lighter profile color to preserve theme identity.
  for (let i = 1; i <= 6; i += 1) {
    const candidate = blendColors(hex, lighterProfileColor, i * 0.15);
    if (getContrastRatio(candidate, Colors.black) >= MIN_DARK_BG_CONTRAST) {
      return candidate;
    }
  }

  // Final fallback for guaranteed visibility.
  return Colors.neutral[50];
}

export function getProfileMiddleAccentColor(profile: ProfileColorScheme | null): string {
  if (!profile) return Colors.neutral[50];
  const middle = blendColors(profile.backgroundColor, profile.foregroundColor, 0.5);
  const lighter = pickLighterHex(profile.backgroundColor, profile.foregroundColor);

  // RGB midpoints can look muddy; nudge toward the lighter profile color and boost saturation.
  const deMuddiedMiddle =
    getSaturation(middle) < MUDDY_SATURATION_THRESHOLD
      ? enhanceColorSaturation(blendColors(middle, lighter, 0.3), 1.2)
      : middle;

  return ensureVisibleOnDarkBackground(deMuddiedMiddle, lighter);
}

/**
 * Active tint for tab bar from profile colors (lighter of bg/fg so icons stay visible on any theme).
 * Use for native tabs; custom tab bar uses fixed Colors.neutral[50].
 */
export function getTabBarActiveTintFromProfile(profile: ProfileColorScheme | null): string {
  return getProfileMiddleAccentColor(profile);
}

/**
 * Determines the appropriate status bar style based on background color
 * @param backgroundColor - Hex color string
 * @returns 'light' for dark backgrounds, 'dark' for light backgrounds
 */
export const getStatusBarStyle = (backgroundColor: string): 'light' | 'dark' => {
  return isColorDark(backgroundColor) ? 'light' : 'dark';
};

/**
 * Default profile colors used throughout the app (orbyt grey – from palette neutral scale).
 */
export const DEFAULT_PROFILE_COLORS = {
  backgroundColor: Colors.neutral[900],
  foregroundColor: Colors.neutral[200],
  statusBarStyle: 'light' as const,
};

/**
 * Adaptive blend ratio toward black for profile chrome.
 * Uses WCAG relative luminance to scale non-linearly:
 * light colors (near white) get a gentle blend (~0.10) so they stay tinted,
 * not greyed; dark colors get a richer deepening (~0.25).
 *
 *   blend(L) = 0.10 + 0.15 * (1 - L)
 *
 * where L = relative luminance ∈ [0, 1].
 * This keeps the perceived darkening proportional across the full range.
 */
function getAdaptiveChromeBlend(hex: string): number {
  const L = getRelativeLuminance(hex);
  return 0.1 + 0.15 * (1 - L);
}

/**
 * Type for profile colors
 */
export interface ProfileColorScheme {
  backgroundColor: string;
  /** Slightly deeper variant of `backgroundColor` for screen root / feed area (list & grid gaps). */
  chromeBackgroundColor: string;
  foregroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  statusBarStyle: 'light' | 'dark';
}

/**
 * orbyt API color data type (matches OrbytColors response)
 */
export interface OrbytAPIColorData {
  textColor: string;
  backgroundColor: string;
  joinedAt: string;
  isBeta: boolean;
}

/**
 * Get profile colors from orbyt API data or ProfileViewWithOrbyt.
 *
 * Supports:
 * 1. OrbytAPIColorData / OrbytColorData (backgroundColor, textColor at top level)
 * 2. ProfileViewWithOrbyt.orbytColors (centralized profile color source)
 */
export function getProfileColors(
  colorData:
    | OrbytAPIColorData
    | { orbytColors?: { backgroundColor: string; textColor: string } | null }
    | null
    | undefined
): ProfileColorScheme {
  let backgroundColor: string = DEFAULT_PROFILE_COLORS.backgroundColor;
  let textColor: string = DEFAULT_PROFILE_COLORS.foregroundColor;

  if (colorData) {
    // 1. OrbytAPIColorData / OrbytColorData (top-level)
    if ('backgroundColor' in colorData && 'textColor' in colorData) {
      backgroundColor = colorData.backgroundColor || DEFAULT_PROFILE_COLORS.backgroundColor;
      textColor = colorData.textColor || DEFAULT_PROFILE_COLORS.foregroundColor;
    }
    // 2. ProfileViewWithOrbyt.orbytColors (from cached profile)
    else if ('orbytColors' in colorData && colorData.orbytColors) {
      const o = colorData.orbytColors;
      backgroundColor = o.backgroundColor || DEFAULT_PROFILE_COLORS.backgroundColor;
      textColor = o.textColor || DEFAULT_PROFILE_COLORS.foregroundColor;
    }
  }

  return {
    backgroundColor,
    chromeBackgroundColor: blendColors(
      backgroundColor,
      Colors.black,
      getAdaptiveChromeBlend(backgroundColor)
    ),
    foregroundColor: textColor,
    textColor,
    primaryColor: backgroundColor,
    secondaryColor: textColor,
    statusBarStyle: getStatusBarStyle(backgroundColor),
  };
}

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
  let backgroundColor: string = Colors.black;
  let foregroundColor: string = '#FFFFFF';
  let accentColor: string = '#FFFFFF';

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
      foregroundColor = result.darkVibrant || result.darkMuted || result.muted || Colors.black;
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
      foregroundColor = result.primary || Colors.black;
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
      foregroundColor = result.darkVibrant || Colors.black;
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
    foregroundColor = isColorDark(backgroundColor) ? '#FFFFFF' : Colors.black;
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
      fallback: Colors.neutral[200],
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
  } catch (_error) {
    return {
      backgroundColor: Colors.neutral[900],
      foregroundColor: Colors.neutral[50],
      textColor: Colors.neutral[50],
      accentColor: '#FFFFFF',
      statusBarStyle: 'light' as const,
    };
  }
}

/**
 * Batch extract colors from multiple images
 * Uses requestIdleCallback to defer operations until after interactions complete
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

  return new Promise(resolve => {
    // Defer batch color extraction until after interactions complete
    requestIdleCallback(
      async () => {
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
                  backgroundColor: Colors.neutral[900],
                  foregroundColor: Colors.neutral[50],
                  textColor: Colors.neutral[50],
                  accentColor: '#FFFFFF',
                  statusBarStyle: 'light' as const,
                });
              }
            });
          }

          resolve(results);
        } catch (_error) {
          // Return fallback colors for all images on error
          resolve(
            imageUrls.map(() => ({
              backgroundColor: Colors.neutral[900],
              foregroundColor: Colors.neutral[50],
              textColor: Colors.neutral[50],
              accentColor: '#FFFFFF',
              statusBarStyle: 'light' as const,
            }))
          );
        }
      },
      { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
    );
  });
}
