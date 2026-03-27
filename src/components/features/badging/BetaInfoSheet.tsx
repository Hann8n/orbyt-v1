import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid } from 'date-fns';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  getFooterBottomPadding,
  SheetActionFooter,
  SHEET_STYLES,
  useMeasuredFooterHeight,
} from '../../../utils/components/truesheet';
import { Colors } from '../../../theme';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import BetaBadge from './BetaBadge';
import { FontFamily, Typography } from '../../../utils/components/typography';
import { useSheetPresentation } from '../../../hooks';

interface BetaInfoSheetProps {
  visible: boolean;
  handle: string;
  joinDate?: string;
  onDismiss: () => void;
}

const BetaInfoSheet: React.FC<BetaInfoSheetProps> = ({ visible, handle, joinDate, onDismiss }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const footerBottomPadding = getFooterBottomPadding(insets.bottom);
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(44 + footerBottomPadding);
  useSheetPresentation(visible, 'beta-info-sheet');

  const handleClosePress = useCallback(() => {
    TrueSheet.dismiss('beta-info-sheet').catch(() => {});
  }, []);

  const formattedDate = useMemo(() => {
    if (!joinDate) return null;
    const date = parseISO(joinDate);
    return isValid(date) ? format(date, 'MMM d, yyyy') : null;
  }, [joinDate]);

  // Header component for TrueSheet header prop (matches GermDisconnectSheet layout)
  const headerComponent = (
    <View style={styles.headerContainer}>
      <View style={styles.headerLeft}>
        <BetaBadge size={24} color={Colors.neutral[50]} opacity={0.7} customMargin={0} />
        <Text style={[styles.headerTitle, styles.headerTitleMargin]} numberOfLines={1}>
          {t('a11y.betaTester')}
        </Text>
      </View>
      <CloseButton onPress={handleClosePress} />
    </View>
  );

  return (
    <AppTrueSheet
      name="beta-info-sheet"
      onDidDismiss={onDismiss}
      header={headerComponent}
      footer={wrapFooter(
        <SheetActionFooter bottomPadding={footerBottomPadding} backgroundColor={Colors.black}>
          <CancelButton onPress={handleClosePress} text={t('common.done')} />
        </SheetActionFooter>
      )}
    >
      <View style={styles.content}>
        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionText}>
            <Text style={styles.highlightedText}>{handle}</Text>
            {t('profile.betaDescriptionRest')}
          </Text>
        </View>
        <View
          style={[
            styles.contentContainer,
            { paddingBottom: Math.max(0, contentBottomPadding - CONTENT_TO_FOOTER_GAP_REDUCTION) },
          ]}
        >
          {formattedDate && (
            <Text style={styles.statusText}>{t('profile.joinedOn', { date: formattedDate })}</Text>
          )}
        </View>
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  content: {},
  headerContainer: {
    ...SHEET_STYLES.headerContainer,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    ...SHEET_STYLES.headerTitle,
  },
  headerTitleMargin: {
    marginLeft: 10,
  },
  descriptionContainer: {
    ...SHEET_STYLES.descriptionContainer,
    marginBottom: 24,
  },
  descriptionText: {
    ...SHEET_STYLES.descriptionText,
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
  },
  highlightedText: {
    color: Colors.neutral[50],
    opacity: 1,
    fontFamily: FontFamily.semibold,
  },
  contentContainer: {
    ...SHEET_STYLES.contentContainer,
  },
  statusText: {
    ...SHEET_STYLES.descriptionText,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default BetaInfoSheet;
