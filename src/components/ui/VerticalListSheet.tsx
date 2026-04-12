import React from 'react';
import { View, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Re-export: use TrueSheet.present(name) to show, TrueSheet.dismiss(name) to hide. */
export { TrueSheet };
import {
  AppTrueSheet,
  type AppTrueSheetVariant,
  getFooterBottomPadding,
} from '../../utils/components/truesheet';
import { LAYOUT_INSETS } from '../../utils/constants';
import { CheckboxCuteFilledDuotoneIcon, CuteRegularSquareBoxEmptyIcon } from './Icon';
import { Colors } from './UI';
import { OptionsButton } from './OptionsButton';

interface VerticalListSheetProps {
  /**
   * Unique name. Use TrueSheet.present(name) to show, TrueSheet.dismiss(name) to hide.
   */
  name: string;
  onDismiss: () => void;
  children: React.ReactNode;
  /**
   * Enable native scrollable content pinning (default: false).
   * Only set true if the sheet's direct content is a ScrollView/FlatList; we usually use our own ScrollView inside a View.
   */
  scrollable?: boolean;
  /**
   * Custom bottom padding for content (overrides default safe-area padding).
   */
  contentBottomPadding?: number;
  /**
   * TrueSheet presentation variant. Use `full` for full-height (detent 1) sheets such as auth flows.
   */
  variant?: AppTrueSheetVariant;
}

const VerticalListSheet: React.FC<VerticalListSheetProps> = ({
  name,
  onDismiss,
  children,
  scrollable = false,
  contentBottomPadding,
  variant = 'default',
}) => {
  const insets = useSafeAreaInsets();
  const paddingBottom =
    contentBottomPadding !== undefined
      ? contentBottomPadding
      : getFooterBottomPadding(insets.bottom);

  return (
    <AppTrueSheet name={name} variant={variant} onDidDismiss={onDismiss} scrollable={scrollable}>
      <View style={styles.content}>
        <View
          style={[
            styles.contentContainer,
            { paddingTop: LAYOUT_INSETS.SHEET_CONTENT, paddingBottom },
          ]}
        >
          {children}
        </View>
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  content: {},
  /** Matches `LAYOUT_INSETS.SHEET_CONTENT`; list rows use `marginHorizontal: 0` so they align with titles. */
  contentContainer: {
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
  },
  checkboxButtonCheckboxWrap: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listButtonMargin: {
    marginHorizontal: 0,
    marginBottom: 8,
  },
});

export default VerticalListSheet;

/** Variants for sheet CTAs: default (neutral), primary (light/inverted), destructive (dark coral), destructiveReversed (light coral bg) */
export type SheetActionButtonVariant =
  | 'default'
  | 'primary'
  | 'destructive'
  | 'destructiveReversed';

// Optional in-file list button for consistent styling inside sheets
// Now uses OptionsButton for consistency
export const VerticalListButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** CTA variant: primary = light bg (e.g. Watch), destructive = coral (e.g. Disconnect), destructiveReversed = light coral bg. Use danger for backward compat. */
  variant?: SheetActionButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  rightIcon?: React.ReactNode;
  /** Custom left content (e.g. avatar + label); when set, replaces default label. */
  leftContent?: React.ReactNode;
  /** Custom right content (e.g. avatar); when set, replaces rightIcon/chevron. */
  rightContent?: React.ReactNode;
}> = ({
  label,
  onPress,
  disabled,
  danger,
  variant,
  loading = false,
  style,
  textStyle,
  rightIcon,
  leftContent,
  rightContent,
}) => {
  const isDestructive = danger || variant === 'destructive';
  const isDestructiveReversed = variant === 'destructiveReversed';
  const isPrimary = variant === 'primary';

  const variantStyle: StyleProp<ViewStyle> = isPrimary
    ? { backgroundColor: Colors.neutral[50] }
    : isDestructiveReversed
      ? { backgroundColor: Colors.coral[500] }
      : undefined;
  const variantTextStyle: StyleProp<TextStyle> | undefined = isPrimary
    ? { color: Colors.neutral[975] }
    : isDestructiveReversed
      ? { color: Colors.neutral[975] }
      : undefined;

  return (
    <OptionsButton
      label={label}
      leftContent={leftContent}
      rightContent={rightContent}
      linkType={leftContent ? 'internal' : undefined}
      onPress={onPress}
      disabled={disabled}
      destructive={isDestructive && !isDestructiveReversed}
      loading={loading}
      rightIcon={rightContent ? undefined : rightIcon}
      style={[styles.listButtonMargin, variantStyle, style]}
      textStyle={
        variantTextStyle
          ? textStyle
            ? [variantTextStyle, textStyle]
            : variantTextStyle
          : textStyle
      }
    />
  );
};

// Checkbox button for vertical list sheets (like in video post screen)
export const VerticalListCheckboxButton: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ label, description, checked, onPress, disabled, style }) => {
  return (
    <OptionsButton
      label={label}
      subtitle={description}
      onPress={onPress}
      disabled={disabled}
      rightIcon={
        <View style={styles.checkboxButtonCheckboxWrap}>
          {checked ? (
            <CheckboxCuteFilledDuotoneIcon
              size={24}
              boxColor={Colors.neutral[50]}
              checkColor={Colors.neutral[975]}
              checkOpacity={1}
            />
          ) : (
            <CuteRegularSquareBoxEmptyIcon size={24} color={Colors.neutral[200]} />
          )}
        </View>
      }
      style={[styles.listButtonMargin, style]}
    />
  );
};
