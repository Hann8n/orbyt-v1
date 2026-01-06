import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import UI from '../../src/components/ui/UI';
import feedService from '../../src/services/FeedService';
import { queryKeys } from '../../src/utils/query/queryKeys';
import { ModerationService } from '../../src/services/moderation/ModerationService';
import { ModerationSettings, LabelPreference } from '../../src/services/moderation/ModerationTypes';
import { useModeration, useUserStoreState } from '../../src/stores/userStore';
import { settingsButtonStyles, settingsLayoutStyles, settingsActiveStyles } from './SettingsStyles';
import { OptionsButton } from '../../src/components/ui/OptionsButton';
import { useModerationSettings } from '../../src/hooks/useModerationSettings';

interface ContentTypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  preference: LabelPreference;
}

const ContentFiltersScreen: React.FC = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { saveModerationSettings } = useModeration();
  const { agent, isAuthenticated, currentUser } = useUserStoreState();

  // Use React Query hook for moderation settings (account-scoped)
  const { settings: moderationSettings } = useModerationSettings(currentUser?.did ?? undefined);

  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [adultContentEnabled, setAdultContentEnabled] = useState(false);

  // Check if agent is available
  useEffect(() => {
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
    }
  }, [agent, isAuthenticated]);

  // Update local state when React Query settings change
  useEffect(() => {
    if (moderationSettings) {
      setSettings(moderationSettings);
      setAdultContentEnabled(moderationSettings.adultContentEnabled);
    }
  }, [moderationSettings]);

  const [contentOptions, setContentOptions] = useState<ContentTypeOption[]>([
    {
      id: 'nsfw',
      label: 'NSFW',
      description: 'Not safe for work content',
      icon: '',
      preference: 'hide',
    },
    {
      id: 'suggestive',
      label: 'Suggestive Content',
      description: 'Suggestive or provocative content',
      icon: '',
      preference: 'warn',
    },
    {
      id: 'nudity',
      label: 'Artistic Nudity',
      description: 'Nude or partially nude content',
      icon: '',
      preference: 'warn',
    },
    {
      id: 'gore',
      label: 'Graphic Media',
      description: 'Violent or graphic content',
      icon: '',
      preference: 'warn',
    },
  ]);

  // Update content options when settings change
  useEffect(() => {
    if (settings) {
      setContentOptions(prev =>
        prev.map(option => ({
          ...option,
          preference: settings.labels[option.id] || option.preference,
        }))
      );
    }
  }, [settings]);

  const updateContentPreference = async (contentId: string, preference: LabelPreference) => {
    // Check if user is authenticated
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    setContentOptions(options => options.map(o => (o.id === contentId ? { ...o, preference } : o)));
    try {
      if (settings) {
        const updatedSettings: ModerationSettings = {
          ...settings,
          labels: {
            ...settings.labels,
            [contentId]: preference,
          },
        };
        await saveModerationSettings(updatedSettings);
        setSettings(updatedSettings);
        // Reset moderation/feeds so all content re-evaluates with new rules
        feedService.clearCurrentFeed();
        queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
        // React Query cache for moderation settings is invalidated by saveModerationSettings
      }
    } catch (e) {
      console.error('Error saving content preference:', e);
      Alert.alert(
        'Error Saving Preference',
        `Failed to save content preference: ${e instanceof Error ? e.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  };

  const updateAdultContent = async (value: boolean) => {
    // Check if user is authenticated
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    setAdultContentEnabled(value);
    try {
      if (settings) {
        const updatedSettings: ModerationSettings = {
          ...settings,
          adultContentEnabled: value,
        };
        await saveModerationSettings(updatedSettings);
        setSettings(updatedSettings);
        // Reset moderation/feeds so all content re-evaluates with new rules
        feedService.clearCurrentFeed();
        queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
      }
    } catch (e) {
      console.error('Error saving adult content preference:', e);
      Alert.alert(
        'Error Saving Setting',
        `Failed to save adult content setting: ${e instanceof Error ? e.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title="Content filters"
        showCloseButton
        onClosePress={() => router.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={settingsLayoutStyles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Content Type Settings */}
        <View style={settingsLayoutStyles.section}>
          <View style={{ marginBottom: 12, paddingHorizontal: 5 }}>
            {adultContentEnabled && (
              <OptionsButton
                label="sensitive content"
                showSwitch={true}
                switchValue={adultContentEnabled}
                onSwitchChange={updateAdultContent}
              />
            )}
          </View>

          {contentOptions.map(option => {
            const isAdult = ['nsfw'].includes(option.id);
            if (isAdult && !adultContentEnabled) return null;
            return (
              <View key={option.id} style={{ marginBottom: 12, paddingHorizontal: 5 }}>
                <OptionsButton
                  label={option.label}
                  containerStyle={{ alignItems: 'center' }}
                  rightContent={
                    <View style={[styles.toggleButtonsContainer, { justifyContent: 'center' }]}>
                      <View style={settingsButtonStyles.toggleButtonGroup}>
                        <Pressable
                          style={[
                            settingsButtonStyles.toggleButton,
                            option.preference === 'ignore' && [
                              settingsActiveStyles.toggleButtonActive,
                              {
                                backgroundColor: UI.Colors.STATUS.SUCCESS,
                                borderRightColor: UI.Colors.STATUS.SUCCESS,
                              },
                            ],
                          ]}
                          onPress={() => updateContentPreference(option.id, 'ignore')}
                          accessibilityLabel="Show"
                        >
                          <Icon
                            name="check"
                            size={16}
                            color={option.preference === 'ignore' ? Colors.black : Colors.lightGray}
                          />
                        </Pressable>
                        <Pressable
                          style={[
                            settingsButtonStyles.toggleButton,
                            option.preference === 'warn' && [
                              settingsActiveStyles.toggleButtonActive,
                              {
                                backgroundColor: UI.Colors.STATUS.WARNING,
                                borderRightColor: UI.Colors.STATUS.WARNING,
                              },
                            ],
                          ]}
                          onPress={() => updateContentPreference(option.id, 'warn')}
                          accessibilityLabel="Warn"
                        >
                          <Icon
                            name="eye"
                            size={16}
                            color={option.preference === 'warn' ? Colors.black : Colors.lightGray}
                          />
                        </Pressable>
                        <Pressable
                          style={[
                            settingsButtonStyles.toggleButton,
                            styles.toggleButtonLast,
                            option.preference === 'hide' && [
                              settingsActiveStyles.toggleButtonActive,
                              {
                                backgroundColor: UI.Colors.STATUS.ERROR,
                                borderRightColor: UI.Colors.STATUS.ERROR,
                              },
                            ],
                          ]}
                          onPress={() => updateContentPreference(option.id, 'hide')}
                          accessibilityLabel="Hide"
                        >
                          <Icon
                            name="close"
                            size={16}
                            color={option.preference === 'hide' ? Colors.black : Colors.lightGray}
                          />
                        </Pressable>
                      </View>
                    </View>
                  }
                />
              </View>
            );
          })}
        </View>
        <View style={{ marginTop: 4, paddingHorizontal: 5 }}>
          <OptionsButton
            label="adjust on bsky.app"
            subtitle="open Bluesky content settings"
            onPress={() => Linking.openURL('https://bsky.app/moderation')}
            rightIcon={<Icon name="external-link" size={20} color={Colors.gray} />}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  menuOptionLeft: {
    flexDirection: 'column',
    flex: 1,
  },
  toggleButtonsContainer: {
    marginTop: 0,
    alignItems: 'center',
    alignSelf: 'center',
  },
  toggleButtonLast: {
    borderRightWidth: 0,
  },
});

export default ContentFiltersScreen;
