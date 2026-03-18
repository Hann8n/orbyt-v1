/**
 * Centralized TrueSheet configuration for consistent sheet appearance across the app.
 * Use with AppTrueSheet or apply these values manually when custom behavior is needed.
 */

import type { ViewStyle } from 'react-native';
import type { TrueSheetProps, GrabberOptions } from '@lodev09/react-native-true-sheet';
import { Colors } from '../../../theme';

export type { SheetDetent } from '@lodev09/react-native-true-sheet';

/** Default props for most app sheets (black background, no grabber, auto height). */
export const DEFAULT_SHEET_PROPS: Pick<TrueSheetProps, 'backgroundColor' | 'grabber' | 'detents'> =
  {
    backgroundColor: Colors.black,
    grabber: false,
    detents: ['auto'],
  };

/** Consistent header container style (padding). */
export const DEFAULT_HEADER_STYLE: ViewStyle = {
  paddingHorizontal: 20,
  paddingTop: 20,
  paddingBottom: 20,
};

/** Default horizontal padding for sheet content. */
export const DEFAULT_CONTENT_PADDING_HORIZONTAL = 12;

export const DEFAULT_GRABBER_OPTIONS: GrabberOptions = {
  width: 42,
  height: 4,
  topMargin: 8,
  cornerRadius: 2,
  color: 'rgba(243, 245, 254, 0.5)',
  adaptive: false,
};

/** Variant overrides for sheets that intentionally differ from defaults. */
export const SHEET_VARIANTS = {
  /** Send-to picker: fixed 90% height for full-height list UX. */
  sendToPicker: {
    detents: [0.9] as const,
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
