/**
 * @deprecated Use Colors from '../components/ui/UI' instead
 * This file is kept for backward compatibility
 */

import { Colors } from '../../components/ui/UI';

// Re-export all colors for backward compatibility
export const BRAND = Colors.BRAND;
export const TEXT = Colors.TEXT;
export const UI = {
  BACKGROUND: Colors.BACKGROUND,
  BORDER: Colors.BORDER,
  DIVIDER: Colors.BORDER.PRIMARY,
  INDICATOR: Colors.BORDER.LIGHT,
  SHIMMER: Colors.SHIMMER.PRIMARY,
};
export const INTERACTIVE = Colors.INTERACTIVE;
export const PROFILE = Colors.PROFILE;
export const STATUS = Colors.STATUS;
export const OVERLAY = Colors.OVERLAY;

// Re-export utility functions
export const alpha = {
  hex: (hex: string, alphaValue: number): string => {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alphaValue})`;
  },
};

export const isColorDark = (hex: string): boolean => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
};

// Export default object for backward compatibility
export default {
  BRAND,
  TEXT,
  UI,
  INTERACTIVE,
  PROFILE,
  STATUS,
  OVERLAY,
  alpha,
  isColorDark,
};
