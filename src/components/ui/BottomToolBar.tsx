import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Text } from 'react-native';
import { NativePressable } from './NativePressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getBottomNavBarHeight } from '../../utils/device/screen';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import Icon from './Icon';
import { Colors } from './UI';
import { BORDER_RADIUS } from '@/utils/constants';

interface BottomToolBarProps {
  mode: 'create' | 'edit';
  onToolPress?: (toolName: string) => void;
  flashActive?: boolean;
  hasSegments?: boolean;
  isDeletePreviewActive?: boolean;
  isFrontCamera?: boolean;
  disableGalleryUpload?: boolean;
  onNextPress?: () => void;
  nextButtonDisabled?: boolean;
  onionSkinningActive?: boolean;
}

const BottomToolBar: React.FC<BottomToolBarProps> = ({
  mode,
  onToolPress,
  flashActive,
  hasSegments = false,
  isDeletePreviewActive = false,
  isFrontCamera = false,
  disableGalleryUpload = false,
  onNextPress,
  nextButtonDisabled = false,
  onionSkinningActive = false,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { screenWidth: width, isCompact: isSmallDevice } = useDeviceLayout();

  // Different tool configurations based on mode
  const getTools = (): { id: string; icon: string; activeIcon?: string }[] => {
    if (mode === 'create') {
      return [
        { id: 'flip', icon: 'camera-rotate' },
        { id: 'delete', icon: 'delete-back' },
        { id: 'onion-skin', icon: 'ghost-fill', activeIcon: 'ghost-fill-sunglasses' },
        { id: 'flash', icon: 'flash' },
        { id: 'gallery', icon: 'gallery' },
      ];
    } else if (mode === 'edit') {
      return [
        { id: 'text', icon: 'text' },
        { id: 'filter', icon: 'color-picker-fill' },
        { id: 'audio', icon: 'music' },
      ];
    }
    return [];
  };

  const tools = getTools();
  const bottomNavBarHeight = getBottomNavBarHeight(insets, isSmallDevice);
  // Icon size for toolbar
  const iconSize = Math.round(Math.max(22, Math.min(28, width * 0.07)));

  // Render tool button
  const renderTool = (tool: { id: string; icon: string; activeIcon?: string }, index?: number) => {
    const isDeleteDisabled = tool.id === 'delete' && !hasSegments;
    const isFlashDisabled = tool.id === 'flash' && isFrontCamera;
    const isGalleryDisabled = tool.id === 'gallery' && disableGalleryUpload;
    const isDisabled = isDeleteDisabled || isFlashDisabled || isGalleryDisabled;

    let iconColor = 'white';
    if (tool.id === 'delete' && isDeletePreviewActive && !isDeleteDisabled) {
      iconColor = Colors.coral[500];
    } else if (tool.id === 'flash' && isFlashDisabled) {
      iconColor = 'rgba(255, 255, 255, 0.75)';
    } else if (tool.id === 'flash' && flashActive) {
      iconColor = Colors.amber[400];
    } else if (isDisabled) {
      iconColor = 'rgba(255, 255, 255, 0.70)';
    }

    // Different styles for create vs edit mode
    const toolStyle =
      mode === 'create'
        ? [styles.tool, { width: iconSize, height: iconSize }]
        : [
            styles.toolEdit,
            {
              width: iconSize,
              height: iconSize,
              marginLeft: index === 0 ? 0 : 30,
            },
          ];

    return (
      <NativePressable
        key={tool.id}
        style={toolStyle}
        androidRippleBorderless
        onPress={() => {
          if (!isDisabled) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onToolPress) {
              onToolPress(tool.id);
            }
          }
        }}
        disabled={isDisabled}
      >
        <Icon
          name={
            tool.activeIcon && tool.id === 'onion-skin' && onionSkinningActive
              ? tool.activeIcon
              : tool.icon
          }
          size={iconSize}
          color={iconColor}
        />
      </NativePressable>
    );
  };

  const isCreateMode = mode === 'create';

  // Original style for create mode
  if (isCreateMode) {
    return (
      <View style={[styles.safeArea, { height: bottomNavBarHeight }]}>
        <View
          style={[
            styles.containerCreate,
            isSmallDevice && styles.containerSmall,
            {
              // Match bottom tab bar padding behavior from app/(tabs)/_layout.tsx
              paddingTop: isSmallDevice ? 2 : 6,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          {tools.map(tool => renderTool(tool))}
        </View>
      </View>
    );
  }

  // New style for edit mode with next button
  return (
    <View style={[styles.safeArea, { height: bottomNavBarHeight }]}>
      <View
        style={[
          styles.containerEdit,
          isSmallDevice && styles.containerSmall,
          {
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Left side - tools */}
        <View style={styles.toolsContainer}>
          {tools.map((tool, index) => renderTool(tool, index))}
        </View>

        {/* Right side - next button */}
        {onNextPress && (
          <View style={styles.nextButtonContainer}>
            <NativePressable
              style={[styles.nextButton, nextButtonDisabled && styles.nextButtonDisabled]}
              onPress={onNextPress}
              disabled={nextButtonDisabled}
            >
              <Text style={styles.nextButtonText}>{t('common.next')}</Text>
            </NativePressable>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: 'transparent',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  // Original style for create mode
  containerCreate: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    flex: 1,
  },
  // New style for edit mode
  containerEdit: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    flex: 1,
  },
  containerSmall: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  toolsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Original tool style for create mode
  tool: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  // New tool style for edit mode
  toolEdit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 60,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    color: Colors.black,
    fontSize: 17,
    fontFamily: 'Figtree-Bold',
    fontWeight: '600',
    includeFontPadding: false,
  },
});

export default BottomToolBar;
