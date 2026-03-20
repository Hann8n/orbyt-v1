/**
 * TrueSheet footer: the native footer is position:absolute and overlays the content.
 * To avoid list content being cut off, use useMeasuredFooterHeight() from this package
 * and apply the returned padding to your list's contentContainerStyle (or content wrapper).
 */

/** Minimum padding below footer Cancel/Done buttons (older devices may have 0 safe area). */
export const FOOTER_BOTTOM_PADDING_MIN = 8;

/** Maximum bottom padding for compact sheet footers on large-safe-area devices. */
export const FOOTER_BOTTOM_PADDING_MAX = 16;

/** Default compact footer inset when safe-area data is unavailable. */
export const FOOTER_BOTTOM_PADDING_DEFAULT = 12;

/** Default padding between sheet content and footer (above Cancel/Close button). */
export const FOOTER_TOP_PADDING_DEFAULT = 12;

/**
 * Pixels to subtract from content bottom padding so items sit closer to the footer.
 * Reduces excess gap while keeping content visible above the overlay.
 */
export const CONTENT_TO_FOOTER_GAP_REDUCTION = 12;

/**
 * Normalized footer bottom inset for close/done actions.
 * We clamp to a compact range so the button stays visually consistent across devices.
 */
export const getFooterBottomPadding = (safeAreaBottom: number): number =>
  Math.max(FOOTER_BOTTOM_PADDING_DEFAULT, Math.min(safeAreaBottom, FOOTER_BOTTOM_PADDING_MAX));
