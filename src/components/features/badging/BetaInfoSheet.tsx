import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid } from 'date-fns';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  safeDismiss,
  safePresent,
  sheetStyles,
  defaultSheetProps,
  FOOTER_HEIGHT,
} from '../../../utils/components/truesheet';
import { Colors } from '../../ui/UI';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import BetaBadge from './BetaBadge';

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
    <View style={sheetStyles.headerContainer}>
      <View style={sheetStyles.headerLeft}>
        <BetaBadge size={24} color={Colors.white} opacity={0.7} customMargin={0} />
        <Text style={[sheetStyles.headerTitle, sheetStyles.headerTitleWithIcon]} numberOfLines={1}>
          Beta Tester
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
      {...defaultSheetProps}
      onDidDismiss={onDismiss}
      header={headerComponent}
      footer={
        <View style={[sheetStyles.footerContainer, { paddingBottom: insets.bottom }]}>
          <View style={sheetStyles.cancelContainer}>
            <CancelButton onPress={onDismiss} text="Close" />
          </View>
        </View>
      }
    >
      <View style={[sheetStyles.content, { paddingBottom: FOOTER_HEIGHT.standard }]}>
        {/* Info Container */}
        <View style={sheetStyles.infoContainer}>
          <Text style={sheetStyles.infoText}>
            <Text style={styles.highlightedText}>{handle}</Text> joined during the orbyt beta. Beta
            testers helped test early features and shape the experience.
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
  highlightedText: {
    fontWeight: '600',
    color: Colors.white,
    opacity: 1,
    fontFamily: 'Figtree-SemiBold',
  },
  statusDateContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  statusText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
});

export default BetaInfoSheet;
