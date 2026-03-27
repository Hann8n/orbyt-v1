import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import ExpoDynamicAppIcon from '@variant-systems/expo-dynamic-app-icon';
import type { ImageSource } from 'expo-image';

import { Colors } from '@/theme';
import Icon from '@/components/ui/Icon';
import ListHeader from '@/components/ui/ListHeader';
import { settingsLayoutStyles } from './SettingsStyles';
import { useCurrentUser } from '@/stores/userStore';
import { useOrbytColors } from '@/services/colors';
import { formatHandle } from '@/utils/formatting/handles';
import { logger } from '@/utils/logger';

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

type IconOption = {
  id: string;
  label: string;
  subtitle?: string;
  iconKey: AppIconKey;
  preview: ImageSource;
  requiresBeta?: boolean;
};

type IconSection = {
  title: string;
  attribution?: {
    handle: string;
    did: string;
  };
  items: IconOption[];
};

const ICON_SECTIONS: IconSection[] = [
  {
    title: '',
    items: [
      {
        id: 'default',
        label: 'Default',
        iconKey: null,
        preview: require('@/assets/AppIcons/iOS/orbyt.png'),
      },
      {
        id: 'orBYTE',
        label: 'Beta Badge',
        iconKey: 'orBYTE',
        preview: require('@/assets/AppIcons/iOS/orBYTE.png'),
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
        label: 'Red',
        iconKey: 'planyt_red',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-red.png'),
      },
      {
        id: 'planyt_orange',
        label: 'Orange',
        iconKey: 'planyt_orange',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-orange.png'),
      },
      {
        id: 'planyt_yellow',
        label: 'Yellow',
        iconKey: 'planyt_yellow',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-yellow.png'),
      },
      {
        id: 'planyt_green',
        label: 'Green',
        iconKey: 'planyt_green',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-green.png'),
      },
      {
        id: 'planyt_blue',
        label: 'Blue',
        iconKey: 'planyt_blue',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-blue.png'),
      },
      {
        id: 'planyt_purple',
        label: 'Purple',
        iconKey: 'planyt_purple',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-purple.png'),
      },
      {
        id: 'planyt_greyscale',
        label: 'Greyscale',
        iconKey: 'planyt_greyscale',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-greyscale.png'),
      },
      {
        id: 'planyt_greyscale_alt',
        label: 'Greyscale Alt',
        iconKey: 'planyt_greyscale_alt',
        preview: require('@/assets/AppIcons/iOS/planyt/planyt-greyscale-alt.png'),
      },
    ],
  },
];

const GRID_PADDING = 20;
const GRID_GAP = 12;
const NUM_COLUMNS = 4;

const AppIconSettingsScreen: React.FC = () => {
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
        title="App icon"
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
                    <Text style={styles.sectionTitleText}>{section.title}</Text>
                    {section.attribution && (
                      <TouchableOpacity
                        style={styles.attributionContainer}
                        onPress={() =>
                          router.navigate({
                            pathname: '/profile/[did]',
                            params: { did: section.attribution!.did },
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <Text style={styles.attributionText}>by </Text>
                        <Text style={styles.attributionHandle}>
                          @{formatHandle(section.attribution.handle)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ) : null}
              <View style={styles.iconGrid}>
                {filteredItems.map(option => {
                  const isSelected = option.iconKey === currentIcon;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.iconItem, { width: iconSize }]}
                      onPress={() => void handleSelectIcon(option.iconKey)}
                      activeOpacity={0.7}
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
                              <Icon name="check" size={12} color={Colors.black} />
                            </View>
                          </View>
                        )}
                      </View>
                      <Text style={styles.iconLabel} numberOfLines={1}>
                        {option.label}
                      </Text>
                      {option.subtitle && (
                        <Text style={styles.iconSubtitle} numberOfLines={2}>
                          {option.subtitle}
                        </Text>
                      )}
                    </TouchableOpacity>
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
