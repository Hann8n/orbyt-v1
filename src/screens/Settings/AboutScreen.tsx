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
import Icon from '../../components/ui/Icon';
import AuthorItem from '../../components/ui/AuthorItem';
import { TEXT, UI, BRAND } from '../../utils/formatting/Colors';
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
      label: 'Website',
      value: 'getorbyt.com',
      icon: 'link',
      onPress: () => handleOpenLink('https://getorbyt.com'),
      showChevron: true,
      description: 'Visit our official website'
    },
    {
      id: 'privacy',
      label: 'Privacy Policy',
      icon: 'shield',
      onPress: () => handleOpenLink('https://orbyt.app/privacy'),
      showChevron: true,
      description: 'Learn how we protect your data'
    },
    {
      id: 'terms',
      label: 'Terms of Service',
      icon: 'file-alt',
      onPress: () => handleOpenLink('https://orbyt.app/terms'),
      showChevron: true,
      description: 'Read our terms and conditions'
    }
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About Orbyt</Text>
        <View style={styles.headerSpacer} />
      </View>

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
          <Text style={styles.appName}>Orbyt</Text>
          <Text style={styles.appTagline}>a new video app for bluesky</Text>
          <Text style={styles.buildInfo}>Build {buildNumber}</Text>
        </View>

        {/* Orbyt Profile Card */}
        <View style={styles.profileCard}>
          <Text style={styles.sectionTitle}>Official Account</Text>
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
          <Text style={styles.sectionTitle}>Links & Legal</Text>
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
                    <Icon name={item.icon} size={20} color="#fff" />
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
                    <Icon name="chevron-right" size={20} color="#666" />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerContent}>
            <Text style={styles.footerText}>
              © {new Date().getFullYear()} Orbyt. All rights reserved.
            </Text>
            <Text style={styles.footerSubtext}>
              Built with ❤️ for the Bluesky community
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
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
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#333',
    shadowColor: '#000',
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
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#000',
  },
  versionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  appName: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    fontFamily: 'Firma-Bold',
    marginBottom: 8,
  },
  appTagline: {
    color: '#666',
    fontSize: 18,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    marginBottom: 8,
  },
  buildInfo: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
  profileCard: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 16,
  },
  orbytAuthorItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    padding: 16,
  },
  linksSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  linksContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
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
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
    marginBottom: 2,
  },
  linkItemDescription: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  linkItemValue: {
    color: '#666',
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
    color: '#666',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    marginBottom: 8,
  },
  footerSubtext: {
    color: '#444',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
});

export default AboutScreen; 