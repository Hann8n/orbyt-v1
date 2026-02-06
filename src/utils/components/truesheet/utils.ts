/**
 * TrueSheet footer: the native footer is position:absolute and overlays the content.
 * To avoid list content being cut off, use useMeasuredFooterHeight() from this package
 * and apply the returned padding to your list's contentContainerStyle (or content wrapper).
 */

/** Minimum padding below footer Cancel/Done buttons (older devices may have 0 safe area). */
export const FOOTER_BOTTOM_PADDING_MIN = 12;
