import React, { useRef, useMemo, useCallback } from 'react';
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

interface VerticalListSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  children: React.ReactNode;
  snapPoints?: string[];
  showCancelButton?: boolean;
  cancelButtonText?: string;
}

const VerticalListSheet: React.FC<VerticalListSheetProps> = ({
  visible,
  onDismiss,
  title,
  children,
  snapPoints = ['auto'],
  showCancelButton = true,
  cancelButtonText = 'Cancel',
}) => {
  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();

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
      backgroundColor={Colors.black}
      onDismiss={onDismiss}
      cornerRadius={25}
      grabber={false}
      FooterComponent={
        showCancelButton ? (
          <View style={[styles.cancelContainer, { paddingBottom: insets.bottom }]}>
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
    paddingHorizontal: 4,
    paddingTop: 4,
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
    borderRadius: 50,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
});

export default VerticalListSheet;
