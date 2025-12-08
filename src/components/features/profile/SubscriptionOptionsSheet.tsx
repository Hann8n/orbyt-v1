import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VerticalListSheet, { VerticalListCheckboxButton } from '../../ui/VerticalListSheet';
import { Colors } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { useSubscriptionStore } from '../../../stores/subscriptionStore';

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
  const insets = useSafeAreaInsets();
  const updatePreferences = useSubscriptionStore((state) => state.updatePreferences);
  const unsubscribe = useSubscriptionStore((state) => state.unsubscribe);
  const getPreferences = useSubscriptionStore((state) => state.getPreferences);
  
  const preferences = did ? (getPreferences(did) || { post: false, reply: false }) : { post: false, reply: false };

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
      showCancelButton={false}
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

        <View style={[styles.saveButtonContainer, { paddingBottom: insets.bottom }]}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.saveButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
  saveButtonContainer: {
    paddingTop: 24,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 44,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  saveButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
});

export default SubscriptionOptionsSheet;

