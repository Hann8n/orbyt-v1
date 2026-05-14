/**
 * TrueSheet footer: the native footer is position:absolute and overlays the content.
 * To avoid list content being cut off, use useMeasuredFooterHeight() from this package
 * and apply the returned padding to your list's contentContainerStyle (or content wrapper).
 */

/** Maximum bottom padding for sheet footers (caps the home-indicator inset on large-safe-area devices). */
const FOOTER_BOTTOM_PADDING_MAX = 34;

/** Fallback footer inset when safe-area data is unavailable. */
const FOOTER_BOTTOM_PADDING_DEFAULT = 0;

/** Default padding between sheet content and footer (above Cancel/Close button). */
export const FOOTER_TOP_PADDING_DEFAULT = 12;

/** Shared padding for composer input areas (chat, SendTo, comments). */
export const COMPOSER_INPUT_PADDING = {
  horizontal: 16,
  vertical: 12,
} as const;

/** Shared dimensions for composer input and send button. */
export const COMPOSER_INPUT_DIMENSIONS = {
  minHeight: 42,
  maxHeight: 120,
  paddingVertical: 9,
  sendButtonSize: 42,
  sendButtonPadding: 8,
  sendButtonMarginLeft: 8,
} as const;

/**
 * Normalized footer bottom inset for close/done actions.
 * We clamp to a compact range so the button stays visually consistent across devices.
 */
export const getFooterBottomPadding = (safeAreaBottom: number): number =>
  Math.max(FOOTER_BOTTOM_PADDING_DEFAULT, Math.min(safeAreaBottom, FOOTER_BOTTOM_PADDING_MAX));
