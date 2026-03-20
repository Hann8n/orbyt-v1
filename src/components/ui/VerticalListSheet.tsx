import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Re-export: use TrueSheet.present(name) to show, TrueSheet.dismiss(name) to hide. */
export { TrueSheet };
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  FOOTER_TOP_PADDING_DEFAULT,
  getFooterBottomPadding,
  SheetActionFooter,
  SHEET_STYLES,
  useMeasuredFooterHeight,
} from '../../utils/components/truesheet';
import Icon from './Icon';
import CloseButton from './CloseButton';
import CancelButton from './CancelButton';
import { Colors } from './UI';
import { OptionsButton } from './OptionsButton';

interface VerticalListSheetProps {
  /**
   * Unique name. Use TrueSheet.present(name) to show, TrueSheet.dismiss(name) to hide.
   */
  name: string;
  onDismiss: () => void;
  title: string;
  children: React.ReactNode;
  showCancelButton?: boolean;
  cancelButtonText?: string;
  /**
   * Description text displayed below the title
   */
  description?: string;
  /**
   * Custom header button to replace the close button
   */
  customHeaderButton?: React.ReactNode;
  /**
   * Custom title font size
   */
  titleSize?: number;
  /**
   * Hide the close button in the header
   */
  hideCloseButton?: boolean;
  /**
   * Custom top padding for the footer
   */
  footerTopPadding?: number;
  /**
   * Enable native scrollable content pinning (default: false).
   * Only set true if the sheet's direct content is a ScrollView/FlatList; we usually use our own ScrollView inside a View.
   */
  scrollable?: boolean;
  /**
   * Custom bottom padding for content (overrides default calculation)
   */
  contentBottomPadding?: number;
  /**
   * Custom footer component (replaces default cancel button)
   */
  customFooter?: React.ReactNode;
  /**
   * Override bottom padding below the footer button. Default uses safe area.
   * Set to 0 to remove extra padding (e.g. when TrueSheet already handles safe area).
   */
  footerBottomPadding?: number;
  /**
   * Background color for the footer area (default: Colors.black).
   */
  footerBackgroundColor?: string;
}

const VerticalListSheet: React.FC<VerticalListSheetProps> = ({
  name,
  onDismiss,
  title,
  children,
  showCancelButton = true,
  cancelButtonText: cancelButtonTextProp,
  description,
  customHeaderButton,
  titleSize,
  hideCloseButton = false,
  footerTopPadding,
  scrollable = false,
  contentBottomPadding,
  customFooter,
  footerBottomPadding: footerBottomPaddingProp,
  footerBackgroundColor = Colors.black,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const cancelButtonText = cancelButtonTextProp ?? t('common.close');
  // Use fixed padding only; TrueSheet's insetAdjustment='automatic' already accounts for safe area
  const footerBottomPadding =
    footerBottomPaddingProp !== undefined
      ? footerBottomPaddingProp
      : getFooterBottomPadding(insets.bottom);
  const footerTop = footerTopPadding ?? FOOTER_TOP_PADDING_DEFAULT;
  const hasFooter = showCancelButton || customFooter;
  const fallbackFooterHeight = hasFooter ? footerTop + 44 + footerBottomPadding : 0;
  const [measuredFooterHeight, wrapFooter] = useMeasuredFooterHeight(fallbackFooterHeight);

  // Content padding so list isn't cut off by the footer (TrueSheet footer is position:absolute)
  const contentPaddingBottom =
    contentBottomPadding !== undefined
      ? contentBottomPadding
      : hasFooter
        ? Math.max(0, measuredFooterHeight - CONTENT_TO_FOOTER_GAP_REDUCTION)
        : 0;

  const handleDismiss = () => {
    TrueSheet.dismiss(name).catch(() => {});
  };

  const headerComponent = (
    <View style={styles.headerContainer}>
      <Text
        style={[
          styles.headerTitle,
          titleSize != null && { fontSize: titleSize, lineHeight: titleSize + 6 },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {hideCloseButton ? (
        <View style={styles.closeButtonSpacer} />
      ) : customHeaderButton ? (
        customHeaderButton
      ) : (
        <CloseButton onPress={handleDismiss} />
      )}
    </View>
  );

  return (
    <AppTrueSheet
      name={name}
      onDidDismiss={onDismiss}
      scrollable={scrollable}
      header={headerComponent}
      footer={
        customFooter
          ? wrapFooter(
              <SheetActionFooter
                bottomPadding={footerBottomPadding}
                topPadding={footerTop}
                backgroundColor={footerBackgroundColor}
              >
                {customFooter}
              </SheetActionFooter>
            )
          : showCancelButton
            ? wrapFooter(
                <SheetActionFooter
                  bottomPadding={footerBottomPadding}
                  topPadding={footerTop}
                  backgroundColor={footerBackgroundColor}
                >
                  <CancelButton onPress={handleDismiss} text={cancelButtonText} />
                </SheetActionFooter>
              )
            : undefined
      }
    >
      <View style={styles.content}>
        {/* Description */}
        {description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionText}>{description}</Text>
          </View>
        )}

        {/* Content */}
        <View style={[styles.contentContainer, { paddingBottom: contentPaddingBottom }]}>
          {children}
        </View>
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    // Removed flex: 1 to allow 'auto' detent to properly size to content
  },
  headerContainer: SHEET_STYLES.headerContainer,
  headerTitle: SHEET_STYLES.headerTitle,
  closeButtonSpacer: SHEET_STYLES.headerCloseSpacer,
  descriptionContainer: SHEET_STYLES.descriptionContainer,
  descriptionText: SHEET_STYLES.descriptionText,
  contentContainer: SHEET_STYLES.contentContainer,
  checkboxButtonCheckbox: {
    ...SHEET_STYLES.selectorBox,
  },
  checkboxButtonCheckboxSelected: {
    ...SHEET_STYLES.selectorBoxSelected,
  },
  listButtonMargin: {
    marginHorizontal: 0,
    marginBottom: 8,
  },
});

export default VerticalListSheet;

// Optional in-file list button for consistent styling inside sheets
// Now uses OptionsButton for consistency
export const VerticalListButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  rightIcon?: React.ReactNode;
}> = ({ label, onPress, disabled, danger, style, textStyle, rightIcon }) => {
  return (
    <OptionsButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      destructive={danger}
      rightIcon={rightIcon}
      style={[styles.listButtonMargin, style]}
      textStyle={textStyle}
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
        <View
          style={[styles.checkboxButtonCheckbox, checked && styles.checkboxButtonCheckboxSelected]}
        >
          {checked && <Icon name="checkmark" size={16} color={Colors.black} />}
        </View>
      }
      style={[styles.listButtonMargin, style]}
    />
  );
};
