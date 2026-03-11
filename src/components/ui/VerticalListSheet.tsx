import React from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../utils/constants';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

/** Re-export: use TrueSheet.present(name) to show, TrueSheet.dismiss(name) to hide. */
export { TrueSheet };
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  DEFAULT_HEADER_STYLE,
  FOOTER_BOTTOM_PADDING_MIN,
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
  footerBackgroundColor = 'transparent',
}) => {
  const { t } = useTranslation();
  const cancelButtonText = cancelButtonTextProp ?? t('common.close');
  // Use fixed padding only; TrueSheet's insetAdjustment='automatic' already accounts for safe area
  const footerBottomPadding =
    footerBottomPaddingProp !== undefined
      ? footerBottomPaddingProp
      : Math.max(FOOTER_BOTTOM_PADDING_MIN, 28);
  const footerTop = footerTopPadding ?? 6;
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
        style={[styles.headerTitle, titleSize != null && { fontSize: titleSize }]}
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
              <View
                style={[
                  styles.footerContainer,
                  { paddingBottom: footerBottomPadding, backgroundColor: footerBackgroundColor },
                ]}
              >
                {customFooter}
              </View>
            )
          : showCancelButton
            ? wrapFooter(
                <View
                  style={[
                    styles.footerContainer,
                    { paddingBottom: footerBottomPadding, backgroundColor: footerBackgroundColor },
                  ]}
                >
                  <View style={[styles.cancelContainer, { paddingTop: footerTop }]}>
                    <CancelButton onPress={handleDismiss} text={cancelButtonText} />
                  </View>
                </View>
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
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...DEFAULT_HEADER_STYLE,
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Figtree-Bold',
    flex: 1,
  },
  closeButtonSpacer: {
    width: 30,
    height: 30,
  },
  descriptionContainer: {
    marginTop: -12,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  descriptionText: {
    color: Colors.neutral[200],
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'left',
    fontFamily: 'Figtree-Regular',
  },
  contentContainer: {
    paddingHorizontal: 12,
    // Removed flex: 1 to allow 'auto' detent to properly size to content
  },
  footerContainer: {
    paddingHorizontal: 20,
    backgroundColor: Colors.black,
  },
  cancelContainer: {
    alignItems: 'center',
  },
  checkboxButtonCheckbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxButtonCheckboxSelected: {
    backgroundColor: Colors.neutral[50],
    borderColor: Colors.neutral[50],
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
