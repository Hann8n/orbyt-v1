import React, { useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import VerticalListSheet, {
  VerticalListCheckboxButton,
  TrueSheet,
} from '../../ui/VerticalListSheet';
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
  const updatePreferences = useSubscriptionStore(state => state.updatePreferences);
  const unsubscribe = useSubscriptionStore(state => state.unsubscribe);
  const subscriptions = useSubscriptionStore(state => state.subscriptions);

  const preferences = useMemo(() => {
    if (!did) return DEFAULT_PREFERENCES;
    const prefs = subscriptions.get(did);
    return prefs ?? DEFAULT_PREFERENCES;
  }, [did, subscriptions]);

  useEffect(() => {
    if (visible) TrueSheet.present('subscription-options-sheet');
  }, [visible]);

  const handleTogglePreference = useCallback(
    async (key: 'post' | 'reply') => {
      if (!did) return;

      const togglingOn = !preferences[key];
      const newPreferences = {
        ...preferences,
        [key]: togglingOn,
      };

      // Enforce "Posts" as required for "Replies"
      // - If turning Replies on, ensure Posts is also on
      // - If turning Posts off, also turn Replies off
      if (key === 'reply' && togglingOn) {
        newPreferences.post = true;
      } else if (key === 'post' && !togglingOn && preferences.reply) {
        newPreferences.reply = false;
      }

      if (!newPreferences.post && !newPreferences.reply) {
        await unsubscribe(did);
      } else {
        await updatePreferences(did, newPreferences);
      }
    },
    [did, preferences, updatePreferences, unsubscribe]
  );

  return (
    <VerticalListSheet
      name="subscription-options-sheet"
      onDismiss={onDismiss}
      title="keep me posted"
      description="Get notified of this account's activity"
      showCancelButton={true}
      cancelButtonText="Done"
      footerTopPadding={0}
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
  content: {},
});

export default SubscriptionOptionsSheet;
