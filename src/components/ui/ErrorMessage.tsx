import React from 'react';
import { View, Text } from 'react-native';
import { authSheetStyles } from './AuthSheetStyles';

interface ErrorMessageProps {
  error: string | null;
}

/**
 * Reusable error message component for auth sheets
 * Only renders when error is present
 */
const ErrorMessage: React.FC<ErrorMessageProps> = ({ error }) => {
  if (!error) return null;

  return (
    <View style={authSheetStyles.errorContainer}>
      <Text style={authSheetStyles.errorText}>{error}</Text>
    </View>
  );
};

export default ErrorMessage;
