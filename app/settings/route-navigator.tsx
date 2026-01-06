import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useRouter, useSegments, usePathname } from 'expo-router';
import ListHeader from '../../src/components/ui/ListHeader';
import { Colors } from '../../src/components/ui/UI';
import Icon from '../../src/components/ui/Icon';

// Route types: 'fullscreen' routes need to close modals first, 'modal' routes can stay in modal stack
type RouteType = 'fullscreen' | 'modal' | 'settings';

// List of available routes in the app
const AVAILABLE_ROUTES = [
  // Tabs - fullscreen
  { path: '/(tabs)/', label: 'Home Tab', type: 'fullscreen' as RouteType },
  { path: '/(tabs)/explore', label: 'Explore Tab', type: 'fullscreen' as RouteType },
  { path: '/(tabs)/create', label: 'Create Tab', type: 'fullscreen' as RouteType },
  { path: '/(tabs)/activity', label: 'Activity Tab', type: 'fullscreen' as RouteType },
  { path: '/(tabs)/profile', label: 'Profile Tab', type: 'fullscreen' as RouteType },

  // Modals - modal presentation
  { path: '/(modals)/feed', label: 'Feed Modal', type: 'modal' as RouteType },

  // Auth - fullscreen
  { path: '/login', label: 'Login', type: 'fullscreen' as RouteType },
  { path: '/advanced-login', label: 'Advanced Login', type: 'fullscreen' as RouteType },
  { path: '/oauth/callback', label: 'OAuth Callback', type: 'fullscreen' as RouteType },

  // Profile - fullscreen (except edit-profile which is modal)
  {
    path: '/profile/[did]',
    label: 'Profile (with DID param)',
    requiresParam: true,
    paramKey: 'did',
    paramPlaceholder: 'did:plc:...',
    type: 'fullscreen' as RouteType,
  },
  { path: '/edit-profile', label: 'Edit Profile', type: 'modal' as RouteType },

  // Channel - fullscreen
  { path: '/channel/channel', label: 'Channel', type: 'fullscreen' as RouteType },
  {
    path: '/channel/[id]',
    label: 'Channel (with ID)',
    requiresParam: true,
    paramKey: 'id',
    paramPlaceholder: 'channel-uri',
    type: 'fullscreen' as RouteType,
  },

  // Post - fullscreen
  {
    path: '/post/[id]',
    label: 'Post (with ID)',
    requiresParam: true,
    paramKey: 'id',
    paramPlaceholder: 'post-uri',
    type: 'fullscreen' as RouteType,
  },
  { path: '/post/VideoPostScreen', label: 'Video Post Screen', type: 'fullscreen' as RouteType },

  // Chat - fullscreen
  {
    path: '/chat/[id]',
    label: 'Chat (with ID)',
    requiresParam: true,
    paramKey: 'id',
    paramPlaceholder: 'conversation-id',
    type: 'fullscreen' as RouteType,
  },

  // Settings - modal (stays in settings stack)
  { path: '/settings', label: 'Settings', type: 'settings' as RouteType },
  { path: '/settings/algorithmic-feed', label: 'Algorithmic Feed', type: 'settings' as RouteType },
  { path: '/settings/app-icon', label: 'App Icon', type: 'settings' as RouteType },
  { path: '/settings/blocked', label: 'Blocked Users', type: 'settings' as RouteType },
  { path: '/settings/channels', label: 'Channels', type: 'settings' as RouteType },
  { path: '/settings/content-filters', label: 'Content Filters', type: 'settings' as RouteType },
  { path: '/settings/followers', label: 'Followers', type: 'settings' as RouteType },
  { path: '/settings/following', label: 'Following', type: 'settings' as RouteType },
  { path: '/settings/hidden-posts', label: 'Hidden Posts', type: 'settings' as RouteType },
  { path: '/settings/muted', label: 'Muted Users', type: 'settings' as RouteType },
  { path: '/settings/saves', label: 'Saves', type: 'settings' as RouteType },

  // Video - fullscreen
  { path: '/video-editor', label: 'Video Editor', type: 'fullscreen' as RouteType },
  { path: '/video-trimmer', label: 'Video Trimmer', type: 'fullscreen' as RouteType },
];

export default function RouteNavigatorScreen() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [paramInputs, setParamInputs] = useState<Record<string, string>>({});

  const filteredRoutes = AVAILABLE_ROUTES.filter(
    route =>
      route.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNavigate = (route: (typeof AVAILABLE_ROUTES)[0]) => {
    if (route.requiresParam && route.paramKey) {
      const paramValue = paramInputs[route.path]?.trim();
      if (!paramValue) {
        return;
      }

      // For fullscreen routes, use replace to close modal and open as fullscreen
      if (route.type === 'fullscreen') {
        // Replace entire stack to ensure route opens as fullscreen
        router.replace({
          pathname: route.path,
          params: { [route.paramKey]: paramValue },
        });
      } else {
        // For modal and settings routes, navigate directly
        router.push({
          pathname: route.path,
          params: { [route.paramKey]: paramValue },
        });
      }
    } else {
      // For fullscreen routes, use replace to close modal and open as fullscreen
      if (route.type === 'fullscreen') {
        // Replace entire stack to ensure route opens as fullscreen
        router.replace(route.path as any);
      } else {
        // For modal and settings routes, navigate directly
        router.push(route.path as any);
      }
    }
  };

  const updateParamInput = (routePath: string, value: string) => {
    setParamInputs(prev => ({ ...prev, [routePath]: value }));
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.black }]}>
      <ListHeader
        mode="sheet"
        title="Route Navigator"
        showCloseButton
        onClosePress={() => router.back()}
        applySafeAreaTop={true}
        backgroundColor={Colors.black}
        titleIndent={true}
      />

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Current Path: {pathname}</Text>
        <Text style={styles.infoText}>Segments: {segments.join(' > ')}</Text>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={Colors.gray} />
        <TextInput
          nativeID="route-navigator-search-input"
          style={styles.searchInput}
          placeholder="Search routes..."
          placeholderTextColor={Colors.gray}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          caretHidden={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="x" size={20} color={Colors.gray} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredRoutes.map(route => (
          <View key={route.path} style={styles.routeItem}>
            <TouchableOpacity
              style={styles.routeButton}
              onPress={() => handleNavigate(route)}
              activeOpacity={0.7}
            >
              <View style={styles.routeContent}>
                <View style={styles.routeHeader}>
                  <Text style={styles.routeLabel}>{route.label}</Text>
                  {route.type && (
                    <View
                      style={[
                        styles.typeBadge,
                        route.type === 'fullscreen'
                          ? styles.fullscreenBadge
                          : route.type === 'modal'
                            ? styles.modalBadge
                            : styles.settingsBadge,
                      ]}
                    >
                      <Text style={styles.typeBadgeText}>{route.type}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.routePath}>{route.path}</Text>
                {route.requiresParam && (
                  <View style={styles.paramContainer}>
                    <TextInput
                      nativeID={`route-param-input-${route.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
                      style={styles.paramInput}
                      placeholder={route.paramPlaceholder || `Enter ${route.paramKey}`}
                      placeholderTextColor={Colors.gray}
                      value={paramInputs[route.path] || ''}
                      onChangeText={value => updateParamInput(route.path, value)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      textContentType="none"
                      importantForAutofill="no"
                      caretHidden={false}
                    />
                  </View>
                )}
              </View>
              <Icon name="chevron-right" size={20} color={Colors.gray} />
            </TouchableOpacity>
          </View>
        ))}

        {filteredRoutes.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No routes found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  infoContainer: {
    padding: 16,
    backgroundColor: Colors.darkGray,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 15,
  },
  infoText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 15,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  routeItem: {
    marginBottom: 8,
  },
  routeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    padding: 16,
    borderRadius: 15,
    justifyContent: 'space-between',
  },
  routeContent: {
    flex: 1,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  routeLabel: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  fullscreenBadge: {
    backgroundColor: Colors.blue,
  },
  modalBadge: {
    backgroundColor: Colors.purple,
  },
  settingsBadge: {
    backgroundColor: Colors.gray,
  },
  typeBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: 'Firma-Medium',
    textTransform: 'uppercase',
  },
  routePath: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 8,
  },
  paramContainer: {
    marginTop: 8,
  },
  paramInput: {
    backgroundColor: Colors.black,
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.gray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
  },
});
