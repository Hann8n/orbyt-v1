import React, { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  SheetActionFooter,
  useMeasuredFooterHeight,
  getFooterBottomPadding,
  SHEET_STYLES,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
} from '../../../utils/components/truesheet';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import { VerticalListButton } from '../../ui/VerticalListSheet';
import { GermDmIcon } from '../../ui/Icon';
import { AtprotoService } from '../../../services/api/AtprotoService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../../theme';
import { Typography, FontFamily } from '../../../utils/components/typography';

interface GermDisconnectSheetProps {
  visible: boolean;
  onDismiss: () => void;
  profileDid: string;
}

const GermDisconnectSheet: React.FC<GermDisconnectSheetProps> = ({
  visible,
  onDismiss,
  profileDid,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const insets = useSafeAreaInsets();
  const footerBottomPadding = getFooterBottomPadding(insets.bottom);
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(44 + footerBottomPadding);

  useEffect(() => {
    if (visible) {
      TrueSheet.present('germ-disconnect-sheet').catch(() => {});
    } else {
      TrueSheet.dismiss('germ-disconnect-sheet').catch(() => {});
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    TrueSheet.dismiss('germ-disconnect-sheet').catch(() => {});
    onDismiss();
  }, [onDismiss]);

  const handleDisconnect = useCallback(async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      const ok = await AtprotoService.deleteGermDeclaration();
      TrueSheet.dismiss('germ-disconnect-sheet').catch(() => {});
      onDismiss();
      if (ok) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.profiles.detail(profileDid),
        });
        Alert.alert(t('common.success'), t('profile.germDisconnected'));
      } else {
        Alert.alert(t('common.error'), t('errors.unexpected'));
      }
    } finally {
      setIsDisconnecting(false);
    }
  }, [profileDid, queryClient, onDismiss, isDisconnecting, t]);

  return (
    <AppTrueSheet
      name="germ-disconnect-sheet"
      onDidDismiss={onDismiss}
      header={
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <View style={styles.iconSquare}>
              <GermDmIcon size={20} />
            </View>
            <Text style={[styles.headerTitle, styles.headerTitleMargin]} numberOfLines={1}>
              {t('profile.germDm')}
            </Text>
          </View>
          <CloseButton onPress={handleDismiss} />
        </View>
      }
      footer={wrapFooter(
        <SheetActionFooter bottomPadding={footerBottomPadding} backgroundColor={Colors.black}>
          <CancelButton onPress={handleDismiss} text={t('common.done')} />
        </SheetActionFooter>
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
        <Text style={styles.description}>{t('profile.germDisconnectSheetDescription')}</Text>
        <VerticalListButton
          label={t('profile.germDisconnect')}
          onPress={handleDisconnect}
          variant="destructiveReversed"
          disabled={isDisconnecting}
          loading={isDisconnecting}
        />
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    ...SHEET_STYLES.headerContainer,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconSquare: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.brand.germBrandGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...SHEET_STYLES.headerTitle,
  },
  headerTitleMargin: {
    marginLeft: 10,
  },
  content: {
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    paddingTop: 8,
  },
  description: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.regular,
    textAlign: 'left',
    marginBottom: 24,
    paddingHorizontal: 0,
  },
});

export default GermDisconnectSheet;
