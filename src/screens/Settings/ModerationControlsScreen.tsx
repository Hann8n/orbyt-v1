import React from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, useLogout } from '../../navigation/types';
import ModerationControls from '../../components/features/moderation/ModerationControls';

type ModerationControlsRouteProp = RouteProp<RootStackParamList, 'ModerationControls'>;

const ModerationControlsScreen: React.FC = () => {
  const route = useRoute<ModerationControlsRouteProp>();
  const navigation = useNavigation();
  const logoutFromContext = useLogout();
  const onLogout = route.params?.onLogout || logoutFromContext;

  return (
    <ModerationControls 
      visible={true} 
      onClose={() => navigation.goBack()} 
      onLogout={onLogout}
    />
  );
};

export default ModerationControlsScreen; 