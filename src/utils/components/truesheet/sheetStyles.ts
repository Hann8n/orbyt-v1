import type { ViewStyle } from 'react-native';
import type { TextStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../constants';
import { FontFamily, Typography } from '../../components/typography';
import {
  DEFAULT_HEADER_STYLE,
  SHEET_SPACING,
  SHEET_TEXT_STYLES,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
} from './trueSheetPresets';
import { COMPOSER_INPUT_PADDING, COMPOSER_INPUT_DIMENSIONS } from './utils';

/** Outer margins for full-width list rows in sheets (`VerticalListSheet` list buttons). Pair with content `paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL`. */
export const SHEET_VERTICAL_LIST_ROW_OUTER: ViewStyle = {
  marginHorizontal: 0,
  marginBottom: 8,
};

export const SHEET_STYLES: {
  headerContainer: ViewStyle;
  headerTitle: TextStyle;
  headerCloseSpacer: ViewStyle;
  headerActionButton: ViewStyle;
  headerActionButtonText: TextStyle;
  descriptionContainer: ViewStyle;
  descriptionText: TextStyle;
  contentContainer: ViewStyle;
  footerContainer: ViewStyle;
  footerCenteredActions: ViewStyle;
  selectorBox: ViewStyle;
  selectorBoxSelected: ViewStyle;
  /** In-body screen title (no native sheet header): short, confident, sits under grabber. */
  sheetScreenTitle: TextStyle;
  /** Row for title + trailing control (e.g. Edit). */
  sheetScreenTitleRow: ViewStyle;
  /** Use with `sheetScreenTitle` when the title shares a row with a button. */
  sheetScreenTitleFlex: TextStyle;
} = {
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...DEFAULT_HEADER_STYLE,
  },
  headerTitle: SHEET_TEXT_STYLES.title,
  headerCloseSpacer: {
    width: 30,
    height: 30,
  },
  headerActionButton: {
    paddingHorizontal: SHEET_SPACING.footerHorizontal,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
    height: 32,
    backgroundColor: Colors.neutral[975],
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  headerActionButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.semibold,
  },
  descriptionContainer: {
    marginTop: SHEET_SPACING.descriptionTopOffset,
    marginBottom: SHEET_SPACING.descriptionBottom,
    paddingHorizontal: SHEET_SPACING.headerHorizontal,
  },
  descriptionText: SHEET_TEXT_STYLES.description,
  contentContainer: {
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  footerContainer: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: SHEET_SPACING.footerHorizontal,
    backgroundColor: Colors.neutral[975],
  },
  footerCenteredActions: {
    width: '100%',
    alignItems: 'center',
  },
  selectorBox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorBoxSelected: {
    backgroundColor: Colors.neutral[50],
    borderColor: Colors.neutral[50],
  },
  /** Inset comes from `VerticalListSheet` body padding — avoid `width: '100%'` + horizontal margin (RN overflow). */
  sheetScreenTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h2,
    lineHeight: Typography.lineHeights.h2,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.35,
    marginBottom: 10,
  },
  sheetScreenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: 10,
    gap: 12,
  },
  /** Use with `sheetScreenTitle` inside `sheetScreenTitleRow` — row already applies horizontal inset. */
  sheetScreenTitleFlex: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
    marginHorizontal: 0,
  },
};

/** Shared composer input styles (chat, SendTo, comments). */
export const COMPOSER_STYLES = StyleSheet.create({
  /** Outer container: padding and background. */
  container: {
    paddingHorizontal: COMPOSER_INPUT_PADDING.horizontal,
    paddingTop: COMPOSER_INPUT_PADDING.vertical,
    paddingBottom: COMPOSER_INPUT_PADDING.vertical,
    backgroundColor: Colors.neutral[975],
  },
  /** Row layout for input + send button. */
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    width: '100%',
  },
  /** Container + row combined (for chat/simple composers). */
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    width: '100%',
    paddingHorizontal: COMPOSER_INPUT_PADDING.horizontal,
    paddingTop: COMPOSER_INPUT_PADDING.vertical,
    paddingBottom: COMPOSER_INPUT_PADDING.vertical,
    backgroundColor: Colors.neutral[975],
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 0,
    borderColor: Colors.transparent,
    position: 'relative' as const,
  },
  textInput: {
    backgroundColor: Colors.transparent,
    color: Colors.neutral[50],
    borderColor: Colors.transparent,
    flex: 1,
    minHeight: COMPOSER_INPUT_DIMENSIONS.minHeight,
    maxHeight: COMPOSER_INPUT_DIMENSIONS.maxHeight,
    paddingRight: 0,
    paddingTop: COMPOSER_INPUT_DIMENSIONS.paddingVertical,
    paddingBottom: COMPOSER_INPUT_DIMENSIONS.paddingVertical,
    paddingLeft: 0,
    textAlignVertical: 'top' as const,
    fontFamily: Typography.families.regular,
    fontSize: Typography.sizes.title,
    lineHeight: Typography.lineHeights.title,
  },
  sendButton: {
    paddingHorizontal: COMPOSER_INPUT_DIMENSIONS.sendButtonPadding,
    paddingVertical: COMPOSER_INPUT_DIMENSIONS.sendButtonPadding,
    alignSelf: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: BORDER_RADIUS.FULL,
    width: COMPOSER_INPUT_DIMENSIONS.sendButtonSize,
    height: COMPOSER_INPUT_DIMENSIONS.sendButtonSize,
    alignItems: 'center' as const,
    marginLeft: COMPOSER_INPUT_DIMENSIONS.sendButtonMarginLeft,
    overflow: 'hidden' as const,
    zIndex: 11,
  },
  sendButtonFallback: {
    backgroundColor: Colors.neutral[200],
  },
  /** Add/media button - smaller, inverted (dark bg, light icon). */
  addButton: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'center' as const,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.overlay.white10,
    overflow: 'hidden' as const,
    zIndex: 11,
  },
  sendButtonGlassBg: {
    ...StyleSheet.absoluteFill,
    borderRadius: BORDER_RADIUS.FULL,
  },
  sendButtonContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
