import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import FeedRenderer from '@/components/features/feed/FeedRenderer';
import { useCurrentUser } from '@/stores/userStore';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/theme';
import ListHeader from '@/components/ui/ListHeader';

const SavesScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useCurrentUser();

  return (
    <View style={styles.container}>
      <ListHeader
        mode="sheet"
        title={t('settings.yourSaves')}
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={false}
        backgroundColor={Colors.transparent}
      />
      <FeedRenderer
        feedOption="bookmarks"
        userDid={currentUser?.did ?? undefined}
        viewMode="grid"
        isVisible={true}
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

export default SavesScreen;
