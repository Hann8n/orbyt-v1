import type { HybridObject } from 'react-native-nitro-modules';

export interface NitroColors extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Blend two #rrggbb hex colors by `ratio` (0 = hex1, 1 = hex2). Returns #rrggbb. */
  blendColors(hex1: string, hex2: string, ratio: number): string;

  /** WCAG relative luminance for a #rrggbb hex color (0–1). */
  getRelativeLuminance(hex: string): number;

  /** WCAG contrast ratio between two #rrggbb hex colors (1–21). */
  getContrastRatio(hex1: string, hex2: string): number;

  /** True when the color's perceived brightness is below 128 (YIQ formula). */
  isColorDark(hex: string): boolean;

  /** Darken a #rrggbb hex color by `amount` (0–1). Single-pass, clamps to black. */
  darkenColor(hex: string, amount: number): string;

  /** Boost HSL saturation of a #rrggbb hex color by `saturationBoost` multiplier. */
  enhanceColorSaturation(hex: string, saturationBoost: number): string;

  /** Convert #rrggbb hex + alpha (0–1) to an rgba(...) CSS string. */
  hexToRGBA(hex: string, alpha: number): string;
}
