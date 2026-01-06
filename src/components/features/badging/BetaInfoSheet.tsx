import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid } from 'date-fns';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../../utils/components/truesheet/utils';
import { Colors } from '../../ui/UI';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import BetaBadge from './BetaBadge';
import KeyboardAwareFooter from '../../../utils/components/truesheet/KeyboardAwareFooter';

interface BetaInfoSheetProps {
  visible: boolean;
  handle: string;
  joinDate?: string;
  onDismiss: () => void;
}

const BetaInfoSheet: React.FC<BetaInfoSheetProps> = ({ visible, handle, joinDate, onDismiss }) => {
  const bottomSheetRef = useRef<TrueSheet>(null);
  const sheetDetents: ('auto' | number)[] = useMemo(() => ['auto'], []);
  const insets = useSafeAreaInsets();

  // Calculate footer height as constant: cancelContainer paddingTop (8) + button minHeight (44)
  const footerHeight = 8 + 44;

  useEffect(() => {
    if (visible) {
      safePresent('beta-info-sheet');
    } else {
      safeDismiss('beta-info-sheet');
    }
  }, [visible]);

  const formattedDate = useMemo(() => {
    if (!joinDate) return null;
    const date = parseISO(joinDate);
    return isValid(date) ? format(date, 'MMM d, yyyy') : null;
  }, [joinDate]);

  // Header component for TrueSheet header prop
  const headerComponent = (
    <View style={styles.headerContainer}>
      <View style={styles.headerLeft}>
        <BetaBadge textSize={20} color={Colors.white} opacity={0.7} customMargin={0} />
        <Text style={[styles.headerTitle, { marginLeft: 4 }]} numberOfLines={1}>
          Beta User
        </Text>
      </View>
      <CloseButton onPress={onDismiss} />
    </View>
  );

  return (
    <TrueSheet
      ref={bottomSheetRef}
      name="beta-info-sheet"
      detents={sheetDetents}
      backgroundColor={Colors.black}
      onDidDismiss={onDismiss}
      grabber={false}
      header={headerComponent}
      footer={
        <View style={{ backgroundColor: Colors.black, paddingBottom: insets.bottom }}>
          <KeyboardAwareFooter
            hideOnKeyboard={true}
            bottomPadding={0}
            style={{ backgroundColor: Colors.black }}
          >
            <View style={[styles.cancelContainer, { backgroundColor: Colors.black }]}>
              <CancelButton onPress={onDismiss} text="Close" />
            </View>
          </KeyboardAwareFooter>
        </View>
      }
    >
      <View style={[styles.content, { paddingBottom: footerHeight }]}>
        {/* Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            <Text style={styles.highlightedText}>{handle}</Text> joined during the Orbyt beta. Beta
            users helped test early features and shape the experience.
          </Text>
        </View>

        {/* Join Date */}
        {formattedDate && (
          <View style={styles.statusDateContainer}>
            <Text style={styles.statusText}>Joined on {formattedDate}</Text>
          </View>
        )}
      </View>
    </TrueSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Bold',
  },
  infoContainer: {
    marginBottom: 20,
    paddingHorizontal: 15,
  },
  infoText: {
    color: Colors.lightGray,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Firma-Regular',
  },
  highlightedText: {
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 1,
    fontFamily: 'Firma-SemiBold',
  },
  statusDateContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  statusText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
});

export default BetaInfoSheet;
