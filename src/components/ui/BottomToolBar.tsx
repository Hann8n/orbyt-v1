import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { isSmallScreen, isTablet, getBottomNavBarHeight } from '../../utils/helpers';
import Icon from './Icon';
import { Colors } from './UI';

interface BottomToolBarProps {
  mode: 'create' | 'edit';
  onToolPress?: (toolName: string) => void;
  flashActive?: boolean;
  hasSegments?: boolean; // Add this prop to control delete button state
  isFrontCamera?: boolean; // Add this prop to disable flash in front camera mode
  disableGalleryUpload?: boolean; // When true, disable gallery button (e.g., not enough remaining time)
}

const BottomToolBar: React.FC<BottomToolBarProps> = ({
  mode,
  onToolPress,
  flashActive,
  hasSegments = false,
  isFrontCamera = false,
  disableGalleryUpload = false,
}) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Different tool configurations based on mode
  const getTools = () => {
    if (mode === 'create') {
      return [
        { id: 'flip', icon: 'camera-rotate' },
        { id: 'delete', icon: 'delete-back' },
        { id: 'flash', icon: 'flash' },
        { id: 'gallery', icon: 'gallery' },
      ];
    } else if (mode === 'edit') {
      return [
        { id: 'text', icon: 'text' },
        { id: 'trim', icon: 'scissors' },
        { id: 'filter', icon: 'color-picker-fill' },
        { id: 'audio', icon: 'music' },
      ];
    }
    return [];
  };

  const tools = getTools();
  const isSmallDevice = isSmallScreen() || isTablet();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  // Icon size for toolbar
  const iconSize = Math.round(Math.max(22, Math.min(28, width * 0.07)));

  return (
    <View style={[styles.safeArea, { height: bottomNavBarHeight }]}>
      <View style={[
        styles.container, 
        isSmallDevice && styles.containerSmall,
        {
          // Match bottom tab bar padding behavior from app/(tabs)/_layout.tsx
          paddingTop: isSmallDevice ? 2 : 6,
          paddingBottom: 0,
        }
      ]}>
        {tools.map((tool) => {
          const isDeleteDisabled = tool.id === 'delete' && !hasSegments;
          const isFlashDisabled = tool.id === 'flash' && isFrontCamera;
          const isGalleryDisabled = tool.id === 'gallery' && disableGalleryUpload;
          const isDisabled = isDeleteDisabled || isFlashDisabled || isGalleryDisabled;
          
          let iconColor = "white";
          if (tool.id === 'flash' && isFlashDisabled) {
            iconColor = Colors.gray;
          } else if (tool.id === 'flash' && flashActive) {
            iconColor = Colors.yellow;
          } else if (isDisabled) {
            iconColor = Colors.gray;
          }
          
          return (
            <TouchableOpacity
              key={tool.id}
              style={[styles.tool, { width: iconSize, height: iconSize }]}
              onPress={() => !isDisabled && onToolPress && onToolPress(tool.id)}
              activeOpacity={isDisabled ? 1 : 0.7}
              disabled={isDisabled}
            >
              <Icon 
                name={tool.icon} 
                size={iconSize} 
                color={iconColor}
              />
            </TouchableOpacity>
          );
        })}
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
  safeAreaSmall: {
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    flex: 1,
  },
  containerSmall: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  tool: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
});

export default BottomToolBar;