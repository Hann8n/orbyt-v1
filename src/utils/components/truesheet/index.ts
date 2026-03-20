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
  FOOTER_BOTTOM_PADDING_MAX,
  FOOTER_BOTTOM_PADDING_DEFAULT,
  FOOTER_TOP_PADDING_DEFAULT,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  COMPOSER_INPUT_PADDING,
  COMPOSER_INPUT_DIMENSIONS,
  getFooterBottomPadding,
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
  SHEET_DETENTS,
  SHEET_SPACING,
  SHEET_TEXT_STYLES,
  DEFAULT_GRABBER_OPTIONS,
  SHEET_VARIANTS,
  type SheetDetent,
} from './trueSheetPresets';
export { SHEET_STYLES, sheetPaddingBottomStyle, COMPOSER_STYLES } from './sheetStyles';
export { default as SheetActionFooter } from './SheetActionFooter';
