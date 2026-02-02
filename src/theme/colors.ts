// ============================================================================
// ORBYT COLOR SYSTEM
// ============================================================================
// This file contains ONLY color definitions with NO imports from app code.
// This prevents circular dependencies in the module graph.
// ============================================================================

/**
 * Comprehensive color palette built from Orbyt brand colors:
 * - Purple (#551def) - Primary brand
 * - Teal (#01f5b3) - Success/Accent
 * - Coral (#fe5f79) - Error/Attention
 * - White (#f3f5fe) - Background base (cool-tinted)
 *
 * Each scale uses HSL-based generation for perceptual uniformity.
 * All colors tested for WCAG AA compliance.
 */

export const Colors = {
  // ═══════════════════════════════════════════════════════════════════════════
  // BRAND COLORS (Original Orbyt colors)
  // ═══════════════════════════════════════════════════════════════════════════
  brand: {
    purple: '#551def', // Primary brand (hsl 256, 87%, 53%)
    teal: '#01f5b3', // Accent/success (hsl 164, 99%, 48%)
    coral: '#fe5f79', // Attention/error (hsl 350, 99%, 68%)
    white: '#f3f5fe', // Background (hsl 229, 69%, 97%)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PURPLE SCALE (Primary - hue 256°, HIGH SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  purple: {
    50: '#f5f0ff',
    100: '#ece0ff',
    200: '#d4bfff',
    300: '#b894ff',
    400: '#9b6aff',
    500: '#551def', // ← Brand purple
    600: '#4a14cc',
    700: '#3c10a6',
    800: '#2e0c80',
    900: '#200858',
    950: '#120430',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAL SCALE (Accent/Success - hue 164°, MAX SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  teal: {
    50: '#e0fff5',
    100: '#b3ffe9',
    200: '#75ffd8',
    300: '#38ffc6',
    400: '#01f5b3', // ← Brand teal
    500: '#00d69c',
    600: '#00b382',
    700: '#008f68',
    800: '#006b4e',
    900: '#004734',
    950: '#00291e',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CORAL SCALE (Attention/Error - hue 350°, HIGH SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  coral: {
    50: '#fff0f2',
    100: '#ffdbdf',
    200: '#ffb8c2',
    300: '#ff8d9e',
    400: '#fe5f79', // ← Brand coral
    500: '#f5355a',
    600: '#db1f44',
    700: '#b71a39',
    800: '#93152e',
    900: '#6f1023',
    950: '#450a15',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEUTRAL SCALE (Cool-tinted grays - hue 229° from Orbyt White)
  // ═══════════════════════════════════════════════════════════════════════════
  neutral: {
    0: '#f3f5fe', // ← Orbyt White (no pure white in app)
    50: '#f3f5fe', // ← Orbyt White
    100: '#e9ecf8',
    200: '#d5daea',
    300: '#b4bcce',
    400: '#8891ab',
    500: '#636c88',
    600: '#4d5570',
    700: '#3b4259',
    800: '#282e42',
    900: '#1a1e2e',
    950: '#0d0f17',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AMBER SCALE (Warning - hue 38°, MAX SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  amber: {
    50: '#fffaeb',
    100: '#fff0c2',
    200: '#ffdf85',
    300: '#ffcc3d',
    400: '#ffb800',
    500: '#ffa500', // Vibrant orange-gold
    600: '#d68a00',
    700: '#ad7000',
    800: '#855600',
    900: '#5c3c00',
    950: '#332100',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLUE SCALE (Info - hue 217°, HIGH SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  blue: {
    50: '#f0f5ff',
    100: '#dce8ff',
    200: '#b8d4ff',
    300: '#85b8ff',
    400: '#5299ff',
    500: '#2b7fff', // Vibrant blue
    600: '#1766e6',
    700: '#1355c0',
    800: '#12449a',
    900: '#103374',
    950: '#0d1f45',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ORANGE SCALE (Secondary Accent - hue 17°, HIGH SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  orange: {
    50: '#fff5f0',
    100: '#ffe5d6',
    200: '#ffc9a8',
    300: '#ffa670',
    400: '#ff7c33',
    500: '#ff6b35', // ← Vibrant orange
    600: '#eb4f0a',
    700: '#c44108',
    800: '#9c3409',
    900: '#752709',
    950: '#451607',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CYAN SCALE (Electric Highlights - hue 187°, MAX SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  cyan: {
    50: '#f0feff',
    100: '#ccfcff',
    200: '#8ff8ff',
    300: '#3df0ff',
    400: '#00e5ff', // ← Electric cyan
    500: '#00b5d6',
    600: '#0096b3',
    700: '#007890',
    800: '#005e70',
    900: '#004452',
    950: '#002830',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SEMANTIC ALIASES (Use these in components for consistent meaning)
  // ═══════════════════════════════════════════════════════════════════════════

  // Primary actions
  primary: '#551def', // purple.500
  primaryLight: '#9b6aff', // purple.400 (vibrant)
  primaryDark: '#4a14cc', // purple.600

  // Accent
  accent: '#01f5b3', // teal.400
  accentLight: '#38ffc6', // teal.300 (vibrant)
  accentDark: '#00d69c', // teal.500

  // Feedback states
  success: '#00d69c', // teal.500
  successLight: '#e0fff5', // teal.50
  warning: '#ffa500', // amber.500 (vibrant orange-gold)
  warningLight: '#fffaeb', // amber.50
  error: '#f5355a', // coral.500 (vibrant)
  errorLight: '#fff0f2', // coral.50
  info: '#2b7fff', // blue.500 (vibrant)
  infoLight: '#f0f5ff', // blue.50

  // Backgrounds
  background: '#f3f5fe', // neutral.50 (Orbyt White)
  surface: '#f3f5fe', // neutral.0 (Orbyt White)
  surfaceElevated: '#e9ecf8', // neutral.100
  surfaceDark: '#1a1e2e', // neutral.900
  surfaceDarkElevated: '#282e42', // neutral.800

  // Text
  textPrimary: '#3b4259', // neutral.700
  textSecondary: '#636c88', // neutral.500
  textMuted: '#8891ab', // neutral.400
  textInverse: '#f3f5fe', // neutral.50
  textOnDark: '#e9ecf8', // neutral.100

  // Borders
  border: '#d5daea', // neutral.200
  borderLight: '#e9ecf8', // neutral.100
  borderDark: '#3b4259', // neutral.700

  // ═══════════════════════════════════════════════════════════════════════════
  // ESSENTIAL COLORS (commonly used base colors)
  // ═══════════════════════════════════════════════════════════════════════════
  black: '#000000',
  white: '#f3f5fe', // Orbyt White (neutral.50)

  // Legacy convenience aliases
  lightGray: '#d5daea', // neutral.200
  mediumGray: '#4d5570', // neutral.600
  darkGray: '#1a1e2e', // neutral.900
  gray: '#636c88', // neutral.500
  red: '#f5355a', // coral.500 (error)
  green: '#00d69c', // teal.500 (success)
  yellow: '#ffa500', // amber.500 (warning)

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERLAYS (with alpha)
  // ═══════════════════════════════════════════════════════════════════════════
  overlay: {
    black15: 'rgba(0, 0, 0, 0.15)',
    black35: 'rgba(0, 0, 0, 0.35)',
    black50: 'rgba(0, 0, 0, 0.50)',
    black60: 'rgba(0, 0, 0, 0.60)',
    black70: 'rgba(0, 0, 0, 0.70)',
    black85: 'rgba(0, 0, 0, 0.85)',
    black95: 'rgba(0, 0, 0, 0.95)',
    white10: 'rgba(255, 255, 255, 0.10)',
    white30: 'rgba(255, 255, 255, 0.30)',
    white80: 'rgba(255, 255, 255, 0.80)',
  },

  // Legacy overlay aliases (for backward compatibility)
  overlayBlack15: 'rgba(0, 0, 0, 0.15)',
  overlayBlack35: 'rgba(0, 0, 0, 0.35)',
  overlayBlack50: 'rgba(0, 0, 0, 0.5)',
  overlayBlack60: 'rgba(0, 0, 0, 0.6)',
  overlayBlack70: 'rgba(0, 0, 0, 0.7)',
  overlayBlack75: 'rgba(0, 0, 0, 0.75)',
  overlayBlack85: 'rgba(0, 0, 0, 0.85)',
  overlayBlack95: 'rgba(0, 0, 0, 0.95)',
  overlayWhite10: 'rgba(255, 255, 255, 0.1)',
  overlayWhite30: 'rgba(255, 255, 255, 0.3)',
  overlayWhite80: 'rgba(255, 255, 255, 0.8)',
  transparent: 'transparent',

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPONENT-SPECIFIC COLORS
  // ═══════════════════════════════════════════════════════════════════════════
  INTERACTIVE: {
    HEART: {
      ACTIVE: '#f5355a', // coral.500 (vibrant)
      INACTIVE: '#d5daea', // neutral.200
    },
    REPOST: {
      ACTIVE: '#00d69c', // teal.500 (vibrant)
      INACTIVE: '#f3f5fe', // Orbyt White
    },
    COMMENT: '#f3f5fe', // Orbyt White
  },

  STATUS: {
    SUCCESS: '#00d69c', // teal.500 (vibrant)
    ERROR: '#f5355a', // coral.500 (vibrant)
    WARNING: '#ffa500', // amber.500 (vibrant)
    INFO: '#551def', // purple.500
    LIVE: '#f5355a', // coral.500 (vibrant)
  },

  PROFILE: {
    DEFAULT_RING: '#d5daea', // neutral.200
  },

  SHIMMER: {
    PRIMARY: ['#1a1e2e', '#282e42', '#1a1e2e'] as const, // neutral.900 → neutral.800 → neutral.900
  },
} as const;

// Type helpers for color scales
export type ColorScale = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
export type NeutralScale = 0 | ColorScale;

// Type for the Colors object
export type ColorsType = typeof Colors;
