import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { isSmallScreen, isTablet } from '../../utils/helpers/screenSize';
import Icon from './Icon';

interface BottomToolBarProps {
  mode: 'create' | 'edit';
  onToolPress?: (toolName: string) => void;
  flashActive?: boolean; // Add this prop
}

const BottomToolBar: React.FC<BottomToolBarProps> = ({ mode, onToolPress, flashActive }) => {
  const navigation = useNavigation();

  // Different tool configurations based on mode
  const getTools = () => {
    if (mode === 'create') {
      return [
        { id: 'gallery', icon: 'image', label: 'Gallery' },
        { id: 'flip', icon: 'repeat', label: 'Flip' },
        { id: 'flash', icon: 'zap', label: 'Flash' },
      ];
    } else if (mode === 'edit') {
      return [
        { id: 'text', icon: 'text', label: 'Text' },
        { id: 'trim', icon: 'scissors', label: 'Trim' },
        { id: 'filter', icon: 'palette', label: 'Filter' },
        { id: 'audio', icon: 'music', label: 'Audio' },
      ];
    }
    return [];
  };

  const tools = getTools();
  const isSmallDevice = isSmallScreen() || isTablet();

  return (
    <SafeAreaView style={[styles.safeArea, isSmallDevice && styles.safeAreaSmall]}>
      <View style={[styles.container, isSmallDevice && styles.containerSmall]}>
        {tools.map((tool) => (
          <TouchableOpacity
            key={tool.id}
            style={styles.tool}
            onPress={() => onToolPress && onToolPress(tool.id)}
          >
            <Icon name={tool.icon} size={24} color="white" />
            <Text style={styles.toolLabel}>{tool.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
};

import { Colors } from './UI';

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Colors.darkGray,
  },
  safeAreaSmall: {
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: Colors.darkGray,
    borderTopWidth: 0.5,
    borderTopColor: Colors.gray,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
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
  toolLabel: {
    color: Colors.white,
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Firma-Regular',
  },
});

export default BottomToolBar;