import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setAppIcon } from '@mozzius/expo-dynamic-app-icon';

import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { OptionsButton } from '../../src/components/ui/OptionsButton';

type AppIconKey = 'orBYTE' | null;

const ICON_OPTIONS: {
  id: string;
  label: string;
  iconKey: AppIconKey;
  preview: any;
}[] = [
  {
    id: 'default',
    label: 'Default',
    iconKey: null,
    preview: require('../../src/assets/AppIcons/iOS/orbyt.png'),
  },
  {
    id: 'orBYTE',
    label: 'Beta',
    iconKey: 'orBYTE',
    preview: require('../../src/assets/AppIcons/iOS/orBYTE.png'),
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
          <OptionsButton
            key={option.id}
            label={option.label}
            onPress={() => handleSelectIcon(option.iconKey)}
            disabled={isSubmitting}
            leftContent={
              <View style={styles.row}>
                <Text style={settingsTextStyles.menuOptionText}>{option.label}</Text>
                <View style={styles.previewContainer}>
                  <Image 
                    source={option.preview} 
                    style={styles.previewImage} 
                    contentFit="contain"
                    cachePolicy="memory"
                  />
                </View>
              </View>
            }
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  previewContainer: {
    width: 52,
    height: 52,
    borderRadius: 15,
    overflow: 'hidden',
    marginLeft: 'auto',
    backgroundColor: Colors.black,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
  },
});

export default AppIconSettingsScreen;


