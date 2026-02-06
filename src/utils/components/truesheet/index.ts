/**
 * TrueSheet utilities
 *
 * Footer padding: TrueSheet's footer is position:absolute and overlays content.
 * Use useMeasuredFooterHeight() so list content isn't cut off—no manual magic numbers.
 */

export { default as KeyboardAwareFooter } from './KeyboardAwareFooter';
export { useMeasuredFooterHeight } from './useMeasuredFooterHeight';
export {
  FOOTER_BOTTOM_PADDING_MIN,
  FOOTER_TOP_PADDING_DEFAULT,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
} from './utils';
export {
  AppTrueSheet,
  DEFAULT_HEADER_STYLE,
  type AppTrueSheetProps,
  type AppTrueSheetVariant,
} from './AppTrueSheet';
export {
  DEFAULT_SHEET_PROPS,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  SHEET_VARIANTS,
  type SheetDetent,
} from './trueSheetPresets';
