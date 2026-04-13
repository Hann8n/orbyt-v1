import { Dimensions, PixelRatio } from 'react-native';
import { classifyDevice } from '@/utils/device/screen';
import { Colors } from '../../theme';

const LAYOUT_SCALE_DAMPING = 0.5;
const LAYOUT_SCALE_MAX = 1.08;
const LAYOUT_SCALE_MIN = 0.97;

/**
 * Calculate responsive scale factor for typography.
 * Balances user's system font scale (accessibility) with device dimensions.
 */
const getTypographyScale = (): number => {
  const { width, height } = Dimensions.get('window');
  const { isTablet, isSmallPhone } = classifyDevice(width, height);

  // Get user's system font scale (respects accessibility settings)
  const fontScale = PixelRatio.getFontScale();

  // For small phones, use user's font scale only (no dimension penalty)
  if (isSmallPhone) {
    return Math.max(1.0, Math.min(1.3, fontScale));
  }

  // Dimension-based scaling for other devices
  const BASE_WIDTH = 390;
  const BASE_HEIGHT = 844;
  const rawScale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
  const aspectRatio = height / width;
  const isTallScreen = aspectRatio > 2.1;

  // Device type adjustments
  const deviceAdjustment = (() => {
    if (isTablet) return 1.05;
    if (isTallScreen) return 1.0;
    return 1.0;
  })();

  const layoutProduct = rawScale * deviceAdjustment;
  const layoutScale = 1 + (layoutProduct - 1) * LAYOUT_SCALE_DAMPING;
  const clampedLayout = Math.max(LAYOUT_SCALE_MIN, Math.min(LAYOUT_SCALE_MAX, layoutScale));

  const finalScale = fontScale * clampedLayout;

  // Clamp to reasonable bounds
  return Math.max(0.95, Math.min(1.25, finalScale));
};

// Initial scale
let SCALE = getTypographyScale();

export type FontWeightToken = 'regular' | 'medium' | 'semibold' | 'bold' | 'black' | 'boldItalic';

export const FontFamily: Record<FontWeightToken, string> = {
  regular: 'Figtree-Regular',
  medium: 'Figtree-Medium',
  semibold: 'Figtree-SemiBold',
  bold: 'Figtree-Bold',
  black: 'Figtree-Black',
  boldItalic: 'Figtree-BoldItalic',
};

// Scale helper - uses current SCALE value
export const fontSizeFor = (base: number): number => Math.round(base * SCALE);

// Update scale dynamically (call when dimensions or font scale changes)
const updateTypographyScale = (): void => {
  SCALE = getTypographyScale();
};

// Line-height helper with gentle growth at larger sizes
export const lineHeightFor = (size: number): number => {
  const ratio = size >= 20 ? 1.3 : size >= 16 ? 1.28 : 1.24;
  return Math.round(size * ratio);
};

export type TextVariant =
  | 'display' // large, hero
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'overline';

// Unscaled base sizes (in pts), then scaled via fontSizeFor
const BASE_SIZES: Record<TextVariant, number> = {
  display: 34,
  h1: 28,
  h2: 24,
  h3: 20,
  title: 18,
  subtitle: 16,
  body: 15,
  bodySmall: 14,
  caption: 12,
  overline: 10,
};

// Helper to compute sizes dynamically
const computeSizes = () =>
  Object.fromEntries(
    (Object.keys(BASE_SIZES) as TextVariant[]).map(k => [k, fontSizeFor(BASE_SIZES[k])])
  ) as Record<TextVariant, number>;

const computeLineHeights = () =>
  Object.fromEntries(
    (Object.keys(BASE_SIZES) as TextVariant[]).map(k => {
      const s = fontSizeFor(BASE_SIZES[k]);
      return [k, lineHeightFor(s)];
    })
  ) as Record<TextVariant, number>;

export const Typography = {
  get scale(): number {
    return SCALE;
  },
  get sizes(): Record<TextVariant, number> {
    return computeSizes();
  },
  get lineHeights(): Record<TextVariant, number> {
    return computeLineHeights();
  },
  families: FontFamily,
  // Convenience: default weights per variant
  defaultWeight: {
    display: 'black',
    h1: 'bold',
    h2: 'bold',
    h3: 'semibold',
    title: 'medium',
    subtitle: 'medium',
    body: 'regular',
    bodySmall: 'regular',
    caption: 'regular',
    overline: 'semibold',
  } as Record<TextVariant, FontWeightToken>,
};

// Optional standardized Text component for consistent usage
import React, { useEffect, useState } from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';

/**
 * Hook to subscribe to font scale and dimension changes.
 * Forces components to re-render when user changes system font size.
 */
const useResponsiveTypography = () => {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      updateTypographyScale();
      forceUpdate(prev => prev + 1);
    });

    return () => subscription?.remove();
  }, []);

  return Typography;
};

export interface TypographyTextProps extends RNTextProps {
  variant?: TextVariant;
  weight?: FontWeightToken;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export const TypographyText: React.FC<TypographyTextProps> = ({
  variant = 'body',
  weight,
  color = Colors.neutral[50],
  align,
  style,
  children,
  ...rest
}) => {
  const typo = useResponsiveTypography();
  const resolvedSize = typo.sizes[variant];
  const resolvedLineHeight = typo.lineHeights[variant];
  const resolvedWeight = weight || typo.defaultWeight[variant];

  return (
    <RNText
      {...rest}
      style={[
        styles.base,
        {
          fontSize: resolvedSize,
          lineHeight: resolvedLineHeight,
          fontFamily: FontFamily[resolvedWeight],
          color,
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

const styles = StyleSheet.create({
  base: {
    // Keep default text rendering consistent across the app
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
