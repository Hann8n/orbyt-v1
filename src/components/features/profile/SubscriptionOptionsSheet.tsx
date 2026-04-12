import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import VerticalListSheet, { VerticalListCheckboxButton } from '../../ui/VerticalListSheet';
import { SHEET_STYLES } from '../../../utils/components/truesheet';
import { useSubscriptionStore } from '../../../stores/subscriptionStore';
import { useSheetPresentation } from '../../../hooks';

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
  const { t } = useTranslation();
  const updatePreferences = useSubscriptionStore(state => state.updatePreferences);
  const unsubscribe = useSubscriptionStore(state => state.unsubscribe);
  const subscriptions = useSubscriptionStore(state => state.subscriptions);

  const preferences = useMemo(() => {
    if (!did) return DEFAULT_PREFERENCES;
    const prefs = subscriptions.get(did);
    return prefs ?? DEFAULT_PREFERENCES;
  }, [did, subscriptions]);

  useSheetPresentation(visible, 'subscription-options-sheet');

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
    <VerticalListSheet name="subscription-options-sheet" onDismiss={onDismiss}>
      <View style={styles.content}>
        <Text style={[SHEET_STYLES.sheetScreenTitle, styles.subscriptionTitle]}>
          {t('profile.keepMePosted')}
        </Text>
        <Text style={[SHEET_STYLES.descriptionText, styles.subtitle]}>
          {t('profile.getNotifiedActivity')}
        </Text>
        <VerticalListCheckboxButton
          label={t('profile.posts')}
          checked={preferences.post}
          onPress={() => handleTogglePreference('post')}
        />

        <VerticalListCheckboxButton
          label={t('profile.replies')}
          checked={preferences.reply}
          onPress={() => handleTogglePreference('reply')}
        />
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  content: {},
  subscriptionTitle: {
    marginBottom: 6,
  },
  subtitle: {
    marginTop: 0,
    marginBottom: 18,
  },
});

export default SubscriptionOptionsSheet;
