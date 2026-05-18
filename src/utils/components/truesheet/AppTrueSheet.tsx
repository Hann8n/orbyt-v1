import { TrueSheet } from '@lodev09/react-native-true-sheet';
import type { TrueSheetProps } from '@lodev09/react-native-true-sheet';
import { DEFAULT_SHEET_PROPS, SHEET_VARIANTS } from './trueSheetPresets';

export type AppTrueSheetVariant =
  | 'default'
  | 'full'
  | 'halfAndFull'
  | 'reactionPicker'
  | 'sendToPicker';

export interface AppTrueSheetProps extends Omit<TrueSheetProps, 'ref'> {
  variant?: AppTrueSheetVariant;
}

/**
 * AppTrueSheet applies DEFAULT_SHEET_PROPS and optional variant overrides.
 * Passed props override defaults. Refs are forwarded for present/dismiss.
 */
export const AppTrueSheet = function AppTrueSheet({
  ref,
  variant = 'default',
  ...rest
}: AppTrueSheetProps & {
  ref?: React.Ref<TrueSheet>;
}) {
  const defaults = { ...DEFAULT_SHEET_PROPS };

  if (variant === 'sendToPicker') {
    Object.assign(defaults, SHEET_VARIANTS.sendToPicker);
  } else if (variant === 'full') {
    Object.assign(defaults, SHEET_VARIANTS.full);
  } else if (variant === 'halfAndFull') {
    Object.assign(defaults, SHEET_VARIANTS.halfAndFull);
  } else if (variant === 'reactionPicker' && rest.maxContentHeight != null) {
    Object.assign(defaults, SHEET_VARIANTS.reactionPicker(rest.maxContentHeight));
  }

  return <TrueSheet ref={ref} {...defaults} {...rest} />;
};
