import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import ExpoDynamicAppIcon from '@variant-systems/expo-dynamic-app-icon';
import type { ImageSource } from 'expo-image';

import { Colors } from '../../src/theme';
import Icon from '../../src/components/ui/Icon';
import ListHeader from '../../src/components/ui/ListHeader';
import { settingsLayoutStyles } from './SettingsStyles';
import { useCurrentUser } from '../../src/stores/userStore';
import { useOrbytColors } from '../../src/services/colors';
import { formatHandle } from '../../src/utils/formatting/handles';
import { logger } from '../../src/utils/logger';

type AppIconKey =
  | 'orBYTE'
  | 'planyt_green'
  | 'planyt_blue'
  | 'planyt_greyscale'
  | 'planyt_greyscale_alt'
  | 'planyt_yellow'
  | 'planyt_purple'
  | 'planyt_orange'
  | 'planyt_red'
  | null;

const ICON_KEYS = new Set<Exclude<AppIconKey, null>>([
  'orBYTE',
  'planyt_green',
  'planyt_blue',
  'planyt_greyscale',
  'planyt_greyscale_alt',
  'planyt_yellow',
  'planyt_purple',
  'planyt_orange',
  'planyt_red',
]);

const normalizeIconKey = (icon: string | null | undefined): AppIconKey => {
  if (!icon || icon === 'Default') return null;
  return ICON_KEYS.has(icon as Exclude<AppIconKey, null>)
    ? (icon as Exclude<AppIconKey, null>)
    : null;
};

const getInitialIcon = (): AppIconKey => {
  if (Platform.OS === 'web') return null;

  try {
    return normalizeIconKey(ExpoDynamicAppIcon.getAppIcon());
  } catch (error) {
    logger.warn('Failed to read current app icon', {
      component: 'AppIconSettingsScreen',
      action: 'loadCurrentIcon',
      error,
    });
    return null;
  }
};

const ICON_SECTIONS: Array<{
  title: string;
  attribution?: { handle: string; did: string };
  items: Array<{
    id: string;
    labelKey: string;
    iconKey: string | null;
    preview: ImageSource;
    requiresBeta?: boolean;
  }>;
}> = [
  {
    title: '',
    items: [
      {
        id: 'default',
        labelKey: 'settings.appIconDefault',
        iconKey: null,
        preview: require('../../src/assets/AppIcons/iOS/orbyt.png'),
      },
      {
        id: 'orBYTE',
        labelKey: 'settings.appIconBetaBadge',
        iconKey: 'orBYTE',
        preview: require('../../src/assets/AppIcons/iOS/orBYTE.png'),
        requiresBeta: true,
      },
    ],
  },
  {
    title: 'planyt',
    attribution: {
      handle: 'consciousbone.bsky.social',
      did: 'did:plc:4pwo2detmolzrckvu4o4dhau',
    },
    items: [
      {
        id: 'planyt_red',
        labelKey: 'settings.appIconRed',
        iconKey: 'planyt_red',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-red.png'),
      },
      {
        id: 'planyt_orange',
        labelKey: 'settings.appIconOrange',
        iconKey: 'planyt_orange',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-orange.png'),
      },
      {
        id: 'planyt_yellow',
        labelKey: 'settings.appIconYellow',
        iconKey: 'planyt_yellow',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-yellow.png'),
      },
      {
        id: 'planyt_green',
        labelKey: 'settings.appIconGreen',
        iconKey: 'planyt_green',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-green.png'),
      },
      {
        id: 'planyt_blue',
        labelKey: 'settings.appIconBlue',
        iconKey: 'planyt_blue',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-blue.png'),
      },
      {
        id: 'planyt_purple',
        labelKey: 'settings.appIconPurple',
        iconKey: 'planyt_purple',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-purple.png'),
      },
      {
        id: 'planyt_greyscale',
        labelKey: 'settings.appIconGreyscale',
        iconKey: 'planyt_greyscale',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-greyscale.png'),
      },
      {
        id: 'planyt_greyscale_alt',
        labelKey: 'settings.appIconGreyscaleAlt',
        iconKey: 'planyt_greyscale_alt',
        preview: require('../../src/assets/AppIcons/iOS/planyt/planyt-greyscale-alt.png'),
      },
    ],
  },
];

const GRID_PADDING = 20;
const GRID_GAP = 12;
const NUM_COLUMNS = 4;

const AppIconSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const [currentIcon, setCurrentIcon] = useState<AppIconKey>(getInitialIcon);
  const { currentUser } = useCurrentUser();
  const { data: orbytColors } = useOrbytColors(currentUser?.did ?? null);
  const isBeta = orbytColors?.isBeta ?? false;
  const { width: screenWidth } = useWindowDimensions();

  // Calculate icon size to fill available width
  const availableWidth = screenWidth - GRID_PADDING * 2;
  const totalGapWidth = GRID_GAP * (NUM_COLUMNS - 1);
  const iconSize = Math.floor((availableWidth - totalGapWidth) / NUM_COLUMNS);

  const handleSelectIcon = useCallback((iconKey: AppIconKey) => {
    if (Platform.OS === 'web') return;

    try {
      if (iconKey === null) {
        if (Platform.OS === 'ios') {
          ExpoDynamicAppIcon.setAppIcon(null);
        } else {
          ExpoDynamicAppIcon.setAppIcon('');
        }
      } else {
        ExpoDynamicAppIcon.setAppIcon(iconKey);
      }

      setCurrentIcon(iconKey);
    } catch (error) {
      logger.error('Failed to set app icon', error, {
        component: 'AppIconSettingsScreen',
        action: 'selectIcon',
        iconKey,
      });
    }
  }, []);

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title={t('settings.appIcon')}
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={Platform.OS === 'android'}
        backgroundColor={Colors.transparent}
      />

      <ScrollView
        style={styles.contentContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {ICON_SECTIONS.map(section => {
          const filteredItems = section.items.filter(option => !option.requiresBeta || isBeta);
          if (filteredItems.length === 0) return null;

          return (
            <View key={section.title || 'default-section'}>
              {section.title ? (
                <View style={settingsLayoutStyles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitleText}>
                      {section.title === 'planyt' ? t('settings.planyt') : section.title}
                    </Text>
                    {section.attribution && (
                      <Pressable
                        style={styles.attributionContainer}
                        onPress={() =>
                          router.navigate({
                            pathname: '/profile/[did]',
                            params: { did: section.attribution!.did },
                          })
                        }
                      >
                        <Text style={styles.attributionText}>{t('settings.by')}</Text>
                        <Text style={styles.attributionHandle}>
                          @{formatHandle(section.attribution.handle)}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : null}
              <View style={styles.iconGrid}>
                {filteredItems.map(option => {
                  const isSelected = option.iconKey === currentIcon;
                  return (
                    <Pressable
                      key={option.id}
                      style={[styles.iconItem, { width: iconSize }]}
                      onPress={() => void handleSelectIcon(option.iconKey as AppIconKey)}
                    >
                      <View style={[styles.iconWrapper, { width: iconSize, height: iconSize }]}>
                        <View style={[styles.iconPreview, { width: iconSize, height: iconSize }]}>
                          <Image
                            source={option.preview}
                            style={styles.iconImage}
                            contentFit="cover"
                            cachePolicy="memory"
                          />
                        </View>
                        {isSelected && (
                          <View style={styles.selectedIndicator}>
                            <View style={styles.checkmarkCircle}>
                              <Icon name="checkmark" size={12} color={Colors.black} />
                            </View>
                          </View>
                        )}
                      </View>
                      <Text style={styles.iconLabel} numberOfLines={1}>
                        {t(option.labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionTitleText: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  attributionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  attributionText: {
    color: Colors.neutral[500],
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
  },
  attributionHandle: {
    color: Colors.teal[400],
    fontSize: 12,
    fontFamily: 'Figtree-SemiBold',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  iconItem: {
    alignItems: 'center',
  },
  iconWrapper: {
    position: 'relative',
  },
  iconPreview: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[900],
  },
  selectedIndicator: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },
  checkmarkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.neutral[50],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.black,
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  iconLabel: {
    color: Colors.neutral[50],
    fontSize: 11,
    fontFamily: 'Figtree-Medium',
    marginTop: 6,
    textAlign: 'center',
  },
  iconSubtitle: {
    color: Colors.neutral[500],
    fontSize: 9,
    fontFamily: 'Figtree-Regular',
    marginTop: 2,
    textAlign: 'center',
  },
});

export default AppIconSettingsScreen;
