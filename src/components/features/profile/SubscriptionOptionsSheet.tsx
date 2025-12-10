import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import VerticalListSheet, { VerticalListCheckboxButton } from '../../ui/VerticalListSheet';
import { useSubscriptionStore } from '../../../stores/subscriptionStore';

const DEFAULT_PREFERENCES = { post: false, reply: false };

interface SubscriptionOptionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  did: string | null | undefined;
}

const SubscriptionOptionsSheet: React.FC<SubscriptionOptionsSheetProps> = ({
  visible,
  onDismiss,
  did,
}) => {
  const updatePreferences = useSubscriptionStore((state) => state.updatePreferences);
  const unsubscribe = useSubscriptionStore((state) => state.unsubscribe);
  const subscriptions = useSubscriptionStore((state) => state.subscriptions);
  
  const preferences = useMemo(() => {
    if (!did) return DEFAULT_PREFERENCES;
    const prefs = subscriptions.get(did);
    return prefs ?? DEFAULT_PREFERENCES;
  }, [did, subscriptions]);

  const handleTogglePreference = useCallback(async (key: 'post' | 'reply') => {
    if (!did) return;
    
    const newPreferences = {
      ...preferences,
      [key]: !preferences[key],
    };
    
    if (!newPreferences.post && !newPreferences.reply) {
      await unsubscribe(did);
    } else {
      await updatePreferences(did, newPreferences);
    }
  }, [did, preferences, updatePreferences, unsubscribe]);

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={onDismiss}
      title="keep me posted"
      description="Get notified of this account's activity"
      showCancelButton={true}
      cancelButtonText="Done"
      name="subscription-options-sheet"
      footerTopPadding={24}
    >
      <View style={styles.content}>
        <VerticalListCheckboxButton
          label="Posts"
          checked={preferences.post}
          onPress={() => handleTogglePreference('post')}
        />

        <VerticalListCheckboxButton
          label="Replies"
          checked={preferences.reply}
          onPress={() => handleTogglePreference('reply')}
        />
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
});

export default SubscriptionOptionsSheet;

