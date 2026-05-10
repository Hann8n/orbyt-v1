import React, { useCallback } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { Colors } from '@/theme';
import { FontFamily, fontSizeFor } from '@/utils/components/typography';
import { NativePressable } from '@/components/ui/NativePressable';
import { useCreateSegmentsStore } from '@/stores/createSegmentsStore';

const DURATION_OPTIONS = [
  { value: 6, labelKey: 'create.duration6s' as const },
  { value: 16, labelKey: 'create.duration16s' as const },
  { value: 60, labelKey: 'create.duration1m' as const },
  { value: 180, labelKey: 'create.duration3m' as const },
] as const;

interface Props {
  selectedDuration: number;
  onSelect: (sec: number) => void;
}

const DurationSelector: React.FC<Props> = ({ selectedDuration, onSelect }) => {
  const { t } = useTranslation();

  const open = useCallback(() => {
    const currentTotal = useCreateSegmentsStore.getState().totalDuration();
    const available = DURATION_OPTIONS.filter(opt => opt.value >= currentTotal);
    Haptics.selectionAsync();
    Alert.alert(t('video.maxDuration'), t('video.selectMaxLength'), [
      ...available.map(opt => ({
        text: t(opt.labelKey),
        onPress: () => onSelect(opt.value),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  }, [onSelect, t]);

  const labelKey =
    DURATION_OPTIONS.find(opt => opt.value === selectedDuration)?.labelKey ?? 'create.duration16s';

  return (
    <NativePressable style={styles.button} onPress={open}>
      <Text style={styles.label}>{t(labelKey)}</Text>
    </NativePressable>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 14,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    color: Colors.neutral[50],
    fontSize: fontSizeFor(17),
    fontFamily: FontFamily.bold,
  },
});

export default React.memo(DurationSelector);
