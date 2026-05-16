import React, { memo } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';
import { NativePressable } from '../../ui/NativePressable';
import { SquircleNativePressable } from '../../ui/Squircle';
import { ListViewIcon, GridViewIcon, DownSmallFillIcon } from '../../ui/Icon';
import type { ViewMode } from '../../../types';
import { Colors } from '../../../theme';
import { Typography, fontSizeFor } from '../../../utils/components/typography';
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
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  showViewToggle?: boolean;
  reserveViewToggleSpace?: boolean;
  variant?: 'header' | 'comments';
  dropdown?: boolean;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  activeTab,
  onTabPress,
  textColor = Colors.neutral[50],
  inactiveTextColor,
  backgroundColor = Colors.transparent,
  accentColor: _accentColor,
  style,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
  reserveViewToggleSpace = true,
  variant = 'header',
  dropdown = false,
}) => {
  const handleViewModeChange = (mode: ViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  };

  const activeTabColor = textColor || Colors.neutral[50];
  const inactiveTabColor =
    inactiveTextColor ??
    (activeTabColor === Colors.neutral[50] ? Colors.neutral[500] : hexToRGBA(textColor, 0.7));

  const variantStyle = variant === 'comments' ? styles.commentsStyle : styles.headerStyle;

  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label || tabs[0]?.label || '';
  const dropdownActions: MenuAction[] = tabs.map(tab => ({
    id: tab.id,
    title: tab.label,
    state: activeTab === tab.id ? 'on' : 'off',
    attributes: { disabled: !!tab.disabled },
  }));

  if (dropdown) {
    return (
      <View style={[styles.tabContainer, variantStyle, { backgroundColor }, style]}>
        <View style={styles.dropdownMenuAnchor}>
          <MenuView
            title=""
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

        {(reserveViewToggleSpace || (showViewToggle && onViewModeChange)) && (
          <View style={styles.viewToggleArea}>
            {showViewToggle && onViewModeChange && (
              <View style={styles.viewToggleContainer}>
                <SquircleNativePressable
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
                </SquircleNativePressable>
                <SquircleNativePressable
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
                </SquircleNativePressable>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

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
    gap: 8,
    flex: 1,
  },
  tabOption: {
    paddingRight: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  tabText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    flexShrink: 0,
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
    width: 'auto',
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  viewToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  viewToggleButton: {
    padding: 6,
    borderRadius: BORDER_RADIUS.FULL,
  },
  activeViewToggleButton: {},
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
    fontSize: fontSizeFor(18),
  },
});

export default memo(TabNavigation);
