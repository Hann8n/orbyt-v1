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

/** Full-bleed dark + ink on light surfaces — same as `neutral[975]` (cool blue-grey, not #000). */
const CANONICAL_BLACK = '#05070a' as const;

export const Colors = {
  // ═══════════════════════════════════════════════════════════════════════════
  // BRAND COLORS (Original Orbyt colors)
  // ═══════════════════════════════════════════════════════════════════════════
  brand: {
    purple: '#551def', // Primary brand (hsl 256, 87%, 53%)
    teal: '#01f5b3', // Accent/success (hsl 164, 99%, 48%)
    coral: '#fe5f79', // Attention/error (hsl 350, 99%, 68%)
    white: '#f3f5fe', // Background (hsl 229, 69%, 97%)
    germBrandGreen: '#7ee459', // Germ DM brand
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
  // PINK SCALE (Feedback accent - hue 325°, HIGH SATURATION)
  // ═══════════════════════════════════════════════════════════════════════════
  pink: {
    50: '#fff0f8',
    100: '#ffd9ef',
    200: '#ffb3df',
    300: '#ff80c7',
    400: '#ff4dad',
    500: '#f72595',
    600: '#d60f7a',
    700: '#ad0c63',
    800: '#850a4c',
    900: '#5c0735',
    950: '#33041d',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEUTRAL SCALE (cool blue-grey; 200=#ccd7e9 text, 900=#0e141b dark – orbyt grey)
  // ═══════════════════════════════════════════════════════════════════════════
  neutral: {
    0: '#f3f5fe', // ← Orbyt White (no pure white in app)
    50: '#f3f5fe', // ← Orbyt White
    100: '#e4eaf5',
    200: '#ccd7e9', // ← Default profile text / light grey
    300: '#a8b8d4',
    400: '#7a8aa8',
    500: '#5a6580', // ← Anchor grey
    600: '#3d4659',
    700: '#282f3d',
    800: '#1a1f2a',
    900: '#0e141b', // ← Default profile background / dark
    /** Between 900 and 950: raised rows/cards on 975 (mid blend, same hue family). */
    925: '#0c1118',
    950: '#0a0e14',
    /** Deepest neutral; same hex as `Colors.black` (canonical app “black”). */
    975: CANONICAL_BLACK,
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
  // ESSENTIAL & OVERLAYS (use scale above: neutral[N], purple[N], coral[N], etc.)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Alias of `neutral[975]` — use for backgrounds/text instead of literal #000. */
  black: CANONICAL_BLACK,

  /** Translucent scrims — RGB matches `CANONICAL_BLACK` (#05070a), not pure #000. */
  overlay: {
    black15: 'rgba(5, 7, 10, 0.15)',
    black35: 'rgba(5, 7, 10, 0.35)',
    black50: 'rgba(5, 7, 10, 0.50)',
    black60: 'rgba(5, 7, 10, 0.60)',
    black70: 'rgba(5, 7, 10, 0.70)',
    black75: 'rgba(5, 7, 10, 0.75)',
    black85: 'rgba(5, 7, 10, 0.85)',
    black95: 'rgba(5, 7, 10, 0.95)',
    white10: 'rgba(255, 255, 255, 0.10)',
    white30: 'rgba(255, 255, 255, 0.30)',
    white80: 'rgba(255, 255, 255, 0.80)',
  },

  transparent: 'transparent',
} as const;

// Type helpers for color scales
export type ColorScale = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
/** Neutral adds `925` / `975` between standard steps (other scales stop at 950). */
export type NeutralScale = 0 | ColorScale | 925 | 975;
