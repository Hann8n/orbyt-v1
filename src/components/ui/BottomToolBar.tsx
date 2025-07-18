import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Image,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isSmallScreen } from '../../utils/helpers/screenSize';
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

  return (
    <SafeAreaView style={[styles.safeArea, isSmallScreen() && styles.safeAreaSmall]}>
      <View style={[styles.container, isSmallScreen() && styles.containerSmall]}>
        {tools.map((tool) => (
          <TouchableOpacity
            key={tool.id}
            style={styles.tool}
            onPress={() => onToolPress && onToolPress(tool.id)}
          >
            {tool.id === 'flash' && mode === 'create' && flashActive ? (
              <Image
                source={require('../../assets/pixelarticons--zap.png')}
                style={{ width: 24, height: 24, resizeMode: 'contain' }}
              />
            ) : (
              <Icon name={tool.icon} size={24} color="white" />
            )}
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
    backgroundColor: Colors.BACKGROUND.PRIMARY,
  },
  safeAreaSmall: {
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: Colors.BACKGROUND.PRIMARY,
    borderTopWidth: 0.5,
    borderTopColor: Colors.BORDER.PRIMARY,
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
    color: Colors.TEXT.PRIMARY,
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Firma-Regular',
  },
});

export default BottomToolBar;