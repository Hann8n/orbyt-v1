import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';
import { NativePressable } from '../../ui/NativePressable';
import { ListViewIcon, GridViewIcon, DownSmallFillIcon } from '../../ui/Icon';
import type { ViewMode } from '../../../types';
import { Colors } from '../../../theme';
import { Typography } from '../../../utils/components/typography';
import { hexToRGBA } from '../../../utils/formatting/colors';

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
  inactiveTextColor?: string;
  backgroundColor?: string;
  accentColor?: string; // Add accent color for vibrant tab styling
  style?: StyleProp<ViewStyle>;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  showViewToggle?: boolean;
  reserveViewToggleSpace?: boolean;
  variant?: 'header' | 'comments'; // New prop to distinguish between header and comments styles
  dropdown?: boolean; // New prop to show as dropdown instead of tabs
  /** i18n key for MenuView title when `dropdown` is true. Default: sort (e.g. channel top/latest). */
  dropdownMenuTitleKey?: string;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  activeTab,
  onTabPress,
  textColor = Colors.neutral[50],
  inactiveTextColor,
  backgroundColor = Colors.transparent,
  accentColor: _accentColor, // Add accent color prop
  style,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
  reserveViewToggleSpace = true,
  variant = 'header', // Default to header variant
  dropdown = false, // Default to tabs
  dropdownMenuTitleKey = 'tabs.sortBy',
}) => {
  const { t } = useTranslation();
  const handleViewModeChange = (mode: ViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  };

  // Use the passed textColor for active tabs, fallback to white for better readability
  const activeTabColor = textColor || Colors.neutral[50];
  // Preserve existing inactive treatment by default, with optional per-screen override.
  const inactiveTabColor =
    inactiveTextColor ??
    (activeTabColor === Colors.neutral[50] ? Colors.neutral[500] : hexToRGBA(textColor, 0.7));

  // Get variant-specific styles
  const variantStyle = variant === 'comments' ? styles.commentsStyle : styles.headerStyle;

  // Get current active tab label
  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label || tabs[0]?.label || '';
  const dropdownActions: MenuAction[] = tabs.map(tab => ({
    id: tab.id,
    title: tab.label,
    state: activeTab === tab.id ? 'on' : 'off',
    attributes: { disabled: !!tab.disabled },
  }));

  // Dropdown mode
  if (dropdown) {
    return (
      <View style={[styles.tabContainer, variantStyle, { backgroundColor }, style]}>
        <View style={styles.dropdownMenuAnchor}>
          <MenuView
            title={t(dropdownMenuTitleKey)}
            actions={dropdownActions}
            shouldOpenOnLongPress={false}
            themeVariant="dark"
            isAnchoredToRight={false}
            onPressAction={({ nativeEvent }: { nativeEvent: { event?: string } }) => {
              const nextTabId = nativeEvent?.event;
              if (!nextTabId || nextTabId === activeTab) return;
              onTabPress(nextTabId);
            }}
          >
            <NativePressable style={styles.dropdownButton}>
              <Text
                style={[
                  styles.dropdownText,
                  variant === 'header' ? styles.dropdownTextHeader : styles.dropdownTextDefault,
                  { color: activeTabColor },
                ]}
              >
                {activeTabLabel}
              </Text>
              <DownSmallFillIcon size={20} color={inactiveTabColor} />
            </NativePressable>
          </MenuView>
        </View>

        {/* View toggle area */}
        {(reserveViewToggleSpace || (showViewToggle && onViewModeChange)) && (
          <View style={styles.viewToggleArea}>
            {showViewToggle && onViewModeChange && (
              <View style={styles.viewToggleContainer}>
                <NativePressable
                  style={[
                    styles.viewToggleButton,
                    viewMode === 'grid' && styles.activeViewToggleButton,
                  ]}
                  onPress={() => handleViewModeChange('grid')}
                >
                  <GridViewIcon
                    color={viewMode === 'grid' ? activeTabColor : inactiveTabColor}
                    size={20}
                  />
                </NativePressable>
                <NativePressable
                  style={[
                    styles.viewToggleButton,
                    viewMode === 'list' && styles.activeViewToggleButton,
                  ]}
                  onPress={() => handleViewModeChange('list')}
                >
                  <ListViewIcon
                    color={viewMode === 'list' ? activeTabColor : inactiveTabColor}
                    size={20}
                  />
                </NativePressable>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  // Regular tabs mode
  return (
    <View style={[styles.tabContainer, variantStyle, { backgroundColor }, style]}>
      <View style={styles.tabsRow}>
        {tabs.map(tab => (
          <NativePressable
            key={tab.id}
            onPress={() => onTabPress(tab.id)}
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
                variant === 'header'
                  ? styles.tabTextHeader
                  : variant === 'comments'
                    ? styles.tabTextComments
                    : styles.tabTextDefault,
                {
                  color: activeTab === tab.id ? activeTabColor : inactiveTabColor,
                },
                activeTab === tab.id && styles.activeTabText,
                tab.disabled && styles.disabledTabText,
              ]}
            >
              {tab.label}
            </Text>
          </NativePressable>
        ))}
      </View>

      {(reserveViewToggleSpace || (showViewToggle && onViewModeChange)) && (
        <View style={styles.viewToggleArea}>
          {showViewToggle && onViewModeChange && (
            <View style={styles.viewToggleContainer}>
              <NativePressable
                style={[
                  styles.viewToggleButton,
                  viewMode === 'grid' && styles.activeViewToggleButton,
                ]}
                onPress={() => handleViewModeChange('grid')}
              >
                <GridViewIcon
                  color={viewMode === 'grid' ? activeTabColor : inactiveTabColor}
                  size={20}
                />
              </NativePressable>
              <NativePressable
                style={[
                  styles.viewToggleButton,
                  viewMode === 'list' && styles.activeViewToggleButton,
                ]}
                onPress={() => handleViewModeChange('list')}
              >
                <ListViewIcon
                  color={viewMode === 'list' ? activeTabColor : inactiveTabColor}
                  size={20}
                />
              </NativePressable>
            </View>
          )}
        </View>
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
    marginTop: 4,
    backgroundColor: Colors.transparent,
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
    includeFontPadding: false,
    textAlignVertical: 'center',
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
  dropdownMenuAnchor: {
    alignSelf: 'flex-start',
  },
  dropdownText: {
    fontFamily: Typography.families.bold,
  },
  dropdownTextHeader: {
    fontSize: Typography.sizes.title,
  },
  dropdownTextDefault: {
    fontSize: Typography.sizes.subtitle,
  },
  tabTextHeader: {
    fontFamily: Typography.families.black,
    fontSize: Typography.sizes.title,
  },
  tabTextDefault: {
    fontFamily: Typography.families.bold,
    fontSize: Typography.sizes.subtitle,
  },
  tabTextComments: {
    fontFamily: Typography.families.black,
    fontSize: Typography.sizes.subtitle,
  },
});

export default memo(TabNavigation);
