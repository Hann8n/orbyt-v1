import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Colors } from '../../src/components/ui/UI';
import { ChatScreen } from '../../src/components/features/chat';

export default function IndividualChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!id) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>{/* Error state */}</View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChatScreen conversationId={id} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
  },
});
