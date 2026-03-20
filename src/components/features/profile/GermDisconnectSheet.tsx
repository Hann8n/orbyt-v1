import React, { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Alert } from 'react-native';
import VerticalListSheet, { VerticalListButton, TrueSheet } from '../../ui/VerticalListSheet';
import { AtprotoService } from '../../../services/api/AtprotoService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useQueryClient } from '@tanstack/react-query';

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

  useEffect(() => {
    if (visible) TrueSheet.present('germ-disconnect-sheet');
  }, [visible]);

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
    <VerticalListSheet
      name="germ-disconnect-sheet"
      onDismiss={onDismiss}
      title={t('profile.germDm')}
      description={t('profile.germDisconnectSheetDescription')}
      showCancelButton
      cancelButtonText={t('common.cancel')}
    >
      <View style={styles.content}>
        <VerticalListButton
          label={t('profile.germDisconnect')}
          onPress={handleDisconnect}
          disabled={isDisconnecting}
          danger
        />
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  content: {},
});

export default GermDisconnectSheet;
