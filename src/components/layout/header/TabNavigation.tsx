import React, { memo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Icon from '../../ui/Icon';

export interface TabOption {
  id: string;
  label: string;
  disabled?: boolean;
}

interface TabNavigationProps {
  tabs: TabOption[];
  activeTab: string;
  onTabPress: (tabId: string) => void;
  textColor?: string;
  backgroundColor?: string;
  style?: any;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  showViewToggle?: boolean;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  activeTab,
  onTabPress,
  textColor = '#fff',
  backgroundColor = 'transparent',
  style,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
}) => {
  const handleViewToggle = () => {
    if (onViewModeChange) {
      onViewModeChange(viewMode === 'list' ? 'grid' : 'list');
    }
  };

  return (
    <View style={[styles.tabContainer, { backgroundColor }, style]}>
      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => onTabPress(tab.id)}
            activeOpacity={0.7}
            disabled={tab.disabled}
            style={[
              styles.tabOption,
              tab.disabled && styles.disabledTab,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: textColor },
                activeTab === tab.id && styles.activeTabText,
                tab.disabled && styles.disabledTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {showViewToggle && onViewModeChange && (
        <TouchableOpacity
          style={styles.viewToggleButton}
          onPress={handleViewToggle}
          activeOpacity={0.7}
        >
          <Icon 
            name={viewMode === 'list' ? 'grid' : 'menu'} 
            size={20} 
            color={textColor} 
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 0,
    paddingRight: 0,
    marginTop: 4,
    marginLeft: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // reduced from 20 to 8
  },
  tabOption: {
    paddingVertical: 4,
    paddingHorizontal: 0,
    paddingLeft: 0,
    paddingRight: 8,
  },
  tabText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    opacity: 0.7,
  },
  activeTabText: {
    opacity: 1,
  },
  disabledTab: {
    opacity: 0.3,
  },
  disabledTabText: {
    opacity: 0.3,
  },
  viewToggleButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});

export default memo(TabNavigation); 