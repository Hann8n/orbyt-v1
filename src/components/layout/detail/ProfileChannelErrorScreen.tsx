import { memo, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import CancelButton from '@/components/ui/CancelButton';
import { Colors } from '@/theme';
import { LAYOUT_INSETS } from '@/utils/constants';

/** Hero size for profile/channel error GIF (readable on phone; larger than TV empty 70). */
const ERROR_GIF_SIZE = 100;

/** Matches ErrorBoundary fallback `content` / `buttonContainer` max width. */
const CONTENT_MAX_WIDTH = 400;

const ERROR_GIF = require('../../../assets/error.gif');

export interface ProfileChannelErrorScreenProps {
  title: string;
  subtitle: string;
  onRetry: () => void;
  onGoBack?: () => void;
}

/**
 * Profile / channel not-found and fetch-error full screen.
 * Always uses a black shell (same as {@link ErrorBoundary}); title/body match its typography and colors.
 */
export const ProfileChannelErrorScreen = memo(function ProfileChannelErrorScreen({
  title,
  subtitle,
  onRetry,
  onGoBack,
}: ProfileChannelErrorScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const actionsPaddingBottom = useMemo(() => Math.max(insets.bottom, 12) + 16, [insets.bottom]);

  return (
    <View style={styles.root}>
      <View style={styles.column}>
        <View style={styles.contentArea}>
          <View style={styles.hero}>
            <Image
              source={ERROR_GIF}
              style={styles.gif}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          </View>

          <View style={styles.copyBlock}>
            <Text style={styles.boundaryTitle}>{title}</Text>
            <Text style={styles.boundaryMessage}>{subtitle}</Text>
          </View>
        </View>

        <View style={[styles.actions, { paddingBottom: actionsPaddingBottom }]}>
          <CancelButton
            onPress={onRetry}
            text={t('errors.tryAgain')}
            variant="primary"
            style={styles.actionBtn}
          />
          {onGoBack != null ? (
            <CancelButton
              onPress={onGoBack}
              text={t('common.goBack')}
              variant="default"
              style={styles.actionBtn}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.black,
    alignItems: 'center',
    paddingHorizontal: LAYOUT_INSETS.SCREEN,
    paddingTop: 24,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    minHeight: 0,
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%',
  },
  hero: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  gif: {
    width: ERROR_GIF_SIZE,
    height: ERROR_GIF_SIZE,
  },
  copyBlock: {
    width: '100%',
    alignItems: 'flex-start',
  },
  boundaryTitle: {
    fontSize: 32,
    fontFamily: 'Figtree-SemiBold',
    color: Colors.neutral[50],
    textAlign: 'left',
    marginBottom: 12,
    lineHeight: 40,
    letterSpacing: 0.15,
    width: '100%',
  },
  boundaryMessage: {
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    color: Colors.neutral[500],
    textAlign: 'left',
    marginBottom: 24,
    lineHeight: 24,
    width: '100%',
  },
  actions: {
    width: '100%',
    paddingTop: 16,
    gap: 12,
  },
  actionBtn: {
    alignSelf: 'stretch',
    width: '100%',
  },
});

ProfileChannelErrorScreen.displayName = 'ProfileChannelErrorScreen';
