import React, { useRef, useEffect } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../utils/components/truesheet/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  /** Detent values for TrueSheet v3: use 'auto', or fractional values (0-1) */
  detents?: ('auto' | number)[];
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
   * Enable scrollable content (default: true)
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
}

const VerticalListSheet: React.FC<VerticalListSheetProps> = ({
  visible,
  onDismiss,
  title,
  children,
  detents = ['auto'],
  showCancelButton = true,
  cancelButtonText = 'Cancel',
  description,
  customHeaderButton,
  name,
  titleSize,
  hideCloseButton = false,
  footerTopPadding,
  scrollable = true,
  contentBottomPadding,
  customFooter,
}) => {
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();

  // Calculate footer height for minimal content padding
  // Footer handles its own safe area padding, so we only need footer height
  const hasFooter = showCancelButton || customFooter;
  const footerHeight = hasFooter ? (footerTopPadding ?? 8) + 44 : 0;

  // Content padding - minimal padding to avoid footer overlap
  // TrueSheet handles spacing, but we add minimal padding for footer height
  // Components can opt-out with contentBottomPadding={0} if they handle their own padding
  const contentPaddingBottom =
    contentBottomPadding !== undefined ? contentBottomPadding : hasFooter ? footerHeight : 0;

  // Handle bottom sheet visibility
  useEffect(() => {
    const presentSheet = async () => {
      try {
        if (name) {
          await safePresent(name);
        } else {
          await bottomSheetRef.current?.present();
        }
      } catch {
        // Safely ignore race conditions when the sheet unmounts
      }
    };

    const dismissSheet = async () => {
      try {
        if (name) {
          await safeDismiss(name);
        } else {
          await bottomSheetRef.current?.dismiss();
        }
      } catch {
        // Safely ignore race conditions when the sheet unmounts
      }
    };

    if (visible) {
      presentSheet();
    } else {
      dismissSheet();
    }
  }, [visible, name]);

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
    <TrueSheet
      ref={bottomSheetRef}
      name={name}
      detents={detents}
      backgroundColor={Colors.black}
      onDidDismiss={onDismiss}
      grabber={false}
      scrollable={scrollable}
      header={headerComponent}
      footer={
        customFooter ? (
          <View style={[styles.footerContainer, { paddingBottom: insets.bottom }]}>
            {customFooter}
          </View>
        ) : showCancelButton ? (
          <View style={[styles.footerContainer, { paddingBottom: insets.bottom }]}>
            <View style={[styles.cancelContainer, { paddingTop: footerTopPadding ?? 8 }]}>
              <CancelButton onPress={onDismiss} text={cancelButtonText} />
            </View>
          </View>
        ) : undefined
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
    </TrueSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Bold',
    flex: 1,
  },
  closeButtonSpacer: {
    width: 30,
    height: 30,
  },
  descriptionContainer: {
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 15,
  },
  descriptionText: {
    color: Colors.lightGray,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Firma-Regular',
  },
  contentContainer: {
    flex: 1,
  },
  footerContainer: {
    backgroundColor: Colors.black,
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  checkboxButtonCheckbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxButtonCheckboxSelected: {
    backgroundColor: Colors.white,
    borderColor: Colors.white,
  },
  listButtonMargin: {
    marginHorizontal: 12,
  },
});

export default VerticalListSheet;

// Optional in-file list button for consistent styling inside sheets
// Now uses OptionsButton for consistency
export const VerticalListButton: React.FC<{
  label: string;
  onPress: () => void;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  rightIcon?: React.ReactNode;
}> = ({ label, onPress, icon: _icon, disabled, danger, style, textStyle, rightIcon }) => {
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
