import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import VerticalListSheet, { VerticalListCheckboxButton } from '../../ui/VerticalListSheet';
import { SHEET_STYLES } from '../../../utils/components/truesheet';
import { useProfileByDid, useSubscriptionMutation } from '../../../services/data/ProfileService';
import { useSheetPresentation } from '../../../hooks';

const DEFAULT_PREFERENCES = { post: false, reply: false };

interface SubscriptionOptionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  did: string;
}

const SubscriptionOptionsSheet: React.FC<SubscriptionOptionsSheetProps> = ({
  visible,
  onDismiss,
  did,
}) => {
  const { t } = useTranslation();
  const { data: profile } = useProfileByDid(did);
  const subscriptionMutation = useSubscriptionMutation();

  const preferences = profile?.viewer?.activitySubscription ?? DEFAULT_PREFERENCES;

  useSheetPresentation(visible, 'subscription-options-sheet');

  const handleTogglePreference = async (key: 'post' | 'reply') => {
    if (!did) return;

    const togglingOn = !preferences[key];
    const newPreferences = {
      ...preferences,
      [key]: togglingOn,
    };

    if (key === 'reply' && togglingOn) {
      newPreferences.post = true;
    } else if (key === 'post' && !togglingOn && preferences.reply) {
      newPreferences.reply = false;
    }

    subscriptionMutation.mutate({ did, preferences: newPreferences });
  };

  const handleTogglePost = () => handleTogglePreference('post');
  const handleToggleReply = () => handleTogglePreference('reply');

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
          onPress={handleTogglePost}
        />

        <VerticalListCheckboxButton
          label={t('profile.replies')}
          checked={preferences.reply}
          onPress={handleToggleReply}
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
