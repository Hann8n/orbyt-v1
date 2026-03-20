/**
 * Centralized TrueSheet configuration for consistent sheet appearance across the app.
 * Use with AppTrueSheet or apply these values manually when custom behavior is needed.
 */

import type { ViewStyle } from 'react-native';
import type { TextStyle } from 'react-native';
import type { TrueSheetProps, GrabberOptions } from '@lodev09/react-native-true-sheet';
import { Colors } from '../../../theme';
import { FontFamily, Typography } from '../../components/typography';
import { hexToRGBA } from '../../formatting/colors';
import { LAYOUT_INSETS } from '../../constants';

export type { SheetDetent } from '@lodev09/react-native-true-sheet';

/** Default props for most app sheets (black background, no grabber, auto height). */
export const DEFAULT_SHEET_PROPS: Pick<TrueSheetProps, 'backgroundColor' | 'grabber' | 'detents'> =
  {
    backgroundColor: Colors.black,
    grabber: false,
    detents: ['auto'],
  };

/** Default horizontal padding for sheet content. */
export const DEFAULT_CONTENT_PADDING_HORIZONTAL = LAYOUT_INSETS.SHEET_CONTENT;

/** Consistent header container style (padding). */
export const DEFAULT_HEADER_STYLE: ViewStyle = {
  paddingHorizontal: LAYOUT_INSETS.SHEET_FOOTER,
  paddingTop: 20,
  paddingBottom: 20,
};

/** Canonical sheet spacing tokens for shell consistency. */
export const SHEET_SPACING = {
  headerHorizontal: LAYOUT_INSETS.SHEET_FOOTER,
  headerTop: 20,
  headerBottom: 20,
  contentHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  contentVertical: 0,
  descriptionTopOffset: -12,
  descriptionBottom: 10,
  footerHorizontal: LAYOUT_INSETS.SHEET_FOOTER,
  footerTop: 12,
  /** Media pickers (e.g. Klipy GIF): wider inset for full-screen grid layouts. */
  mediaPickerHorizontal: 16,
} as const;

export const DEFAULT_GRABBER_OPTIONS: GrabberOptions = {
  width: 42,
  height: 4,
  topMargin: 8,
  cornerRadius: 2,
  color: hexToRGBA(Colors.brand.white, 0.5),
  adaptive: false,
};

/** Shared shell text styles for sheet headers and descriptions. */
export const SHEET_TEXT_STYLES: {
  title: TextStyle;
  description: TextStyle;
} = {
  title: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h3,
    lineHeight: Typography.lineHeights.h3,
    fontFamily: FontFamily.bold,
    textAlign: 'left',
    flex: 1,
  },
  description: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    textAlign: 'left',
    fontFamily: FontFamily.regular,
  },
};

/** Canonical detent presets for common sheet behaviors. */
export const SHEET_DETENTS = {
  auto: ['auto'] as const,
  full: [1] as const,
  halfAndFull: [0.5, 1] as const,
  sendToPicker: [0.9] as const,
} as const;

/** Variant overrides for sheets that intentionally differ from defaults. */
export const SHEET_VARIANTS = {
  full: {
    detents: SHEET_DETENTS.full,
  },
  halfAndFull: {
    detents: SHEET_DETENTS.halfAndFull,
  },
  /** Send-to picker: fixed 90% height for full-height list UX. */
  sendToPicker: {
    detents: SHEET_DETENTS.sendToPicker,
  },
  /** Reaction picker: grabber, neutral background, custom inset behavior. */
  reactionPicker: (
    maxContentHeight: number
  ): Pick<
    TrueSheetProps,
    'backgroundColor' | 'grabber' | 'grabberOptions' | 'insetAdjustment' | 'maxContentHeight'
  > => {
    return {
      backgroundColor: Colors.neutral[900],
      grabber: true,
      grabberOptions: DEFAULT_GRABBER_OPTIONS,
      insetAdjustment: 'never',
      maxContentHeight,
    };
  },
} as const;
