import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,

} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../utils/truesheet/trueSheetUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { Colors } from './UI';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { hexToRGBA } from '../../utils/formatting/colorUtils';
import KeyboardAwareFooter from '../../utils/truesheet/KeyboardAwareFooter';

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
   * Enable iOS 26 Liquid Glass background when available
   */
  enableGlass?: boolean;
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
  enableGlass = true,
  name,
  titleSize,
  hideCloseButton = false,
}) => {
  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  // Calculate footer height for layout; keep the actual control height + safe area
  const footerHeight = showCancelButton ? 44 + insets.bottom : 0;

  // Simplified content padding: we only need a modest gap above the footer
  // so content doesn't butt up against it. Use 12px plus the safe area inset
  // when footer is present so interactive content isn't hidden behind the footer.
  const contentPaddingBottom = showCancelButton ? 12 + insets.bottom : 12;

  const shouldUseGlass = useMemo(() => {
    return enableGlass && Platform.OS === 'ios' && isLiquidGlassAvailable();
  }, [enableGlass]);

  // Handle bottom sheet visibility
  React.useEffect(() => {
    if (visible) {
      if (name) safePresent(name);
      else bottomSheetRef.current?.present();
    } else {
      if (name) safeDismiss(name);
      else bottomSheetRef.current?.dismiss();
    }
  }, [visible, name]);


  return (
    <TrueSheet
      ref={bottomSheetRef}
      name={name}
      detents={detents}
      backgroundColor={Colors.black}
      onDidDismiss={onDismiss}
      grabber={false}
      keyboardMode="pan"
      scrollable
      footer={
        showCancelButton ? (
          <KeyboardAwareFooter hideOnKeyboard={true} bottomPadding={insets.bottom} style={{ backgroundColor: Colors.black }}>
            <View style={[styles.cancelContainer, { backgroundColor: Colors.black }]}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={onDismiss} 
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>{cancelButtonText}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAwareFooter>
        ) : undefined
      }
    >
      <View style={styles.content}>
        {/* Header with title and close button */}
        <View style={styles.headerContainer}>
          <Text style={[styles.headerTitle, titleSize && { fontSize: titleSize }]} numberOfLines={1}>
            {title}
          </Text>
          {hideCloseButton ? (
            <View style={styles.closeButton} />
          ) : customHeaderButton ? (
            customHeaderButton
          ) : (
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Icon name="close" size={20} color={Colors.white} />
            </TouchableOpacity>
          )}
        </View>
        
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
  bottomSheetBackground: {
    backgroundColor: Colors.black,
    // Square top corners - no border radius
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 0,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 12,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Bold',
    flex: 1,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
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
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  cancelButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 44,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  cancelButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  listButton: {
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: Colors.darkGray,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listButtonDanger: {
    backgroundColor: Colors.red,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  listButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listButtonText: {
    color: Colors.white,
    fontFamily: 'Firma-SemiBold',
    fontSize: 18,
  },
  listButtonTextDanger: {
    color: Colors.black,
  },
  checkboxButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
  },
  checkboxButtonContent: {
    flex: 1,
    marginRight: 16,
  },
  checkboxButtonLabel: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  checkboxButtonDescription: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
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
});

export default VerticalListSheet;

// Optional in-file list button for consistent styling inside sheets
export const VerticalListButton: React.FC<{
  label: string;
  onPress: () => void;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  style?: any;
  textStyle?: any;
}> = ({ label, onPress, icon, disabled, danger, style, textStyle }) => {
  return (
    <TouchableOpacity
      style={[
        styles.listButton,
        danger && styles.listButtonDanger,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.listButtonContent}>
        <Text style={[styles.listButtonText, danger && styles.listButtonTextDanger, textStyle]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// Checkbox button for vertical list sheets (like in video post screen)
export const VerticalListCheckboxButton: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: any;
}> = ({ label, description, checked, onPress, disabled, style }) => {
  return (
    <TouchableOpacity
      style={[styles.checkboxButtonRow, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.checkboxButtonContent}>
        <Text style={styles.checkboxButtonLabel}>{label}</Text>
        {description && (
          <Text style={styles.checkboxButtonDescription}>{description}</Text>
        )}
      </View>
      <View style={[
        styles.checkboxButtonCheckbox,
        checked && styles.checkboxButtonCheckboxSelected
      ]}>
        {checked && (
          <Icon name="checkmark" size={16} color={Colors.black} />
        )}
      </View>
    </TouchableOpacity>
  );
};
