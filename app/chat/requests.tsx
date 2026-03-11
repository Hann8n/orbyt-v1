import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import ListHeader from '../../src/components/ui/ListHeader';
import ChatsTab from '../../src/components/features/activity/ChatsTab';
import { Colors } from '../../src/theme';

const REQUESTS_FILTER = { status: 'request' as const };

export default function ChatRequestsScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ListHeader
        mode="stacked"
        title={t('chat.requests')}
        showBackButton
        applySafeAreaTop
        backgroundColor={Colors.transparent}
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
