/**
 * App-wide TrueSheet wrapper that applies consistent defaults.
 * Use for all sheets except CommentSection (which keeps raw TrueSheet).
 */

import { forwardRef } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import type { TrueSheetProps } from '@lodev09/react-native-true-sheet';
import { DEFAULT_SHEET_PROPS, SHEET_VARIANTS } from './trueSheetPresets';

export { DEFAULT_HEADER_STYLE } from './trueSheetPresets';

export type AppTrueSheetVariant = 'default' | 'reactionPicker' | 'sendToPicker';

export interface AppTrueSheetProps extends Omit<TrueSheetProps, 'ref'> {
  variant?: AppTrueSheetVariant;
}

/**
 * AppTrueSheet applies DEFAULT_SHEET_PROPS and optional variant overrides.
 * Passed props override defaults. Refs are forwarded for present/dismiss.
 */
export const AppTrueSheet = forwardRef<TrueSheet, AppTrueSheetProps>(function AppTrueSheet(
  { variant = 'default', ...rest },
  ref
) {
  const defaults = { ...DEFAULT_SHEET_PROPS };

  if (variant === 'sendToPicker') {
    Object.assign(defaults, SHEET_VARIANTS.sendToPicker);
  } else if (variant === 'reactionPicker' && rest.maxHeight != null) {
    Object.assign(defaults, SHEET_VARIANTS.reactionPicker(rest.maxHeight));
  }

  return <TrueSheet ref={ref} {...defaults} {...rest} />;
});
