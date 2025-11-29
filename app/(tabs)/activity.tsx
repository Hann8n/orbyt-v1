import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../src/components/ui/UI';
import { TabNavigation, TabOption } from '../../src/components/layout/header';
import { getBottomNavBarHeight } from '../../src/utils/helpers';
import NotificationsTab from '../../src/components/features/activity/NotificationsTab';
import MessagesTab from '../../src/components/features/activity/MessagesTab';

// Activity Swipeable Pager Component using react-native-pager-view
const ActivitySwipePager = ({
  activeTab,
  onActiveTabChange,
  renderTabContent,
}: {
  activeTab: 'notifications' | 'messages';
  onActiveTabChange: (tab: 'notifications' | 'messages') => void;
  renderTabContent: (tabId: 'notifications' | 'messages') => React.ReactNode;
}) => {
  const pagerViewRef = useRef<PagerView>(null);
  const pages: Array<'notifications' | 'messages'> = ['notifications', 'messages'];
  const activeIndex = pages.indexOf(activeTab);

  // Sync PagerView page when activeTab changes (e.g., from TabNavigation tap)
  useEffect(() => {
    if (pagerViewRef.current && activeIndex >= 0) {
      requestAnimationFrame(() => {
        pagerViewRef.current?.setPage(activeIndex);
      });
    }
  }, [activeIndex]);

  // Handle page selection from PagerView swipe
  const handlePageSelected = useCallback((event: any) => {
    const selectedIndex = event.nativeEvent.position;
    const nextTab = pages[selectedIndex];
    if (nextTab && nextTab !== activeTab) {
      onActiveTabChange(nextTab);
    }
  }, [activeTab, pages, onActiveTabChange]);

  const initialPageIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <View style={styles.activityContainer}>
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
        scrollEnabled={true}
        pageMargin={0}
      >
        {pages.map((page) => (
          <View key={page} style={styles.pagerPage}>
            {renderTabContent(page)}
          </View>
        ))}
      </PagerView>
    </View>
  );
};

const ActivityScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'notifications' | 'messages'>('notifications');
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Define tab options for activity
  const tabOptions: TabOption[] = useMemo(() => [
    { id: 'notifications', label: 'Notifications' },
    { id: 'messages', label: 'Messages' },
  ], []);

  // Tab content renderer
  const renderTabContent = useCallback((tabId: 'notifications' | 'messages') => {
    if (tabId === 'notifications') {
      return <NotificationsTab />;
    } else if (tabId === 'messages') {
      return <MessagesTab />;
    }
    return null;
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

      {/* Header with integrated tabs */}
      <View style={[styles.headerSection, { paddingTop: insets.top }]}>
        <View style={styles.tabSection}>
          <TabNavigation
            tabs={tabOptions}
            activeTab={activeTab}
            onTabPress={(tabId) => {
              const newTab = tabId as 'notifications' | 'messages';
              setActiveTab(newTab);
            }}
            textColor={Colors.white}
            backgroundColor="transparent"
            style={[styles.tabNavigation, styles.customTabContainer]}
          />
        </View>
      </View>

      {/* Tab Content */}
      <ActivitySwipePager
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        renderTabContent={renderTabContent}
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
  headerSection: {
    backgroundColor: Colors.black,
    paddingHorizontal: 20,
    paddingBottom: 0,
    paddingTop: 0,
  },
  tabSection: {
    marginTop: 0,
  },
  tabNavigation: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  customTabContainer: {
    paddingVertical: 0,
    marginTop: 0,
    minHeight: 36,
    paddingTop: 0,
    paddingBottom: 0,
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
