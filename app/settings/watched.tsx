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
      <FeedRenderer
        feedOption="watched"
        userDid={currentUser?.did ?? undefined}
        queryOptions={{ enabled: !!currentUser?.did }}
        viewMode="grid"
        refreshControl={null}
        headerComponent={
          <ListHeader
            mode="sheet"
            title="Watched videos"
            showCloseButton
            onClosePress={() => router.back()}
            applySafeAreaTop={false}
            style={styles.headerStyle}
          />
        }
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
  headerStyle: {
    marginHorizontal: -5,
  },
});

export default WatchedScreen;
