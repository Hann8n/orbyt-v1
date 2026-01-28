import React from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { useCurrentUser } from '../../src/stores/userStore';

const WatchedScreen: React.FC = () => {
  const router = useRouter();
  const { currentUser } = useCurrentUser();

  return (
    <View style={styles.container}>
      <ListHeader
        mode="sheet"
        title="Watched videos"
        showCloseButton
        onClosePress={() => router.back()}
        applySafeAreaTop={false}
        backgroundColor={Colors.black}
        titleIndent={true}
      />
      <FeedRenderer
        feedOption="watched"
        userDid={currentUser?.did ?? undefined}
        queryOptions={{ enabled: !!currentUser?.did }}
        viewMode="grid"
        refreshControl={null}
        backgroundColor={Colors.black}
        secondaryColor={Colors.white}
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
