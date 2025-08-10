import React, { memo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { ListViewIcon, GridViewIcon } from '../../ui/Icon';

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
  accentColor?: string; // Add accent color for vibrant tab styling
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
  accentColor, // Add accent color prop
  style,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
}) => {
  const handleViewModeChange = (mode: 'list' | 'grid') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  };

  // Use accent color for active tabs, fallback to text color
  const activeTabColor = accentColor || textColor;

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
              activeTab === tab.id && styles.activeTabOption,
              tab.disabled && styles.disabledTab,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.id ? activeTabColor : hexToRGBA(textColor, 0.7) },
                activeTab === tab.id && styles.activeTabText,
                tab.disabled && styles.disabledTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Always render the view toggle area to maintain consistent spacing */}
      <View style={styles.viewToggleArea}>
        {showViewToggle && onViewModeChange && (
          <View style={styles.viewToggleContainer}>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                viewMode === 'grid' && styles.activeViewToggleButton
              ]}
              onPress={() => handleViewModeChange('grid')}
              activeOpacity={0.7}
            >
              <GridViewIcon 
                color={viewMode === 'grid' ? activeTabColor : hexToRGBA(textColor, 0.6)} 
                size={20}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                viewMode === 'list' && styles.activeViewToggleButton
              ]}
              onPress={() => handleViewModeChange('list')}
              activeOpacity={0.7}
            >
              <ListViewIcon 
                color={viewMode === 'list' ? activeTabColor : hexToRGBA(textColor, 0.6)} 
                size={20}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

// Helper function for hex to rgba conversion
const hexToRGBA = (hex: string, alpha: number): string => {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
    backgroundColor: 'transparent',
    // Add layout stability to prevent jitter
    minHeight: 48,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // reduced from 20 to 8
    // Add layout stability
    flex: 1,
  },
  tabOption: {
    paddingRight: 8,
    // Add layout stability to prevent jitter
    minHeight: 36,
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 17,
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
  activeTabOption: {
    opacity: 1,
  },
  viewToggleArea: {
    width: 'auto', // Remove fixed width to eliminate right padding
    height: 36, // Fixed height to maintain consistent spacing
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  viewToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2, // Fine-tune vertical alignment with tabs
  },
  viewToggleButton: {
    padding: 6,
    borderRadius: 50,
  },
  activeViewToggleButton: {
    // Removed background color for active view toggle button
  },
});

export default memo(TabNavigation); 