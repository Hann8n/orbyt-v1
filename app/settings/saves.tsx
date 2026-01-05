import React from 'react';
import { useRouter } from 'expo-router';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { useCurrentUser } from '../../src/stores/userStore';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';

const SavesScreen: React.FC = () => {
  const navigation = useRouter();
  const { currentUser } = useCurrentUser();

  return (
    <View style={styles.container}>
      <ListHeader 
        mode="sheet"
        title="Your saves"
        showCloseButton
        onClosePress={() => navigation.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
  },
});

export default SavesScreen;




