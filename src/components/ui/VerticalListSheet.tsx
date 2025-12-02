import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { Colors } from './UI';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { hexToRGBA } from '../../utils/formatting/colorUtils';

interface VerticalListSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  children: React.ReactNode;
  snapPoints?: string[];
  showCancelButton?: boolean;
  cancelButtonText?: string;
  /**
   * Custom header button to replace the close button
   */
  customHeaderButton?: React.ReactNode;
  /**
   * Pass the scrollable ref (e.g., FlashList/ScrollView) for better scroll interop with the sheet
   */
  scrollRef?: React.RefObject<any>;
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
  snapPoints = ['auto'],
  showCancelButton = true,
  cancelButtonText = 'Cancel',
  customHeaderButton,
  scrollRef,
  enableGlass = true,
  name,
  titleSize,
  hideCloseButton = false,
}) => {
  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const shouldUseGlass = useMemo(() => {
    return enableGlass && Platform.OS === 'ios' && isLiquidGlassAvailable();
  }, [enableGlass]);

  // Handle bottom sheet visibility
  React.useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  // Handle keyboard visibility
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Backdrop component - TrueSheet handles backdrop automatically
  const renderBackdrop = useCallback(() => null, []);

  return (
    <TrueSheet
      ref={bottomSheetRef}
      name={name}
      sizes={snapPoints as any}
      backgroundColor={Colors.black}
      onDismiss={onDismiss}
      grabber={false}
      keyboardMode="pan"
      scrollRef={scrollRef}
      FooterComponent={
        showCancelButton && !isKeyboardVisible ? (
          <View style={[styles.cancelContainer, { paddingBottom: insets.bottom, backgroundColor: Colors.black }]}> 
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onDismiss} 
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{cancelButtonText}</Text>
            </TouchableOpacity>
          </View>
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
        
        {/* Content */}
        <View style={styles.contentContainer}>
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
    marginBottom: 12,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 15,
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
  contentContainer: {
    flex: 1,
    paddingBottom: 8,
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
    backgroundColor: 'rgba(255,80,80,0.12)',
    borderColor: 'rgba(255,80,80,0.25)',
    borderWidth: 1,
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
    color: Colors.red,
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
}> = ({ label, onPress, icon, disabled, danger }) => {
  return (
    <TouchableOpacity
      style={[
        styles.listButton,
        danger && styles.listButtonDanger,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.listButtonContent}>
        <Text style={[styles.listButtonText, danger && styles.listButtonTextDanger]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};
