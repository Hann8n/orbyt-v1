import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/theme';
import { NativePressable } from '@/components/ui/NativePressable';
import { BackArrowIcon } from '@/components/ui/Icon';
import ChatsTab from '@/components/features/activity/ChatsTab';
import { FontFamily, TextStyles, fontSizeFor } from '@/utils/components/typography';
import { getEffectiveTopInset } from '@/utils/device/screen';

export default function RequestsScreen() {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const topInset = getEffectiveTopInset(top);
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + fontSizeFor(4) }]}>
        <NativePressable onPress={() => router.back()} style={styles.backButton}>
          <BackArrowIcon size={28} color={Colors.neutral[50]} />
        </NativePressable>
        <Text style={styles.title} numberOfLines={1}>
          {t('chat.requests')}
        </Text>
      </View>
      <ChatsTab chatFilter={{ status: 'request' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: fontSizeFor(10),
    paddingBottom: fontSizeFor(4),
    gap: fontSizeFor(4),
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: TextStyles.sectionHeader.fontSize,
    fontFamily: FontFamily.black,
    color: Colors.neutral[50],
    includeFontPadding: false,
  },
});
