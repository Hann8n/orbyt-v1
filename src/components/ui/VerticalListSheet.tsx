import React, { useRef, useEffect, useState } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../utils/truesheet/trueSheetUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { Colors } from './UI';
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
}) => {
  const bottomSheetRef = useRef<TrueSheet>(null);
  const footerRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);

  // Measure footer height dynamically
  const handleFooterLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) {
      setFooterHeight(height);
    }
  };

  // Content padding accounts for footer height to prevent content from being hidden
  // Dynamically calculated based on measured footer height
  const contentPaddingBottom = showCancelButton && footerHeight > 0
    ? footerHeight + insets.bottom
    : 0;

  // Handle bottom sheet visibility
  useEffect(() => {
    if (visible) {
      if (name) {
        safePresent(name);
      } else {
        bottomSheetRef.current?.present();
      }
    } else {
      if (name) {
        safeDismiss(name);
      } else {
        bottomSheetRef.current?.dismiss();
      }
    }
  }, [visible, name]);

  // Header component for TrueSheet header prop
  const headerComponent = (
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
  );

  return (
    <TrueSheet
      ref={bottomSheetRef}
      name={name}
      detents={detents}
      backgroundColor={Colors.black}
      onDidDismiss={onDismiss}
      grabber={false}
      keyboardMode="pan"
      scrollable={scrollable}
      header={headerComponent}
      footer={
        showCancelButton ? (
          <KeyboardAwareFooter hideOnKeyboard={true} bottomPadding={insets.bottom} style={{ backgroundColor: Colors.black }}>
            <View 
              ref={footerRef}
              onLayout={handleFooterLayout}
              style={[styles.cancelContainer, { backgroundColor: Colors.black, paddingTop: footerTopPadding ?? 8 }]}
            >
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
