import React, { memo, useState } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { ListViewIcon, GridViewIcon, DownSmallFillIcon } from '../../ui/Icon';
import { Colors } from '../../ui/UI';
import VerticalListSheet, { VerticalListButton } from '../../ui/VerticalListSheet';

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
  viewMode?: 'list' | 'grid' | 'horizontal';
  onViewModeChange?: (mode: 'list' | 'grid' | 'horizontal') => void;
  showViewToggle?: boolean;
  variant?: 'header' | 'comments'; // New prop to distinguish between header and comments styles
  dropdown?: boolean; // New prop to show as dropdown instead of tabs
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
  variant = 'header', // Default to header variant
  dropdown = false, // Default to tabs
}) => {
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const handleViewModeChange = (mode: 'list' | 'grid') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  };

  // Use the passed textColor for active tabs, fallback to white for better readability
  const activeTabColor = textColor || '#FFFFFF';

  // Get variant-specific styles
  const variantStyle = variant === 'comments' ? styles.commentsStyle : styles.headerStyle;

  // Get current active tab label
  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label || tabs[0]?.label || '';

  // Dropdown mode
  if (dropdown) {
    return (
      <>
        <View style={[styles.tabContainer, variantStyle, { backgroundColor }, style]}>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setDropdownVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.dropdownText, { color: activeTabColor, fontFamily: 'Firma-SemiBold', fontSize: variant === 'header' ? 18 : 16 }]}>
              {activeTabLabel}
            </Text>
          <DownSmallFillIcon size={20} color={Colors.gray} />
          </TouchableOpacity>

          {/* View toggle area */}
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
                    color={viewMode === 'grid' ? activeTabColor : hexToRGBA(textColor, 0.75)} 
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
                    color={viewMode === 'list' ? activeTabColor : hexToRGBA(textColor, 0.75)} 
                    size={20}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <VerticalListSheet
          visible={dropdownVisible}
          onDismiss={() => setDropdownVisible(false)}
          title="Sort by"
          showCancelButton={true}
          cancelButtonText="Cancel"
          enableGlass={false}
        >
          <View style={styles.optionsContainer}>
            {tabs.map((tab) => (
              <VerticalListButton
                key={tab.id}
                label={tab.label}
                onPress={() => {
                  if (activeTab !== tab.id) {
                    onTabPress(tab.id);
                  }
                  setDropdownVisible(false);
                }}
                disabled={tab.disabled || activeTab === tab.id}
              />
            ))}
          </View>
        </VerticalListSheet>
      </>
    );
  }

  // Regular tabs mode
  return (
    <View style={[styles.tabContainer, variantStyle, { backgroundColor }, style]}>
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
                { 
                  color: activeTab === tab.id ? activeTabColor : hexToRGBA(textColor, 0.8),
                  fontFamily: activeTab === tab.id 
                    ? (variant === 'header' ? 'Firma-Black' : 'Firma-Black')
                    : (variant === 'header' ? 'Firma-SemiBold' : 'Firma-SemiBold'),
                  fontSize: variant === 'header' ? 18 : 16
                },
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
                color={viewMode === 'grid' ? activeTabColor : hexToRGBA(textColor, 0.75)} 
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
                color={viewMode === 'list' ? activeTabColor : hexToRGBA(textColor, 0.75)} 
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
    fontWeight: 'bold',
    opacity: 0.8,
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
    borderRadius: BORDER_RADIUS.FULL,
  },
  activeViewToggleButton: {
    // Removed background color for active view toggle button
  },
  // Simple variant styles - just basic spacing differences
  headerStyle: {
    paddingVertical: 12,
    paddingBottom: 15,
    marginTop: 4,
  },
  commentsStyle: {
    paddingVertical: 8,
    marginTop: 0,
    minHeight: 40,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 8,
    minHeight: 36,
  },
  dropdownText: {
    fontSize: 18,
  },
  optionsContainer: {
    paddingHorizontal: 0,
  },
});

export default memo(TabNavigation); 