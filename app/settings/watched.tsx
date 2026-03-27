import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/theme';
import ListHeader from '@/components/ui/ListHeader';
import FeedRenderer from '@/components/features/feed/FeedRenderer';
import { useCurrentUser } from '@/stores/userStore';

const WatchedScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useCurrentUser();

  return (
    <View style={styles.container}>
      <ListHeader
        mode="sheet"
        title={t('settings.watchedVideos')}
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={false}
        backgroundColor={Colors.transparent}
      />
      <FeedRenderer
        feedOption="watched"
        userDid={currentUser?.did ?? undefined}
        queryOptions={{ enabled: !!currentUser?.did }}
        viewMode="grid"
        backgroundColor={Colors.black}
        secondaryColor={Colors.neutral[50]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});

export default WatchedScreen;
