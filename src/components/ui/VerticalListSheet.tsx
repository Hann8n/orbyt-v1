import React, { useRef, useEffect } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  DEFAULT_HEADER_STYLE,
  FOOTER_TOP_PADDING_DEFAULT,
  useMeasuredFooterHeight,
} from '../../utils/components/truesheet';
import Icon from './Icon';
import CloseButton from './CloseButton';
import CancelButton from './CancelButton';
import { Colors } from './UI';
import { OptionsButton } from './OptionsButton';

interface VerticalListSheetProps {
  visible: boolean;
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
   * Name for global TrueSheet methods
   */
  name?: string;
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
  visible,
  onDismiss,
  title,
  children,
  showCancelButton = true,
  cancelButtonText = 'Close',
  description,
  customHeaderButton,
  name,
  titleSize,
  hideCloseButton = false,
  footerTopPadding,
  scrollable = false,
  contentBottomPadding,
  customFooter,
  footerBottomPadding: footerBottomPaddingProp,
  footerBackgroundColor = 'transparent',
}) => {
  const bottomSheetRef = useRef<TrueSheet>(null);
  const footerBottomPadding = footerBottomPaddingProp !== undefined ? footerBottomPaddingProp : 24;
  const footerTop = footerTopPadding ?? FOOTER_TOP_PADDING_DEFAULT;
  const hasFooter = showCancelButton || customFooter;
  const fallbackFooterHeight = hasFooter ? footerTop + 44 + footerBottomPadding : 0;
  const [measuredFooterHeight, wrapFooter] = useMeasuredFooterHeight(fallbackFooterHeight);

  // Content padding so list isn't cut off by the footer (TrueSheet footer is position:absolute)
  // Slightly reduce to bring content closer to footer; allow override via contentBottomPadding
  const contentPaddingBottom =
    contentBottomPadding !== undefined
      ? contentBottomPadding
      : hasFooter
        ? Math.max(0, measuredFooterHeight - CONTENT_TO_FOOTER_GAP_REDUCTION)
        : 0;

  // Handle bottom sheet visibility with instance ref (TrueSheet v3+)
  useEffect(() => {
    const sheet = bottomSheetRef.current;
    if (!sheet) return;
    if (visible) {
      sheet.present().catch(() => {});
    } else {
      sheet.dismiss().catch(() => {});
    }
  }, [visible]);

  // Header component for TrueSheet header prop
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
        <CloseButton onPress={onDismiss} />
      )}
    </View>
  );

  return (
    <AppTrueSheet
      ref={bottomSheetRef}
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
                    <CancelButton onPress={onDismiss} text={cancelButtonText} />
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
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  descriptionText: {
    color: Colors.neutral[200],
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Figtree-Regular',
  },
  contentContainer: {
    // Removed flex: 1 to allow 'auto' detent to properly size to content
  },
  footerContainer: {
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
    marginHorizontal: 8,
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
