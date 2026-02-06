import { View, StyleSheet } from 'react-native';
import ListHeader from '../../src/components/ui/ListHeader';
import ChatsTab from '../../src/components/features/activity/ChatsTab';
import { Colors } from '../../src/theme';

const REQUESTS_FILTER = { status: 'request' as const };

export default function ChatRequestsScreen() {
  return (
    <View style={styles.container}>
      <ListHeader
        mode="stacked"
        title="Requests"
        showBackButton
        applySafeAreaTop
        backgroundColor={Colors.black}
      />
      <View style={styles.list}>
        <ChatsTab chatFilter={REQUESTS_FILTER} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  list: {
    flex: 1,
  },
});
