import { Dimensions } from 'react-native';
import { isSmallScreen, isTablet, isTallScreen } from '../helpers';

const { width, height } = Dimensions.get('window');

// Guideline base sizes (iPhone 12/13/14 baseline)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

// Compute a conservative, clamped scale to ensure readability across devices
const rawScale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
const deviceAdjustment = (() => {
  if (isTablet()) return 1.12;
  if (isSmallScreen()) return 0.94;
  if (isTallScreen()) return 1.02;
  return 1;
})();

const SCALE = Math.max(0.9, Math.min(1.2, rawScale * deviceAdjustment));

export type FontWeightToken = 'regular' | 'medium' | 'semibold' | 'bold' | 'black' | 'boldItalic';

export const FontFamily: Record<FontWeightToken, string> = {
  regular: 'Firma-Regular',
  medium: 'Firma-Medium',
  semibold: 'Firma-SemiBold',
  bold: 'Firma-Bold',
  black: 'Firma-Black',
  boldItalic: 'Firma-BoldItalic',
};

// Scale helper
export const fontSizeFor = (base: number): number => Math.round(base * SCALE);

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
  body: 16,
  bodySmall: 14,
  caption: 12,
  overline: 10,
};

export const Typography = {
  scale: SCALE,
  sizes: Object.fromEntries(
    (Object.keys(BASE_SIZES) as TextVariant[]).map((k) => [k, fontSizeFor(BASE_SIZES[k])])
  ) as Record<TextVariant, number>,
  lineHeights: Object.fromEntries(
    (Object.keys(BASE_SIZES) as TextVariant[]).map((k) => {
      const s = fontSizeFor(BASE_SIZES[k]);
      return [k, lineHeightFor(s)];
    })
  ) as Record<TextVariant, number>,
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
import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';

export interface TypographyTextProps extends RNTextProps {
  variant?: TextVariant;
  weight?: FontWeightToken;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export const TypographyText: React.FC<TypographyTextProps> = ({
  variant = 'body',
  weight,
  color = '#FFFFFF',
  align,
  style,
  children,
  ...rest
}) => {
  const resolvedSize = Typography.sizes[variant];
  const resolvedLineHeight = Typography.lineHeights[variant];
  const resolvedWeight = weight || Typography.defaultWeight[variant];

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

export default Typography;


