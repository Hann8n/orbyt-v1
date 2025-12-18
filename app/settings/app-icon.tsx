import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setAppIcon } from '@mozzius/expo-dynamic-app-icon';

import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon from '../../src/components/ui/Icon';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';

type AppIconKey = 'orBYTE' | 'orbytTV' | null;

const ICON_OPTIONS: {
  id: string;
  label: string;
  iconKey: AppIconKey;
  description: string;
  preview: any;
}[] = [
  {
    id: 'default',
    label: 'Default icon',
    iconKey: null,
    description: 'Use the standard orbyt icon',
    preview: require('../../src/assets/icon.png'),
  },
  {
    id: 'orBYTE',
    label: 'Triangle icon',
    iconKey: 'orBYTE',
    description: 'Minimal triangle mark',
    preview: require('../../src/assets/AppIcons/android/orBYTE_icon_adaptive_foreground.png'),
  },
  {
    id: 'orbytTV',
    label: 'TV icon',
    iconKey: 'orbytTV',
    description: 'TV-inspired app icon',
    preview: require('../../src/assets/AppIcons/android/orbyt_icon_adaptive_foreground.png'),
  },
];

const AppIconSettingsScreen: React.FC = () => {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectIcon = useCallback(
    async (iconKey: AppIconKey) => {
      if (isSubmitting) return;

      try {
        setIsSubmitting(true);
        await setAppIcon(iconKey);
      } catch (error: any) {
        console.error('Error changing app icon:', error);
        const message =
          Platform.OS === 'android'
            ? 'Changing the app icon may not be supported on all Android launchers.'
            : 'Unable to change the app icon. Please make sure this device supports alternate icons.';
        Alert.alert('icon change failed', message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting],
  );

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title="App icon"
        showCloseButton
        onClosePress={() => navigation.back()}
        applySafeAreaTop={Platform.OS === 'android'}
        style={{ marginHorizontal: -5 }}
        backgroundColor={Colors.black}
        titleIndent={true}
      />

      <View style={{ flex: 1 }}>
        {ICON_OPTIONS.map(option => (
          <View key={option.id} style={{ marginBottom: 0 }}>
            <TouchableOpacity
              style={settingsButtonStyles.menuOption}
              onPress={() => handleSelectIcon(option.iconKey)}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <View style={styles.iconRowLeft}>
                <View style={styles.previewContainer}>
                  <Image source={option.preview} style={styles.previewImage} resizeMode="contain" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={settingsTextStyles.menuOptionText}>{option.label}</Text>
                  <Text style={styles.descriptionText}>{option.description}</Text>
                </View>
              </View>
              <View style={styles.chevronContainer}>
                <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  iconRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  previewContainer: {
    width: 44,
    height: 44,
    borderRadius: 15,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: Colors.black,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
  },
  descriptionText: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
  },
  chevronContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppIconSettingsScreen;


