import React from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, useLogout } from '../../navigation/types';
import ModerationDebug from '../../components/features/moderation/ModerationDebug';

type ModerationDebugRouteProp = RouteProp<RootStackParamList, 'ModerationDebug'>;

const ModerationDebugScreen: React.FC = () => {
  const route = useRoute<ModerationDebugRouteProp>();
  const navigation = useNavigation();
  const logoutFromContext = useLogout();
  const onLogout = route.params?.onLogout || logoutFromContext;

  return (
    <ModerationDebug 
      visible={true} 
      onClose={() => navigation.goBack()} 
    />
  );
};

export default ModerationDebugScreen; 