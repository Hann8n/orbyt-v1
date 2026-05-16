/**
 * TrueSheet footer: the native footer is position:absolute and overlays the content.
 * To avoid list content being cut off, use useMeasuredFooterHeight() from this package
 * and apply the returned padding to your list's contentContainerStyle (or content wrapper).
 */

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

