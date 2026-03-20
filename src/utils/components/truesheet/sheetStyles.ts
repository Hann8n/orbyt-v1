import type { ViewStyle } from 'react-native';
import type { TextStyle } from 'react-native';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../constants';
import { FontFamily, Typography } from '../../components/typography';
import {
  DEFAULT_HEADER_STYLE,
  SHEET_SPACING,
  SHEET_TEXT_STYLES,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
} from './trueSheetPresets';

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
    backgroundColor: Colors.neutral[900],
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
    paddingHorizontal: SHEET_SPACING.footerHorizontal,
    backgroundColor: Colors.black,
  },
  footerCenteredActions: {
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
};

export const sheetPaddingBottomStyle = (
  paddingBottom: number,
  backgroundColor: string = Colors.black
): ViewStyle => ({
  paddingBottom,
  backgroundColor,
});
