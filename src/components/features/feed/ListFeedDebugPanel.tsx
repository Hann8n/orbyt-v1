import React from 'react';
import { View, Text, ViewStyle } from 'react-native';

interface ListFeedDebugPanelProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  title?: string;
}

const ListFeedDebugPanel: React.FC<ListFeedDebugPanelProps> = ({ children, style, title }) => (
  <View style={[{ padding: 16, backgroundColor: '#222', borderRadius: 8, maxWidth: 340 }, style]}>
    {title && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>{title}</Text>}
    {children}
  </View>
);

export default ListFeedDebugPanel; 