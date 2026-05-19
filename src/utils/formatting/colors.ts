import ImageColors, { ImageColorsResult } from 'react-native-image-colors';
import { Colors } from '../../theme';

function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.round(Math.min(255, Math.max(0, v * 255)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

export const hexToRGBA = (hex: string, alpha: number): string => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
};

export const blendColors = (color1: string, color2: string, ratio: number = 0.5): string => {
  const [r1, g1, b1] = parseHex(color1);
  const [r2, g2, b2] = parseHex(color2);
  const t = Math.min(1, Math.max(0, ratio));
  return toHex(r1 * (1 - t) + r2 * t, g1 * (1 - t) + g2 * t, b1 * (1 - t) + b2 * t);
};

export const isColorDark = (hex: string): boolean => {
  const [r, g, b] = parseHex(hex);
  return ((r * 299 + g * 587 + b * 114) * 255) / 1000 < 128;
};

/** Darken a color by `amount` (0–1). Single linear pass; clamps to black. */
export const darkenColor = (hex: string, amount: number = 0.4): string => {
  const [r, g, b] = parseHex(hex);
  const t = Math.min(1, Math.max(0, amount));
  return toHex(r * (1 - t), g * (1 - t), b * (1 - t));
};

export const getRelativeLuminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

export const getContrastRatio = (color1: string, color2: string): number => {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

export const enhanceColorSaturation = (hex: string, saturationBoost: number = 1.3): string => {
  const [r, g, b] = parseHex(hex);
  const cmax = Math.max(r, g, b),
    cmin = Math.min(r, g, b);
  const delta = cmax - cmin,
    l = (cmax + cmin) / 2;
  if (delta === 0) return hex;
  let h = 0;
  if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = (((h / 6) % 1) + 1) % 1;
  const s = Math.min(
    1,
    (l > 0.5 ? delta / (2 - cmax - cmin) : delta / (cmax + cmin)) * saturationBoost
  );
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
    p = 2 * l - q;
  const hue2rgb = (p2: number, q2: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
    if (t < 1 / 2) return q2;
    if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
    return p2;
  };
  return toHex(hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3));
};

// ---------------------------------------------------------------------------
// Color scheme helpers
// ---------------------------------------------------------------------------

export const getStatusBarStyle = (foregroundColor: string): 'light' | 'dark' =>
  isColorDark(foregroundColor) ? 'dark' : 'light';

/** Inactive tab bar icon/label color. */
export const TAB_BAR_INACTIVE_TINT = blendColors(Colors.neutral[200], Colors.neutral[300], 0.5);

const MIN_DARK_BG_CONTRAST = 4.5;
const MUDDY_SATURATION_THRESHOLD = 0.18;

function getSaturation(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const cmax = Math.max(r, g, b);
  const cmin = Math.min(r, g, b);
  const l = (cmax + cmin) / 2;
  if (cmax === cmin) return 0;
  const d = cmax - cmin;
  return l > 0.5 ? d / (2 - cmax - cmin) : d / (cmax + cmin);
}

function pickLighterHex(a: string, b: string): string {
  return getRelativeLuminance(a) >= getRelativeLuminance(b) ? a : b;
}

function ensureVisibleOnDarkBackground(hex: string, lighterProfileColor: string): string {
  if (getContrastRatio(hex, Colors.black) >= MIN_DARK_BG_CONTRAST) return hex;
  for (let i = 1; i <= 6; i++) {
    const candidate = blendColors(hex, lighterProfileColor, i * 0.15);
    if (getContrastRatio(candidate, Colors.black) >= MIN_DARK_BG_CONTRAST) return candidate;
  }
  return Colors.neutral[50];
}

function getProfileMiddleAccentColor(profile: ProfileColorScheme | null): string {
  if (!profile) return Colors.neutral[50];
  const middle = blendColors(profile.backgroundColor, profile.foregroundColor, 0.5);
  const lighter = pickLighterHex(profile.backgroundColor, profile.foregroundColor);
  const deMuddied =
    getSaturation(middle) < MUDDY_SATURATION_THRESHOLD
      ? enhanceColorSaturation(blendColors(middle, lighter, 0.3), 1.2)
      : middle;
  return ensureVisibleOnDarkBackground(deMuddied, lighter);
}

/** Active tint for tab bar derived from profile colors. */
export function getTabBarActiveTintFromProfile(profile: ProfileColorScheme | null): string {
  return getProfileMiddleAccentColor(profile);
}

function getAdaptiveChromeBlend(hex: string): number {
  const L = getRelativeLuminance(hex);
  return 0.1 + 0.15 * (1 - L);
}

export interface ProfileColorScheme {
  backgroundColor: string;
  /** Slightly deeper variant of `backgroundColor` for screen root / feed area. */
  chromeBackgroundColor: string;
  foregroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  statusBarStyle: 'light' | 'dark';
}

export interface OrbytAPIColorData {
  textColor: string;
  backgroundColor: string;
  joinedAt: string;
  isBeta: boolean;
}

const DEFAULT_PROFILE_COLORS = {
  backgroundColor: Colors.neutral[900],
  foregroundColor: Colors.neutral[200],
  statusBarStyle: 'light' as const,
};

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
    if ('backgroundColor' in colorData && 'textColor' in colorData) {
      backgroundColor = colorData.backgroundColor || DEFAULT_PROFILE_COLORS.backgroundColor;
      textColor = colorData.textColor || DEFAULT_PROFILE_COLORS.foregroundColor;
    } else if ('orbytColors' in colorData && colorData.orbytColors) {
      backgroundColor =
        colorData.orbytColors.backgroundColor || DEFAULT_PROFILE_COLORS.backgroundColor;
      textColor = colorData.orbytColors.textColor || DEFAULT_PROFILE_COLORS.foregroundColor;
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
    statusBarStyle: getStatusBarStyle(textColor),
  };
}

// ---------------------------------------------------------------------------
// Image color extraction
// ---------------------------------------------------------------------------

function getBestColor(result: ImageColorsResult): {
  backgroundColor: string;
  foregroundColor: string;
  accentColor: string;
} {
  const r = result as unknown as Record<string, string | undefined>;

  const vibrantCandidates = [
    r['vibrant'],
    r['darkVibrant'],
    r['lightVibrant'],
    r['primary'],
    r['secondary'],
    r['dominant'],
    r['average'],
    r['background'],
    r['muted'],
    r['darkMuted'],
    r['lightMuted'],
    r['detail'],
  ];
  const backgroundColor = enhanceColorSaturation(
    vibrantCandidates.find(Boolean) ?? Colors.black,
    1.4
  );

  const accentCandidates = [
    r['lightVibrant'],
    r['vibrant'],
    r['secondary'],
    r['detail'],
    r['lightMuted'],
  ];
  const accentColor = enhanceColorSaturation(accentCandidates.find(Boolean) ?? '#FFFFFF', 1.5);

  const darkBg = isColorDark(backgroundColor);
  const fgCandidates = darkBg
    ? [r['lightVibrant'], r['secondary'], r['lightMuted'], r['detail']]
    : [r['darkVibrant'], r['primary'], r['darkMuted'], r['muted']];
  let foregroundColor = fgCandidates.find(Boolean) ?? (darkBg ? '#FFFFFF' : Colors.black);

  if (
    foregroundColor.toLowerCase() === backgroundColor.toLowerCase() ||
    getContrastRatio(backgroundColor, foregroundColor) < 3.0
  ) {
    foregroundColor = darkBg ? '#FFFFFF' : Colors.black;
  }

  return { backgroundColor, foregroundColor, accentColor };
}

/**
 * Extract colors from image — for use in the edit screen as suggestions only.
 * Not for automatic profile color setting.
 */
export async function extractColorsFromImage(imageUrl: string): Promise<{
  backgroundColor: string;
  foregroundColor: string;
  textColor: string;
  accentColor: string;
  statusBarStyle: 'light' | 'dark';
}> {
  try {
    let uri = imageUrl;
    if (
      !imageUrl.startsWith('file://') &&
      !imageUrl.startsWith('/') &&
      !imageUrl.startsWith('http')
    ) {
      uri = `file://${imageUrl}`;
    }

    const result = await ImageColors.getColors(uri, {
      fallback: Colors.neutral[200],
      cache: true,
      key: imageUrl,
    });

    const { backgroundColor, foregroundColor, accentColor } = getBestColor(result);
    return {
      backgroundColor,
      foregroundColor,
      textColor: foregroundColor,
      accentColor: accentColor || foregroundColor,
      statusBarStyle: isColorDark(foregroundColor) ? 'dark' : 'light',
    };
  } catch {
    return {
      backgroundColor: Colors.neutral[900],
      foregroundColor: Colors.neutral[50],
      textColor: Colors.neutral[50],
      accentColor: '#FFFFFF',
      statusBarStyle: 'light',
    };
  }
}
