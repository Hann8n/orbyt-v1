import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Icon from '@/components/ui/Icon';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Colors } from '@/theme';
import { FontFamily, Typography } from '@/utils/components/typography';
import { BORDER_RADIUS } from '@/utils/constants';

interface Props {
  onRequestPermission: () => void;
}

const PermissionGate: React.FC<Props> = ({ onRequestPermission }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Icon name="video_camera_2" size={64} color={Colors.neutral[200]} style={styles.icon} />
      <Text style={styles.text}>{t('video.pleaseEnableCamera')}</Text>
      <SquircleNativePressable style={styles.button} onPress={onRequestPermission}>
        <Text style={styles.buttonText}>{t('video.grantPermission')}</Text>
      </SquircleNativePressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: Colors.black,
  },
  icon: {
    marginBottom: 20,
    opacity: 0.9,
  },
  text: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: Typography.lineHeights.title,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 20,
    minWidth: 120,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    color: Colors.black,
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.semibold,
  },
});

export default PermissionGate;
