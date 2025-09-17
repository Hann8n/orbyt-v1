import React, { useRef, useMemo, useCallback } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
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
   * Pass the scrollable ref (e.g., FlashList/ScrollView) for better scroll interop with the sheet
   */
  scrollRef?: React.RefObject<any>;
  /**
   * Enable iOS 26 Liquid Glass background when available
   */
  enableGlass?: boolean;
}

const VerticalListSheet: React.FC<VerticalListSheetProps> = ({
  visible,
  onDismiss,
  title,
  children,
  snapPoints = ['auto'],
  showCancelButton = true,
  cancelButtonText = 'Cancel',
  scrollRef,
  enableGlass = true,
}) => {
  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();

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

  // Backdrop component - TrueSheet handles backdrop automatically
  const renderBackdrop = useCallback(() => null, []);

  return (
    <TrueSheet
      ref={bottomSheetRef}
      sizes={snapPoints as any}
      backgroundColor={shouldUseGlass ? 'rgba(0,0,0,0.6)' : Colors.black}
      onDismiss={onDismiss}
      grabber={false}
      keyboardMode="pan"
      scrollRef={scrollRef}
      FooterComponent={
        showCancelButton ? (
          <View style={[styles.cancelContainer, { paddingBottom: insets.bottom, backgroundColor: 'transparent' }]}> 
            <TouchableOpacity 
              style={[styles.cancelButton, shouldUseGlass && styles.cancelButtonGlass]} 
              onPress={onDismiss} 
              activeOpacity={0.7}
            >
              {shouldUseGlass && (
                <GlassView
                  style={StyleSheet.absoluteFill}
                  glassEffectStyle="clear"
                  tintColor="rgba(24,28,34,0.15)"
                  isInteractive
                />
              )}
              <Text style={styles.cancelButtonText}>{cancelButtonText}</Text>
            </TouchableOpacity>
          </View>
        ) : undefined
      }
    >
      <View style={styles.content}>
        {/* Header with title and close button */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Icon name="close" size={20} color={Colors.white} />
          </TouchableOpacity>
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
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
    paddingBottom: 20,
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 20,
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
  cancelButtonGlass: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)'
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
    marginBottom: 4,
    backgroundColor: Colors.darkGray,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  // Applied when iOS Liquid Glass is available to avoid double-stacked
  // background and heavy stroke under the glass effect.
  listButtonGlass: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
  },
  listButtonDanger: {
    backgroundColor: 'rgba(255,80,80,0.12)',
    borderColor: 'rgba(255,80,80,0.25)',
  },
  listButtonDangerGlass: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,80,80,0.22)',
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
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  return (
    <TouchableOpacity
      style={[
        styles.listButton,
        danger && styles.listButtonDanger,
        useGlass && (danger ? styles.listButtonDangerGlass : styles.listButtonGlass),
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {useGlass && (
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="clear"
          tintColor={danger ? 'rgba(255,80,80,0.10)' : 'rgba(24,28,34,0.15)'}
          isInteractive
        />
      )}
      <View style={styles.listButtonContent}>
        <Text style={[styles.listButtonText, danger && styles.listButtonTextDanger]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};
