import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import UI from '../../src/components/ui/UI';
import type { LabelPreference, ModerationPrefs } from '@atproto/api';
import feedService from '../../src/services/FeedService';
import { queryKeys } from '../../src/utils/query/queryKeys';
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

const BASE_CONTENT_OPTIONS: Omit<ContentTypeOption, 'preference'>[] = [
  { id: 'porn', label: 'NSFW', description: 'Not safe for work content', icon: '' },
  {
    id: 'sexual',
    label: 'Suggestive Content',
    description: 'Suggestive or provocative content',
    icon: '',
  },
  {
    id: 'nudity',
    label: 'Artistic Nudity',
    description: 'Nude or partially nude content',
    icon: '',
  },
  {
    id: 'graphic-media',
    label: 'Graphic Media',
    description: 'Violent or graphic content',
    icon: '',
  },
];

const ContentFiltersScreen: React.FC = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { saveModerationPrefs } = useModeration();
  const { agent, isAuthenticated, currentUser } = useUserStoreState();

  const { moderationPrefs } = useModerationSettings(currentUser?.did ?? undefined);

  // Local draft after user edits; null until first edit. Effective = draft ?? server.
  const [settings, setSettings] = useState<ModerationPrefs | null>(null);
  const effective = settings ?? moderationPrefs;

  const adultContentEnabled = (effective?.adultContentEnabled ?? false) as boolean;

  const contentOptions = useMemo(
    () =>
      BASE_CONTENT_OPTIONS.map(opt => ({
        ...opt,
        preference: (effective?.labels?.[opt.id] ?? 'hide') as LabelPreference,
      })),
    [effective]
  );

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

  const updateContentPreference = async (contentId: string, preference: LabelPreference) => {
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
      return;
    }
    const base = settings ?? moderationPrefs;
    if (!base) return;
    const updated: ModerationPrefs = {
      ...base,
      labels: { ...base.labels, [contentId]: preference },
    };
    setSettings(updated);
    try {
      await saveModerationPrefs(updated);
      feedService.clearCurrentFeed();
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
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
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
      return;
    }
    const base = settings ?? moderationPrefs;
    if (!base) return;
    const updated: ModerationPrefs = { ...base, adultContentEnabled: value };
    setSettings(updated);
    try {
      await saveModerationPrefs(updated);
      feedService.clearCurrentFeed();
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
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
        style={styles.headerMargin}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={settingsLayoutStyles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Content Type Settings */}
        <View style={settingsLayoutStyles.section}>
          <View style={styles.optionContainer}>
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
            const isAdult = option.id === 'porn';
            if (isAdult && !adultContentEnabled) return null;
            return (
              <View key={option.id} style={styles.optionContainer}>
                <OptionsButton
                  label={option.label}
                  containerStyle={styles.optionButtonContainer}
                  rightContent={
                    <View style={styles.toggleButtonsContainer}>
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
        <View style={styles.externalLinkContainer}>
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
  headerMargin: {
    marginHorizontal: -5,
  },
  optionContainer: {
    marginBottom: 12,
    paddingHorizontal: 5,
  },
  optionButtonContainer: {
    alignItems: 'center',
  },
  toggleButtonsContainer: {
    marginTop: 0,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  toggleButtonLast: {
    borderRightWidth: 0,
  },
  externalLinkContainer: {
    marginTop: 4,
    paddingHorizontal: 5,
  },
});

export default ContentFiltersScreen;
