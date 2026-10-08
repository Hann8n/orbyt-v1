import React, { useRef, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tabRefs } from '@/utils/navigation/tabRefs';
import { View, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TabView,
  TabBar,
  type SceneRendererProps,
  type NavigationState,
  type Route,
  type TabDescriptor,
} from 'react-native-tab-view';

import { Colors } from '@/theme';
import NotificationsTab from '@/components/features/activity/NotificationsTab';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { FontFamily, TextStyles, fontSizeFor } from '@/utils/components/typography';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { getEffectiveTopInset } from '@/utils/device/screen';

const ActivityScreen: React.FC = () => {
  const { t } = useTranslation();
  const { screenWidth } = useDeviceLayout();
  const [index, setIndex] = useState(0);
  const { top } = useSafeAreaInsets();
  const topInset = getEffectiveTopInset(top);
  const { notificationsCount } = useUnreadCount();

  const notificationsTabRef = useRef<typeof tabRefs.activity>(null);

  const routes = useMemo<Route[]>(
    () => [{ key: 'notifications', title: t('tabs.notifications') }],
    [t]
  );

  // Clamp index if the requests tab disappears while the user is on it
  const safeIndex = Math.min(index, routes.length - 1);

  const tabOptions = useMemo(
    () => ({
      notifications: {
        badge: notificationsCount > 0 ? () => <View style={styles.badgeDot} /> : undefined,
      },
    }),
    [notificationsCount]
  );

  const activityCommonOptions = useMemo<TabDescriptor<Route>>(
    () => ({
      sceneStyle: styles.scene,
      label: ({ color, labelText }) => (
        <Text
          style={{
            color,
            fontSize: TextStyles.sectionHeader.fontSize,
            fontFamily: FontFamily.black,
            includeFontPadding: false,
          }}
        >
          {labelText}
        </Text>
      ),
    }),
    []
  );

  const handleIndexChange = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    if (nextIndex === 0 && notificationsTabRef.current) {
      tabRefs.activity = notificationsTabRef.current;
    }
  }, []);

  const renderScene = useCallback(({ route }: SceneRendererProps & { route: Route }) => {
    if (route.key === 'notifications') {
      return (
        <NotificationsTab
          ref={r => {
            notificationsTabRef.current = r;
          }}
        />
      );
    }
    return null;
  }, []);

  const renderTabBar = useCallback(
    (
      props: SceneRendererProps & {
        navigationState: NavigationState<Route>;
        options: Record<string, TabDescriptor<Route>> | undefined;
      }
    ) => (
      <TabBar
        {...props}
        style={styles.tabBar}
        tabStyle={styles.tabItem}
        contentContainerStyle={[styles.tabBarContent, { paddingTop: topInset + fontSizeFor(4) }]}
        activeColor={Colors.neutral[50]}
        inactiveColor={Colors.neutral[500]}
        renderIndicator={() => null}
        scrollEnabled
        gap={fontSizeFor(10)}
        pressOpacity={0.7}
      />
    ),
    [topInset]
  );

  return (
    <View style={styles.container}>
      <TabView
        navigationState={{ index: safeIndex, routes }}
        renderScene={renderScene}
        onIndexChange={handleIndexChange}
        renderTabBar={renderTabBar}
        initialLayout={{ width: screenWidth }}
        lazy
        lazyPreloadDistance={1}
        commonOptions={activityCommonOptions}
        options={tabOptions}
        overScrollMode="never"
        style={styles.container}
      />
    </View>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  scene: {
    backgroundColor: Colors.black,
  },
  tabBar: {
    backgroundColor: Colors.black,
    elevation: 0,
    boxShadow: 'none',
  },
  tabBarContent: {
    paddingHorizontal: fontSizeFor(10),
    paddingBottom: fontSizeFor(4),
  },
  tabItem: {
    width: 'auto',
    paddingHorizontal: fontSizeFor(4),
    paddingVertical: 0,
    minHeight: 0,
  },
  badgeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.teal[600],
    borderWidth: 2,
    borderColor: Colors.black,
  },
});
