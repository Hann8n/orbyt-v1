import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon } from '../../components/ui/Icon';
import ListHeader from '../../components/ui/ListHeader';
import AuthorItem from '../../components/ui/AuthorItem';
import { Colors } from '../../components/ui/UI';
import Constants from 'expo-constants';
import { useProfile } from '../../services/cache/ProfileCache';

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
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1';

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
      onPress: () => handleOpenLink('https://orbyt.app/privacy'),
      showChevron: true,
      description: 'learn how we protect your data'
    },
    {
      id: 'terms',
      label: 'terms of service',
      icon: 'paper-fill',
      onPress: () => handleOpenLink('https://orbyt.app/terms'),
      showChevron: true,
      description: 'read our terms and conditions'
    }
  ];

  return (
    <View style={styles.container}> 
      <ListHeader
        mode="stacked"
        title="about orbyt"
        showBackButton
        onBackPress={() => navigation.goBack()}
        applySafeAreaTop
      />

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.appIconContainer}>
            <View style={styles.appIcon}>
              <Image source={require('../../assets/logo.png')} style={styles.logoImage} />
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionText}>v{appVersion}</Text>
            </View>
          </View>
          <Text style={styles.appName}>orbyt</Text>
          <Text style={styles.appTagline}>a new video app for bluesky</Text>
                      <Text style={styles.buildInfo}>build {buildNumber}</Text>
        </View>

        {/* Orbyt Profile Card */}
        <View style={styles.profileCard}>
          <Text style={styles.sectionTitle}>official account</Text>
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
          <Text style={styles.sectionTitle}>links & legal</Text>
          <View style={styles.linksContainer}>
            {aboutItems.map((item, itemIndex) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.linkItem,
                  itemIndex === aboutItems.length - 1 && styles.lastItem
                ]}
                onPress={item.onPress}
                activeOpacity={0.7}
                disabled={!item.onPress}
              >
                <View style={styles.linkItemLeft}>
                  <View style={styles.linkIconContainer}>
                    <Icon name={item.icon} size={24} color={Colors.white} />
                  </View>
                  <View style={styles.linkTextContainer}>
                    <Text style={styles.linkItemText}>{item.label}</Text>
                    {item.description && (
                      <Text style={styles.linkItemDescription}>{item.description}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.linkItemRight}>
                  
                  {item.showChevron && (
                    <Icon name="chevron-right" size={20} color={Colors.gray} />
                  )}
                </View>
              </TouchableOpacity>
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
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray,
    backgroundColor: Colors.black,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Firma-Bold',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  appIconContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  appIcon: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: Colors.darkGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.mediumGray,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoImage: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
  },
  versionBadge: {
    position: 'absolute',
    top: -8,
    right: -25,
    backgroundColor: Colors.mediumGray,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
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
    fontFamily: 'Firma-Bold',
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
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 16,
  },
  orbytAuthorItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: Colors.mediumGray,
    borderRadius: 16,
    padding: 16,
  },
  linksSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  linksContainer: {
    backgroundColor: Colors.darkGray,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
    overflow: 'hidden',
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.mediumGray,
  },
  lastItem: {
    borderBottomWidth: 0,
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
  linkIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkItemText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
    marginBottom: 2,
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
    marginHorizontal: 20,
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