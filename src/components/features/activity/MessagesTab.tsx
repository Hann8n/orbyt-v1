import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../../components/ui/UI';
import { ConversationList } from '../chat';
import { getBottomNavBarHeight } from '../../../utils/helpers';

const MessagesTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);

  return (
    <View style={styles.container}>
      <ConversationList bottomNavBarHeight={bottomNavBarHeight} />
    </View>
  );
};

export default MessagesTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});
