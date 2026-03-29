import React, { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { tabRefs } from '@/utils/navigation/tabRefs';
import { View, StyleSheet, StatusBar } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { Colors } from '@/theme';
import ChatsTab from '@/components/features/activity/ChatsTab';
import NotificationsTab from '@/components/features/activity/NotificationsTab';
import { useUnreadCount } from '@/hooks/useUnreadCount';

// Tab label keys (resolved via t() in component)
const TAB_LABEL_KEYS: { [key: string]: string } = {
  chats: 'tabs.chats',
  notifications: 'tabs.notifications',
};

// Indicator item component that uses shared value directly
const ActivityIndicatorItem = React.memo(function ActivityIndicatorItem({
  tabIndex,
  pageScrollProgress,
  label,
  onPress,
  badge,
}: {
  tabIndex: number;
  pageScrollProgress: SharedValue<number>;
  label: string;
  onPress: () => void;
  badge?: React.ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const baseProgress = pageScrollProgress.value;
    const roundedProgress = Math.round(baseProgress);
    const isActive = roundedProgress === tabIndex;
    const distance = Math.abs(baseProgress - tabIndex);
    const opacity = isActive ? 1 : Math.max(0.3, 1 - distance * 0.4);
    const color = isActive ? Colors.neutral[50] : Colors.neutral[500];

    return {
      color,
      fontSize: 22,
      marginRight: 8,
      fontWeight: 'bold' as const,
      fontFamily: 'Figtree-Black',
      opacity,
    };
  }, [tabIndex]);

  return (
    <NativePressable onPress={onPress} style={styles.indicatorItem}>
      <View style={styles.badgeContainer}>
        <Animated.Text style={animatedStyle}>{label}</Animated.Text>
        {badge}
      </View>
    </NativePressable>
  );
});

const ActivityScreen: React.FC = () => {
  const { t } = useTranslation();
  const pageScrollProgress = useSharedValue(0);
  const pagerViewRef = useRef<PagerView>(null);
  const { notificationsCount, messagesCount } = useUnreadCount();

  const pages = useMemo<Array<'chats' | 'notifications'>>(() => ['notifications', 'chats'], []);
  const notificationsTabRef = useRef<typeof tabRefs.activity>(null);
  const chatsTabRef = useRef<typeof tabRefs.activity>(null);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

      {/* Header with animated tab indicators */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.headerSection}>
          <View style={styles.tabSection}>
            <View style={styles.indicatorContainer}>
              {pages.map(tabId => {
                const tabIndex = pages.indexOf(tabId);
                const badge =
                  tabId === 'notifications' && Number(notificationsCount) > 0 ? (
                    <View style={styles.badge} />
                  ) : tabId === 'chats' && Number(messagesCount) > 0 ? (
                    <View style={styles.badge} />
                  ) : undefined;

                return (
                  <ActivityIndicatorItem
                    key={tabId}
                    tabIndex={tabIndex}
                    pageScrollProgress={pageScrollProgress}
                    label={TAB_LABEL_KEYS[tabId] ? t(TAB_LABEL_KEYS[tabId]) : tabId}
                    onPress={() => {
                      const targetIndex = pages.indexOf(tabId);
                      if (targetIndex >= 0 && pagerViewRef.current) {
                        pagerViewRef.current.setPage(targetIndex);
                      }
                    }}
                    badge={badge}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Tab Content - setPage on tap (animated); indicator only from onPageSelected */}
      <View style={styles.activityContainer}>
        <PagerView
          ref={pagerViewRef}
          style={styles.pagerView}
          initialPage={0}
          onPageSelected={e => {
            const index = e.nativeEvent.position;
            pageScrollProgress.value = index;
            if (index === 0 && notificationsTabRef.current) {
              tabRefs.activity = notificationsTabRef.current;
            } else if (index === 1 && chatsTabRef.current) {
              tabRefs.activity = chatsTabRef.current;
            }
          }}
          scrollEnabled={true}
          pageMargin={0}
        >
          <View key="notifications" style={styles.pagerPage} collapsable={false}>
            <NotificationsTab
              ref={r => {
                notificationsTabRef.current = r;
              }}
            />
          </View>
          <View key="chats" style={styles.pagerPage} collapsable={false}>
            <ChatsTab
              ref={r => {
                chatsTabRef.current = r;
              }}
            />
          </View>
        </PagerView>
      </View>
    </View>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    overflow: 'hidden',
  },
  headerSection: {
    backgroundColor: Colors.black,
    paddingHorizontal: 10,
    paddingBottom: 0,
    paddingTop: 0,
    zIndex: 1,
  },
  headerSafeArea: {
    backgroundColor: Colors.black,
  },
  tabSection: {
    marginTop: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingBottom: 4,
    minHeight: 48,
    flex: 1,
  },
  indicatorItem: {
    paddingHorizontal: 4,
  },
  badgeContainer: {
    position: 'relative',
    paddingRight: 2,
    paddingTop: 2,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.teal[600],
    borderWidth: 2,
    borderColor: Colors.black,
  },
  activityContainer: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  pagerView: {
    flex: 1,
  },
  pagerPage: {
    width: '100%',
    height: '100%',
  },
});
