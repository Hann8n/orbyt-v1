import React from 'react';
import { StatusBar } from 'react-native';
import { useClearView } from '../../stores/uiStore';
import { Colors } from './UI';

const StatusBarController: React.FC = () => {
  const { isClearViewMode } = useClearView();

  // Hide status bar when in clear view mode
  const shouldHideStatusBar = isClearViewMode;

  return (
    <StatusBar 
      barStyle="light-content" 
      backgroundColor={Colors.black} 
      hidden={shouldHideStatusBar}
    />
  );
};

export default StatusBarController; 