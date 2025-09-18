import React from 'react';
import { StatusBar } from 'react-native';
import { Colors } from './UI';

const StatusBarController: React.FC = () => {

  return (
    <StatusBar 
      barStyle="light-content" 
      backgroundColor={Colors.black} 
      hidden={false}
    />
  );
};

export default StatusBarController; 