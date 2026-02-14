import React from 'react';
import { useRouter } from 'expo-router';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { useCurrentUser } from '../../src/stores/userStore';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../src/theme';
import ListHeader from '../../src/components/ui/ListHeader';

const SavesScreen: React.FC = () => {
  const router = useRouter();
  const { currentUser } = useCurrentUser();

  return (
    <View style={styles.container}>
      <ListHeader
        mode="sheet"
        title="Your saves"
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
        refreshControl={undefined}
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
