import React from 'react';
import { StatusBar } from 'react-native';
import { useClearView } from '../../services/ClearViewContext';
import { isSmallScreen, isTablet } from '../../utils/helpers/screenSize';

const StatusBarController: React.FC = () => {
  const { isClearViewMode } = useClearView();
  const isSmallDevice = isSmallScreen() || isTablet();

  // Hide status bar when in clear view mode on small devices/tablets
  const shouldHideStatusBar = isSmallDevice && isClearViewMode;

  return (
    <StatusBar 
      barStyle="light-content" 
      backgroundColor="#000" 
      hidden={shouldHideStatusBar}
    />
  );
};

export default StatusBarController; 