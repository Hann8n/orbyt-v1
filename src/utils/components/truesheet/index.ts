/**
 * TrueSheet utilities
 *
 * Footer padding: TrueSheet's footer is position:absolute and overlays content.
 * Use useMeasuredFooterHeight() so list content isn't cut off—no manual magic numbers.
 */

export { useMeasuredFooterHeight } from './useMeasuredFooterHeight';
export {
  FOOTER_TOP_PADDING_DEFAULT,
  COMPOSER_INPUT_PADDING,
  COMPOSER_INPUT_DIMENSIONS,
} from './utils';
export { AppTrueSheet, type AppTrueSheetProps, type AppTrueSheetVariant } from './AppTrueSheet';
export {
  DEFAULT_SHEET_PROPS,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  SHEET_SPACING,
  SHEET_TEXT_STYLES,
  DEFAULT_GRABBER_OPTIONS,
  SHEET_VARIANTS,
  type SheetDetent,
} from './trueSheetPresets';
export { SHEET_STYLES, COMPOSER_STYLES, SHEET_VERTICAL_LIST_ROW_OUTER } from './sheetStyles';
export { default as SheetActionFooter } from './SheetActionFooter';
