import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../src/components/ui/UI';
import { TabNavigation, TabOption } from '../../src/components/layout/header';
import { getBottomNavBarHeight } from '../../src/utils/helpers';
import NotificationsTab from '../../src/components/features/activity/NotificationsTab';
import MessagesTab from '../../src/components/features/activity/MessagesTab';

// Activity Swipeable Pager Component
const ActivitySwipePager = ({
  activeTab,
  onActiveTabChange,
  renderTabContent,
}: {
  activeTab: 'notifications' | 'messages';
  onActiveTabChange: (tab: 'notifications' | 'messages') => void;
  renderTabContent: (tabId: 'notifications' | 'messages') => React.ReactNode;
}) => {
  const flatListRef = useRef<FlatList>(null);
  const [dims, setDims] = useState(Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);

  const screenWidth = dims.width;
  const pages: Array<'notifications' | 'messages'> = ['notifications', 'messages'];
  const activeIndex = pages.indexOf(activeTab);

  useEffect(() => {
    if (flatListRef.current && activeIndex >= 0) {
      flatListRef.current.scrollToIndex({ index: activeIndex, animated: true });
    }
  }, [activeIndex]);

  const getItemLayout = useCallback((_, index: number) => ({ length: screenWidth, offset: screenWidth * index, index }), [screenWidth]);

  return (
    <View style={styles.activityContainer}>
      <FlatList
        ref={flatListRef}
        data={pages}
        keyExtractor={(t) => `activity-page-${t}`}
        renderItem={({ item }) => (
          <View style={{ width: screenWidth, flex: 1 }}>
            {renderTabContent(item)}
          </View>
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          const nextTab = pages[index];
          if (nextTab && nextTab !== activeTab) onActiveTabChange(nextTab);
        }}
        initialScrollIndex={activeIndex < 0 ? 0 : activeIndex}
      />
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
});
