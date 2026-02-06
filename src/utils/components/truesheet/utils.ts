/**
 * TrueSheet footer: the native footer is position:absolute and overlays the content.
 * To avoid list content being cut off, use useMeasuredFooterHeight() from this package
 * and apply the returned padding to your list's contentContainerStyle (or content wrapper).
 */

/** Minimum padding below footer Cancel/Done buttons (older devices may have 0 safe area). */
export const FOOTER_BOTTOM_PADDING_MIN = 0;

/** Default padding between sheet content and footer (above Cancel/Close button). */
export const FOOTER_TOP_PADDING_DEFAULT = 12;

/**
 * Pixels to subtract from content bottom padding so items sit closer to the footer.
 * Reduces excess gap while keeping content visible above the overlay.
 */
export const CONTENT_TO_FOOTER_GAP_REDUCTION = 12;
