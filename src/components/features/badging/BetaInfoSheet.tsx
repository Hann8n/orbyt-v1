import React, { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid } from 'date-fns';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  DEFAULT_HEADER_STYLE,
  useMeasuredFooterHeight,
} from '../../../utils/components/truesheet';
import { Colors } from '../../../theme';
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

const FOOTER_BOTTOM_INSET_MIN = 8;
const FOOTER_BOTTOM_INSET_MAX = 16;

const BetaInfoSheet: React.FC<BetaInfoSheetProps> = ({ visible, handle, joinDate, onDismiss }) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  const footerBottomPadding = Math.max(
    FOOTER_BOTTOM_INSET_MIN,
    Math.min(insets.bottom, FOOTER_BOTTOM_INSET_MAX)
  );
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(44 + footerBottomPadding);

  useEffect(() => {
    const sheet = bottomSheetRef.current;
    if (!sheet) return;
    if (visible) {
      sheet.present().catch(() => {});
    } else {
      sheet.dismiss().catch(() => {});
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
        <BetaBadge size={24} color={Colors.neutral[50]} opacity={0.7} customMargin={0} />
        <Text style={[styles.headerTitle, styles.headerTitleMargin]} numberOfLines={1}>
          {t('a11y.betaTester')}
        </Text>
      </View>
      <CloseButton onPress={onDismiss} />
    </View>
  );

  return (
    <AppTrueSheet
      ref={bottomSheetRef}
      name="beta-info-sheet"
      onDidDismiss={onDismiss}
      header={headerComponent}
      footer={wrapFooter(
        <View style={styles.footerContainer}>
          <KeyboardAwareFooter
            hideOnKeyboard={true}
            bottomPadding={footerBottomPadding}
            style={styles.footerKeyboardAware}
          >
            <View style={styles.cancelContainer}>
              <CancelButton onPress={onDismiss} text={t('common.close')} />
            </View>
          </KeyboardAwareFooter>
        </View>
      )}
    >
      <View
        style={[
          styles.content,
          {
            paddingBottom: Math.max(0, contentBottomPadding - CONTENT_TO_FOOTER_GAP_REDUCTION),
          },
        ]}
      >
        {/* Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            <Text style={styles.highlightedText}>{handle}</Text> joined during the orbyt beta. Beta
            testers helped test early features and shape the experience.
          </Text>
        </View>

        {/* Join Date */}
        {formattedDate && (
          <View style={styles.statusDateContainer}>
            <Text style={styles.statusText}>{t('profile.joinedOn', { date: formattedDate })}</Text>
          </View>
        )}
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 12,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    ...DEFAULT_HEADER_STYLE,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Figtree-Bold',
  },
  infoContainer: {
    marginBottom: 20,
    paddingHorizontal: 15,
  },
  infoText: {
    color: Colors.neutral[200],
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Figtree-Regular',
  },
  highlightedText: {
    fontWeight: '600',
    color: Colors.neutral[50],
    opacity: 1,
    fontFamily: 'Figtree-SemiBold',
  },
  headerTitleMargin: {
    marginLeft: 4,
  },
  statusDateContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  statusText: {
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
  cancelContainer: {
    alignItems: 'center',
    backgroundColor: Colors.black,
  },
  footerContainer: {
    backgroundColor: Colors.black,
  },
  footerKeyboardAware: {
    backgroundColor: Colors.black,
  },
});

export default BetaInfoSheet;
