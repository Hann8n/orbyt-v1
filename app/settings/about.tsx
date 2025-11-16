import React from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon } from '../../src/components/ui/Icon';
import ListHeader from '../../src/components/ui/ListHeader';
import AuthorItem from '../../src/components/ui/AuthorItem';
import { Colors } from '../../src/components/ui/UI';
import { AnimatedTV } from '../../src/components/ui';
import Constants from 'expo-constants';
import { useProfile } from '../../src/services/cache/ProfileCache';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { hexToRGBA } from '../../src/utils/formatting/colorUtils';

interface AboutItem {
  id: string;
  label: string;
  value?: string;
  icon: string;
  onPress?: () => void;
  showChevron?: boolean;
  description?: string;
}

const AboutScreen: React.FC = () => {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // Fetch Orbyt profile data
  const { data: orbytProfile } = useProfile('getorbyt.com');

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Error opening link:', err));
  };

  const aboutItems: AboutItem[] = [
    {
      id: 'website',
      label: 'website',
      value: 'getorbyt.com',
      icon: 'link-fill',
      onPress: () => handleOpenLink('https://getorbyt.com'),
      showChevron: true,
      description: 'visit our official website'
    },
    {
      id: 'privacy',
      label: 'privacy policy',
      icon: 'safe-shield-2-fill',
      onPress: () => handleOpenLink('https://getorbyt.com/privacy'),
      showChevron: true,
      description: 'learn how we protect your data'
    },
    {
      id: 'terms',
      label: 'terms of service',
      icon: 'paper-fill',
      onPress: () => handleOpenLink('https://getorbyt.com/terms'),
      showChevron: true,
      description: 'read our terms and conditions'
    }
  ];

  return (
    <View style={settingsLayoutStyles.container}> 
      <ListHeader
        mode="sheet"
        title="about orbyt"
        showCloseButton
        onClosePress={() => navigation.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.appIconContainer}>
            <AnimatedTV size={100} />
          </View>
          <Text style={styles.appName}>orbyt</Text>
          <Text style={styles.appTagline}>a new video app for bluesky</Text>
          <Text style={styles.buildInfo}>v{appVersion}</Text>
        </View>

        {/* Orbyt Profile Card */}
        <View style={styles.profileCard}>
          <Text style={settingsTextStyles.sectionTitle}>official account</Text>
          <AuthorItem
            handle="getorbyt.com"
            displayName={orbytProfile?.displayName || "Orbyt"}
            avatar={orbytProfile?.avatar}
            size="large"
            showArrow={true}
            style={styles.orbytAuthorItem}
          />
        </View>

        {/* Links Section */}
        <View style={styles.linksSection}>
          <Text style={settingsTextStyles.sectionTitle}>links & legal</Text>
          <View style={styles.linksContainer}>
            {aboutItems.map((item, itemIndex) => (
              <View key={item.id} style={{ marginBottom: 0 }}>
                <TouchableOpacity
                  style={settingsButtonStyles.menuOption}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                  disabled={!item.onPress}
                >
                  <View style={styles.linkItemLeft}>
                    <View style={styles.linkTextContainer}>
                      <Text style={settingsTextStyles.menuOptionText}>{item.label}</Text>
                      {item.description && (
                        <Text style={styles.linkItemDescription}>{item.description}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.linkItemRight}>
                    {item.showChevron && (
                      <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerContent}>
            <View style={styles.footerHeartContainer}>
              <Text style={styles.footerSubtext}>
                built with{' '}
              </Text>
              <Icon name="heart" size={16} color={Colors.lightRed} />
              <Text style={styles.footerSubtext}>
                {' '}for the bluesky community
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  appIconContainer: {
    marginBottom: 20,
  },
  versionBadge: {
    position: 'absolute',
    top: -8,
    right: -25,
    backgroundColor: Colors.mediumGray,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 2,
    borderColor: Colors.black,
  },
  versionText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  appName: {
    color: Colors.white,
    fontSize: 32,
    fontWeight: '700',
    fontFamily: 'Firma-Black',
    marginBottom: 8,
  },
  appTagline: {
    color: Colors.gray,
    fontSize: 18,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    marginBottom: 8,
  },
  buildInfo: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
  profileCard: {
    marginBottom: 24,
  },

  orbytAuthorItem: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 4,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  linksSection: {
    marginBottom: 24,
  },
  linksContainer: {
    // Removed container styling since individual items now have their own styling
  },

  linkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  linkItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  linkTextContainer: {
    flex: 1,
  },

  linkItemDescription: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  linkItemValue: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginRight: 8,
  },
  footer: {
    marginTop: 16,
  },
  footerContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    marginBottom: 8,
  },
  footerSubtext: {
    color: Colors.mediumGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
  footerHeartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AboutScreen; 